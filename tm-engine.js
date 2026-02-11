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
import { startEngine } from './lib/runtimeEngine.js';
import { DEFAULT_LOCALE } from './lib/localePresets.js';

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
    routesConfigPath: null
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
    }
  }

  return parsed;
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

  console.log(`[Engine] Initializing...`);
  console.log(`[Engine] Location: ${args.location}`);
  console.log(`[Engine] Time scale: ${args.timescale}x`);

  const engine = await startEngine({
    location: args.location,
    startLocalISO: args.startDate,
    timescale: args.timescale,
    tickMs: args.tickMs,
    publishEveryMs: args.publishEveryMs,
    localePreset: args.locale,
    routesConfigPath: args.routesConfigPath
  });

  console.log(`[Engine] Start time: ${engine.simTime.toISOString()}`);
  console.log(`[Engine] Ready.`);

  const server = createServer(engine);
  const wss = new WebSocketServer(server);
  server.wss = wss;

  // Push state to WebSocket clients on every publish
  engine.onPublish((state) => {
    wss.broadcast(state);

    const s = state.states;
    const c = state.controls.lighting;
    console.log(
      `[${state.engine.simTime.slice(11, 19)}] ` +
      `${s.timeOfDay.padEnd(9)} ${s.sky.padEnd(9)} ${s.comfort.padEnd(6)} ` +
      `lum:${c.exteriorLuminance.toFixed(2)} clients:${wss.clientCount}`
    );
  });

  server.listen(args.port, () => {
    console.log(`[Server] HTTP:      http://localhost:${args.port}/worldstate`);
    console.log(`[Server] WebSocket: ws://localhost:${args.port}/`);
    console.log(`[Server] Status:    http://localhost:${args.port}/status`);
    console.log(`[Server] Dashboard: http://localhost:${args.port}/`);
    console.log('');
  });
}

main().catch(console.error);
