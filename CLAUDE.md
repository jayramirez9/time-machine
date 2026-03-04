# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product Vision

See **PRD.md** for the full Time Machine Experience Bible — the product constitution, non-negotiables, and system requirements. All implementation decisions must align with that document.

## Current Status

**Last updated**: 2026-03-04

**Active phase**: Phase 5 — Geographic Data Pipeline (see ROADMAP.md)

**What's done in Phase 5**:
- Cesium for Unreal plugin installed and verified (Baton Rouge, Manhattan, Grand Canyon)
- Cesium OSM Buildings streaming (~1.4B building volumes over Manhattan)
- Weather engine dispatch working over Cesium terrain (sun, fog, clouds, sky light)

**What's done in Phase 5** (continued):
- Location → Unreal automation: geocode → CesiumGeoreference dispatch via `lib/cesiumGeoreference.js`, coordinates in launcher UI + API

**What's next in Phase 5**:
- Terrain from DEM (USGS 3DEP or Cesium terrain tiles → Unreal Landscape)
- Satellite imagery base layer
- Google Photorealistic 3D Tiles evaluation (licensing concerns — see `docs/research-geo-pipeline.md`)
- Vector data ingestion (OSM roads, water, land-use)
- CesiumGeoreference objectPath: needs actual actor path from live Unreal level (placeholder in routes.json)

**Key research completed**:
- Cesium for Unreal architecture, pricing, capabilities (free plugin, optional Cesium Ion cloud)
- Two-track geo strategy decided: Cesium streaming for scouting, USGS heightmaps for production
- Google Photorealistic 3D Tiles NOT recommended for production (licensing restrictions)
- Full research in `docs/research-geo-pipeline.md`

**All prior phases complete**: Phase 0 (weather loop), Phase 1 (audio-visual coherence), Phase 2 (spatial audio — hardware pending), Phase 3 (pre-1940 weather), Phase 4 (era soundscapes — art pass pending)

## Project Overview

Weather Engine is a weather state generator for environmental simulation systems. It supports multiple weather providers: **Visual Crossing** (paid, no rate limits, data back to ~1970), **Open-Meteo** (free, historical data back to 1940), and **NOAA GHCN-Daily** (free, daily data back to ~1800s). Provider selection is automatic — for pre-1940 dates, NOAA is preferred when `NOAA_API_TOKEN` is set; for 1940+, Visual Crossing is preferred when `VISUALCROSSING_API_KEY` is set, with Open-Meteo as fallback. A mock provider is also available for offline use, testing, or deterministic simulation environments.

## Commands

Run the CLI directly (no build step required):
```bash
./cli.js                                    # Interactive mode
./cli.js -l "New York, NY" -d "06-15-2024"  # Direct mode with flags
./cli.js -l "London, UK" -d "01-01-1950"    # Historical data (back to 1940)
./cli.js -l "Paris, France" --mock          # Use mock provider (offline)
./cli.js -l "Baton Rouge, LA" -d "04-06-1983" --provider visualcrossing  # Force Visual Crossing
./cli.js -l "Baton Rouge, LA" -d "04-06-1983" --provider openmeteo      # Force Open-Meteo
./cli.js -l "New York, NY" -d "06-15-1884" --provider noaa              # Force NOAA (pre-1940)
```

### Weather Providers

Set environment variables for providers:
```bash
export VISUALCROSSING_API_KEY="your-key"    # Visual Crossing ($35/mo, no rate limits)
export NOAA_API_TOKEN="your-token"          # NOAA Climate Data Online (free, daily back to 1800s)
export ELEVENLABS_API_KEY="your-key"        # ElevenLabs (preferred, AI sound effects generation)
export FREESOUND_API_KEY="your-key"         # Freesound (legacy, CC-licensed audio search)
```

Provider auto-selection: `--provider auto` (default) uses NOAA for pre-1940 dates (if token set), Visual Crossing for 1940+ (if key set), else Open-Meteo. Use `--provider visualcrossing`, `--provider openmeteo`, or `--provider noaa` to force a specific provider.

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
./cli.js -l "New York, NY" -d "06-15-1884" --mode world --locale nyc_city_1884
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

Built-in transports: `http` (stubbed), `osc` (stubbed), `log` (stubbed), `unreal` (live — writes to Unreal via Remote Control API).

