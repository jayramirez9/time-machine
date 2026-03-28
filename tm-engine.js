#!/usr/bin/env node

/**
 * Time Machine Engine Daemon
 * Always-on service that publishes WorldState on a fixed cadence
 *
 * Usage:
 *   ./tm-engine.js --location "Baton Rouge, LA" --date "07-04-1978"
 *   ./tm-engine.js --location "Baton Rouge, LA" --realtime
 *
 * Transports:
 *   HTTP GET  http://localhost:3000/worldstate
 *   WebSocket ws://localhost:3000/
 */

import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { startEngine } from './lib/runtimeEngine.js';
import { smartGeocode } from './lib/openmeteo.js';
import { LOCALES, DEFAULT_LOCALE } from './lib/localePresets.js';
import { getApiKey as getVCKey } from './lib/visualcrossing.js';
import { getApiKey as getNOAAKey } from './lib/noaa.js';

import { isUnrealReachable, getGeoreference } from './lib/cesiumGeoreference.js';
import { getTilesetStatus } from './lib/cesiumTileset.js';
import { loadProfile, generateAccuracyManifest } from './lib/environmentProfile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse arguments
function parseArgs(args) {
  const parsed = {
    location: null,
    startDate: null,
    locale: null,
    port: parseInt(process.env.PORT) || parseInt(process.env.TM_PORT) || 3000,
    timescale: 60,
    tickMs: 1000,
    publishEveryMs: 5000,
    routesConfigPath: null,
    quiet: false,
    overnight: false,
    mock: false,
    provider: 'auto',
    profile: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--location' || arg === '-l') {
      parsed.location = args[++i];
    } else if (arg === '--date' || arg === '-d') {
      parsed.startDate = args[++i];
    } else if (arg === '--locale') {
      parsed.locale = args[++i];
    } else if (arg === '--port' || arg === '-p') {
      parsed.port = parseInt(args[++i]);
    } else if (arg === '--timescale') {
      parsed.timescale = parseFloat(args[++i]);
    } else if (arg === '--routes') {
      parsed.routesConfigPath = args[++i];
    } else if (arg === '--quiet') {
      parsed.quiet = true;
    } else if (arg === '--overnight') {
      parsed.overnight = true;
      parsed.quiet = true;
    } else if (arg === '--mock') {
      parsed.mock = true;
    } else if (arg === '--provider') {
      parsed.provider = args[++i];
    } else if (arg === '--profile') {
      parsed.profile = args[++i];
    }
  }

  return parsed;
}

// WebSocket handling (minimal implementation without external deps)
class WebSocketServer {
  constructor(server) {
    this.clients = new Set();
    server.on('upgrade', (req, socket, head) => {
      const path = req.url.split('?')[0];
      if (path === '/' || path === '/stream') {
        this.handleUpgrade(req, socket);
      } else {
        socket.destroy();
      }
    });
  }

  handleUpgrade(req, socket) {
    const key = req.headers['sec-websocket-key'];
    const accept = this.computeAcceptKey(key);

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      '\r\n'
    );

    this.clients.add(socket);

    socket.on('close', () => {
      this.clients.delete(socket);
    });

    socket.on('error', () => {
      this.clients.delete(socket);
    });
  }

  computeAcceptKey(key) {
    const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    return crypto.createHash('sha1').update(key + GUID).digest('base64');
  }

  broadcast(data) {
    const payload = JSON.stringify(data);
    const frame = this.encodeFrame(payload);

    for (const client of this.clients) {
      try {
        client.write(frame);
      } catch (e) {
        this.clients.delete(client);
      }
    }
  }

  encodeFrame(payload) {
    const data = Buffer.from(payload);
    const length = data.length;

    let frame;
    if (length < 126) {
      frame = Buffer.alloc(2 + length);
      frame[0] = 0x81; // text frame
      frame[1] = length;
      data.copy(frame, 2);
    } else if (length < 65536) {
      frame = Buffer.alloc(4 + length);
      frame[0] = 0x81;
      frame[1] = 126;
      frame.writeUInt16BE(length, 2);
      data.copy(frame, 4);
    } else {
      frame = Buffer.alloc(10 + length);
      frame[0] = 0x81;
      frame[1] = 127;
      frame.writeBigUInt64BE(BigInt(length), 2);
      data.copy(frame, 10);
    }

    return frame;
  }

  get clientCount() {
    return this.clients.size;
  }
}

