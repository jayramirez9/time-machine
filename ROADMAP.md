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

## Phase 2 — Spatial Audio (DONE)

Sound exists in 3D space. Directional audio, reverb, occlusion.

- [x] HRTF spatial panning (v2 audio profiles)
- [x] Doppler pitch shift on micro-events
- [x] Synthetic convolution reverb (enclosure-aware, surface-aware sends)
- [x] Real convolution IRs (file-based loading with synthetic fallback)
- [x] Occlusion layer (Layer 5): building-edge diffraction, room LPF, urban canyon filter
- [x] HRTF panner refDistance fix (micro-events audible in mix)

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
- [x] **Historical photo → texture pipeline** (AI-assisted PBR extraction): Texture prompt builder (`lib/texturePromptBuilder.js`) generates era-aware Meshy prompts from architecture style metadata (materials, decorative elements, weathering, era exclusions). Quality tiers (hero 300K / foreground 150K / background 50K / distant 15K). Preview tool (`tools/preview-textures.js`) for offline prompt tuning. Batch generation tool (`tools/texture-buildings.js`) for Text-to-3D pipeline. Gemini → Meshy Image-to-3D reference image pipeline (`lib/geminiImageGen.js`, `tools/generate-building-refs.js`): generates architectural reference images via Gemini, feeds into Meshy Image-to-3D for tier-2 building assets. Supports `--image-only` (just reference images) and full pipeline. Unreal mesh import automation (`lib/meshImport.js`, `tools/spawn-meshes.js`): reads GENERATION_MANIFEST.json files, matches to building footprints, downloads FBX from daemon HTTP, imports into UE Content Browser, spawns with PBR textures at geo positions. Daemon serves mesh-data/ over HTTP. API-tested: 56 Broad St Second Empire building generated with PBR textures via Meshy 6.
- [x] Street-level props: `lib/propCatalog.js` (16 prop types with era ranges, placement rules, density weights), `lib/propPlacement.js` (spline-walking placement engine with intersection props, de-duplication, deterministic seeded PRNG, --only/--exclude filtering), `tools/spawn-props.js` CLI. Prop types include hitching posts (pre-1920), horse troughs, fire hydrants, bollards, awnings, hanging signs, fire alarm boxes, mailboxes, telegraph/telephone poles, newsstands, parking meters (post-1935), traffic lights (post-1920), benches, trash cans. Era filtering matches eraData.js anachronism timeline. Tested: 1884 NYC has no parking meters; 1978 has no hitching posts.
- [x] **Meshy AI integration** — `lib/meshyClient.js` API client + `tools/meshy-generate.js` CLI. Text-to-3D, Image-to-3D, and Retexture via Meshy 6 API. Research spike validated: text prompt produced architecturally correct 1880s Italianate brownstone with PBR textures. Pro plan ($20/mo, 1,000 credits). See `docs/research-meshy.md`.
- [x] **1980s Baton Rouge test scene** — 12877 Erin Ave neighborhood. Validated "any Place×Time" pipeline: Cesium terrain + Google 3D Tiles for geometry (houses still standing, no Meshy needed), real July 4 1983 weather via Visual Crossing, 26 ElevenLabs SFX assets, procedural audio profile. Quality gaps: photogrammetry trees, audio mix levels need tuning, no era-specific overlay yet. Confirmed: pipeline works end-to-end for arbitrary US addresses at ~$3 cost (audio only, no 3D generation).
- [x] **Historical skyline accuracy** — `filterBuildingsByYear()` in `buildingMassing.js` filters GeoJSON by `yearBuilt`/`yearDemolished`. `spawn-buildings.js --year` now filters buildings (not just styles). `historicalOverlay.js` gets `loadOverlay()` + accessor helpers (`getFeatureAdditions`, `getFeatureRemovals`, `getSurfaceSwaps`).
- [x] **Location-specific audio profiles** — Procedural profile generator produces plausible-but-generic era sounds. Location-tuned profiles (specific taxi horns for NYC, specific bird species for region, specific church bells) require either hand-curation or agent-driven research (Phase 7).

## Phase 7 — The Agent Layer

AI agents autonomously research and assemble Place×Time profiles. See PRD Phase 7.

