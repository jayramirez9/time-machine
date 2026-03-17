# Time Machine — Roadmap

Living document. Phase numbering matches PRD. Phases are sequential but items within a phase are not prioritized.

---

## Phase 0 — Complete the Weather Loop (DONE)

One location, one era, full weather→visual+audio loop running end-to-end in Unreal.

- [x] Weather engine with Visual Crossing, Open-Meteo providers
- [x] WorldState compiler: categorical states + normalized controls
- [x] Runtime engine with tick loop, timeline caching, state smoothing
- [x] Environment router + endpoint dispatcher (Unreal, DSP, lighting)
- [x] Rate limiter with EMA smoothing
- [x] Live Unreal dispatch (sun, fog, clouds, wind, precip, wetness, haze)
- [x] Daemon with HTTP/WebSocket transport
- [x] WebGPU viz client
- [x] Full 24-hour soak test: 29 publishes, 0 violations on live engine AND replay

## Phase 1 — Audio-Visual Coherence (DONE)

Sound and picture agree. Weather you see is weather you hear.

- [x] 5-layer audio engine (PRD Section 13)
- [x] Audio profile v1 (Baton Rouge Suburb 1978)
- [x] Wire audio engine to daemon WebSocket — all 9 controls driving 5 layers
- [x] Wind audio coherence (level + gustiness + direction matched to visual)
- [x] Rain surface audio matched to precipDensity
- [x] Thunder model with distance-based delay

## Phase 2 — Multi-Window + Spatial Audio (PARTIAL)

The room becomes a portal. Multiple windows, directional audio, spatial coherence.

Done (spatial audio):
- [x] HRTF spatial panning (v2 audio profiles)
- [x] Doppler pitch shift on micro-events
- [x] Synthetic convolution reverb (enclosure-aware, surface-aware sends)
- [x] Real convolution IRs (file-based loading with synthetic fallback)
- [x] Occlusion layer (Layer 5): building-edge diffraction, room LPF, urban canyon filter
- [x] HRTF panner refDistance fix (micro-events audible in mix)

Not started (installation hardware):
- [ ] Multi-camera Unreal scene (N/E/S/W)
- [ ] Exposure/color matching across cameras
- [ ] 4-zone speaker mapping
- [ ] Window physics stub ("glass closed" EQ filtering)
- [ ] Operator preset switcher
- [ ] Calibration flow v1

## Phase 3 — Historical Depth / Pre-1940 Weather (DONE)

Break the 1940 barrier. Reach back to the 1800s with real weather data.

- [x] NOAA GHCN-Daily provider for pre-1940 historical data (daily obs back to ~1800s)
- [x] Provider fallback chain: Visual Crossing (1940+) → NOAA (pre-1940) → Open-Meteo → Mock
- [x] Confidence/resolution metadata based on data age
- [x] 1884 NYC weather verified end-to-end

## Phase 4 — Era-Specific Soundscapes (DONE)

You hear 1884, not 2024 with old buildings.

- [x] Audio profile v2 schema (NYC 1884): full HRTF spatial metadata, motion paths, doppler, surface types, IR profile, voice generation config
- [x] Locale preset: `nyc_city_1884` with era-appropriate parameters
- [x] ElevenLabs SFX pipeline — era-aware AI audio generation (replaced Freesound)
- [x] 40 NYC 1884 audio assets generated via ElevenLabs (0 era audit errors)
- [x] AI voice generation: period vendor calls, newsboy cries, children's shouts (12 TTS clips across 5 events)
- [x] Year-precise era exclusions: shared anachronism timeline (`lib/eraData.js`, 35 entries 1712–2017)
- [x] Era audit tool (`tools/era-audit.js`)
- [x] Greybox scene spawner (12 brownstones, 4 gas lamps, player position)
- [x] Harvard Square 1969 locale: third locale/era (17 micro-events, 3 voice profiles, 55 SFX + 12 voice assets)
- [x] Doppler + reverb tuning pass (listening session validated)
- [x] Audition panel for debugging individual assets
- [x] Web launcher with runtime engine restart
- [~] ~~**Unreal scene art pass**~~: Paused — direction changed. Greybox served its purpose for audio development; future visual fidelity comes from Cesium streaming + Phase 6 historical urban form, not hand-dressed cubes.
- [~] ~~**Gas lamp light configuration**~~: Paused — direction changed. Greybox PointLights superseded by geo pipeline. Period lighting will be placed in context of real geometry in Phase 6.