function serveHtml(res, filePath) {
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) {
      res.statusCode = 500;
      res.end('Error reading file');
      return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(html);
  });
}

// Static file serving helper (audio-assets, terrain-data, mesh-data)
function serveStaticDir(res, dirName, assetPath, extraMimes = {}, opts = {}) {
  if (assetPath.includes('..')) {
    res.statusCode = 400;
    res.end('Invalid path');
    return;
  }
  const filePath = path.join(__dirname, dirName, assetPath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = { '.json': 'application/json', '.png': 'image/png', ...extraMimes };
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    res.statusCode = 404;
    res.end('Not found');
  });
  stream.on('open', () => {
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    if (opts.cacheControl) res.setHeader('Cache-Control', opts.cacheControl);
    stream.pipe(res);
  });
}

// JSON body parser helper
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// HTTP Server — engineRef is a mutable { engine, config } container
function createServer(engineRef) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const wss = server.wss;
    const engine = engineRef.engine;
    const urlPath = req.url.split('?')[0];

    // ── API endpoints ──────────────────────────────────────
    if (req.method === 'GET' && urlPath === '/api/status') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        running: !!engine,
        location: engine?.location || null,
        simTime: engine?.simTime?.toISOString() || null,
        timescale: engine?.timescale || null,
        locale: engineRef.config?.locale || null,
        provider: engineRef.config?.provider || null,
        date: engineRef.config?.startDate || null,
        clients: wss?.clientCount || 0,
        uptime: process.uptime()
      }));
      return;
    }

    if (req.method === 'GET' && urlPath === '/api/unreal-status') {
      const routesConfig = engineRef.routesConfigPath ? JSON.parse(fs.readFileSync(engineRef.routesConfigPath, 'utf8')) : null;
      const host = routesConfig?.endpoints?.unreal?.host || 'http://localhost:30010';
      const reachable = await isUnrealReachable(host);
      let cesiumFound = false;
      let origin = null;
      if (reachable) {
        const geoState = await getGeoreference(host);
        cesiumFound = geoState.ok;
        origin = geoState.origin || null;
      }
      let tileset = null;
      if (reachable) {
        const ts = await getTilesetStatus(host);
        tileset = ts.ok ? { found: ts.found, url: ts.url || null } : null;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ reachable, cesiumFound, origin, tileset, host }));
      return;
    }

    if (req.method === 'GET' && urlPath === '/api/locales') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        locales: Object.keys(LOCALES),
        default: DEFAULT_LOCALE,
        autoInference: true,
        autoInferenceNote: 'Omit locale to auto-infer from location population + year'
      }));
      return;
    }

    if (req.method === 'GET' && urlPath === '/api/profile') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(engineRef.profileManifest || null));
      return;
    }

    if (req.method === 'POST' && urlPath === '/api/launch') {
      try {
        const body = await readBody(req);
        if (!body.location) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: 'location is required' }));
          return;
        }

        // Stop current engine
        if (engine) {
          engine.stop();
          console.log('[Engine] Stopped for relaunch');
        }

        // If explicit lat/lon provided, pre-resolve geocode to skip geocoding
        let preGeo = null;
        if (body.lat != null && body.lon != null) {
          preGeo = {
            lat: parseFloat(body.lat),
            lon: parseFloat(body.lon),
            name: body.location,
            population: 0,
            timezone: body.timezone || null,
            countryCode: null
          };
          // Fill in timezone via smartGeocode if not provided
          if (!preGeo.timezone) {
            try {
              const resolved = await smartGeocode(body.location);
              preGeo.timezone = resolved.timezone;
              preGeo.population = resolved.population;
              preGeo.countryCode = resolved.countryCode;
              if (!preGeo.name || preGeo.name === body.location) {
                preGeo.name = resolved.name;
              }
            } catch (_e) { /* timezone stays null */ }
          }
        }

        const config = {
          location: body.location,
          startDate: body.date || null,
          locale: body.locale || null,
          timescale: body.timescale || 60,
          provider: body.provider || 'auto',
          mock: body.provider === 'mock',
          profilePath: body.profilePath || null,
          preGeo
        };

        // Load environment profile if provided
        if (config.profilePath) {
          try {
            const profile = loadProfile(config.profilePath);
            engineRef.profileManifest = generateAccuracyManifest(profile);
          } catch (e) {
            console.warn(`[Engine] Profile load failed: ${e.message}`);
            engineRef.profileManifest = null;
          }
        } else {
          engineRef.profileManifest = null;
        }

        console.log(`[Engine] Launching: ${config.location} @ ${config.startDate || 'now'} (${config.locale})`);

        const newEngine = await startEngine({
          location: config.location,
          startLocalISO: config.startDate,
          timescale: config.timescale,
          tickMs: 1000,
          publishEveryMs: 5000,
          localePreset: config.locale,
          routesConfigPath: engineRef.routesConfigPath,
          useMock: config.mock,
          provider: config.provider,
          environmentProfilePath: config.profilePath || undefined,
          preGeo: config.preGeo || undefined
        });

        // Swap engine reference and re-wire publish
        engineRef.engine = newEngine;
        engineRef.config = config;
        if (engineRef.unwire) engineRef.unwire();
        engineRef.unwire = engineRef.wirePublish(newEngine, wss);

        console.log(`[Engine] Running: ${newEngine.simTime.toISOString()}`);

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          ok: true,
          location: newEngine.location,
          simTime: newEngine.simTime.toISOString(),
          timescale: newEngine.timescale,
          georeference: newEngine.georeference || null,
          profile: engineRef.profileManifest || null
        }));
      } catch (e) {
        console.error('[Engine] Launch failed:', e);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
      return;
    }

    // ── Existing routes ─────────────────────────────────────
    if (req.method === 'GET' && urlPath === '/worldstate') {
      res.setHeader('Content-Type', 'application/json');
      res.end(engine ? JSON.stringify(engine.getState(), null, 2) : '{}');
    } else if (req.method === 'GET' && urlPath === '/status') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        status: engine ? 'running' : 'stopped',
        location: engine?.location,
        simTime: engine?.simTime?.toISOString(),
        timescale: engine?.timescale,
        clients: wss?.clientCount || 0,
        uptime: process.uptime()
      }));
    } else if (req.method === 'GET' && urlPath === '/') {
      serveHtml(res, path.join(__dirname, 'launcher.html'));
    } else if (req.method === 'GET' && urlPath === '/dashboard') {
      serveHtml(res, path.join(__dirname, 'dashboard.html'));
    } else if (req.method === 'GET' && (urlPath === '/audio' || urlPath === '/audio/' || urlPath === '/audio-engine' || urlPath === '/audio-engine/')) {
      serveHtml(res, path.join(__dirname, 'audio-engine.html'));
    } else if (req.method === 'GET' && urlPath.startsWith('/audio-profiles/')) {
      const profileId = urlPath.replace('/audio-profiles/', '').replace(/\.json$/, '').replace(/\/$/, '');
      const filePath = path.join(__dirname, 'audio-profiles', profileId + '.json');
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
          res.statusCode = 404;
          res.end('Profile not found');
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(data);
      });
    } else if (req.method === 'GET' && urlPath.startsWith('/audio-assets/')) {
      serveStaticDir(res, 'audio-assets', urlPath.slice('/audio-assets/'.length), {
        '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
        '.flac': 'audio/flac', '.m4a': 'audio/mp4',
      }, { cacheControl: 'public, max-age=86400' });
    } else if (req.method === 'GET' && urlPath.startsWith('/terrain-data/')) {
      serveStaticDir(res, 'terrain-data', urlPath.slice('/terrain-data/'.length), {
        '.r16': 'application/octet-stream', '.png': 'image/png',
        '.tif': 'image/tiff', '.json': 'application/json',
      });
    } else if (req.method === 'GET' && urlPath.startsWith('/mesh-data/')) {
      serveStaticDir(res, 'mesh-data', urlPath.slice('/mesh-data/'.length), {
        '.fbx': 'application/octet-stream', '.glb': 'model/gltf-binary',
        '.obj': 'text/plain', '.png': 'image/png', '.json': 'application/json',
      });
    } else if (req.method === 'GET' && urlPath.startsWith('/material-assets/')) {
      serveStaticDir(res, 'material-assets', urlPath.slice('/material-assets/'.length), {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json',
      });
    } else if (req.method === 'GET' && (urlPath === '/viz' || urlPath === '/viz/')) {
      serveHtml(res, path.join(__dirname, 'viz.html'));
    } else {
      res.statusCode = 404;
      res.end('Not found');
    }
  });
  return server;
}