- [x] Profile schema specification: `docs/environment-profile-schema.md` (9 PRD layers, confidence/citation envelope per layer, accuracy manifest). `lib/environmentProfile.js` validation + helpers. `profiles/nyc_1884.json` first complete profile (all 9 layers, hand-authored from existing Phase 5-6 data).
- [x] Weather research agent: `lib/agents/weatherAgent.js`. Ranks providers (NOAA/VC/Open-Meteo/mock) by year + API key availability, probes NOAA stations for distance/coverage, calculates confidence scores (resolution, station distance, year degradation), generates source citations and known compromises. Returns Environment Profile weather layer. 44 tests.
- [x] Ecology research agent: `lib/agents/ecologyAgent.js`. 25+ species database (birds, mammals, insects) with introduction dates, regional coverage, seasonal/diurnal weights. Filters by year, region, habitat (population-based). Includes vegetation data.
- [x] Urban form research agent: `lib/agents/urbanFormAgent.js`. Reads terrain-data metadata, assesses Sanborn coverage (24 US cities), resolves architecture era, surveys available props. Confidence scales with data completeness.
- [x] Cultural research agent: `lib/agents/culturalAgent.js`. Produces both culture + music layers. 8 era brackets (colonial through modern) with commerce, daily life, languages, newspapers, street vendors. Music era classification (pre_recording through streaming) with genre weights and performance venues.
- [x] Photo archive agent: `lib/agents/photoArchiveAgent.js`. Catalogs 8 US digitized photo collections (NYPL, LOC, MCNY, Detroit Publishing, etc.) with API availability, geographic/temporal coverage. Matches archives to location + year, assesses photo availability by era.
- [x] Materials & infrastructure agent: `lib/agents/materialsInfraAgent.js`. Road surfaces by era (8 eras, pre-1800 through modern), building facade materials, acoustic properties, 24-item infrastructure timeline (lighting, transport, communication, utilities). Produces both materials + infrastructure layers.
- [x] Profile assembler (orchestrator): `lib/agents/profileAssembler.js`. Geocodes location, runs 7 research agents in parallel, merges into complete Environment Profile, generates accuracy manifest with review checklist. `tools/generate-environment-profile.js` CLI.
- [x] Accuracy manifest generator: Integrated into `lib/environmentProfile.js` (`generateAccuracyManifest()`) and the profile assembler. Auto-generates layer summaries, confidence rollup, gap list, and review checklist from layer metadata.
- [x] **Photo archive auto-fetch for texture pipeline**: LOC Prints & Photographs API wired into the reference image → 3D pipeline. `generate-building-refs.js` now supports `--photos <dir>` (use pre-downloaded photos) and `--auto-fetch` (auto-download from LOC before generating). Photos matched to buildings by street name; unmatched buildings fall back to Gemini. Three-tier pipeline: (1) real historical photo → Meshy Image-to-3D (best), (2) Gemini reference image → Meshy (good), (3) text-only (fallback). `lib/photoArchiveFetch.js` gains `findBestPhoto()` for manifest-to-building matching. Dry-run shows `[PHOTO]` vs `[GEMINI]` per building. Generation manifest records `pipeline: 'historical-photo-to-3d'` or `'gemini-reference-image-to-3d'` with source attribution.
- [x] **Chronicling America for cultural agent**: LOC Chronicling America API (free, no key, 1770s+) for location-specific cultural detail. Full-text newspaper search — auto-search for street vendors, local customs, advertisements, business types. Enriches the culture layer with real primary-source data instead of generic era templates. `lib/chroniclingAmerica.js` API client, wired into `lib/agents/culturalAgent.js` via `researchNewspapers()`. Graceful fallback when API unreachable.
- [ ] **Era-appropriate ground truth for any city×year**: The fundamental scaling problem. Sanborn maps cover ~12,000 US cities but require manual footprint tracing. OSM has modern footprints but no date metadata. Agent-driven research to assemble "what buildings existed here in year X" for arbitrary locations — cross-referencing Sanborn, photo archives, city directories, and census records.

## Phase 7b — Visual Fidelity

