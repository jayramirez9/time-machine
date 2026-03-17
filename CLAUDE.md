# CLAUDE.md

## Product Vision

See **PRD.md** for the full Time Machine Experience Bible — the product constitution, non-negotiables, and system requirements. All implementation decisions must align with that document.

## Project Overview

Weather Engine is a weather state generator for environmental simulation systems. It supports multiple weather providers: **Visual Crossing** (paid, no rate limits, data back to ~1970), **Open-Meteo** (free, historical data back to 1940), and **NOAA GHCN-Daily** (free, daily data back to ~1800s). Provider selection is automatic — for pre-1940 dates, NOAA is preferred when `NOAA_API_TOKEN` is set; for 1940+, Visual Crossing is preferred when `VISUALCROSSING_API_KEY` is set, with Open-Meteo as fallback. A mock provider is also available for offline use, testing, or deterministic simulation environments.

This is a Node.js ES modules project. No build step required.

## Quick Reference

```bash
# CLI
./cli.js -l "New York, NY" -d "06-15-2024"              # Direct mode
./cli.js -l "Baton Rouge, LA" -d "07-04-1978" --mode world --locale baton_rouge_suburb

# Daemon
./tm-engine.js -l "Baton Rouge, LA" -d "07-04-1978"     # Start engine
./tm-engine.js --routes routes.example.json --timescale 120

# Tests
npm test

# Launch (opens browser)
time-machine
```

## Environment Variables

```bash
export VISUALCROSSING_API_KEY="your-key"    # Visual Crossing ($35/mo, no rate limits)
export NOAA_API_TOKEN="your-token"          # NOAA Climate Data Online (free, daily back to 1800s)
export ELEVENLABS_API_KEY="your-key"        # ElevenLabs (preferred, AI sound effects generation)
export FREESOUND_API_KEY="your-key"         # Freesound (legacy, CC-licensed audio search)
export GOOGLE_3D_TILES_API_KEY="your-key"   # Google Photorealistic 3D Tiles (scouting/preview only)
export MESHY_API_KEY="your-key"             # Meshy (AI 3D model generation, $20/mo Pro)
export GOOGLE_AI_API_KEY="your-key"         # Google AI / Gemini (reference image generation)
```

Provider auto-selection: `--provider auto` (default) uses NOAA for pre-1940 dates (if token set), Visual Crossing for 1940+ (if key set), else Open-Meteo.

---

## Architecture

### Weather Pipeline

```
Weather Provider → Timeline Interpolation → World State Compiler → Locale Preset Tuning
```

**Providers** (`lib/`): `visualcrossing.js` (paid, hourly back to ~1970), `openmeteo.js` (free, 1940+), `noaa.js` (free, daily back to ~1800s), `weather.js` (mock/offline)

**Pipeline** (`lib/`):
- `weatherTimeline.js` — fetches surrounding hours, interpolates to 15min intervals, auto-selects provider with fallback chain
- `worldStateCompiler.js` — compiles timeline into renderer-independent world state with categorical states and normalized controls (lighting, audio, atmosphere, visual)
- `localePresets.js` — environment-specific tuning (`baton_rouge_suburb`, `nyc_city`, `nyc_city_1884`)

### Runtime Engine

The core simulation engine (`lib/runtimeEngine.js`) owns the tick loop and publishes WorldState on a fixed cadence. Used standalone as a library or via the daemon.

```js
import { startEngine } from './lib/runtimeEngine.js';

const engine = await startEngine({
  location: 'Baton Rouge, LA',
  startLocalISO: '07-04-1978',
  timescale: 60,              // Sim speed multiplier (default: 1)
  tickMs: 1000,               // Tick interval in ms (default: 1000)
  publishEveryMs: 5000,       // Publish interval in ms (default: 5000)
  localePreset: 'baton_rouge_suburb',
  routesConfigPath: './routes.json'
});

const state = engine.getState();
const unsub = engine.onPublish((state) => { /* state.states, state.controls, state.routed */ });
engine.simTime; engine.location; engine.timescale; engine.tickCount;
engine.stop();
```