## Phase 4.5 — Period Music Streaming

Turn on the radio and only hear music that existed on this exact day. See PRD Section 14.5.

- [ ] MusicBrainz date authority module
- [ ] Locale music profile schema (radio format, genre weights, station identity)
- [ ] `musicRadio` WorldState control
- [ ] Streaming playback adapter (Spotify/Apple Music via ISRC lookup)
- [ ] Radio station simulation (sequencing, gaps, patter cadence)
- [ ] Pre-recording era music (barrel organ, brass band, parlor piano)
- [ ] Baton Rouge 1978 integration test (20+ transitions, zero date violations)

## Phase 5 — Geographic Data Pipeline (DONE)

Type a location, get real terrain in Unreal. The foundation for every visual scene. See PRD Section 18 and `docs/research-geo-pipeline.md` for full spec and research.

- [x] Cesium for Unreal integration: plugin installed, georeference set via Remote Control API, verified at Baton Rouge, Manhattan, and Grand Canyon
- [x] Cesium OSM Buildings: 1.4B building volumes streaming, verified over Manhattan
- [x] Weather engine dispatch over Cesium terrain: sun position, fog, clouds, sky light driving real geo data — shadows moving correctly
- [x] Terrain from DEM: USGS 3DEP → Unreal Landscape (`lib/landscapeImport.js`, `lib/demFetcher.js`, `tools/fetch-dem.js`, `tools/import-terrain.js`). Automated end-to-end: DEM fetch, GDAL processing, HTTP transfer, Unreal import. Hooked into `startEngine()`.
- [x] Satellite imagery base layer: NAIP aerial imagery fetched via `tools/fetch-imagery.js`, matched to terrain extent
- [x] Google Photorealistic 3D Tiles: stream through Cesium for scouting/preview. `lib/cesiumTileset.js`, `tools/set-tileset.js`. Auto-configures on engine start when `GOOGLE_3D_TILES_API_KEY` is set. Launcher UI toggle. Not for production use (Google ToS).
- [x] Vector data ingestion (OSM): roads, water, land-use → spline guides and landscape masks. `lib/osmVectors.js`, `tools/fetch-vectors.js`. Overpass API fetch, GeoJSON conversion, Douglas-Peucker simplification, scanline polygon rasterization to landscape masks, road spline extraction. Auto-imports into Unreal on engine start via Python RC API scripts.
- [x] Location → Cesium automation: `tools/set-location.js` geocodes and sets CesiumGeoreference via RC API. Engine auto-sets georeference on start when routes are configured. `engine.georeference` exposed in WorldState.
- [x] Location → Unreal Landscape: end-to-end geocode → DEM fetch → Landscape actor import (automated in `startEngine()` when routes configured)
- [x] LOD and scale strategy: six named scale tiers (city_block→region), Cesium tile budget config, dual-layer model. `lib/scalePresets.js`, `docs/lod-scale-strategy.md`. `--scale` flag on `fetch-dem.js`, `startEngine()` reads from locale preset.
- [x] Historical overlay workflow: overlay metadata schema (terrain deltas, surface swaps, feature add/remove, coastlines, OSM date filter), confidence tracking, height anchoring rules. `lib/historicalOverlay.js`, `docs/historical-overlay-workflow.md`, `docs/overlay-example-nyc-1884.json`.

## Phase 6 — Historical Urban Form

The 3D world looks like 1884, not just sounds like it. See PRD Phase 6.