The scene is accurate. Now make it beautiful. Close the gap between "correct geometry" and "a place that feels real." Prioritized by impact-per-effort: lighting and atmosphere first (engine settings), then materials (reusable across all scenes), then organic detail (vegetation, grime, motion).

### 7b.1 — Rendering Foundation (Lumen + Nanite)

Lumen GI and Nanite mesh are the single biggest quality multiplier — bounce light filling alleys, warm glow under awnings, millions of polygons at no extra cost. This is mostly configuration, not content.

- [x] **Lumen Global Illumination**: `lib/renderingConfig.js` enables Lumen GI via Python RC API on engine start. Console commands: `r.Lumen.DiffuseIndirect.Allow`, `r.Lumen.Reflections.Allow`, `r.Lumen.TraceMeshSDFs`, `r.Lumen.ScreenProbeGather.FinalGatherQuality 2`, `r.Lumen.Scene.Detail 1.5`, sky light leak reduction. Auto-creates PostProcessVolume (TM_PostProcess) if missing. Wired into `runtimeEngine.js` startup after tileset config. Non-fatal — engine continues if Unreal unreachable.
- [x] **Nanite mesh conversion**: `lib/meshImport.js` auto-enables Nanite on imported Meshy FBX meshes (nanite_settings.enabled = True, guarded by try/except). `lib/renderingConfig.js` exports `buildNaniteConversionScript()` for batch-converting existing TM_* actors. `r.Nanite.Enable 1` set on engine start.
- [x] **Virtual Shadow Maps**: VSM enabled via `r.Shadow.Virtual.Enable 1` + `r.Shadow.Virtual.ResolutionLodBiasDirectional -1.0` on engine start. `configureLampShadows()` iterates TM_Lamp_ actors and sets `cast_shadows` + `contact_shadow_length 0.02` for soft contact shadows.
- [x] **Exposure and tone mapping**: Histogram auto-exposure with cinematic speed (up 2.0, down 1.0). 5 era-aware tone mapping presets in `lib/localePresets.js`: pre_1900 (warm desaturated tintype), early_1900s (sepia), kodachrome (1940-1970 saturated), ektachrome (1970-1990 natural), modern. `resolveToneMapping(year)` auto-selects. New `controls.postprocess` group in WorldState: exposureBias, filmSlope, filmToe, filmShoulder, saturation, colorGamma R/G/B. Routed to PostProcessVolume via existing `postprocess` dispatch type. 32 new tests.

### 7b.2 — Era Material Library

A brownstone cube with a great tileable material looks better than a 300K-poly Meshy mesh with baked AI texture. Build 10–15 hero material sets per era, applied procedurally by architecture style.

- [x] **Recipe-based material catalog**: `lib/materialCatalog.js` — era-agnostic recipe system. `BASE_TEXTURES` (17 types: brownstone, brick_red, stone_grey, limestone, granite, cast_iron, wood_clapboard, concrete, stucco, terra_cotta, steel_frame + 6 surface types). `PRIMARY_TO_TEXTURE` maps `STYLES[].materials.primary` → base texture. `getMaterialRecipe(styleName)` returns `{ textureKey, tint, roughness, metallic, tilingScale, miName, miPath }`. Covers all 30+ architecture styles across all eras. No per-era authoring needed.
- [x] **Auto-MI creation at spawn time**: `scriptMaterialSetup()` in `lib/spawnScript.js` generates Python that auto-creates Unreal Material Instance Constants from a single master material (`M_TM_Surface`). Downloads base textures from daemon, imports into Content Browser, creates MI via `MaterialInstanceConstantFactoryNew`, sets PBR parameters (BaseColor, Normal, Tint, TilingScale, RoughnessScale, MetallicScale), saves. Idempotent — skips existing MIs. Wired into `buildSpawnScript()` and `buildStreetSpawnScript()` via `daemonUrl` parameter.
- [x] **Material auto-assignment**: `spawn-buildings.js` and `spawn-streets.js` pass `--era` and `--daemon-url` through to script builders. Style classification → MI assignment is fully automatic. `brownstone_rowhouse` → `MI_brownstone`, `belgian_block` → `MI_belgian_block`. Graceful fallback to default material when MI doesn't exist.
- [x] **Placeholder texture library**: `material-assets/` — 17 directories with `base_color.png` + `normal.png` placeholder PNGs (solid colors matching tint values). Daemon serves over HTTP at `/material-assets/`. Swap for real Megascans/CC0 textures anytime without code changes.
- [x] **Real PBR texture sets**: `tools/fetch-textures.js` downloads CC0 tileable PBR textures from ambientCG. 17 sets: brownstone (Bricks102), red brick (Bricks059), grey stone (Rock030), limestone (Bricks075A), granite (Granite002A), cast iron (PaintedMetal004), wood clapboard (WoodSiding008), concrete (Concrete034), stucco (Plaster001), terra cotta (Tiles027), steel (Metal038), belgian block (PavingStones128), cobblestone (PavingStones046), granite flag (PavingStones142), dirt (Ground054), macadam (Gravel023), brick paving (Bricks094). Each: base_color + normal + roughness PNGs at 1K. 125MB total in `material-assets/` (gitignored). `scriptMaterialSetup()` updated to import all 3 maps.
- [ ] **Runtime Virtual Texture (RVT) blending**: Landscape RVT layer for road/sidewalk/grass transitions. Soft blending at surface boundaries instead of hard edges. Driven by `fetch-vectors.js` land-use masks.
- [ ] **Parallax Occlusion Mapping**: POM on hero facade materials for depth without geometry cost. Brownstone window recesses, cast iron column fluting, brick mortar lines. Distance-based LOD to flat normal map beyond 20m.

