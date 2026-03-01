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
import { DEFAULT_LOCALE } from './lib/localePresets.js';
import { getApiKey as getVCKey } from './lib/visualcrossing.js';

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

// HTTP Server
function createServer(engine) {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    const wss = server.wss;

    if (req.method === 'GET' && req.url === '/worldstate') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(engine.getState(), null, 2));
    } else if (req.method === 'GET' && req.url === '/status') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        status: 'running',
        location: engine.location,
        simTime: engine.simTime.toISOString(),
        timescale: engine.timescale,
        clients: wss.clientCount,
        uptime: process.uptime()
      }));
    } else if (req.method === 'GET' && req.url === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end(`
<!DOCTYPE html>
<html>
<head><title>Time Machine Engine</title></head>
<body>
<h1>Time Machine Engine</h1>
<p>Location: ${engine.location}</p>
<p>Sim Time: <span id="simTime">-</span></p>
<pre id="state"></pre>
<script>
const ws = new WebSocket('ws://' + location.host + '/');
ws.onmessage = (e) => {
  const data = JSON.parse(e.data);
  document.getElementById('simTime').textContent = data.engine.simTime;
  document.getElementById('state').textContent = JSON.stringify(data, null, 2);
};
</script>
</body>
</html>
      `);
    } else if (req.method === 'GET' && (req.url === '/audio' || req.url === '/audio/')) {
      serveHtml(res, path.join(__dirname, 'audio.html'));
    } else if (req.method === 'GET' && (req.url === '/audio-engine' || req.url === '/audio-engine/')) {
      serveHtml(res, path.join(__dirname, 'audio-engine.html'));
    } else if (req.method === 'GET' && req.url.startsWith('/audio-profiles/')) {
      const profileId = req.url.replace('/audio-profiles/', '').replace(/\.json$/, '').replace(/\/$/, '');
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
    } else if (req.method === 'GET' && req.url.startsWith('/audio-assets/')) {
      const assetPath = req.url.replace('/audio-assets/', '');
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
    } else if (req.method === 'GET' && (req.url === '/viz' || req.url === '/viz/')) {
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
  const providerName = args.mock ? 'mock' : args.provider === 'visualcrossing' ? 'Visual Crossing' : args.provider === 'openmeteo' ? 'Open-Meteo' : (getVCKey() ? 'Visual Crossing (auto)' : 'Open-Meteo (auto)');
  console.log(`[Engine] Weather provider: ${providerName}`);
  if (quiet) console.log(`[Engine] Quiet mode — only violations will be printed`);
  if (args.overnight) console.log(`[Engine] Overnight soak mode — summary on exit`);

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

  console.log(`[Engine] Start time: ${engine.simTime.toISOString()}`);
  console.log(`[Engine] Ready.`);

  const server = createServer(engine);
  const wss = new WebSocketServer(server);
  server.wss = wss;

  // Violation tracking for quiet/overnight modes
  const stats = {
    publishCount: 0,
    totalViolations: 0,
    maxDeltaSeen: {},
    startedAt: Date.now()
  };

  // Push state to WebSocket clients on every publish
  engine.onPublish((state) => {
    wss.broadcast(state);
    stats.publishCount++;

    const violations = state.violations || [];

    // Track violation stats
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
      // Only print violations
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
    engine.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    printSummary();
    engine.stop();
    process.exit(0);
  });

  server.listen(args.port, () => {
    console.log(`[Server] HTTP:      http://localhost:${args.port}/worldstate`);
    console.log(`[Server] WebSocket: ws://localhost:${args.port}/ or /stream`);
    console.log(`[Server] Status:    http://localhost:${args.port}/status`);
    console.log(`[Server] Dashboard: http://localhost:${args.port}/`);
    console.log(`[Server] Audio:     http://localhost:${args.port}/audio`);
    console.log(`[Server] Audio v2:  http://localhost:${args.port}/audio-engine`);
    console.log(`[Server] Viz:       http://localhost:${args.port}/viz`);
    console.log('');
  });
}

main().catch(console.error);