- [x] Sanborn map ingestion (footprints, heights, materials from LOC archive): `lib/sanborn.js` LOC API client, `tools/fetch-sanborn.js` CLI. Fetches sheet images via IIIF, builds sheet index, generates seed template for building footprint tracing. NYC 1890 volumes (9 items, 400+ sheets) verified. Earliest digitized NYC maps are 1890 (not 1884) — 6-year gap is acceptable for building stock accuracy.
- [x] Block massing generation: `lib/buildingMassing.js` polygon→spawn conversion, `tools/spawn-buildings.js` CLI. 29 building footprints traced from Sanborn Vol.1 1894 (Bowling Green / Financial District). Footprints georeferenced via OSM street intersection anchors (±5m). Spawns scaled cubes with correct position, rotation, and height (350cm/floor, 4-9 stories). Python batch script via RC API. Dry-run verified.
- [x] Era-appropriate street layout: `lib/streetLayout.js` surface classification (belgian block, cobblestone, dirt, granite flag — era-configurable rules per OSM road category), `lib/streetMeshing.js` spline→flat mesh conversion, `lib/lampPlacement.js` gas lamp position computation with intersection de-duplication. `tools/spawn-streets.js` CLI spawner — reads roads-splines.json, spawns street slabs + granite sidewalks + gas lamp PointLights via Python RC API. Manhattan dry-run: 1,118 street segments, 192 sidewalks, 328 gas lamps. Zero asphalt surfaces. Lamps at 4.2m, 2200K warm gas color, 30–40m spacing on major avenues.
- [x] Architectural style library: `lib/architectureStyles.js` — maps (material + use + stories) to style for a given era. 10 NYC 1884 styles (brownstone_rowhouse, italianate_tenement, cast_iron_commercial, gothic_revival_church, greek_revival_civic, second_empire, federal_commercial, industrial_loft, wood_frame_vernacular, italianate_commercial), skeleton eras (chicago_1920, sf_1908), 8 general American styles (craftsman_bungalow, art_deco_commercial, ranch_house, etc.), 8 general era presets (~1700–present). Style-aware floor heights, cornice heights, roof types, facade rhythm, decorative elements. `resolveEra(year)` auto-selects era for any year. Integrated into spawn-buildings.js.
- [x] Hero building modeling: `lib/landmarks.js` multi-primitive compositions, `tools/spawn-landmarks.js` CLI. 6 NYC 1884 landmarks authored as basic shape arrangements (cube/cone/cylinder/sphere): Trinity Church (nave + transept + tower + spire, 86m), Brooklyn Bridge Manhattan tower (tower + arches + roadway, 84m), Western Union Building (body + cornice + mansard), City Hall (body + balustrade + cupola + dome), NY Tribune Building (body + clock tower + cap), Grand Central Depot (shed + vault + facade + tower + cap). Era filtering by yearBuilt/yearDemolished. Actor prefix TM_Landmark_. Dry-run verified: 23 primitives across 6 landmarks, year 1870 correctly filters to 2.
- [~] **Historical photo → texture pipeline** (AI-assisted PBR extraction): Texture prompt builder (`lib/texturePromptBuilder.js`) generates era-aware Meshy prompts from architecture style metadata (materials, decorative elements, weathering, era exclusions). Quality tiers (hero 300K / foreground 150K / background 50K / distant 15K). Preview tool (`tools/preview-textures.js`) for offline prompt tuning. API-tested: 56 Broad St Second Empire building generated with PBR textures via Meshy 6. Remaining: batch generation tool, Nano Banana (Gemini) → Meshy Image-to-3D reference image pipeline, Unreal import automation.
- [ ] Street-level props (hitching posts, awnings, period signage, horse troughs)
- [x] **Meshy AI integration** — `lib/meshyClient.js` API client + `tools/meshy-generate.js` CLI. Text-to-3D, Image-to-3D, and Retexture via Meshy 6 API. Research spike validated: text prompt produced architecturally correct 1880s Italianate brownstone with PBR textures. Pro plan ($20/mo, 1,000 credits). See `docs/research-meshy.md`.
- [ ] **1980s Baton Rouge test scene** — 12877 Erin Ave neighborhood. Validate the "any Place×Time" pipeline beyond hand-built 1884 NYC. Cesium terrain + historical overlay (option 2). User has ground truth (grew up there). Tests: `general_late20c` architecture styles for real suburban context, Meshy generation for 1980s buildings, overlay curation workflow, procedural audio for late 20th century.
- [ ] **Historical skyline accuracy** — OSM Buildings and Google 3D Tiles show present-day skyline. Need date-filtered building set or manual add/remove overlay per era. Critical for any era before ~2000 (Twin Towers, missing skyscrapers, demolished landmarks). Extends `lib/historicalOverlay.js` overlay schema.
- [ ] **Sub-daily weather reconstruction (pre-1970)** — NOAA daily obs (high/low/precip) → plausible hourly arc. Current timeline interpolator synthesizes a curve but it's a guess. ERA5/20CRv3 reanalysis datasets could provide real sub-daily data back to 1940 (ERA5) or 1806 (20CRv3).
- [ ] **Location-specific audio profiles** — Procedural profile generator produces plausible-but-generic era sounds. Location-tuned profiles (specific taxi horns for NYC, specific bird species for region, specific church bells) require either hand-curation or agent-driven research (Phase 7).