### 7b.3 — Procedural Weathering & Grime

Nothing in the real world is clean. Dirt accumulates in corners, rain streaks under windowsills, soot darkens surfaces near chimneys. One system, infinite variety.

- [x] **Decal spawner tool**: `tools/spawn-decals.js` procedurally scatters deferred decals on building facades. `lib/decalCatalog.js`: 5 facade types (water_stain, soot_smoke 1800-1960, dirt_accumulation, crack_spall, moss_lichen with north-facing preference) + 4 ground grime types (puddle_stain, horse_waste pre-1920, oil_spot post-1900, mud_tracking). `lib/decalPlacement.js`: seeded PRNG facade walking (4 faces per building bbox), material affinity filtering, era filtering, age-weighted density, radius-based dedup. `--density` (0-1), `--only/--exclude`, `--no-ground`, `--dry-run`. Actor prefixes `TM_Decal_`, `TM_Grime_`. 68 tests.
- [ ] **Master weathering material function**: Shared Unreal material function that all building materials include. Inputs: world-position noise, vertex color (hand-paintable override), age factor (years since construction), rainfall factor (from WorldState). Outputs: darkening, roughness increase, color desaturation. One function, applied everywhere. *(UE editor work — Node.js data pipeline complete via AgeInYears + WeatheringStrength material params.)*
- [x] **Ground grime layer**: Ground grime decals placed along street splines via `placeGroundGrime()` in `lib/decalPlacement.js`. Era-appropriate: horse_waste pre-1920, oil_spot post-1900, puddle_stain + mud_tracking all eras. Pitch-90 downward projection. Spawned via `tools/spawn-decals.js`.
- [x] **Age-from-profile**: `yearBuilt`/`yearDemolished` carried through `footprintToSpawnData()` in `lib/buildingMassing.js`. `computeBuildingAge()` helper. `buildSpawnScript()` accepts `targetYear`, emits per-building Dynamic Material Instances with `AgeInYears` + `WeatheringStrength` scalars via `scriptPerBuildingWeathering()`. `weatheringCurve()` in `lib/materialCatalog.js` gives material-specific aging rates (wood 25yr → 1.0, granite 100yr → 1.0). `spawn-buildings.js --year` now passes targetYear through.

### 7b.4 — Vegetation System

The eye notices barren surfaces instantly. Grass between cobblestones, weeds along walls, street trees — all era-appropriate from the ecology agent.

