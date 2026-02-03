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

## Daemon

The Time Machine Engine (`tm-engine.js`) is an always-on service that publishes WorldState on a fixed cadence.

### Running the Daemon

```bash
./tm-engine.js -l "Baton Rouge, LA" -d "07-04-1978"    # Historical simulation
./tm-engine.js -l "Baton Rouge, LA" --realtime         # Real-time mode
./tm-engine.js --port 3333 --timescale 120             # Custom port, 2min/sec
```

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /worldstate` | Pull current world state (JSON) |
| `GET /status` | Engine status (uptime, clients, sim time) |
| `GET /` | Browser dashboard with live updates |
| `WebSocket /` | Push updates every 5 seconds |

### Configuration

- **Tick rate:** 1Hz internal
- **Publish interval:** Every 5 seconds
- **Time scale:** 60x default (1 real second = 1 sim minute)
- **Easing:** State transitions are smoothed (no snapping)
- **Log file:** `tm-engine.log` (rolling, 1000 lines)

### Flags

| Flag | Description |
|------|-------------|
| `-l, --location` | Location string (default: "Baton Rouge, LA") |
| `-d, --date` | Start date in MM-DD-YYYY format |
| `--realtime` | Use current real time instead of simulated |
| `--port` | HTTP/WebSocket port (default: 3000) |
| `--timescale` | Simulation speed multiplier (default: 60) |
| `--locale` | Locale preset for environment tuning |
| `--no-mock` | Use real Open-Meteo API instead of mock |

## Architecture

This is a Node.js ES modules project:

### Core
- **cli.js** - Command-line interface with three input modes (TTY, piped, flags) and three output modes (raw, timeline, world)
- **tm-engine.js** - Always-on daemon with HTTP/WebSocket transport, eased state transitions, and persistent world clock
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