The `unreal` transport supports multiple actor dispatch types configured in the endpoint's `actors` map:
- `rotation` — batches Pitch/Yaw/Roll into `SetActorRotation` calls (used for DirectionalLight sun position)
- `property` — direct property write on a component (used for ExponentialHeightFog density)
- `material_scalar` — writes `ScalarParameterValues` on a MaterialInstance (used for volumetric cloud coverage)
- `niagara` — calls `SetVariableFloat` on a NiagaraComponent (used for precipitation particle spawn rate)
- `landscape_scalar` — calls `SetLandscapeMaterialScalarParameterValue` on a Landscape actor (used for ground wetness)
- `postprocess` — writes Settings struct properties on a PostProcessVolume with auto-override (used for heat haze)
- `call` — arbitrary function call on an actor

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
| `GET /` | Web launcher — pick location, date, time, provider and launch |
| `GET /dashboard` | Browser dashboard with live updates |
| `GET /api/status` | Engine status JSON (running, location, simTime, timescale) |
| `GET /api/locales` | Available locale presets |
| `POST /api/launch` | Stop engine, start new one with `{location, date, timescale, provider}` |
| `WebSocket /` or `/stream` | Push updates every 5 seconds |
| `GET /audio-engine` | Full 5-layer audio engine with audition panel (PRD Section 13) |
| `GET /audio` | Alias for `/audio-engine` |
| `GET /audio-profiles/:id` | Audio profile JSON |
| `GET /audio-assets/*` | Audio asset files (MP3, WAV, etc.) |
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
- **tm-engine.js** - Daemon shell: CLI arg parsing, HTTP/WebSocket transport, web launcher API. Supports runtime engine restart via `POST /api/launch`. Delegates to `startEngine()`
- **lib/runtimeEngine.js** - Runtime engine: world time progression, timeline caching, state smoothing, publish tick loop. Exports `startEngine()` and `easeWorldState()`
- **lib/environmentRouter.js** - Config-driven WorldState field mapping to downstream endpoints. Exports `evaluateRoutes()` and `validateConfig()`
- **lib/dispatch.js** - Plugin-model endpoint dispatcher. Exports `dispatch()`, `registerTransport()`, `getTransport()`
- **lib/rateLimiter.js** - Per-parameter change-rate clamping with optional EMA smoothing. Exports `createRateLimiter()`
- **lib/stateLog.js** - JSONL state logger, writes daily files to `logs/`. Exports `createStateLog()`
- **tm-replay.js** - Replay CLI for feeding logged state through the rate limiter and reporting violations
- **lib/timezone.js** - Zero-dependency timezone utilities using `Intl.DateTimeFormat`. Exports `localToUtc()`, `getLocalHour()`, `getLocalMinutes()`, `formatLocalISO()`, `getLocalDateStr()`
- **lib/eraData.js** - Shared era anachronisms timeline (~35 entries, 1712–2017). Single source of truth for technology introduction dates, used by `elevenlabs-fetch.js` (prompt exclusions) and `era-audit.js` (attribution auditing). Exports `getExclusionText(year)` and `getAuditPatterns(year)`
- **lib/math.js** - Shared interpolation utilities: `lerp()`, `lerpAngle()`
- **test/noaa.test.js** - Unit tests for the NOAA GHCN-Daily provider

### Weather Providers
- **lib/visualcrossing.js** - Visual Crossing API provider (paid, $35/mo). No rate limits, hourly data back to ~1970. Requires `VISUALCROSSING_API_KEY` env var. Same `getWeather()` interface as openmeteo.js. Includes API response caching.
- **lib/openmeteo.js** - Open-Meteo API provider with geocoding, forecast (last 92 days + 16 days ahead), and historical archive (1940+). Free, rate-limited. Includes confidence/resolution metadata based on data age.
- **lib/noaa.js** - NOAA GHCN-Daily API provider. Daily temperature, precipitation, wind, and snow observations from historical weather stations back to ~1800s. Requires `NOAA_API_TOKEN` env var. Free. Best for deep historical queries (pre-1940) where Open-Meteo has no data.
- **lib/weather.js** - Mock weather provider for offline use and testing

### World State Pipeline
- **lib/weatherTimeline.js** - Fetches surrounding hours and interpolates to configurable intervals (default: 6hr window, 15min intervals). Auto-selects provider: pre-1940 NOAA (if token set) > Visual Crossing (if key set) > Open-Meteo > Mock. Falls back to Open-Meteo if primary provider fails.
- **lib/worldStateCompiler.js** - Compiles timeline into renderer-independent world state with categorical states and normalized controls (lighting, audio, atmosphere, visual)
- **lib/localePresets.js** - Environment-specific tuning presets (e.g., `baton_rouge_suburb`, `nyc_city`, `nyc_city_1884`)

