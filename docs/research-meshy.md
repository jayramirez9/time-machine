# Research Spike: Meshy AI for Historical 3D Asset Generation

**Date:** 2026-03-16  
**Status:** Research complete — ready for prototyping decision  
**Relates to:** Phase 6 (Historical Urban Form), PRD Section 22 Phase 6.6  

---

## Executive Summary

Meshy 6 is a cloud-based AI 3D model generation service that converts text prompts or 2D images into textured 3D meshes with PBR materials. It's the most mature tool in the text/image-to-3D space for production workflows, with a native Unreal Engine plugin and REST API.

**The opportunity for Time Machine:** Meshy could collapse the distance between "we have a Sanborn footprint and one LOC photo" and "we have a textured 3D building in Unreal" — potentially replacing weeks of manual modeling per hero building with minutes of generation + cleanup.

**The honest risk:** These tools generate *objects*, not *buildings at architectural fidelity*. The gap between "impressive 3D model from a photo" and "historically accurate brownstone facade that holds up at street-level viewing distance in a real-time renderer" is real and unproven for this use case.

---

## How It Works

### Two Primary Modes

**Text-to-3D (two-stage):**
1. **Preview** — generates untextured geometry from a text prompt (max 600 chars). ~25 seconds.
2. **Refine** — textures the preview mesh with PBR maps (base color, metallic, roughness, normal). ~5 minutes.

**Image-to-3D (single-stage):**
- Upload a photo or illustration → get a textured 3D mesh. Supports JPEG/PNG, public URL or base64.
- This is the more relevant mode for Time Machine: feed it a historical photograph → get a 3D reconstruction.

### Output Specs

| Property | Value |
|----------|-------|
| **Formats** | GLB, FBX, OBJ, USDZ (all Unreal-compatible) |
| **Poly count** | Configurable: 100–300,000 (default 30,000) |
| **Topology** | Triangle or quad mesh |
| **PBR maps** | Base color, metallic, roughness, normal (optional, `enable_pbr: true`) |
| **Remesh** | Optional cleanup pass for cleaner topology |
| **Texture resolution** | Not explicitly documented; appears to be 2K based on output file sizes |
| **Generation time** | Preview: ~25s, Full (with texture): ~1-5 min |

### API Details

Base URL: `https://api.meshy.ai/openapi/v1/` (Image-to-3D) or `/v2/` (Text-to-3D)

**Async model:** POST creates a task → returns task ID → poll for completion or use SSE streaming.

**Key parameters (Image-to-3D):**
```json
{
  "image_url": "<url or base64 data URI>",
  "enable_pbr": true,
  "should_remesh": true,
  "should_texture": true,
  "topology": "triangle",
  "target_polycount": 30000
}
```

**Key parameters (Text-to-3D preview):**
```json
{
  "mode": "preview",
  "prompt": "1884 Italianate commercial building, 5 stories, cast-iron facade, ornate cornice",
  "negative_prompt": "modern, glass, steel, low quality",
  "art_style": "realistic",
  "ai_model": "meshy-6",
  "should_remesh": true,
  "target_polycount": 50000
}
```

**Retexture API** — can re-texture an existing mesh (from any source) using a text prompt or reference image. This is potentially powerful: generate geometry from Sanborn data procedurally, then skin it with Meshy using a historical photo as reference.

**Webhook support** — can POST results to a callback URL on completion, avoiding polling.

---

## Pricing

### Plan Tiers

| Plan | Monthly Cost | Credits/month | Notes |
|------|-------------|---------------|-------|
| **Free** | $0 | 100 | CC BY 4.0 license, 10 downloads/month, Meshy-4 models only for download |
| **Pro** | $20 | 1,000 | Customer-owned IP, API access, unlimited downloads |
| **Studio** | $60 | 4,000 | Team features, higher queue priority |
| **Enterprise** | Custom | Custom | SSO, dedicated support, custom retention |

### Credit Costs Per Operation

| Operation | Credits |
|-----------|---------|
| Text-to-3D preview (Meshy-6) | 20 |
| Text-to-3D refine (texture) | 10 |
| Image-to-3D without texture (Meshy-6) | 20 |
| Image-to-3D with texture (Meshy-6) | 30 |
| Retexture | 10 |
| Remesh | 5 |

### Cost Analysis for Time Machine

At Pro tier ($20/mo, 1,000 credits):
- **~33 fully textured buildings per month** from images (30 credits each)
- **~50 untextured geometry previews** for evaluation (20 credits each)
- **~100 retexture operations** on existing meshes (10 credits each)