## Phase 7 — The Agent Layer

AI agents autonomously research and assemble Place×Time profiles. See PRD Phase 7.

- [ ] Profile schema specification (formal JSON schema with confidence ratings + citations)
- [ ] Weather research agent
- [ ] Ecology research agent
- [ ] Urban form research agent
- [ ] Cultural research agent
- [ ] Photo archive agent
- [ ] Profile assembler (orchestrator)
- [ ] Accuracy manifest generator

## Phase 8 — Living Street View

The full dream. Walk through a historically accurate 3D reconstruction. See PRD Phase 8.

- [ ] Walkable city blocks (navigable street-level Unreal experience)
- [ ] Acoustic environment modeling (per-street reverb/reflection)
- [ ] Dynamic population (procedural pedestrians, carriages, vendors — era-appropriate: horses & carriages for 1880s, mixed traffic for 1970s, modern for 2000s)
- [ ] Period-accurate lighting transitions (lamplighter NPC, sunrise through canyons)
- [ ] Interactive audio anchoring (spatial audio tied to world position)
- [ ] Multi-era support (same block, different year)
- [ ] Narrative mode (scripted time-lapse: sunrise→sunset, decade→decade)
- [ ] **Street-level inhabited feel** — the empty-city problem. Parked vehicles, window displays, laundry lines, trash, street vendors, market stalls. The difference between "accurate geometry" and "a place where people live." Hardest for pre-photographic eras where reference is sparse.

---

## Backlog — No Phase, No Timeline

Ideas that would improve quality but don't belong to a specific phase.

- [ ] **Foley session / sound library upgrade**: Dedicated Foley session with period-appropriate props or curated sound library (Sonniss, Boom, Pro Sound Effects). Horse hooves on real granite, wooden wheel rumble, coal chute impact, iron-on-iron rail sounds.

- [ ] **Present-day weather modeling for historical reconstruction**: Reanalysis datasets (ERA5, 20CRv3) to reconstruct sub-daily weather from sparse NOAA daily observations. Turn "high of 85F, 0.2in rain" into a plausible hourly arc.

- [ ] **Ambisonic output for WAMM speakers**: Full ambisonic rendering pipeline for Wilson WAMM speaker array. See `docs/audio-architecture-wamm.md`.

- [ ] **Multi-locale support**: Template for rapid locale/era onboarding: locale preset + audio profile + Unreal scene package.

- [ ] **Crowd simulation**: Persistent ambient human presence — murmur layers, footstep density tied to activityLevel, crowd noise responding to time-of-day and weather.

- [ ] **Dynamic music / score layer**: Generative or adaptive musical underscore that responds to weather state, time of day, and dramatic arc.