### Browser Clients
- **launcher.html** - Web launcher for picking location, date, time, timescale, and weather provider. POSTs to `/api/launch` to start/restart the engine. Shows live status via WebSocket. Served at `/`
- **audio-engine.html** - Full 5-layer PRD audio engine (PRD Section 13) with audition panel. Served at `/audio-engine` (and `/audio`). Layers: Base Bed (crossfade-rotating), Directional Beds (N/E/S/W panned), Micro-Events (procedurally scheduled one-shots with bag-draw), Weather (wind/gust/rain/thunder), Occlusion. Audition panel: collapsible panel listing every loaded sound grouped by layer with play/stop buttons for debugging individual assets in isolation
- **viz.html** - WebGPU fullscreen renderer with sky, sun, clouds, rain, haze, heat distortion. Served at `/viz`

All clients connect to the daemon via WebSocket at `/stream` and smoothly interpolate toward incoming WorldState values.

#### Audio Spatial Features

The audio engine supports two spatial modes, auto-selected based on profile schema version:

- **v2 profiles** (`schemaVersion: 2`): HRTF spatial panning via `PannerNode` with full 3D positioning (azimuth, elevation, distance). Listener position and orientation configured from profile's `listener` block. Distance-based low-pass filter simulates air absorption.
- **v1 profiles**: Stereo `StereoPannerNode` fallback with jittered pan positions.

**Doppler pitch shift**: Micro-events with `dopplerFactor > 0` get automatic `playbackRate` automation during motion. Three variants: `passby` (high→normal→low), `approach` (high→normal), `recede` (normal→low). Uses half of `dopplerFactor` as max pitch deviation.

**Convolution reverb**: Synthetic impulse responses generated algorithmically (no external IR files). Enclosure-aware configs (`open_window`, `porch`, `street`, `indoor`) control decay, HF damping, and early reflection gain. Surface-aware send levels per micro-event (`granite_sett` +3dB, `iron_rail` +2dB, `wood_plank` −2dB, `dirt` −4dB). Wet/dry parallel send from each one-shot to a shared ConvolverNode.

