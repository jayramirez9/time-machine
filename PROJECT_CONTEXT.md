# PROJECT_CONTEXT.md

## Project
Time Machine — Immersive environment software (LED virtual production, world state engine driving Unreal scenes)
Version: Phase 6 in progress — 6.1–6.5 complete (Sanborn, massing, streets, styles, landmarks)
HQ: Henhouse

## Current Sprint
Phase 6 (Historical Urban Form) in progress. 6.1–6.5 complete:
- **6.1 Sanborn Map Ingestion** (DONE): `lib/sanborn.js` LOC API client, `tools/fetch-sanborn.js` CLI. Fetches sheet images via IIIF, builds sheet index. NYC 1890 volumes (earliest digitized) verified.
- **6.2 Block Massing Generation** (DONE): `lib/buildingMassing.js` polygon→spawn conversion, `tools/spawn-buildings.js` CLI. 29 buildings traced from Sanborn Vol.1 1894 (Bowling Green / Financial District). Georeferenced via OSM street intersection anchors (±5m). Spawns scaled cubes with height = stories × 350cm. Dry-run verified.
- **6.3 Era-Appropriate Street Layout** (DONE): `lib/streetLayout.js` surface classification, `lib/streetMeshing.js` spline→mesh, `lib/lampPlacement.js` gas lamps with intersection de-dup, `tools/spawn-streets.js` CLI. 1,118 street segments, 192 sidewalks, 328 gas lamps. Zero asphalt.
- **6.4 Architectural Style Library** (DONE): `lib/architectureStyles.js` — 10 NYC 1884 styles, skeleton eras (chicago_1920, sf_1908), 8 general American styles, 8 era presets (~1700–present). Style-aware floor heights, cornice, roof types. Integrated into spawn-buildings.js.
- **6.5 Hero Building Modeling** (DONE): `lib/landmarks.js` multi-primitive compositions, `tools/spawn-landmarks.js` CLI. 6 NYC 1884 landmarks (Trinity Church, Brooklyn Bridge tower, Western Union, City Hall, Tribune, Grand Central Depot) as basic shape arrangements (cube/cone/cylinder/sphere). Era filtering by yearBuilt/yearDemolished. 23 primitives total.
- Full geo pipeline: Cesium streaming + USGS DEM + satellite imagery + OSM vectors, all auto-importing on engine start
- Historical overlay schema (`lib/historicalOverlay.js`): terrain deltas, surface swaps, feature add/remove, coastlines, OSM date filter

Next: Phase 6.6 (historical photo → texture pipeline), 6.7 (street-level props), or Phase 4.5 (Period Music).

## Key Constraints
- Solo builder, evenings/weekends only (full-time Director role at CFA)
- Bootstrap — no external funding. Hardware purchases gated on frozen physical specs
- Two-product dependency — Time Machine rendering architecture can't finalize until ADU hardware specs are frozen (window count, placement, display selection)
- PC (Windows, UE 5.7) is Unreal workhorse; Mac (M1) runs daemon + audio engine

## Technical Decisions
- Unreal Engine 5.7 as rendering platform (PC via Tailscale)
- World state engine architecture: weather/sun/fog as data layer driving scene parameters
- M1 MacBook as dev environment running daemon (port 3000), PC runs Unreal Editor (RC API port 30010)
- Tailscale VPN for Mac↔PC connectivity (Mac: 100.68.243.96, PC: 100.96.244.16)
- RC API actor communication via function calls (`SetUrl`, `SetOriginLatitude`, etc.) — UE 5.4+ blocks direct property read/write with getter/setter protection
- RC API actor discovery via `/remote/search/assets` endpoint (with `/remote/search` fallback for older UE)
- RC API IP allowlist must include `100.0.0.0` lower bound for Tailscale subnet
- Python script execution via `ExecutePythonScript` on `PythonScriptLibrary` through RC API `/remote/object/call`
- UE 5.7 API: `RenderingLibrary` (not `KismetRenderingLibrary`), canvas-based RT drawing
- Two-track terrain: Cesium streaming for scouting, USGS heightmaps for production Landscape actors
- 6-phase roadmap: prototype → launchable MVP (~6-9 months at full-time pace)

## Open Questions
- ADU form factor: mobile trailer or brick-and-mortar? Gates display specs, speaker topology, production compute, installation approach
- What's the minimum viable version that proves the business, not just the technology?
- When does Henhouse need its first non-Jay contributor? What role?
- Multi-window rendering approach — depends on frozen physical specs (Phase 0.5)
- el_train era prompt contradiction: pre-1900 exclusion says "no motors/engines" but 1884 NYC is steam era
- dispatch.js unreal transport still uses direct property writes (rcProp) — may also be blocked by getter/setter protection on UE 5.4+. Needs testing.

## Last Updated
**Date:** 2026-03-11
**What changed:** Completed Phase 6.3 (street layout), 6.4 (architecture styles), and 6.5 (hero landmarks). New files: `lib/streetLayout.js`, `lib/streetMeshing.js`, `lib/lampPlacement.js`, `tools/spawn-streets.js`, `lib/architectureStyles.js`, `lib/landmarks.js`, `tools/spawn-landmarks.js`, `lib/worldStateContract.js`, `lib/audioProfileValidator.js`, `tm-eval.js`, plus tests. 6 NYC 1884 landmarks modeled as multi-primitive compositions (23 shapes total). 386 tests passing. Commit `6a2ec49` pushed to main.
