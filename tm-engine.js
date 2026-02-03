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
import fs from 'fs';
import path from 'path';
import { getMockWeather } from './lib/weather.js';
import { getWeatherTimeline } from './lib/weatherTimeline.js';
import { compileWorldState } from './lib/worldStateCompiler.js';
import { LOCALES, DEFAULT_LOCALE } from './lib/localePresets.js';

// Configuration
const CONFIG = {
  port: parseInt(process.env.TM_PORT) || 3000,
  tickRateMs: 1000,           // Internal tick: 1Hz
  publishIntervalMs: 5000,    // Publish to clients: every 5s
  timeScale: 60,              // 1 real second = 60 sim seconds (1 min)
  easeRate: 0.1,              // Lerp factor for smooth transitions
  logFile: 'tm-engine.log',
  logMaxLines: 1000
};

// Parse arguments
function parseArgs(args) {
  const parsed = {
    location: 'Baton Rouge, LA',
    startDate: null,
    realtime: false,
    locale: DEFAULT_LOCALE,
    mock: true  // Default to mock until API rate limits reset
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--location' || arg === '-l') {
      parsed.location = args[++i];
    } else if (arg === '--date' || arg === '-d') {
      parsed.startDate = args[++i];
    } else if (arg === '--realtime') {
      parsed.realtime = true;
    } else if (arg === '--locale') {
      parsed.locale = args[++i];
    } else if (arg === '--port' || arg === '-p') {
      CONFIG.port = parseInt(args[++i]);
    } else if (arg === '--timescale') {
      CONFIG.timeScale = parseFloat(args[++i]);
    } else if (arg === '--no-mock') {
      parsed.mock = false;
    }
  }

  return parsed;
}

// Parse date string
function parseDate(dateStr) {
  if (!dateStr) return new Date();
  const match = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (match) {
    const [, month, day, year] = match;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0);
  }
  return new Date(dateStr);
}

// Linear interpolation
function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Ease between two world states (no snapping)
function easeWorldState(current, target, rate) {
  if (!current) return target;

  return {
    ...target,
    controls: {
      lighting: {
        exteriorLuminance: lerp(current.controls.lighting.exteriorLuminance, target.controls.lighting.exteriorLuminance, rate),
        colorTempK: lerp(current.controls.lighting.colorTempK, target.controls.lighting.colorTempK, rate),
        contrast: lerp(current.controls.lighting.contrast, target.controls.lighting.contrast, rate)
      },
      audio: {
        baseNoiseFloorDb: lerp(current.controls.audio.baseNoiseFloorDb, target.controls.audio.baseNoiseFloorDb, rate),
        windLevel: lerp(current.controls.audio.windLevel, target.controls.audio.windLevel, rate),
        rainLevel: lerp(current.controls.audio.rainLevel, target.controls.audio.rainLevel, rate)
      },
      atmosphere: {
        haze: lerp(current.controls.atmosphere.haze, target.controls.atmosphere.haze, rate),
        wetness: lerp(current.controls.atmosphere.wetness, target.controls.atmosphere.wetness, rate)
      },
      visual: {
        windDirection: lerp(current.controls.visual.windDirection, target.controls.visual.windDirection, rate),
        sunAltitude: lerp(current.controls.visual.sunAltitude, target.controls.visual.sunAltitude, rate),
        sunAzimuth: lerp(current.controls.visual.sunAzimuth, target.controls.visual.sunAzimuth, rate),
        precipDensity: lerp(current.controls.visual.precipDensity, target.controls.visual.precipDensity, rate),
        heatDistortion: lerp(current.controls.visual.heatDistortion, target.controls.visual.heatDistortion, rate)
      }
    }
  };
}

// Rolling log writer
class RollingLog {
  constructor(filepath, maxLines) {
    this.filepath = filepath;
    this.maxLines = maxLines;
    this.lines = [];
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filepath)) {
        const content = fs.readFileSync(this.filepath, 'utf8');
        this.lines = content.split('\n').filter(l => l.trim());
        if (this.lines.length > this.maxLines) {
          this.lines = this.lines.slice(-this.maxLines);
        }
      }
    } catch (e) {
      this.lines = [];
    }
  }

  write(entry) {
    const timestamp = new Date().toISOString();
    const line = `${timestamp} ${JSON.stringify(entry)}`;
    this.lines.push(line);
    if (this.lines.length > this.maxLines) {
      this.lines.shift();
    }
    fs.writeFileSync(this.filepath, this.lines.join('\n') + '\n');
  }
}

