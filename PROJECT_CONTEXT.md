# PROJECT_CONTEXT.md

## Project
Time Machine — Immersive environment software (LED virtual production, world state engine driving Unreal scenes)
Version: Phase 6 in progress — 6.1 (Sanborn ingestion) and 6.2 (block massing) complete
HQ: Henhouse

## Current Sprint
Phase 6 (Historical Urban Form) in progress. 6.1 and 6.2 complete:
- **6.1 Sanborn Map Ingestion** (DONE): `lib/sanborn.js` LOC API client, `tools/fetch-sanborn.js` CLI. Fetches sheet images via IIIF, builds sheet index. NYC 1890 volumes (earliest digitized) verified.
- **6.2 Block Massing Generation** (DONE): `lib/buildingMassing.js` polygon→spawn conversion, `tools/spawn-buildings.js` CLI. 29 buildings traced from Sanborn Vol.1 1894 (Bowling Green / Financial District). Georeferenced via OSM street intersection anchors (±5m). Spawns scaled cubes with height = stories × 350cm. Dry-run verified.
- Full geo pipeline: Cesium streaming + USGS DEM + satellite imagery + OSM vectors, all auto-importing on engine start
- Historical overlay schema (`lib/historicalOverlay.js`): terrain deltas, surface swaps, feature add/remove, coastlines, OSM date filter

Next: Phase 6.3 (era-appropriate street layout), 6.4 (architectural style library), or Phase 4.5 (Period Music).

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
**Date:** 2026-03-10
**What changed:** Completed Phase 6.1 (Sanborn map ingestion) and Phase 6.2 (block massing generation). New files: `lib/sanborn.js`, `tools/fetch-sanborn.js`, `lib/buildingMassing.js`, `tools/spawn-buildings.js`. 29 building footprints traced from 1894 Sanborn plates for lower Manhattan. Spawn data verified via --dry-run. 262 tests passing. Commit `2d5d939` pushed to main.
