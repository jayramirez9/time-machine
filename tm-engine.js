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
import { LOCALES, DEFAULT_LOCALE } from './lib/localePresets.js';
import { getApiKey as getVCKey } from './lib/visualcrossing.js';
import { getApiKey as getNOAAKey } from './lib/noaa.js';
import { getExclusionText } from './lib/eraData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse arguments
function parseArgs(args) {
  const parsed = {
    location: 'Baton Rouge, LA',
    startDate: null,
    locale: DEFAULT_LOCALE,
    port: parseInt(process.env.TM_PORT) || 3000,
    timescale: 60,
    tickMs: 1000,
    publishEveryMs: 5000,
    routesConfigPath: null,
    quiet: false,
    overnight: false,
    mock: false,
    provider: 'auto'
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

/**
 * Build a detailed image generation prompt from location, date, and optional world state.
 */
function buildImagePrompt(location, dateStr, hour, worldState) {
  // Parse date for era context
  let year, month, day;
  if (dateStr) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      // MM-DD-YYYY format
      month = parseInt(parts[0]);
      day = parseInt(parts[1]);
      year = parseInt(parts[2]);
    }
  }
  if (!year) year = new Date().getFullYear();
  if (!month) month = new Date().getMonth() + 1;

  const monthNames = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];
  const monthName = monthNames[(month - 1) % 12];

  // Time of day description from hour
  const hourNum = parseInt(hour) || 12;
  let timeDesc;
  if (hourNum >= 5 && hourNum < 7) timeDesc = 'early morning at dawn, soft golden light on the horizon';
  else if (hourNum >= 7 && hourNum < 10) timeDesc = 'morning, warm directional sunlight casting long shadows';
  else if (hourNum >= 10 && hourNum < 12) timeDesc = 'late morning, bright daylight';
  else if (hourNum >= 12 && hourNum < 14) timeDesc = 'midday, overhead sun, short shadows';
  else if (hourNum >= 14 && hourNum < 16) timeDesc = 'early afternoon, warm angled light';
  else if (hourNum >= 16 && hourNum < 18) timeDesc = 'late afternoon, golden hour approaching';
  else if (hourNum >= 18 && hourNum < 20) timeDesc = 'evening at dusk, warm orange and pink sky';
  else if (hourNum >= 20 && hourNum < 22) timeDesc = 'twilight, deep blue sky with remaining glow on the horizon';
  else timeDesc = 'nighttime, dark sky, artificial lighting from the era';

  // Weather context from world state if available
  let weatherDesc = '';
  if (worldState?.states) {
    const s = worldState.states;
    const skyMap = { clear: 'clear blue sky', few: 'mostly clear sky with a few clouds', scattered: 'scattered clouds',
      broken: 'mostly cloudy, broken cloud cover', overcast: 'heavy overcast grey sky' };
    const precipMap = { none: '', light_rain: ', light rain falling', rain: ', steady rain', heavy_rain: ', heavy downpour',
      light_snow: ', light snowfall', snow: ', steady snowfall', heavy_snow: ', heavy blizzard conditions', sleet: ', icy sleet' };
    const comfortMap = { freezing: 'People bundled in heavy winter clothing.', cold: 'People wearing coats and warm layers.',
      cool: 'People in light jackets.', comfortable: 'People dressed comfortably for mild weather.',
      warm: 'People in light summer clothing.', hot: 'Oppressive heat visible in the atmosphere, people seeking shade.' };
    weatherDesc = `${skyMap[s.sky] || 'partly cloudy'}${precipMap[s.precip] || ''}. ${comfortMap[s.comfort] || ''}`;
  } else {
    weatherDesc = 'typical weather for the season and location.';
  }

  // Era exclusions (visual equivalent of audio anachronisms)
  const exclusions = getExclusionText(year)
    .replace(/Only sounds that existed/g, 'Only technology and objects that existed')
    .replace(/No /g, 'Do not show ');

  const prompt = [
    `Generate a photorealistic street-level photograph of ${location} in ${monthName} ${year}.`,
    `Time of day: ${timeDesc}.`,
    `Weather: ${weatherDesc}`,
    `The image must be historically accurate for ${year}. Show architecture, clothing, vehicles, signage, and street infrastructure authentic to this exact era and place.`,
    `Street-level perspective, as if taken by a photographer standing on the sidewalk.`,
    exclusions ? exclusions : '',
    `Style: photorealistic photograph shot on a modern digital camera with full vivid saturated color. Rich blues in the sky, warm skin tones, colorful fabrics and signage. Absolutely NOT sepia, NOT faded, NOT black and white, NOT desaturated. Full color exactly like a modern high-resolution photograph. Extremely detailed and immersive.`
  ].filter(Boolean).join(' ');

  return prompt;
}

