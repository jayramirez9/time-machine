# PROJECT_CONTEXT.md

## Project
Time Machine — Immersive environment software (LED virtual production, world state engine driving Unreal scenes)
Version: Phase 6 in progress — 6.1–6.6 complete, Meshy integration done
HQ: Henhouse

## Current Sprint
Phase 6 (Historical Urban Form) in progress. 6.1–6.6 complete, Meshy pipeline built:
- **6.1 Sanborn Map Ingestion** (DONE): `lib/sanborn.js` LOC API client, `tools/fetch-sanborn.js` CLI.
- **6.2 Block Massing Generation** (DONE): `lib/buildingMassing.js`, `tools/spawn-buildings.js`. 29 buildings from Sanborn Vol.1 1894.
- **6.3 Era-Appropriate Street Layout** (DONE): `lib/streetLayout.js`, `lib/streetMeshing.js`, `lib/lampPlacement.js`, `tools/spawn-streets.js`. 1,118 segments, 192 sidewalks, 328 gas lamps.
- **6.4 Architectural Style Library** (DONE): `lib/architectureStyles.js` — 25+ styles, 12 era rulesets (~1700–present).
- **6.5 Hero Building Modeling** (DONE): `lib/landmarks.js`, `tools/spawn-landmarks.js`. 6 NYC 1884 landmarks.
- **Meshy AI Integration** (DONE): `lib/meshyClient.js` API client, `tools/meshy-generate.js` CLI. Text-to-3D, Image-to-3D, Retexture. API-tested: Second Empire building with PBR textures. Pro plan $20/mo.
- **6.6 Texture Pipeline** (DONE): `lib/texturePromptBuilder.js` generates era-aware Meshy prompts + Gemini reference image prompts. `tools/preview-textures.js` for offline prompt tuning. `tools/texture-buildings.js` for batch Text-to-3D. `lib/geminiImageGen.js` + `tools/generate-building-refs.js` for Gemini → Meshy Image-to-3D reference image pipeline (tier 2 assets). `lib/meshImport.js` + `tools/spawn-meshes.js` for Unreal mesh import (FBX download from daemon, Content Browser import, geo-positioned spawn with PBR textures). Quality tiers (hero 300K / foreground 150K / background 50K / distant 15K).
- Full geo pipeline: Cesium streaming + USGS DEM + satellite imagery + OSM vectors, all auto-importing on engine start
- Historical overlay schema (`lib/historicalOverlay.js`): terrain deltas, surface swaps, feature add/remove, coastlines, OSM date filter

### 3D Asset Pipeline (new this session)
Three-tier pipeline for period-accurate 3D buildings:
1. Historical photo → Meshy Image-to-3D (best fidelity, archival photos)
2. Nano Banana (Gemini) → Meshy Image-to-3D (AI reference image when no photo exists)
3. Meshy Text-to-3D from architecture style metadata (prompt-only fallback)

Pipeline strategy by decade documented in `docs/research-unreal-pipeline-by-decade.md`. Key insight: pipeline stays the same, data mix changes. Cesium goes from ground truth (2020s) to terrain-only (pre-1900).

### Instant Image Generator: REMOVED
Nano Banana (Gemini image gen) removed from launcher/engine as standalone feature. Role shifted to reference image generator feeding into Meshy Image-to-3D pipeline. Removed: `buildImagePrompt()`, `pushBackdropToUnreal()`, `POST /api/generate-image`, `POST /api/push-backdrop`, `tools/spawn-backdrop.js`, texture dispatch type.

### Next Test Scene
**1980s Baton Rouge** — 12877 Erin Ave (user's childhood neighborhood). Validates "any Place×Time" pipeline beyond hand-built 1884 NYC. Cesium terrain + historical overlay (user-curated) + Meshy generation.

Next: 6.7 (street-level props), or stand up Baton Rouge 1980s scene.

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
- Meshy 6 API for AI 3D building generation (text-to-3D, image-to-3D, retexture). Pro tier ($20/mo). Output: FBX/GLB with PBR maps.
- Pipeline > vendor tools: design for tool swappability (Meshy, ElevenLabs, Gemini are all replaceable; metadata and prompt builders survive)
- 6-phase roadmap: prototype → launchable MVP (~6-9 months at full-time pace)

## Open Questions
- ADU form factor: mobile trailer or brick-and-mortar? Gates display specs, speaker topology, production compute, installation approach
- What's the minimum viable version that proves the business, not just the technology?
- When does Henhouse need its first non-Jay contributor? What role?
- Multi-window rendering approach — depends on frozen physical specs (Phase 0.5)
- el_train era prompt contradiction: pre-1900 exclusion says "no motors/engines" but 1884 NYC is steam era
- Will hero-quality (300K poly) Meshy output match the 2.5M face web UI test? Server busy — needs retry.
- How to handle Cesium OSM buildings with no `start_date` tag for 1980s/1990s filtering?
- UX for "personal knowledge curation" — how does a user annotate historical overlay data?
- Nano Banana → Meshy: RESOLVED — single tool (`generate-building-refs.js`) with `--image-only` flag for two-step use

## Last Updated
**Date:** 2026-03-16
**What changed:** Built Meshy AI 3D generation pipeline (client, CLI, research doc). Built texture prompt builder with architecture style metadata → Meshy prompts, quality tiers, offline preview tool, batch generation tool. Removed instant image generator (Nano Banana shifting to reference image role in 3D pipeline). Added decade pipeline research doc. Added 1980s Baton Rouge as next test scene. Added international support roadmap (global DEM, non-US architecture styles, culture-aware audio, regional street surfaces). 448 tests passing. Commits `d8b63bd`, `c7be8c0`, `9a1d174` pushed to main.
