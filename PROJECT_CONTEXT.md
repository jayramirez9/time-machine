# PROJECT_CONTEXT.md

> **Staleness note (2026-07-08):** `ROADMAP.md` is the source of truth for current work; this doc's body below is a historical snapshot (Phase 6/7 era). Only this header is kept current.

## Project
Time Machine — Immersive environment software (world state engine driving Unreal scenes, procedural + capture-based historical reconstruction)
Version: Code-side through 7c complete (7b UE-editor work still stacked for the box); **Phase 7d (3DGS capture pipeline) active**. 1,551 tests pass. CI live (eval gate + AI PR reviewer).
HQ: Henhouse

## Current Sprint
**R&D workstation — first unit DOA (shipping damage); free higher-tier replacement due 2026-07-23** (Corsair a7500: RTX 5090, **Ryzen 9 9950X3D** 16C, up from the ordered 9900X3D — `docs/rd-workstation-spec.md`, incl. arrival checks and a thermal caveat on the 240 mm AIO). Ion client corrections **done 2026-07-22** (built from ion's `openapi.yaml`: `RASTER_IMAGERY` + required `outputs:[…SPLATS_3DTILES]`, derived assets captured off the create response). Next: a write-scope ion token from Jay, then the Trinity live-verification run (ROADMAP 7d.2). When the box arrives: Live Verification Sprint (ROADMAP 7d.4), then **7d.5** generative far-field backdrop (`docs/spike-generative-backdrop.md` — free pre-test first; it may close the question without spend).

### Phase 7 — The Agent Layer (DONE)
- **7.1 Profile Schema**: `docs/environment-profile-schema.md`, `lib/environmentProfile.js` — 9 PRD layers, confidence/citation envelope, accuracy manifest. `profiles/nyc_1884.json` first complete profile.
- **7.2 Weather Agent**: `lib/agents/weatherAgent.js` — provider ranking, NOAA station probing, confidence scoring.
- **7.3 Ecology Agent**: `lib/agents/ecologyAgent.js` — 25+ species database, year/region/habitat filtering.
- **7.4 Urban Form Agent**: `lib/agents/urbanFormAgent.js` — terrain data assessment, Sanborn coverage (24 cities), architecture era resolution.
- **7.5 Cultural Agent**: `lib/agents/culturalAgent.js` — culture + music layers, 8 era brackets, street vendors, music formats.
- **7.6 Photo Archive Agent**: `lib/agents/photoArchiveAgent.js` — 8 US digitized photo collections catalog.
- **7.7 Profile Assembler**: `lib/agents/profileAssembler.js` — orchestrator, parallel agent execution, accuracy manifest generation.
- **7.8 Accuracy Manifest**: Integrated into environmentProfile.js + assembler. Auto-generates from layer metadata.
- **CLI**: `tools/generate-environment-profile.js` — full pipeline, `--dry-run`, `--terrain`, `--skip`.
- **Decisions parking lot**: 8 open decisions in memory (profile ID format, live API integration, confidence thresholds, startEngine integration).

### Phase 6 (Historical Urban Form) — 6.1–6.7 complete:
- **6.1 Sanborn Map Ingestion** (DONE): `lib/sanborn.js` LOC API client, `tools/fetch-sanborn.js` CLI.
- **6.2 Block Massing Generation** (DONE): `lib/buildingMassing.js`, `tools/spawn-buildings.js`. 29 buildings from Sanborn Vol.1 1894.
- **6.3 Era-Appropriate Street Layout** (DONE): `lib/streetLayout.js`, `lib/streetMeshing.js`, `lib/lampPlacement.js`, `tools/spawn-streets.js`. 1,118 segments, 192 sidewalks, 328 gas lamps.
- **6.4 Architectural Style Library** (DONE): `lib/architectureStyles.js` — 25+ styles, 12 era rulesets (~1700–present).
- **6.5 Hero Building Modeling** (DONE): `lib/landmarks.js`, `tools/spawn-landmarks.js`. 6 NYC 1884 landmarks.
- **Meshy AI Integration** (DONE): `lib/meshyClient.js` API client, `tools/meshy-generate.js` CLI. Text-to-3D, Image-to-3D, Retexture. API-tested: Second Empire building with PBR textures. Pro plan $20/mo.
- **6.6 Texture Pipeline** (DONE): `lib/texturePromptBuilder.js` generates era-aware Meshy prompts + Gemini reference image prompts. `tools/preview-textures.js` for offline prompt tuning. `tools/texture-buildings.js` for batch Text-to-3D. `lib/geminiImageGen.js` + `tools/generate-building-refs.js` for Gemini → Meshy Image-to-3D reference image pipeline (tier 2 assets). `lib/meshImport.js` + `tools/spawn-meshes.js` for Unreal mesh import (FBX download from daemon, Content Browser import, geo-positioned spawn with PBR textures). Quality tiers (hero 300K / foreground 150K / background 50K / distant 15K).
- **6.7 Street-Level Props** (DONE): `lib/propCatalog.js` (16 prop types with era ranges, placement rules, density), `lib/propPlacement.js` (spline-walking placement with intersection props, deterministic PRNG, de-duplication), `tools/spawn-props.js` CLI. Era-filtered: 1884 gets hitching posts/horse troughs, 1978 gets parking meters/traffic lights.
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

Next: 1980s Baton Rouge test scene, or historical skyline accuracy, or Phase 7 (agent layer).

## Key Constraints
- Solo builder, evenings/weekends only (full-time Director role at CFA)
- Bootstrap — no external funding. Hardware purchases gated on frozen physical specs
- Two-product dependency — Time Machine rendering architecture can't finalize until ADU hardware specs are frozen (window count, placement, display selection)
- PC (Windows, UE 5.7) is Unreal workhorse; Mac (M1) runs daemon + audio engine

## Technical Decisions
- Unreal Engine 5.7 as rendering platform (PC via LAN)
- World state engine architecture: weather/sun/fog as data layer driving scene parameters
- M1 MacBook as dev environment running daemon (port 3000), PC runs Unreal Editor (RC API port 30010)
- LAN connectivity: Mac (192.168.68.78) ↔ PC (192.168.68.63), hardwired 2.5Gb/s
- RC API actor communication via function calls (`SetUrl`, `SetOriginLatitude`, etc.) — UE 5.4+ blocks direct property read/write with getter/setter protection
- RC API actor discovery via `/remote/search/assets` endpoint (with `/remote/search` fallback for older UE)
- RC API IP allowlist must include `192.168.68.0` subnet for LAN access
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
**What changed:** Completed Phase 6.6 (Gemini→Meshy reference image pipeline, Unreal mesh import automation) and Phase 6.7 (street-level props with era-filtered placement engine). Simplify pass: fixed JSON.stringify bug, path traversal vulnerability, dead code removal, consolidated static file serving, extracted shared geometry helpers and arg parsing. Phase 6 core items (6.1–6.7) all complete. 506 tests passing. Commits `ba27dea`, `d9edd9a`, `353c69d` pushed to main.