// WebSocket handling (minimal implementation without external deps)
class WebSocketServer {
  constructor(server) {
    this.clients = new Set();
    server.on('upgrade', (req, socket, head) => {
      this.handleUpgrade(req, socket);
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
    const crypto = require('crypto');
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

// Main Engine
class TimeMachineEngine {
  constructor(options) {
    this.location = options.location;
    this.locale = LOCALES[options.locale] || LOCALES[DEFAULT_LOCALE];
    this.useMock = options.mock;

    // World clock
    this.simTime = options.startDate ? parseDate(options.startDate) : new Date();
    this.realtime = options.realtime;
    this.lastTickTime = Date.now();

    // State
    this.currentState = null;
    this.targetState = null;
    this.timeline = null;

    // Logging
    this.log = new RollingLog(CONFIG.logFile, CONFIG.logMaxLines);

    // Tick counters
    this.tickCount = 0;
    this.publishTickInterval = CONFIG.publishIntervalMs / CONFIG.tickRateMs;
  }

  async initialize() {
    console.log(`[Engine] Initializing...`);
    console.log(`[Engine] Location: ${this.location}`);
    console.log(`[Engine] Start time: ${this.simTime.toISOString()}`);
    console.log(`[Engine] Time scale: ${CONFIG.timeScale}x`);
    console.log(`[Engine] Using ${this.useMock ? 'mock' : 'real'} weather provider`);

    await this.refreshTimeline();
    this.updateTargetState();
    this.currentState = this.targetState;

    console.log(`[Engine] Ready.`);
  }

  async refreshTimeline() {
    try {
      this.timeline = await getWeatherTimeline({
        location: this.location,
        centerDate: this.simTime,
        windowHours: 6,
        intervalMinutes: 15,
        useMock: this.useMock
      });
    } catch (e) {
      console.error(`[Engine] Failed to refresh timeline: ${e.message}`);
    }
  }

  updateTargetState() {
    if (!this.timeline) return;

    this.targetState = compileWorldState({
      timeline: this.timeline,
      locale: this.locale,
      now: this.simTime
    });
  }

  tick() {
    const now = Date.now();
    const deltaMs = now - this.lastTickTime;
    this.lastTickTime = now;

    // Advance simulation time
    if (this.realtime) {
      this.simTime = new Date();
    } else {
      const simDeltaMs = deltaMs * CONFIG.timeScale;
      this.simTime = new Date(this.simTime.getTime() + simDeltaMs);
    }

    // Update target state
    this.updateTargetState();

    // Ease current state toward target
    this.currentState = easeWorldState(this.currentState, this.targetState, CONFIG.easeRate);

    this.tickCount++;

    // Refresh timeline periodically (every ~5 minutes sim time)
    if (this.tickCount % 300 === 0) {
      this.refreshTimeline();
    }
  }

  shouldPublish() {
    return this.tickCount % this.publishTickInterval === 0;
  }

  getState() {
    return {
      ...this.currentState,
      engine: {
        simTime: this.simTime.toISOString(),
        realtime: this.realtime,
        timeScale: CONFIG.timeScale,
        tickCount: this.tickCount
      }
    };
  }

  logState() {
    const summary = {
      simTime: this.simTime.toISOString(),
      states: this.currentState?.states,
      luminance: this.currentState?.controls?.lighting?.exteriorLuminance
    };
    this.log.write(summary);
  }
}

// HTTP Server
function createServer(engine, wss) {
  return http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    if (req.method === 'GET' && req.url === '/worldstate') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(engine.getState(), null, 2));
    } else if (req.method === 'GET' && req.url === '/status') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        status: 'running',
        location: engine.location,
        simTime: engine.simTime.toISOString(),
        realtime: engine.realtime,
        timeScale: CONFIG.timeScale,
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
    } else {
      res.statusCode = 404;
      res.end('Not found');
    }
  });
}

// Main
async function main() {
  const args = parseArgs(process.argv.slice(2));

  const engine = new TimeMachineEngine(args);
  await engine.initialize();

  const server = createServer(engine, { clientCount: 0 });
  const wss = new WebSocketServer(server);

  // Update server reference for client count
  server.wss = wss;

  server.listen(CONFIG.port, () => {
    console.log(`[Server] HTTP:      http://localhost:${CONFIG.port}/worldstate`);
    console.log(`[Server] WebSocket: ws://localhost:${CONFIG.port}/`);
    console.log(`[Server] Status:    http://localhost:${CONFIG.port}/status`);
    console.log(`[Server] Dashboard: http://localhost:${CONFIG.port}/`);
    console.log('');
  });

  // Main loop
  setInterval(() => {
    engine.tick();

    if (engine.shouldPublish()) {
      const state = engine.getState();
      wss.broadcast(state);
      engine.logState();

      // Console output
      const s = state.states;
      const c = state.controls.lighting;
      console.log(
        `[${state.engine.simTime.slice(11, 19)}] ` +
        `${s.timeOfDay.padEnd(9)} ${s.sky.padEnd(9)} ${s.comfort.padEnd(6)} ` +
        `lum:${c.exteriorLuminance.toFixed(2)} clients:${wss.clientCount}`
      );
    }
  }, CONFIG.tickRateMs);
}

main().catch(console.error);