- [x] **Foliage catalog**: `lib/foliageCatalog.js` — 20 foliage types across 4 categories: 8 street trees (American Elm, London Plane, etc. — era-filtered, Dutch Elm dies 1970), 5 park trees, 4 ground cover (grass, weeds, clover, dandelion), 3 building-base vegetation (wall weeds, foundation moss, gutter grass). Region-aware from ecology agent VEGETATION_DB. Seasonal canopy weights per species.
- [x] **Street tree placement**: `lib/foliagePlacement.js` walks sidewalk splines at 12m spacing with 2m offset. Seeded PRNG, dedup. `tools/spawn-vegetation.js` CLI with `--year`, `--region`, `--month`, `--density`, `--only/--exclude`, `--no-ground`, `--dry-run`. Actor prefixes `TM_Tree_`, `TM_Foliage_`. 39 tests.
- [x] **Ground cover scatter**: Grid-based scatter in `placeGroundCover()` within bounding box areas. Seeded PRNG placement with position jitter. Separate dedup radius (100cm) from trees (500cm).
- [x] **Seasonal variation**: Each foliage entry has `seasonal: { spring, summer, fall, winter }` canopy weights. `--month` flag drives seasonal modulation. LeafDensity material parameter set in spawn script. *(UE material responding to LeafDensity is editor work.)*

### 7b.5 — Atmospheric Particles (Niagara)

Dust, smoke, and haze make air visible. Cheap to render, massive impact on presence.

- [x] **Chimney smoke**: `lib/particlePlacement.js` `placeChimneySmoke()` spawns NiagaraActor above building rooftops. Era-filtered: pre-1970 only (gas/electric = no visible smoke). Smoke color from `getHeatingFuel()` (wood=light, coal=dark). Wind-responsive Niagara variable bindings.
- [x] **Street-level dust**: `placeStreetDust()` walks road splines at 80m intervals, ground level. Dry/windy conditions trigger via WorldState bindings.
- [x] **Gas lamp glow**: `placeLampGlow()` spawns one NiagaraActor per TM_Lamp_ position. Era-appropriate glow color from `getPrimaryLighting()` (gas 2200K, electric 5500K). Summer moth sub-emitter.
- [x] **Rain splash particles**: `placeRainSplash()` dense scatter at 10m intervals along major roads + intersections. Ground level. Density from precipDensity WorldState binding.
- [x] **Window light glow**: `placeWindowGlow()` computes window positions at 350cm floor intervals, 250cm horizontal spacing. Seeded per-window occupancy (40-60%). Uses PointLight (not Niagara). Gas era: warm 2200K with flicker. Electric: steady 3200K. `tools/spawn-particles.js` CLI with `--year`, `--month`, `--only/--exclude`, `--dry-run`. Actor prefix `TM_Particle_`. 35 tests.

### 7b.6 — Detail Props & Small Motion

Still scenes feel dead. Tiny motion and clutter sell life even without NPCs.

- [x] **Cloth simulation**: `lib/clutterCatalog.js` defines 4 cloth items (awning_cloth, hanging_laundry, flag_banner, window_curtain) with `animationType: 'cloth'`, windResponsive flags. `lib/clutterPlacement.js` `placeClothItems()` anchors to building facade positions. *(UE cloth physics setup is editor work.)*
- [x] **Animated prop catalog**: 3 animated entries in clutterCatalog (swinging_sign with skeletal_loop, weathervane with material_anim + wind-responsive, rocking_chair residential-only). `placeAnimatedProps()` places at building facades/rooftops.
- [x] **Street clutter scatter**: `lib/clutterCatalog.js` defines 8 clutter types (newspaper 1830+, leaves seasonal, horse_manure pre-1920, cigarette_butts 1880+, bottle_caps 1892+, apple_core, coal_ash 1800-1960, straw pre-1920). `lib/clutterPlacement.js` `placeStreetClutter()` density-based scatter along road splines with gutter offset. Horse manure density declines 2%/year post-1900. Seasonal leaf modulation. `tools/spawn-clutter.js` CLI with `--year`, `--month`, `--no-cloth`, `--no-animated`, `--only/--exclude`, `--dry-run`. Actor prefix `TM_Clutter_`. 43 tests.

**Exit criteria:** Stand at street level in Manhattan 1884. Lumen GI fills the alley with warm bounce light. Brownstone facades have visible mortar depth. Water stains streak below every cornice. Cobblestones have grass in the joints. Three chimneys trail coal smoke. A shop awning ripples in the wind. Gas lamps glow with moth halos. It feels like a *place*, not a diagram.

