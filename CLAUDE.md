# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Weather Engine is a weather state generator for environmental simulation systems. By default, it fetches real weather data from the Open-Meteo API, with historical data available back to 1940. A mock provider is also available for offline use, testing, or deterministic simulation environments.

## Commands

Run the CLI directly (no build step required):
```bash
./cli.js                                    # Interactive mode
./cli.js -l "New York, NY" -d "06-15-2024"  # Direct mode with flags
./cli.js -l "London, UK" -d "01-01-1950"    # Historical data (back to 1940)
./cli.js -l "Paris, France" --mock          # Use mock provider (offline)
```

### Output Modes

Use `--mode` to control output format:
```bash
./cli.js -l "Baton Rouge, LA" -d "07-04-1978" --mode raw       # Default: single weather reading
./cli.js -l "Baton Rouge, LA" -d "07-04-1978" --mode timeline  # 6-hour interpolated timeline
./cli.js -l "Baton Rouge, LA" -d "07-04-1978" --mode world     # World state for renderers
```

Use `--locale` with world mode for environment-specific tuning:
```bash
./cli.js -l "New York, NY" -d "07-04-1978" --mode world --locale nyc_city
./cli.js -l "Baton Rouge, LA" -d "07-04-1978" --mode world --locale baton_rouge_suburb  # default
```

Run tests with Node's built-in test runner:
```bash
npm test
```

## Runtime Engine

The core simulation engine (`lib/runtimeEngine.js`) owns the tick loop and publishes WorldState on a fixed cadence. It can be used standalone as a library or via the daemon.

### startEngine() API

```js
import { startEngine } from './lib/runtimeEngine.js';

const engine = await startEngine({
  location: 'Baton Rouge, LA',       // Location string
  startLocalISO: '07-04-1978',       // ISO string or MM-DD-YYYY
  timescale: 60,                     // Sim speed multiplier (default: 1)
  tickMs: 1000,                      // Tick interval in ms (default: 1000)
  publishEveryMs: 5000,              // Publish interval in ms (default: 5000)
  localePreset: 'baton_rouge_suburb', // Locale preset key
  routesConfigPath: './routes.json'   // Optional: path to routes config
});

// Pull current state
const state = engine.getState();

// Subscribe to publish events (push)
const unsub = engine.onPublish((state) => {
  console.log(state.states, state.controls);
  console.log(state.routed); // present if routesConfigPath was provided
});

// Read-only properties
engine.simTime;    // Current simulation Date
engine.location;   // Location string
engine.timescale;  // Speed multiplier
engine.tickCount;  // Total ticks elapsed

// Stop the engine
engine.stop();
```

### Environment Router

The environment router (`lib/environmentRouter.js`) maps WorldState fields to downstream endpoint parameters via a JSON config file. When `routesConfigPath` is provided to `startEngine()`, routed values are included in every published state under `state.routed`.

See `routes.example.json` for a full config example. Transform types: `scale`, `map`, `curve`, `threshold`, `passthrough`.

### Endpoint Dispatcher

The dispatcher (`lib/dispatch.js`) sends routed payloads to downstream endpoints using a plugin transport model. It is called automatically on each publish tick when `routesConfigPath` is provided.

```js
import { dispatch, registerTransport } from './lib/dispatch.js';

// Replace a stubbed transport with a real one
registerTransport('http', async (config, params) => {
  await fetch(config.url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
});

// Manual dispatch (called automatically by startEngine when routes are configured)
const results = await dispatch(
  { unreal: { fogDensity: 0.003 }, dsp: { '/wind/gain': -48 } },
  config.endpoints
);
// results: { unreal: { ok: true, transport: 'http', params }, dsp: { ok: true, ... } }
```

Built-in transports (all stubbed, log only): `http`, `osc`, `log`.

### Rate Limiter

The rate limiter (`lib/rateLimiter.js`) sits between route evaluation and dispatch to prevent hour-boundary pops from reaching downstream endpoints. It enforces per-parameter change-rate limits with optional EMA smoothing.

Configure rate limits per route in the routes JSON config:

```json
{
  "source": "controls.audio.windLevel",
  "endpoint": "dsp",
  "param": "/buses/wind_bed/gain",
  "transform": { "type": "scale", "inputRange": [0, 1], "outputRange": [-60, 0] },
  "rateLimit": { "maxDelta": 6, "ema": 0.2 }
}
```

- `maxDelta` — max change per second per parameter. Deltas exceeding this are clamped.
- `ema` — optional EMA smoothing factor (0–1). Lower = smoother. Applied before clamping.

When a value is clamped, a violation is reported in the published state under `state.violations` and logged to the JSONL state log.

```js
import { createRateLimiter } from './lib/rateLimiter.js';

const limiter = createRateLimiter(config.routes);
const { clamped, violations } = limiter.limit(routed, dtSeconds);
```

### State Logging

The state logger (`lib/stateLog.js`) writes every published WorldState to a daily JSONL file at `logs/worldstate-YYYY-MM-DD.jsonl`. Each line contains `{ ts, simTime, states, controls, routed?, violations? }`. Logging is automatic when the engine runs; the `logDir` option (default: `"logs"`) controls the output directory.