### Audio Profiles
- **audio-profiles/*.json** - AudioProfile presets defining all sound assets and scheduling rules for a locale/era. Served at `/audio-profiles/:id`. Two schema versions:
  - **v1** (`baton_rouge_suburb_1978`): Stereo pan positions, basic scheduling. No spatial metadata.
  - **v2** (`nyc_city_1884`, `schemaVersion: 2`): Full HRTF spatial metadata per source (azimuth, elevation, distance), listener position/enclosure/facing, motion paths with doppler factors, surface types for reverb sends, IR profile for convolution reverb, voice generation config (`voiceConfig` + per-event `voice`/`phrases`). See `docs/audio-profile-schema-v2.md` for full spec.
- **audio-assets/{profile_id}/** - Downloaded/generated audio files (MP3) served at `/audio-assets/*`. Gitignored (large binaries). Regenerate with `tools/elevenlabs-fetch.js` (preferred) or `tools/freesound-fetch.js` (legacy).

### Cesium Integration (Phase 5)
- **Cesium for Unreal** plugin provides real-world geospatial terrain and building data. Installed via Fab/Marketplace.
- **CesiumGeoreference** actor sets the world origin to a lat/lon. Controllable via Remote Control API: `OriginLatitude`, `OriginLongitude`, `OriginHeight` properties on the actor's objectPath (not RootComponent). Automated via `lib/cesiumGeoreference.js` — dispatched automatically by `startEngine()` when `cesiumGeoreference` config is present in the routes JSON.
- **lib/cesiumGeoreference.js** - One-shot dispatch of lat/lon/height to CesiumGeoreference actor. Called by runtime engine after geocoding. Exports `setCesiumGeoreference()`.
- **Cesium World Terrain** streams global terrain with satellite imagery. Added via Cesium panel Quick Add.
- **Cesium OSM Buildings** streams ~1.4B building volumes from OpenStreetMap. Added via Cesium panel Quick Add (asset ID 96188).
- **Location → Unreal automation**: Type a location in the web launcher → geocode → dispatch lat/lon to CesiumGeoreference → Cesium tiles re-stream around the new origin. Coordinates shown in launcher status bar and `/api/status` response. Configure the actor objectPath in routes JSON under `cesiumGeoreference.objectPath`.
- Weather engine dispatch (sun, fog, clouds, sky light) works over Cesium terrain — verified with moving shadows on Manhattan.
- See `docs/research-geo-pipeline.md` for full research on approaches, licensing, and the two-track strategy (Cesium streaming for scouting, USGS heightmaps for production).

### Route Configs
- **routes.json** - Production routes config. Unreal routes (sun position, fog, clouds, sky light), DSP routes, lighting routes. Actor objectPaths must match the current level — update the level path prefix when switching projects.
- **routes.example.json** - Annotated example routes config showing all transform types and actor dispatch configurations.

### Tools
- **tools/elevenlabs-fetch.js** - **Primary audio asset generator.** Uses ElevenLabs Text-to-Sound Effects API to generate era-appropriate audio from text prompts. Prompts are built from profile context (era, description, surface, motion) — no anachronism risk. Generates MP3 at 44.1kHz/128kbps (WAV for impulse responses), writes a GENERATION_MANIFEST.json. Requires `ELEVENLABS_API_KEY` env var. Usage: `ELEVENLABS_API_KEY=xxx ./tools/elevenlabs-fetch.js audio-profiles/nyc_city_1884.json [--dry-run] [--only beds|micro|weather|ir] [--force]`
- **tools/freesound-fetch.js** - Legacy Freesound API asset fetcher. Searches for CC-licensed sounds by label keyword, downloads preview MP3s. Lower quality than ElevenLabs, prone to era mismatches (modern traffic in historical profiles). Still useful for natural recordings (birds, weather) where recorded audio may be preferred. Requires `FREESOUND_API_KEY` env var.
- **tools/elevenlabs-voice-fetch.js** - **Voice generation tool.** Uses ElevenLabs Text-to-Speech API to generate period-appropriate spoken phrases (vendor cries, newsboy calls, children's shouts) for micro-events with `voice` + `phrases` fields. Auto-selects voices from the ElevenLabs library based on profile `voiceConfig` descriptions, caches voice IDs back to the profile. Generated clips are added as additional sources alongside existing SFX — the engine's bag-draw naturally mixes them. Writes VOICE_MANIFEST.json. Requires `ELEVENLABS_API_KEY` env var. Usage: `ELEVENLABS_API_KEY=xxx ./tools/elevenlabs-voice-fetch.js audio-profiles/nyc_city_1884.json [--dry-run] [--only <event_id>] [--force] [--list-voices]`
- **tools/era-audit.js** - Era validation tool. Scans audio profile attributions for anachronistic sounds that don't belong in the target era. Uses shared anachronism data from `lib/eraData.js` for year-precise keyword checks, plus supplementary context and mismatch patterns. Usage: `./tools/era-audit.js audio-profiles/nyc_city_1884.json`
- **tools/spawn-greybox.js** - Unreal scene spawner for the 1884 NYC greybox. Spawns 12 brownstone blocks (2 rows of 6 scaled cubes), 4 gas lamp PointLights, and moves PlayerStart to 2nd floor listener position. Uses Unreal Remote Control API directly for objectPath-based actor configuration. Usage: `node tools/spawn-greybox.js [--host http://localhost:30010]`
- **bin/time-machine** - Shell launcher script. Sources `.env`, starts the daemon, waits for it to be ready, and opens `http://localhost:3000/` in the browser. Detects if already running. Aliased as `time-machine` in user's shell. Usage: `time-machine` or `time-machine --no-open`

### Extended Audio Controls (WorldState)
The world state compiler (`lib/worldStateCompiler.js`) now produces extended audio controls beyond the original 3:
- `gustiness` (0-1) — wind gust intensity derived from wind speed classification
- `thunderProb` (0-1) — probability of thunder events, derived from rain level
- `activityLevel` (0-1) — locale activity modulated by time of day
- `timeOfDayPhase` (0-1) — continuous day position (0=midnight, 0.5=noon)
- `snowLevel` (0-1) — snow audio level, separate from rain
- `windDirection` (degrees) — duplicated from visual for audio independence

The world state output is designed to be self-sufficient: renderers can ignore raw weather data and drive entirely from `states` + `controls`.

### Timezone Handling

All date interpretation is timezone-aware. When a user specifies "07-04-1978" for Baton Rouge, the system geocodes first to get the IANA timezone (`America/Chicago`), then interprets the date as 3pm Central Time — not server-local time.

The flow: `geocode(location)` → `localToUtc(year, month, day, hour, minute, timezone)` → UTC Date for API calls.

**`lib/timezone.js`** provides zero-dependency utilities using built-in `Intl.DateTimeFormat`:
- `localToUtc()` — wall-clock time at a location → UTC Date
- `getLocalHour()` / `getLocalMinutes()` — UTC Date → local time components
- `formatLocalISO()` — UTC Date → ISO string in local time
- `getLocalDateStr()` — UTC Date → YYYY-MM-DD in local time

All functions gracefully fall back to machine-local when timezone is null.