### Environment Router & Dispatch

The router (`lib/environmentRouter.js`) maps WorldState fields to downstream endpoint parameters via JSON config. Transform types: `scale`, `map`, `curve`, `threshold`, `passthrough`. See `routes.example.json`.

The dispatcher (`lib/dispatch.js`) sends routed payloads to endpoints using a plugin transport model. Called automatically on each publish tick when routes are configured.

```js
import { dispatch, registerTransport } from './lib/dispatch.js';
registerTransport('http', async (config, params) => { /* ... */ });
```

Built-in transports: `http` (stubbed), `osc` (stubbed), `log` (stubbed), `unreal` (live — writes to Unreal via Remote Control API).

**Unreal transport dispatch types** (configured in endpoint's `actors` map):
- `rotation` — batches Pitch/Yaw/Roll into `SetActorRotation` (sun position)
- `property` — direct property write on a component (fog density)
- `material_scalar` — `ScalarParameterValues` on MaterialInstance (cloud coverage)
- `niagara` — `SetVariableFloat` on NiagaraComponent (precipitation spawn rate)
- `landscape_scalar` — `SetLandscapeMaterialScalarParameterValue` (ground wetness)
- `postprocess` — Settings struct properties on PostProcessVolume with auto-override (heat haze)
- `call` — arbitrary function call on an actor

### Rate Limiter

`lib/rateLimiter.js` sits between route evaluation and dispatch to prevent hour-boundary pops. Per-parameter change-rate limits with optional EMA smoothing.

```json
{
  "source": "controls.audio.windLevel",
  "endpoint": "dsp",
  "param": "/buses/wind_bed/gain",
  "transform": { "type": "scale", "inputRange": [0, 1], "outputRange": [-60, 0] },
  "rateLimit": { "maxDelta": 6, "ema": 0.2 }
}
```

- `maxDelta` — max change per second. Deltas exceeding this are clamped.
- `ema` — optional smoothing factor (0–1). Lower = smoother.

Violations reported in `state.violations` and logged to JSONL state log.

### State Logging & Replay

`lib/stateLog.js` writes every published WorldState to `logs/worldstate-YYYY-MM-DD.jsonl`. Each line: `{ ts, simTime, states, controls, routed?, violations? }`.

`tm-replay.js` reads a JSONL log and feeds it through the rate limiter to detect snaps:
```bash
./tm-replay.js logs/worldstate-2026-02-17.jsonl --routes routes.example.json
```

### Timezone Handling

All date interpretation is timezone-aware. Flow: `geocode(location)` → `localToUtc(year, month, day, hour, minute, timezone)` → UTC Date for API calls.

`lib/timezone.js` (zero-dependency, uses `Intl.DateTimeFormat`): `localToUtc()`, `getLocalHour()`, `getLocalMinutes()`, `formatLocalISO()`, `getLocalDateStr()`. Falls back to machine-local when timezone is null.

---

## Daemon (`tm-engine.js`)

Thin CLI + HTTP/WebSocket transport shell around `startEngine()`.

```bash
./tm-engine.js -l "Baton Rouge, LA" -d "07-04-1978"
./tm-engine.js --port 3333 --timescale 120
./tm-engine.js --routes routes.example.json --quiet
./tm-engine.js --routes routes.example.json --overnight   # Soak test
```

**Flags**: `-l/--location`, `-d/--date` (MM-DD-YYYY), `--port` (default 3000), `--timescale` (default 60), `--locale`, `--routes`, `--quiet`, `--overnight`

**HTTP Endpoints**:

| Endpoint | Description |
|----------|-------------|
| `GET /` | Web launcher |
| `GET /worldstate` | Current world state JSON |
| `GET /status`, `GET /api/status` | Engine status |
| `GET /api/locales` | Available locale presets |
| `POST /api/launch` | Restart engine with new params |
| `GET /dashboard` | Browser dashboard with live updates |
| `GET /audio-engine` (or `/audio`) | 5-layer audio engine with audition panel |
| `GET /audio-profiles/:id` | Audio profile JSON |
| `GET /audio-assets/*` | Audio asset files |
| `GET /viz` | WebGPU browser client |
| `WebSocket /` or `/stream` | Push updates every 5s |

**Launcher**: `bin/time-machine` — shell script that sources `.env`, starts daemon, opens browser.

---

## Audio System

### Browser Audio Engine (`audio-engine.html`)

5-layer engine (PRD Section 13): Base Bed (crossfade-rotating), Directional Beds (N/E/S/W panned), Micro-Events (procedurally scheduled one-shots with bag-draw), Weather (wind/gust/rain/thunder), Occlusion. Includes audition panel for debugging individual assets.

**Spatial modes** (auto-selected by profile schema version):
- **v2**: HRTF spatial panning via `PannerNode` with 3D positioning. Distance-based low-pass filter for air absorption.
- **v1**: Stereo `StereoPannerNode` fallback with jittered pan.

**Doppler**: Micro-events with `dopplerFactor > 0` get `playbackRate` automation. Variants: `passby`, `approach`, `recede`.

**Convolution reverb**: Synthetic impulse responses (no external IR files). Enclosure-aware configs (`open_window`, `porch`, `street`, `indoor`). Surface-aware send levels per micro-event.

### Audio Profiles (`audio-profiles/*.json`)

- **v1** (`baton_rouge_suburb_1978`): Stereo pan, basic scheduling.
- **v2** (`nyc_city_1884`, `schemaVersion: 2`): HRTF spatial metadata, listener position/enclosure/facing, motion paths with doppler, surface types for reverb, IR profile, voice generation config. See `docs/audio-profile-schema-v2.md`.

Assets in `audio-assets/{profile_id}/` (gitignored). Regenerate with `tools/elevenlabs-fetch.js`.

### Extended Audio Controls (WorldState)

`worldStateCompiler.js` produces: `gustiness`, `thunderProb`, `activityLevel`, `timeOfDayPhase`, `snowLevel`, `windDirection` — plus the original `windLevel`, `rainLevel`, `ambientLevel`.

The world state is self-sufficient: renderers drive entirely from `states` + `controls`.

---

## Unreal Integration

### Cesium Geospatial

- **Cesium for Unreal** plugin provides terrain + building streaming. Installed via Fab/Marketplace.
- **CesiumGeoreference** sets world origin to lat/lon. Controllable via RC API (properties on objectPath, not RootComponent).
- **Cesium World Terrain** + **OSM Buildings** (asset ID 96188) added via Quick Add.
- **Auto-georeference on engine start**: geocodes location, calls `setGeoreference()` to teleport scene.
- **Auto-height**: `estimateHeight()` queries USGS 3DEP for ground level + 2m eye offset.
- **Google 3D Tiles** (scouting only, not production — ToS restrictions). Toggle in launcher.
- **`lib/cesiumGeoreference.js`**: discover actor, write origin, estimate height, check connectivity.
- **`lib/cesiumTileset.js`**: discover tileset actors, set/clear URL, get status.
- **Status endpoint**: `GET /api/unreal-status` → `{ reachable, cesiumFound, origin, tileset }`.

See `docs/research-geo-pipeline.md` and `docs/research-historical-built-environment.md`.

### Terrain Pipeline

Two-track strategy: Cesium streaming for scouting, USGS heightmaps for production Landscape actors.

**DEM workflow**: `fetch-dem.js` → `fetch-imagery.js` → `import-terrain.js`. Output to `terrain-data/{slug}/` (gitignored). GDAL required (`brew install gdal`).

Manhattan test data: `terrain-data/manhattan-ny/` — 1009×1009 R16 heightmap, 2048×2048 NAIP imagery.

### 3D Asset Generation (Meshy)

AI-powered 3D building generation using Meshy 6 API.

**Three modes**: text prompt → 3D, reference image → 3D, retexture existing geometry with period materials.
**Output**: FBX/GLB with PBR maps (base color, metallic, roughness). 100–300K polys.
**Pipeline hierarchy**: (1) Historical photo → Image-to-3D (hero), (2) Sanborn + Text-to-3D (block), (3) Massing + Retexture (background).
**Credits**: Preview 20, texture 10, image-to-3D+texture 30. Pro: 1,000/month ($20).

`lib/meshyClient.js`: `createTextTo3D()`, `createImageTo3D()`, `createRetexture()`, `pollTask()`, `downloadModel()`, `getBalance()`.
`lib/geminiImageGen.js`: Gemini reference image generation for Meshy Image-to-3D pipeline.
`lib/meshImport.js`: Import FBX/GLB into Unreal via RC API, match to footprint positions.
`lib/texturePromptBuilder.js`: Pure-function prompt generation from building metadata. Quality tiers control polycount.

See `docs/research-meshy.md`.

### Unreal Spawn Infrastructure

Shared utilities for spawning actors via Unreal Remote Control API:

- `lib/rcHelpers.js` — RC client + CLI arg parsing. Used by all `spawn-*.js` tools.
- `lib/spawnScript.js` — Python script generation primitives (header, clear, mesh/light items).
- `lib/buildingMassing.js` — GeoJSON footprints → scaled cubes (350cm/floor), axis-aligned bounding boxes.
- `lib/streetMeshing.js` — Road spline control points → flat slab segments + raised sidewalks.
- `lib/lampPlacement.js` — Gas lamp positions along splines, 2200K PointLights at 4.2m, intersection dedup.
- `lib/landmarks.js` — Multi-primitive hero building compositions from `landmarks.json`.
- `lib/propCatalog.js` — 16 era-appropriate street furniture types with introduction/removal years.
- `lib/propPlacement.js` — Prop placement engine with deterministic seeded PRNG.

### Agent Layer (`lib/agents/`)

Phase 7 research agents that produce Environment Profile layers:

- `weatherAgent.js` — Researches weather data availability. Ranks providers by year + API keys, probes NOAA stations. Exports `researchWeather()`, `rankProviders()`, `calculateConfidence()`, `PROVIDERS`.
- `ecologyAgent.js` — Builds species pools from embedded regional database (25+ species). Filters by year (introduction dates), region, habitat. Exports `researchEcology()`, `SPECIES_DB`, `getSpeciesForRegion()`, `filterByYear()`.
- `urbanFormAgent.js` — Assesses building/street/landmark data availability. Reads terrain-data metadata, checks Sanborn coverage, resolves architecture era. Exports `researchUrbanForm()`, `assessTerrainData()`, `SANBORN_COVERAGE`.
- `culturalAgent.js` — Produces culture + music layers from embedded era databases. Street vendors, daily life, languages, music formats. Exports `researchCulture()`, `ERA_CULTURE_DB`, `MUSIC_ERA_DB`, `getMusicEra()`.
- `photoArchiveAgent.js` — Catalogs available photo archives for a location + year. 8 major US collections with API availability. Exports `researchPhotoArchives()`, `PHOTO_ARCHIVES`, `matchArchives()`.
- `materialsInfraAgent.js` — Road surfaces, building facades, roofing by era + infrastructure timeline (lighting, transport, utilities). Exports `researchMaterials()`, `researchInfrastructure()`, `INFRASTRUCTURE_TIMELINE`.
- `profileAssembler.js` — **Orchestrator.** Geocodes, runs all agents in parallel, merges into Environment Profile, generates accuracy manifest. Exports `assembleProfile()`.

### Environment Profiles (`profiles/`)

Environment Profiles are the complete description of a place at a moment in history — the master document that the agent pipeline (Phase 7) produces. 9 layers: terrain, weather, soundscape, urbanForm, ecology, culture, music, materials, infrastructure. Each layer has `{ data, confidence, sources, knownCompromises }`. See `docs/environment-profile-schema.md` for the full spec.

- `profiles/nyc_1884.json` — first complete profile (all 9 layers populated, hand-authored)
- `lib/environmentProfile.js` — validation, loading, layer helpers, accuracy manifest generation

### Historical Urban Form Libraries

- `lib/architectureStyles.js` — Era-appropriate building classification. Maps (material + use + stories) → style with floor heights, cornice heights, roof types. 10 styles for nyc_1884, skeleton eras, 8 general American styles, 8 era presets (~1700–present). `classifyBuilding()`, `resolveEra()`, `getFloorHeight()`.
- `lib/streetLayout.js` — Era-appropriate street surfaces. Maps OSM road subcategories → historical surfaces (belgian_block, cobblestone, dirt), widths, sidewalk dims, lamp spacing. `classifyStreet()`, `findIntersections()`.
- `lib/sanborn.js` — Library of Congress Sanborn Map API client. Search, fetch sheets, download IIIF images, building footprint GeoJSON validation.
- `lib/eraData.js` — Shared anachronisms timeline (~35 entries, 1712–2017). `getExclusionText(year)`, `getAuditPatterns(year)`.

---

## CLI Tools (`tools/`)

### Audio Generation
| Tool | Description | Requires |
|------|-------------|----------|
| `elevenlabs-fetch.js` | **Primary SFX generator.** ElevenLabs Sound Effects API → MP3/WAV. Era-appropriate prompts. Writes GENERATION_MANIFEST.json. | `ELEVENLABS_API_KEY` |
| `elevenlabs-voice-fetch.js` | **Voice TTS generator.** Period-appropriate spoken phrases for micro-events. Auto-selects voices, caches IDs to profile. | `ELEVENLABS_API_KEY` |
| `freesound-fetch.js` | Legacy Freesound fetcher. CC-licensed audio search. Useful for natural recordings. | `FREESOUND_API_KEY` |
| `era-audit.js` | Scans audio profiles for anachronistic sounds using `lib/eraData.js`. | — |

### 3D Asset Generation
| Tool | Description | Requires |
|------|-------------|----------|
| `meshy-generate.js` | **3D model generator.** Text-to-3D, Image-to-3D, or Retexture. Outputs FBX/GLB to `mesh-data/`. | `MESHY_API_KEY` |
| `generate-building-refs.js` | **Gemini → Meshy pipeline.** Reference image generation + Image-to-3D. Tier 2. | `GOOGLE_AI_API_KEY` + `MESHY_API_KEY` |
| `preview-textures.js` | **Offline prompt preview.** Generates texture prompts from buildings.geojson — zero API calls. `--summary` for distribution + credit estimate. | — |

### Terrain & Geospatial
| Tool | Description | Requires |
|------|-------------|----------|
| `fetch-dem.js` | USGS 3DEP DEM → Unreal R16 heightmap | GDAL |
| `fetch-imagery.js` | USGS NAIP 1m satellite imagery | — |
| `import-terrain.js` | Validates terrain data, prints Landscape import instructions | — |
| `set-location.js` | Geocode + set CesiumGeoreference via RC API | Unreal running |
| `set-tileset.js` | Manage Cesium3DTileset URL (Google 3D Tiles, custom, clear, status) | Unreal running |
| `fetch-sanborn.js` | Download Sanborn fire insurance maps from Library of Congress | — |

### Unreal Spawners
| Tool | Description | Actor prefix |
|------|-------------|-------------|
| `spawn-buildings.js` | GeoJSON footprints → scaled cubes | `TM_Building_{idx}_{material}_{stories}s` |
| `spawn-streets.js` | Road splines → slabs + sidewalks + lamps. `--era` flag. | `TM_Street_`, `TM_Sidewalk_`, `TM_Lamp_` |
| `spawn-landmarks.js` | Multi-primitive hero buildings from `landmarks.json`. `--year` filter. | `TM_Landmark_{id}_{index}` |
| `spawn-meshes.js` | Import Meshy FBX into Unreal, spawn at geo positions | `TM_Mesh_{idx}_{slug}` |
| `spawn-props.js` | Era-appropriate street furniture. `--year`, `--only`, `--exclude`. | `TM_Prop_{type}_{idx}` |
| `spawn-greybox.js` | Quick 1884 NYC greybox scene (12 brownstones + 4 lamps) | — |

All spawners support `--dry-run` and `--clear`. Most support `--host` for remote Unreal.

### Profile Generation
| Tool | Description |
|------|-------------|
| `generate-environment-profile.js` | **Phase 7 agent pipeline.** Assembles a complete Environment Profile for any Place×Time. Runs 7 research agents in parallel, produces JSON with 9 layers + accuracy manifest. `--terrain` to include existing terrain data. `--skip` layers. `--dry-run`. |

### Route Configs

- `routes.json` — Production config. Actor objectPaths must match the current level.
- `routes.example.json` — Annotated example with all transform types and dispatch configurations.

---

## Browser Clients

- `launcher.html` — Web launcher (served at `/`). Pick location, date, time, timescale, provider. POSTs to `/api/launch`.
- `audio-engine.html` — 5-layer audio engine + audition panel (served at `/audio-engine`, `/audio`).
- `viz.html` — WebGPU renderer: sky, sun, clouds, rain, haze, heat distortion (served at `/viz`).

All clients connect via WebSocket at `/stream` and smoothly interpolate toward incoming values.

---

## Tests

```bash
npm test   # Node built-in test runner
```

| Test file | Coverage |
|-----------|----------|
| `test/noaa.test.js` | NOAA GHCN-Daily provider |
| `test/architectureStyles.test.js` | Style classification, floor heights, era rules |
| `test/streetLayout.test.js` | Street classification, meshing, lamp placement |
| `test/landmarks.test.js` | Validation, era filtering, spawn conversion, manhattan-ny integration |
| `test/propPlacement.test.js` | Catalog integrity, era/road filtering, placement engine, determinism |
| `test/geminiImageGen.test.js` | Gemini client (mocked fetch) |
| `test/meshImport.test.js` | Manifest parsing, spawn data, Python script generation |
| `test/environmentProfile.test.js` | Profile validation, layer helpers, accuracy manifest, NYC 1884 integration |
| `test/weatherAgent.test.js` | Provider ranking, confidence calculation, compromise generation, offline research |
| `test/ecologyAgent.test.js` | Species DB integrity, year/region filtering, habitat classification |
| `test/urbanFormAgent.test.js` | Terrain data assessment, Sanborn coverage, architecture era resolution |
| `test/culturalAgent.test.js` | Era culture/music DB integrity, era resolution, layer generation |
| `test/photoArchiveAgent.test.js` | Archive matching by location/year, photo availability assessment |
| `test/materialsInfraAgent.test.js` | Road surfaces, infrastructure timeline, lighting/transport by year |
| `test/profileAssembler.test.js` | Full pipeline assembly, validation, progress callbacks, skip layers |

---

## Shared Utilities (`lib/`)

| Module | Purpose |
|--------|---------|
| `math.js` | `lerp()`, `lerpAngle()` |
| `timezone.js` | Zero-dependency timezone utils via `Intl.DateTimeFormat` |
| `eraData.js` | Anachronism timeline (~35 entries, 1712–2017) |
| `demFetcher.js` | USGS 3DEP DEM download + GDAL processing |
| `rcHelpers.js` | Unreal RC API client + CLI arg parsing for spawn tools |
| `spawnScript.js` | Python script generation primitives for RC API |
| `environmentProfile.js` | Environment Profile schema validation, loading, layer helpers, accuracy manifest generation. See `docs/environment-profile-schema.md` |