For Phase 6 scope (one NYC block, ~20-40 buildings), a single month of Pro could cover geometry generation for all buildings. Hero buildings requiring iteration might consume 3-5 attempts each.

**Bottom line: $20-60/month covers the asset generation budget for Phase 6. This is trivial.**

---

## Unreal Engine Integration

### Three Import Paths

1. **Meshy Unreal Plugin** — native plugin with "Bridge to Unreal" feature. Send models directly from Meshy workspace into UE scene. Requires plugin install.

2. **API + FBX/GLB download** — programmatic: call API, download FBX, import via UE's built-in glTF/FBX importer. This is the automation path.

3. **Manual download** — export from Meshy web UI, drag into Content Browser.

### Automation Path (Recommended for Time Machine)

The API workflow that fits the existing pipeline:

```
Historical photo (LOC archive)
    ↓
tools/meshy-generate.js  →  Meshy Image-to-3D API
    ↓                         (async, poll for result)
Download FBX + PBR textures
    ↓
Import into Unreal via RC API Python script
    ↓
Place at geo-coordinates from Sanborn footprint data
```

This mirrors the pattern already established in `tools/elevenlabs-fetch.js` (AI generation API → download → integrate).

---

## Where Meshy Fits in the Phase 6 Pipeline

### Current Pipeline Hierarchy (updated)

1. **Real photogrammetry / scan data** — best quality, rarely available for historical buildings
2. **Historical photo → Meshy Image-to-3D** — hero buildings with LOC/NYPL photo reference
3. **Sanborn footprint + Meshy Text-to-3D** — buildings with Sanborn data but no photo
4. **Sanborn footprint + Meshy Retexture** — procedurally massed geometry, AI-textured with era-appropriate prompts
5. **Sanborn footprint → procedural massing only** — fallback for background buildings (current `landmarks.js` approach)

### Specific Use Cases

**Hero Buildings (Phase 6.5):**
- Trinity Church, Brooklyn Bridge, City Hall, Grand Central Depot
- Feed historical photographs to Image-to-3D
- Generate at high poly count (100K-300K), remesh for UE
- Manual cleanup in Blender if needed, then import

**Block Buildings (Phase 6.2):**
- Generate block massing from Sanborn footprints (procedural, as planned)
- Use Meshy Retexture API to apply era-appropriate textures
- Text prompt: "1884 brownstone facade, weathered brick, stone lintels, iron fire escape"
- Or use historical photo as texture reference

**Street Props (Phase 6.7):**
- Gas lamps, hitching posts, horse troughs, period signage
- Text-to-3D with prompts like "1880s cast iron gas street lamp, ornate Victorian design"
- Lower poly count (5K-10K), batch generate

### Integration with Existing Phase 6 Plans

Meshy doesn't *replace* the Sanborn pipeline — it augments it. The Sanborn maps still provide the ground truth for footprints, heights, materials, and lot lines. Meshy provides the visual fidelity layer on top:

- **Sanborn** → where buildings are, how big, what material
- **Meshy** → what they look like in 3D with textures

This is the "dress it for any era" principle from PRD Section 18.4, executed with AI instead of manual modeling.

---

## Quality Assessment

### What Meshy 6 Does Well
- Hard-surface geometry has improved significantly (sharper edges, cleaner silhouettes)
- PBR output is Unreal-ready (base color, metallic, roughness, normal maps)
- Consistent UV mapping reduces post-processing
- Configurable poly count gives control over LOD budget
- Fast iteration: preview in 25 seconds means rapid prompt refinement

### Known Limitations
- **Single-object focus** — generates individual objects, not scenes or city blocks. Each building is a separate generation.
- **Prompt sensitivity** — architectural prompts need to be specific. "Building" gives garbage; "5-story Italianate commercial building with cast-iron facade, ornate bracketed cornice, arched windows" gives usable results.
- **Back-side generation** — Image-to-3D from a single photo will hallucinate the unseen sides. Multi-image input (if available) or text guidance for the texture pass can mitigate this.
- **Scale accuracy** — generated models don't have real-world dimensions. Need to scale to match Sanborn footprint data on import.
- **Texture fidelity at close range** — AI-generated textures may not hold up at the street-level viewing distances Time Machine requires. This is the biggest unknown.
- **No interior geometry** — generates exterior shells only. Fine for Time Machine's window-view use case.
- **Historical accuracy** — the AI has no inherent understanding of "1884 NYC architecture." Accuracy comes from prompt engineering and photo reference, not from the model's knowledge.