/**
 * Push generated backdrop image to Unreal Engine.
 * Copies the image into the UE Content/Generated directory.
 * Unreal auto-reimports changed assets when "Monitor Content Directories" is on (default).
 * On first use, import backdrop.png via the Content Browser manually, then assign to the
 * BackdropPlane material. Subsequent generates auto-update the texture.
 */
async function pushBackdropToUnreal(opts = {}) {
  const backdropPath = path.join(__dirname, 'generated-textures', 'backdrop.png');
  if (!fs.existsSync(backdropPath)) {
    throw new Error('No generated image found. Generate an image first.');
  }

  const contentDir = opts.contentDir || process.env.UNREAL_CONTENT_DIR || '';
  if (!contentDir) {
    throw new Error('UNREAL_CONTENT_DIR env var or contentDir option is required');
  }

  // Copy image to Unreal Content directory
  const destDir = path.join(contentDir, 'Generated');
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, 'backdrop.png');
  fs.copyFileSync(backdropPath, destPath);
  console.log(`[Backdrop] Pushed to ${destPath}`);

  return { ok: true, message: 'Backdrop pushed to Unreal Content', destPath };
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

    if (req.method === 'GET' && urlPath === '/api/locales') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        locales: Object.keys(LOCALES),
        default: DEFAULT_LOCALE
      }));
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

        const config = {
          location: body.location,
          startDate: body.date || null,
          locale: body.locale || DEFAULT_LOCALE,
          timescale: body.timescale || 60,
          provider: body.provider || 'auto',
          mock: body.provider === 'mock'
        };

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
          provider: config.provider
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
          timescale: newEngine.timescale
        }));
      } catch (e) {
        console.error('[Engine] Launch failed:', e);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
      return;
    }

    if (req.method === 'POST' && urlPath === '/api/generate-image') {
      try {
        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: 'GEMINI_API_KEY environment variable is not set' }));
          return;
        }

        const body = await readBody(req);
        const worldState = engine ? engine.getState() : null;
        const prompt = buildImagePrompt(
          body.location || 'New York, NY',
          body.date || null,
          body.time || '12',
          worldState
        );

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`,
          {
            method: 'POST',
            headers: {
              'x-goog-api-key': geminiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                responseModalities: ['IMAGE'],
                imageConfig: { aspectRatio: '16:9' }
              }
            })
          }
        );

        if (!geminiRes.ok) {
          const errText = await geminiRes.text();
          console.error('[Gemini] API error:', geminiRes.status, errText);
          let errMsg = `Gemini API error: ${geminiRes.status}`;
          try {
            const errJson = JSON.parse(errText);
            if (geminiRes.status === 429) errMsg = 'Gemini API quota exceeded — check billing at ai.google.dev';
            else if (errJson.error?.message) errMsg = errJson.error.message;
          } catch (_) {}
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: errMsg }));
          return;
        }

        const geminiData = await geminiRes.json();
        const parts = geminiData.candidates?.[0]?.content?.parts || [];
        const imagePart = parts.find(p => p.inlineData || p.inline_data);

        if (!imagePart) {
          const textPart = parts.find(p => p.text);
          const reason = geminiData.candidates?.[0]?.finishReason || 'unknown';
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: `No image returned (reason: ${reason})${textPart ? ': ' + textPart.text.slice(0, 150) : ''}`, prompt }));
          return;
        }

        const imgData = imagePart.inlineData || imagePart.inline_data;
        const { mimeType, data } = imgData;

        // Save to disk for Unreal backdrop pipeline
        const texDir = path.join(__dirname, 'generated-textures');
        try {
          fs.mkdirSync(texDir, { recursive: true });
          fs.writeFileSync(path.join(texDir, 'backdrop.png'), Buffer.from(data, 'base64'));
          console.log('[Gemini] Saved backdrop to generated-textures/backdrop.png');
        } catch (saveErr) {
          console.error('[Gemini] Failed to save backdrop:', saveErr.message);
        }

        // Auto-push to Unreal if UNREAL_CONTENT_DIR is configured (fire-and-forget)
        const contentDir = process.env.UNREAL_CONTENT_DIR;
        if (contentDir) {
          pushBackdropToUnreal({ contentDir }).catch(err => {
            console.error('[Backdrop] Auto-push failed:', err.message);
          });
        }

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          ok: true,
          image: `data:${mimeType};base64,${data}`,
          prompt
        }));
      } catch (e) {
        console.error('[Gemini] Error:', e);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
      return;
    }

    if (req.method === 'POST' && urlPath === '/api/push-backdrop') {
      try {
        const body = await readBody(req);
        const result = await pushBackdropToUnreal({
          unrealHost: body.unrealHost,
          contentDir: body.contentDir,
          materialPath: body.materialPath,
          parameterName: body.parameterName
        });
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));
      } catch (e) {
        console.error('[Backdrop] Error:', e);
        res.statusCode = e.message.includes('required') ? 400 : 500;
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
      const assetPath = urlPath.replace('/audio-assets/', '');
      const filePath = path.join(__dirname, 'audio-assets', assetPath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.mp3': 'audio/mpeg',
        '.ogg': 'audio/ogg',
        '.wav': 'audio/wav',
        '.flac': 'audio/flac',
        '.m4a': 'audio/mp4'
      };
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.statusCode = 404;
          res.end('Asset not found');
          return;
        }
        res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.end(data);
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
  console.log(`[Engine] Location: ${args.location}`);
  console.log(`[Engine] Time scale: ${args.timescale}x`);
  const providerName = args.mock ? 'mock' : args.provider === 'visualcrossing' ? 'Visual Crossing' : args.provider === 'openmeteo' ? 'Open-Meteo' : args.provider === 'noaa' ? 'NOAA GHCN-Daily' : (getNOAAKey() ? 'NOAA (auto, pre-1940)' : getVCKey() ? 'Visual Crossing (auto)' : 'Open-Meteo (auto)');
  console.log(`[Engine] Weather provider: ${providerName}`);
  if (quiet) console.log(`[Engine] Quiet mode — only violations will be printed`);
  if (args.overnight) console.log(`[Engine] Overnight soak mode — summary on exit`);

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

  // Start initial engine
  const engine = await startEngine({
    location: args.location,
    startLocalISO: args.startDate,
    timescale: args.timescale,
    tickMs: args.tickMs,
    publishEveryMs: args.publishEveryMs,
    localePreset: args.locale,
    routesConfigPath: args.routesConfigPath,
    useMock: args.mock,
    provider: args.provider
  });
  engineRef.engine = engine;

  console.log(`[Engine] Start time: ${engine.simTime.toISOString()}`);
  console.log(`[Engine] Ready.`);

  const server = createServer(engineRef);
  const wss = new WebSocketServer(server);
  server.wss = wss;

  // Wire initial engine publish
  engineRef.unwire = wirePublish(engine, wss);

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
