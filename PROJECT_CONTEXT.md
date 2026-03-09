# PROJECT_CONTEXT.md

## Project
Time Machine — Immersive environment software (LED virtual production, world state engine driving Unreal scenes)
Version: Phase 5 — Geographic Data Pipeline
HQ: Henhouse

## Current Sprint
Phase 5 nearing completion (9 of 11 items done). Current state:
- World state engine drives Unreal scene (sun, fog, clouds, rain, sky light, heat haze, ground wetness)
- 5-layer spatial audio engine with HRTF, doppler, convolution reverb, occlusion
- Cesium streaming georeference auto-sets on engine start
- USGS 3DEP DEM → GDAL → PNG16 → Unreal Landscape import fully automated
- Terrain + satellite imagery import via Remote Control API Python scripting
- Google Photorealistic 3D Tiles auto-stream when `GOOGLE_3D_TILES_API_KEY` is set (scouting only)
- Manhattan test data verified (1009×1009, 15.6m–43.1m elevation)
- OSM vector data: roads, water, landuse fetched from Overpass API → GeoJSON → landscape masks + road splines → Unreal import via RC API Python scripting. Manhattan verified (508 roads, 4 water, 12 landuse → 253 splines, 1373 control points)

Next: LOD/scale strategy, historical overlay workflow. Phase 4 greybox items (art pass, gas lamps) permanently paused — superseded by geo pipeline.

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
**Date:** 2026-03-09
**What changed:** Added OSM vector data ingestion pipeline — `lib/osmVectors.js` (Overpass API fetch, GeoJSON conversion, Douglas-Peucker simplification, scanline rasterization to landscape masks, road spline extraction), `tools/fetch-vectors.js` CLI, Unreal import scripts for spline actors and mask textures. Hooked into `startEngine()` for automatic import. Manhattan verified end-to-end (524 features, 253 splines).