## Phase 7c — Audio Fidelity

The soundscape is procedurally generated and era-aware. Now make it dense, varied, and physically grounded. Close the gap between "correct macro ambience" and "foley that makes you believe you're standing there." Same principle as 7b: build systems, not individual assets.

The procedural profile generator (`lib/profileGenerator.js`) already handles any city×year with 47 event templates across 6 era brackets. The ecology agent provides species data. The gap is **detail density and variation** — AAA foley (RDR2, Crimson Desert) has 30,000+ clips across hundreds of categories. We have ~40 per scene with one take each.

### 7c.1 — Foley Event Templates (Quick Wins)

Wire the data that already exists but isn't flowing through, then expand the template library.

- [x] **Diurnal/seasonal gating**: Ecology agent species DB `diurnal` and `seasonal` weights wired into profile generator and audio engine scheduler. `aggregateWeights()` computes density-weighted averages across species. `diurnalWeights` carried into profile JSON, used by `diurnalWeightAt()` in audio engine to modulate firing probability via cosine interpolation. Seasonal cooldown modulation via `getSeason(month, hemisphere)`. Birds peak at dawn (0.9×), suppress at night (0.1×). Insects silent in winter (cooldown 9999). `--month` flag on `generate-profile.js`.
- [x] **Surface-linked footstep events**: `footsteps_street` and `footsteps_sidewalk` universal templates with `surfaceFromEra` flag. Surface and shoe type resolved from `ERA_META` per era (dirt/leather boots for pre-1830, cobblestone/leather shoes for steam age, asphalt/rubber-soled for modern). Sidewalk surfaces (granite flag, concrete) tracked separately. Materials layer from environment profile overrides defaults when available. Horse_cart and carriage surfaces also enriched. 2 source slots per footstep event for variation.
- [x] **Door and window foley templates**: `door_open_close`, `door_creak`, `window_rattle`, `shutter_bang`, `gate_latch`. Wind-gated (`weatherGate: 'wind'`) for window/shutter/cloth events. Density-gated for door/gate events. 5 new universal templates.
- [x] **Material-contact foley templates**: `object_clatter`, `metal_clang`, `glass_clink`, `cloth_rustle`, `broom_sweep`, `water_pour`, `keys_jingle`. Gated by activityLevel, timeOfDay, and density. Priority tags for scheduling suppression. 7 new universal templates.
- [x] **Transport-specific detail**: Added `elevated_train` (steam_age, urban), `bicycle_bell` (steam_age), `bus_diesel` (auto_age, urban), `subway_rumble` (auto_age, dense_urban). Supplements existing transport templates (horse_walk, horse_cart, carriage, early_automobile, trolley, car_passby, car_traffic).

### 7c.2 — Variation & Layering

Single-take assets sound robotic on repeat. Build variation into the generation pipeline.

- [x] **Variant hints + pitch/timing jitter**: Multi-source events get `variantHint` per source (e.g. "slightly closer, more present" vs "slightly farther, more reverberant") — wired into `elevenlabs-fetch.js` prompt builder for distinct takes. Audio engine adds ±5% pitch jitter (`playbackRate`) and 0-400ms onset delay per fire. Zero extra API cost, significant repetition masking.
- [ ] **Layered bed construction**: Generate 2-3 complementary bed sources per directional bed instead of 1. Cross-fade between layers for richer texture. Profile generator outputs `sources: [near, mid, far]` per direction.

### 7c.3 — Voice Integration in Auto Profiles

The voice generation framework exists (`elevenlabs-voice-fetch.js`) but only the hand-authored NYC 1884 profile uses it.

- [x] **Auto voice config in profile generator**: `generateVoiceEvents()` creates vendor voice events for urban profiles 1850-1960 using cultural agent vendor data. `VENDOR_PHRASES` provides 2-3 era-appropriate cries per vendor type (newsboy, oyster seller, flower girl, hot corn girl, etc.). Modern urban (post-1960) gets `voice_passerby` casual speech fragment. Max 3 voice events per profile. Each has `voice` and `phrases` fields for `elevenlabs-voice-fetch.js`.
- [x] **Wire voice fetch into bootstrap-scene.js**: `voice-assets` step added to bootstrap pipeline after `audio-assets`. Runs `elevenlabs-voice-fetch.js` automatically when profile has voice configs. Requires `ELEVENLABS_API_KEY`.