### Replay CLI

The replay tool (`tm-replay.js`) reads a JSONL state log and feeds it through the rate limiter to detect snaps.

```bash
./tm-replay.js logs/worldstate-2026-02-17.jsonl                              # Raw delta scan
./tm-replay.js logs/worldstate-2026-02-17.jsonl --routes routes.example.json  # Rate-limit check
./tm-replay.js logs/worldstate-2026-02-17.jsonl --duration 30                 # Replay in 30s
```

Prints a summary with violation count, worst offenders, and largest raw control deltas. Exit code 0 if clean, 1 if violations detected.

## Daemon

The daemon (`tm-engine.js`) is a thin CLI + HTTP/WebSocket transport shell around `startEngine()`.

### Running the Daemon

```bash
./tm-engine.js -l "Baton Rouge, LA" -d "07-04-1978"    # Historical simulation
./tm-engine.js --port 3333 --timescale 120              # Custom port, 2min/sec
./tm-engine.js --routes routes.example.json             # With environment routing
./tm-engine.js --routes routes.example.json --quiet     # Only print violations
./tm-engine.js --routes routes.example.json --overnight # Soak test, summary on exit
```

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /worldstate` | Pull current world state (JSON) |
| `GET /status` | Engine status (uptime, clients, sim time) |
| `GET /` | Browser dashboard with live updates |
| `WebSocket /` or `/stream` | Push updates every 5 seconds |
| `GET /audio` | WebAudio browser client |
| `GET /viz` | WebGPU browser client |

### Flags

| Flag | Description |
|------|-------------|
| `-l, --location` | Location string (default: "Baton Rouge, LA") |
| `-d, --date` | Start date in MM-DD-YYYY format |
| `--port` | HTTP/WebSocket port (default: 3000) |
| `--timescale` | Simulation speed multiplier (default: 60) |
| `--locale` | Locale preset for environment tuning |
| `--routes` | Path to environment router JSON config |
| `--quiet` | Suppress per-tick output; only print violations |
| `--overnight` | Implies `--quiet`; prints summary on SIGINT/SIGTERM |

## Architecture

This is a Node.js ES modules project:

### Core
- **cli.js** - Command-line interface with three input modes (TTY, piped, flags) and three output modes (raw, timeline, world)
- **tm-engine.js** - Daemon shell: CLI arg parsing, HTTP/WebSocket transport. Delegates to `startEngine()`
- **lib/runtimeEngine.js** - Runtime engine: world time progression, timeline caching, state smoothing, publish tick loop. Exports `startEngine()` and `easeWorldState()`
- **lib/environmentRouter.js** - Config-driven WorldState field mapping to downstream endpoints. Exports `evaluateRoutes()` and `validateConfig()`
- **lib/dispatch.js** - Plugin-model endpoint dispatcher. Exports `dispatch()`, `registerTransport()`, `getTransport()`
- **lib/rateLimiter.js** - Per-parameter change-rate clamping with optional EMA smoothing. Exports `createRateLimiter()`
- **lib/stateLog.js** - JSONL state logger, writes daily files to `logs/`. Exports `createStateLog()`
- **tm-replay.js** - Replay CLI for feeding logged state through the rate limiter and reporting violations
- **lib/index.js** - Library entry point; exports `getWeather()`, `getMockWeather()`, and `createWeatherEngine()` factory

### Weather Providers
- **lib/openmeteo.js** - Open-Meteo API provider with geocoding, forecast (last 92 days + 16 days ahead), and historical archive (1940+). Includes confidence/resolution metadata based on data age.
- **lib/weather.js** - Mock weather provider for offline use and testing

### World State Pipeline
- **lib/weatherTimeline.js** - Fetches surrounding hours and interpolates to configurable intervals (default: 6hr window, 15min intervals)
- **lib/worldStateCompiler.js** - Compiles timeline into renderer-independent world state with categorical states and normalized controls (lighting, audio, atmosphere, visual)
- **lib/localePresets.js** - Environment-specific tuning presets (e.g., `baton_rouge_suburb`, `nyc_city`)

### Browser Clients
- **audio.html** - WebAudio ambient engine with 4 looping stems (bed, wind, rain, thunder). Served at `/audio`
- **viz.html** - WebGPU fullscreen renderer with sky, sun, clouds, rain, haze, heat distortion. Served at `/viz`

Both connect to the daemon via WebSocket at `/stream` and smoothly interpolate toward incoming WorldState values.

The world state output is designed to be self-sufficient: renderers can ignore raw weather data and drive entirely from `states` + `controls`.

## Known Limitations

### Timezone Handling (TODO)

Dates are currently interpreted in the **machine's local timezone**, not the target location's timezone. This means `07-04-1978` for Baton Rouge will be 3pm in whatever timezone the server runs in (e.g., UTC on cloud deployments), not 3pm Central Time.

**Current workaround:** Works correctly when the machine's timezone matches the target location.

**Proper fix (not yet implemented):**
1. Geocode first to get location's timezone (Open-Meteo returns this)
2. Interpret user's date/time as being in that timezone
3. Convert to UTC for API calls

The weather response now includes `timezone` and `timezoneAbbr` fields to support this fix.