// Main
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const quiet = args.quiet;

  console.log(`[Engine] Initializing...`);
  if (args.location) {
    console.log(`[Engine] Location: ${args.location}`);
  } else {
    console.log(`[Engine] No location specified — start via launcher UI or POST /api/launch`);
  }
  console.log(`[Engine] Time scale: ${args.timescale}x`);
  const providerName = args.mock ? 'mock' : args.provider === 'visualcrossing' ? 'Visual Crossing' : args.provider === 'openmeteo' ? 'Open-Meteo' : args.provider === 'noaa' ? 'NOAA GHCN-Daily' : (getNOAAKey() ? 'NOAA (auto, pre-1940)' : getVCKey() ? 'Visual Crossing (auto)' : 'Open-Meteo (auto)');
  console.log(`[Engine] Weather provider: ${providerName}`);
  if (quiet) console.log(`[Engine] Quiet mode — only violations will be printed`);
  if (args.overnight) console.log(`[Engine] Overnight soak mode — summary on exit`);

  // Load environment profile if provided via CLI
  let profileManifest = null;
  if (args.profile) {
    try {
      const profile = loadProfile(args.profile);
      profileManifest = generateAccuracyManifest(profile);
      console.log(`[Engine] Profile: ${profile.id} (${Math.round(profileManifest.overallConfidence * 100)}% confidence)`);
    } catch (e) {
      console.error(`[Engine] Profile load failed: ${e.message}`);
    }
  }

  // Mutable engine container — shared with server route handlers
  const engineRef = {
    engine: null,
    config: {
      location: args.location,
      startDate: args.startDate,
      locale: args.locale,
      timescale: args.timescale,
      provider: args.provider
    },
    routesConfigPath: args.routesConfigPath,
    profileManifest,
    unwire: null,
    wirePublish: null   // set below
  };

  // Violation tracking for quiet/overnight modes
  const stats = {
    publishCount: 0,
    totalViolations: 0,
    maxDeltaSeen: {},
    startedAt: Date.now()
  };

  // Wire an engine's onPublish to the WebSocket broadcast + console logging
  function wirePublish(engine, wss) {
    return engine.onPublish((state) => {
      // Attach profile summary if loaded (lightweight — no gaps array)
      if (engineRef.profileManifest) {
        const m = engineRef.profileManifest;
        state.profile = {
          id: m.profileId,
          overallConfidence: m.overallConfidence,
          layerSummary: m.layerSummary
        };
      }
      wss.broadcast(state);
      stats.publishCount++;

      const violations = state.violations || [];

      if (violations.length > 0) {
        stats.totalViolations += violations.length;
        for (const v of violations) {
          const key = `${v.endpoint}::${v.param}`;
          const absDelta = Math.abs(v.delta);
          if (!stats.maxDeltaSeen[key] || absDelta > stats.maxDeltaSeen[key]) {
            stats.maxDeltaSeen[key] = absDelta;
          }
        }
      }

      if (quiet) {
        for (const v of violations) {
          console.log(
            `[SNAP] ${state.engine.simTime} ${v.endpoint}::${v.param} ` +
            `delta=${v.delta} max=${v.maxDelta} clamped→${v.clamped}`
          );
        }
      } else {
        const s = state.states;
        const c = state.controls.lighting;
        let line =
          `[${state.engine.simTime.slice(11, 19)}] ` +
          `${s.timeOfDay.padEnd(9)} ${s.sky.padEnd(9)} ${s.comfort.padEnd(6)} ` +
          `lum:${c.exteriorLuminance.toFixed(2)} clients:${wss.clientCount}`;
        if (violations.length > 0) {
          line += ` SNAPS:${violations.length}`;
        }
        console.log(line);
      }
    });
  }
  engineRef.wirePublish = wirePublish;

  const server = createServer(engineRef);
  const wss = new WebSocketServer(server);
  server.wss = wss;

  // Start initial engine (only if location provided via CLI)
  if (args.location) {
    const engine = await startEngine({
      location: args.location,
      startLocalISO: args.startDate,
      timescale: args.timescale,
      tickMs: args.tickMs,
      publishEveryMs: args.publishEveryMs,
      localePreset: args.locale,
      routesConfigPath: args.routesConfigPath,
      useMock: args.mock,
      provider: args.provider,
      environmentProfilePath: args.profile || undefined
    });
    engineRef.engine = engine;
    engineRef.unwire = wirePublish(engine, wss);

    console.log(`[Engine] Start time: ${engine.simTime.toISOString()}`);
    console.log(`[Engine] Ready.`);
  } else {
    console.log(`[Engine] Idle — waiting for launch command`);
  }

  // SIGINT/SIGTERM handler — print summary
  function printSummary() {
    const elapsed = ((Date.now() - stats.startedAt) / 1000).toFixed(0);
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('  ENGINE SUMMARY');
    console.log('═══════════════════════════════════════════');
    console.log(`  Runtime:     ${elapsed}s`);
    console.log(`  Publishes:   ${stats.publishCount}`);
    console.log(`  Violations:  ${stats.totalViolations}`);

    const offenders = Object.entries(stats.maxDeltaSeen).sort((a, b) => b[1] - a[1]);
    if (offenders.length > 0) {
      console.log('');
      console.log('  Worst offenders:');
      for (const [key, delta] of offenders.slice(0, 10)) {
        console.log(`    ${key}: max delta ${delta}`);
      }
    }

    if (stats.totalViolations === 0) {
      console.log('');
      console.log('  Result: CLEAN');
    } else {
      console.log('');
      console.log(`  Result: ${stats.totalViolations} snap(s) detected`);
    }
    console.log('═══════════════════════════════════════════');
  }

  process.on('SIGINT', () => {
    printSummary();
    engineRef.engine?.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    printSummary();
    engineRef.engine?.stop();
    process.exit(0);
  });

  server.listen(args.port, () => {
    console.log(`[Server] HTTP:      http://localhost:${args.port}/worldstate`);
    console.log(`[Server] WebSocket: ws://localhost:${args.port}/ or /stream`);
    console.log(`[Server] Launcher:  http://localhost:${args.port}/`);
    console.log(`[Server] Dashboard: http://localhost:${args.port}/dashboard`);
    console.log(`[Server] Audio:     http://localhost:${args.port}/audio-engine`);
    console.log(`[Server] Viz:       http://localhost:${args.port}/viz`);
    console.log('');
  });
}

main().catch(console.error);
