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

## Daemon

The daemon (`tm-engine.js`) is a thin CLI + HTTP/WebSocket transport shell around `startEngine()`.

### Running the Daemon

```bash
./tm-engine.js -l "Baton Rouge, LA" -d "07-04-1978"    # Historical simulation
./tm-engine.js --port 3333 --timescale 120              # Custom port, 2min/sec
./tm-engine.js --routes routes.example.json             # With environment routing
```

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /worldstate` | Pull current world state (JSON) |
| `GET /status` | Engine status (uptime, clients, sim time) |
| `GET /` | Browser dashboard with live updates |
| `WebSocket /` | Push updates every 5 seconds |

### Flags

| Flag | Description |
|------|-------------|
| `-l, --location` | Location string (default: "Baton Rouge, LA") |
| `-d, --date` | Start date in MM-DD-YYYY format |
| `--port` | HTTP/WebSocket port (default: 3000) |
| `--timescale` | Simulation speed multiplier (default: 60) |
| `--locale` | Locale preset for environment tuning |
| `--routes` | Path to environment router JSON config |

## Architecture

This is a Node.js ES modules project:

### Core
- **cli.js** - Command-line interface with three input modes (TTY, piped, flags) and three output modes (raw, timeline, world)
- **tm-engine.js** - Daemon shell: CLI arg parsing, HTTP/WebSocket transport. Delegates to `startEngine()`
- **lib/runtimeEngine.js** - Runtime engine: world time progression, timeline caching, state smoothing, publish tick loop. Exports `startEngine()` and `easeWorldState()`
- **lib/environmentRouter.js** - Config-driven WorldState field mapping to downstream endpoints. Exports `evaluateRoutes()` and `validateConfig()`
- **lib/index.js** - Library entry point; exports `getWeather()`, `getMockWeather()`, and `createWeatherEngine()` factory

### Weather Providers
- **lib/openmeteo.js** - Open-Meteo API provider with geocoding, forecast (last 92 days + 16 days ahead), and historical archive (1940+). Includes confidence/resolution metadata based on data age.
- **lib/weather.js** - Mock weather provider for offline use and testing

### World State Pipeline
- **lib/weatherTimeline.js** - Fetches surrounding hours and interpolates to configurable intervals (default: 6hr window, 15min intervals)
- **lib/worldStateCompiler.js** - Compiles timeline into renderer-independent world state with categorical states and normalized controls (lighting, audio, atmosphere, visual)
- **lib/localePresets.js** - Environment-specific tuning presets (e.g., `baton_rouge_suburb`, `nyc_city`)

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