### The Critical Unknown

**Will Meshy-generated buildings look convincing at Time Machine's viewing distance and fidelity bar?**

This can only be answered by generating a test building and viewing it in the Unreal scene under installation-like conditions. The research can't resolve this — only a prototype can.

---

## Competitive Landscape

| Tool | Strength | Weakness | Price |
|------|----------|----------|-------|
| **Meshy 6** | Best all-around, Unreal plugin, mature API | Locked to one model | $20/mo Pro |
| **Rodin/Deemos** | Highest photorealism, 4K PBR | $99+/mo, slower | $99/mo |
| **Tripo** | Clean quad topology, fast | Fewer controls, no UE plugin | $12/mo |
| **3DAI Studio** | Multi-model access (Meshy + Rodin + Tripo) | Aggregator, less direct control | $14-29/mo |
| **Neural4D** | Production topology, game-ready | Newer, less proven | $6.90/mo |

**Recommendation:** Start with Meshy Pro ($20/mo) for the Unreal plugin and mature API. If photorealism becomes critical for hero buildings, access Rodin through 3DAI Studio ($29/mo) as an escalation path. The multi-model aggregator approach lets you try different engines for the same prompt without separate subscriptions.

---

## Proposed Prototype

### What to Build

`tools/meshy-generate.js` — a CLI tool following the established pattern:

```bash
# Generate a hero building from a historical photo
node tools/meshy-generate.js --image ./reference/trinity-church-1884.jpg --name "trinity_church" --polycount 100000

# Generate a street prop from text
node tools/meshy-generate.js --text "1880s cast iron gas street lamp, ornate Victorian" --name "gas_lamp" --polycount 10000

# Retexture existing geometry with era-appropriate skin
node tools/meshy-generate.js --retexture ./meshes/block-massing.glb --style "1884 brownstone, weathered brick, stone lintels"
```

### Prototype Steps

1. **Sign up for Meshy Pro** ($20/mo, cancel anytime)
2. **Test Image-to-3D with a known building** — use an 1880s LOC photo of a recognizable NYC building
3. **Test Text-to-3D for a generic brownstone** — evaluate whether architectural prompts produce usable geometry
4. **Test Retexture on a procedural box** — can Meshy skin a simple massing volume with convincing period textures?
5. **Import best result into Unreal** — view at expected installation distance over Cesium terrain
6. **Evaluate** — does it pass the "not obviously wrong" bar? Does it need cleanup? How much?

### Success Criteria

- Generated building is recognizable as the target architectural style
- PBR textures import cleanly into Unreal (no UV issues, proper material channels)
- Geometry can be placed on Cesium terrain at correct geo-coordinates
- At expected viewing distance (simulating window installation), the building doesn't break the illusion
- Total generation + cleanup time per building is under 30 minutes (vs. days for manual modeling)

### Failure Modes to Watch

- **Melted geometry** — AI generates something that looks like a building from one angle but is nonsensical in 3D
- **Anachronistic textures** — modern materials leak into historical prompts (glass curtain walls, aluminum, etc.)
- **Uncanny valley** — close but obviously AI-generated in a way that breaks immersion
- **Scale mismatch** — can't reliably match generated buildings to Sanborn footprint dimensions

---

## Decision Framework

| If prototype shows... | Then... |
|----------------------|---------|
| Hero buildings from photos are convincing | Build `tools/meshy-generate.js`, integrate into Phase 6.5 pipeline |
| Text-to-3D architecture is weak but retexture works | Use procedural massing + Meshy retexture for block buildings |
| Quality is insufficient at all levels | Skip Meshy, focus on procedural generation with hand-authored style libraries (original Phase 6 plan) |
| Quality is good but needs cleanup | Add Blender automation step between Meshy and Unreal import |

---

## References

- Meshy API Docs: https://docs.meshy.ai/
- Meshy Unreal Plugin: https://docs.meshy.ai/en/unreal-plugin/introduction
- Meshy API Pricing: https://docs.meshy.ai/en/api/pricing
- Meshy 6 Launch: https://www.meshy.ai/blog/meshy-6-launch (Jan 18, 2026)
- Phase 6 spec: PRD Section 22, Phase 6
- Existing pattern: `tools/elevenlabs-fetch.js` (AI generation → download → integrate)