### 7c.4 — Context-Aware Scheduling

Make the audio engine smarter about when and how events fire.

- [x] **Weather-reactive foley**: Audio engine scheduler reads `windLevel`, `rainLevel`, `gustiness` from WorldState. Wind-gated events (`weatherGate: 'wind'`) suppressed when `gustiness < 0.2`, boosted proportionally in strong wind. Footsteps, door, and sweep events suppressed during heavy rain (`rainLevel > 0.7`).
- [x] **Activity curve from timeOfDayPhase**: `activityMultiplierAt(timePhase)` — piecewise linear curve modeling realistic urban daily rhythm. Quiet at 3am (0.05×), building at 6am (0.4×), peak at noon (1.0×), evening taper (0.85× at 6pm), night drop (0.15× at 11pm). Multiplied with `activityLevel` for effective activity gating.
- [x] **Concurrent event priority**: Events tagged `priority: 'low'` (bird_song, glass_clink, keys_jingle) suppressed when other events are already active (`activeSources > 0`). Prevents quiet detail events from competing with prominent sounds.

**Exit criteria:** Stand at street level in Manhattan 1884 with eyes closed. You hear hooves on cobblestone, a distant door creak, varying birdsong that fades at dusk. A vendor calls. The sounds don't repeat noticeably over 10 minutes. Rain starts — footsteps thin out, a shutter bangs in the wind, drips patter on an awning. It sounds like a *place*, not a playlist.

---

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

- [x] **One-command scene bootstrap** (`tools/bootstrap-scene.js`): Chains fetch-dem → fetch-imagery → fetch-vectors → generate-profile → elevenlabs-fetch → fetch-photos → generate-environment-profile into a single orchestrator. Parallel phases, idempotent skip detection, API key auto-detection. `node tools/bootstrap-scene.js "Manhattan, NY" --year 1884` does everything.

- [ ] **Present-day weather modeling for historical reconstruction**: Reanalysis datasets (ERA5, 20CRv3) to reconstruct sub-daily weather from sparse NOAA daily observations. Turn "high of 85F, 0.2in rain" into a plausible hourly arc.

- [ ] **Ambisonic / multi-channel output**: Ambisonic rendering pipeline for immersive speaker arrays (quad, 5.1, 7.1, Atmos, or custom configs). See `docs/audio-architecture-wamm.md`.

- [ ] **Crowd simulation**: Persistent ambient human presence — murmur layers, footstep density tied to activityLevel, crowd noise responding to time-of-day and weather.

- [ ] **Dynamic music / score layer**: Generative or adaptive musical underscore that responds to weather state, time of day, and dramatic arc.

- [ ] **Ecology live API integration**: Re-evaluate embedded 25-species DB vs live APIs (GBIF for historical specimen records, eBird for bird observations, iNaturalist for crowd-sourced data). Current DB is sufficient while ElevenLabs SFX quality is the bottleneck — revisit when generated audio quality improves enough that species-specific accuracy matters.

- [ ] **Vision Pro port**: Immersive experience on Apple Vision Pro. Spatial audio maps naturally to the platform. Rendering options: RealityKit native, Unity PolySpatial, or streaming from Unreal via Pixel Streaming. Key questions: full volume vs shared space, passthrough blending (windows into the past overlaid on real room), head-tracked spatial audio via platform HRTF, and how to drive the weather/world state pipeline from visionOS.

- [ ] **Period music streaming**: Turn on the radio and only hear music that existed on this exact day (PRD Section 14.5). MusicBrainz date authority, locale music profile schema, `musicRadio` WorldState control, streaming playback adapter (Spotify/Apple Music via ISRC lookup), radio station simulation (sequencing, gaps, patter cadence), pre-recording era music (barrel organ, brass band, parlor piano).

- [ ] **Sub-daily weather reconstruction (pre-1970)**: NOAA daily obs (high/low/precip) → plausible hourly arc. Current timeline interpolator synthesizes a curve but it's a guess. ERA5/20CRv3 reanalysis datasets could provide real sub-daily data back to 1940 (ERA5) or 1806 (20CRv3).