- [ ] **Era-appropriate ground truth for any city×year**: The fundamental scaling problem. Sanborn maps cover ~12,000 US cities but require manual footprint tracing. OSM has modern footprints but no date metadata. Need a strategy for rapidly assembling "what buildings existed here in year X" for arbitrary locations — likely an agent task (Phase 7).

---

## International Support

Currently US-only for terrain and building data. These items unlock any location worldwide.

### Terrain
- [ ] **Global DEM source** — Add Copernicus DEM (30m, free, global) or SRTM as fallback in `lib/demFetcher.js` when `isInUS()` returns false. Same GDAL processing pipeline, different download endpoint. Cesium World Terrain already streams globally — this only affects the Landscape actor pipeline.
- [ ] **Non-US elevation queries** — `estimateHeight()` already falls back to Open-Elevation API for international coordinates. Verify accuracy for mountainous terrain (Nepal, Alps) where coarse elevation data is more visible.

### Architecture Styles
- [ ] **European architecture style library** — New era rulesets for major European building traditions. Georgian/Victorian/Edwardian (UK), Haussmann (Paris), Amsterdam canal houses, Mediterranean vernacular. Each needs materials, decorative elements, texture search terms — same schema as US styles in `lib/architectureStyles.js`.
- [ ] **Asian architecture style library** — Pagoda temples, Newari brick-and-timber (Nepal), Chinese courtyard compounds, Japanese machiya townhouses, colonial-era hybrids (Hong Kong, Singapore). Significant gap — current style system assumes Western construction.
- [ ] **Region-aware `resolveEra()`** — Current function maps year → American era. International scenes need region+year → style era. E.g., 1920 London ≠ 1920 Chicago. Add `resolveEra(year, { region })` parameter.

### Historical Map Sources
- [ ] **UK Ordnance Survey maps** — Equivalent of Sanborn for Britain. Detailed building footprints back to 1840s. NLS (National Library of Scotland) has excellent digitized coverage. Need ingestion pipeline similar to `lib/sanborn.js`.
- [ ] **European cadastral maps** — Building footprints from national land registries. Coverage and digitization vary by country. France (cadastre.gouv.fr), Netherlands (BAG), Germany (ALKIS).
- [ ] **OpenHistoricalMap** — Community-sourced historical map data in OSM format. Sparse but growing. Could supplement other sources.

### Audio
- [ ] **Culture-aware audio profile generator** — Current procedural generator is latitude/density-aware but not culture-aware. A London street sounds different from a NYC street at the same density. Temple bells (Nepal), call to prayer (Istanbul), pub chatter (Edinburgh), cicadas (Japan) — these are culturally specific, not density-derived. Needs a culture/region dimension in `lib/profileGenerator.js`.
- [ ] **Non-English voice generation** — `elevenlabs-voice-fetch.js` generates English phrases. International scenes need vendor calls, street chatter, and ambient speech in local languages. ElevenLabs supports multilingual TTS.

### Weather
- [ ] **International weather station coverage audit** — Open-Meteo works globally but station density varies. Audit data quality for target international locations (Edinburgh, Kathmandu, Tokyo, Paris). Map confidence levels to inform users when weather data is sparse.

### Street Layout
- [ ] **Non-US street surface classification** — Current `lib/streetLayout.js` rules assume American road types and historical surfaces. European cities have different patterns: setts (UK), pavé (France), sampietrini (Rome). Need region-aware surface rules.
- [ ] **Metric dimensions** — Street widths and lamp spacing are currently in US-centric dimensions. International streets follow different standards (narrower European streets, wider Asian boulevards).

### Pipeline Integration
- [ ] **Locale auto-detection for international** — `resolveLocale()` uses population + year for US presets. International scenes need country/region detection from geocode `countryCode` (already exposed from Open-Meteo) to select appropriate architecture styles, street rules, and audio culture.
- [ ] **Research: per-country data source registry** — Map out, for each target country, what historical building data is available and in what format. Some countries have excellent digital archives (UK, Netherlands), others have almost nothing digitized (most of Africa, Central Asia).