- [ ] **Address-level geocoding precision**: Accept street address or zip code (not just city) for higher-precision scene placement. Address/zip → lat/lon via geocoder, then use neighborhood-level density, street type, and building context. City-only input degrades gracefully to current population-based system.

- [ ] **Multi-window installation**: Multi-camera Unreal scene (N/E/S/W), exposure/color matching across cameras, multi-zone speaker mapping, window physics ("glass closed" EQ filtering), operator preset switcher, calibration flow.

## Phase 9 — International Support

Currently US-only for terrain, building data, and cultural context. This phase unlocks any location worldwide.

- [ ] **Global DEM source** — Add Copernicus DEM (30m, free, global) or SRTM as fallback in `lib/demFetcher.js` when `isInUS()` returns false. Same GDAL processing pipeline, different download endpoint. Cesium World Terrain already streams globally — this only affects the Landscape actor pipeline.
- [ ] **Non-US elevation queries** — `estimateHeight()` already falls back to Open-Elevation API for international coordinates. Verify accuracy for mountainous terrain (Nepal, Alps) where coarse elevation data is more visible.
- [ ] **European architecture style library** — New era rulesets for major European building traditions. Georgian/Victorian/Edwardian (UK), Haussmann (Paris), Amsterdam canal houses, Mediterranean vernacular. Each needs materials, decorative elements, texture search terms — same schema as US styles in `lib/architectureStyles.js`.
- [ ] **Asian architecture style library** — Pagoda temples, Newari brick-and-timber (Nepal), Chinese courtyard compounds, Japanese machiya townhouses, colonial-era hybrids (Hong Kong, Singapore). Significant gap — current style system assumes Western construction.
- [ ] **Region-aware `resolveEra()`** — Current function maps year → American era. International scenes need region+year → style era. E.g., 1920 London ≠ 1920 Chicago. Add `resolveEra(year, { region })` parameter.
- [ ] **UK Ordnance Survey maps** — Equivalent of Sanborn for Britain. Detailed building footprints back to 1840s. NLS (National Library of Scotland) has excellent digitized coverage. Need ingestion pipeline similar to `lib/sanborn.js`.
- [ ] **European cadastral maps** — Building footprints from national land registries. Coverage and digitization vary by country. France (cadastre.gouv.fr), Netherlands (BAG), Germany (ALKIS).
- [ ] **OpenHistoricalMap** — Community-sourced historical map data in OSM format. Sparse but growing. Could supplement other sources.
- [ ] **Culture-aware audio profile generator** — Current procedural generator is latitude/density-aware but not culture-aware. A London street sounds different from a NYC street at the same density. Temple bells (Nepal), call to prayer (Istanbul), pub chatter (Edinburgh), cicadas (Japan) — these are culturally specific, not density-derived. Needs a culture/region dimension in `lib/profileGenerator.js`.
- [ ] **Non-English voice generation** — `elevenlabs-voice-fetch.js` generates English phrases. International scenes need vendor calls, street chatter, and ambient speech in local languages. ElevenLabs supports multilingual TTS.
- [ ] **International weather station coverage audit** — Open-Meteo works globally but station density varies. Audit data quality for target international locations (Edinburgh, Kathmandu, Tokyo, Paris). Map confidence levels to inform users when weather data is sparse.
- [ ] **Non-US street surface classification** — Current `lib/streetLayout.js` rules assume American road types and historical surfaces. European cities have different patterns: setts (UK), pavé (France), sampietrini (Rome). Need region-aware surface rules.
- [ ] **Metric dimensions** — Street widths and lamp spacing are currently in US-centric dimensions. International streets follow different standards (narrower European streets, wider Asian boulevards).
- [ ] **Locale auto-detection for international** — `resolveLocale()` uses population + year for US presets. International scenes need country/region detection from geocode `countryCode` (already exposed from Open-Meteo) to select appropriate architecture styles, street rules, and audio culture.
- [ ] **Per-country data source registry** — Map out, for each target country, what historical building data is available and in what format. Some countries have excellent digital archives (UK, Netherlands), others have almost nothing digitized (most of Africa, Central Asia).
