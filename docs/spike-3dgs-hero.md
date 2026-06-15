# Spike: 3DGS vs. Mesh for Hero Buildings (Phase 7d.1)

**Status:** Prep done (archival photos staged) — awaiting Unreal box + Cesium ion account + Meshy/Gemini keys to execute arms
**Type:** Decision-gate spike (time-box ~1–2 days of active work, excluding Cesium ion processing wait)
**Subject:** Trinity Church, NYC (`trinity_church` in `terrain-data/manhattan-ny/landmarks.json`, yearBuilt 1846)

## The decision this gates

How much of the **hero-building pipeline** should shift from procedural mesh generation (Meshy) to **capture-based reconstruction** (3D Gaussian Splatting via Cesium ion)? Output is a documented verdict: *shift to capture / keep Meshy / hybrid (which features go which way)*. This decision sets the scope of Phase 7d.2.

## Why Trinity Church

- Already a landmark in the 1884 scene (currently a multi-primitive composition).
- The current (third) building was completed **1846 and still stands** — so we can get a **modern ground-truth capture** as a quality ceiling, *and* test the harder historical-archival-photo path against it.
- Distinctive Gothic Revival silhouette (spire) — easy to judge recognizability and where each method fails.

## Arms

| Arm | Method | Pipeline | Mostly built? |
|-----|--------|----------|---------------|
| **A — Mesh (baseline)** | Archival photo → Meshy Image-to-3D → Unreal | `generate-building-refs.js` → `spawn-meshes.js` (`lib/meshImport.js`) | ✅ exists — re-run + capture stills |
| **B1 — Splat (historical)** | Archival photos → Cesium ion iTwin Capture → 3DGS tileset → Cesium for Unreal | new (manual via ion web UI for the spike) | ⚠️ manual |
| **B2 — Splat (ceiling, optional)** | Modern photos/capture → ion → 3DGS | same as B1 | optional, only if time |

B2 is the upper bound on capture quality (dense, modern imagery). B1 is the real test — it simulates the historical case where only sparse archival photos exist. The gap B2→B1 tells us how much archival sparsity degrades capture.

## Inputs to gather first

- Archival photographs of Trinity Church (use `tools/fetch-photos.js` / `lib/photoArchiveFetch.js` against LOC). **Record how many usable angles we actually get** — this is itself a finding (sparse archival coverage is the limiting factor for the historical regime).
- Cesium ion account + credits (iTwin Capture reconstruction).
- Unreal 5.8 with Cesium for Unreal (3DGS tileset support).

### Prep results (2026-06-15)

Archival photos **gathered and staged** → `photos/spike-trinity/` (see its README for the table).

**First finding (already informs the decision):** LOC's digitized Trinity Church holdings near the era are **sparse and low-resolution** — ~9 catalog items, **all masters ≤640px** (confirmed via IIIF `info.json`; not a fetch bug — the full scans aren't in LOC's public IIIF service for these IDs). Only ~4–5 are usable elevations, mostly the same Broadway front angle, 1880–1920.

This is the archival-coverage limit the Representation Regimes model predicts, made concrete:
- **Arm A (Meshy):** viable from a single reference — `photos/spike-trinity/01_wall-st-trinity_c1903_503x640.jpg`.
- **Arm B1 (archival→splat):** marginal — thin angle variety + 640px ceiling. The honest test of the demolished/pre-photographic regime.
- **Arm B2 (modern→splat):** Trinity still stands → dense modern capture is the realistic high-quality path and the A/B quality ceiling.

If Arm B1 underperforms, try higher-res sources before concluding: NYPL Digital Collections, Trinity parish archives, HABS architectural survey scans.

## Ready-to-run commands (when box + keys are in place)

```bash
# Arm A — Meshy mesh from the best archival elevation
MESHY_API_KEY=xxx node tools/meshy-generate.js \
  --image photos/spike-trinity/01_wall-st-trinity_c1903_503x640.jpg \
  --name trinity-church-meshy
# → mesh-data/trinity-church-meshy/ ; import via tools/spawn-meshes.js

# Arm B1 — archival → 3DGS: upload photos/spike-trinity/0[1-5]*.jpg to Cesium ion
#          (iTwin Capture, Gaussian splat output), note the asset ID, then stream
#          via Cesium for Unreal 3DGS tileset (extend lib/cesiumTileset.js in 7d.2).
# Arm B2 — same, with dense modern capture of the standing building (quality ceiling).
```

## Evaluation criteria (the scorecard)

Judge each arm at **the distance and lighting the actual experience uses**, not in an asset viewer.

1. **Street-level fidelity** — how it reads at eye level in the scene.
2. **Silhouette / recognizability** — is it unmistakably Trinity Church? Where does each method break (spire, tracery, doorway depth)?
3. **★ Dynamic relighting under WorldState — the critical one.** Time Machine's entire premise is that the sun moves and weather changes, driven by WorldState. **3DGS bakes lighting from capture time and does not relight easily; mesh + PBR relights natively.** A splat hero that stays lit for "noon, clear" while the scene runs dusk-with-storm *breaks Law 5.1 (One Universe)* and the day/night/weather loop. **This is the Time-Machine-specific reason capture may be the wrong choice for heroes even though it wins on raw photorealism.** Test explicitly: drive the sun/weather and observe whether each arm stays coherent.
4. **Photo requirement** — minimum count/quality of archival images for an acceptable result (B1). Determines which 1884 landmarks are even capture-eligible.
5. **Effort** — wall-clock + manual steps end-to-end.
6. **Cost** — Cesium ion credits vs. Meshy credits per hero.

## Deliverable

Update this file with: side-by-side stills (each arm at matched camera + 2–3 lighting states), the filled scorecard, and a one-paragraph **verdict** with the hero-pipeline recommendation. Promote the decision into ROADMAP Phase 7d.2 scope.

## Hypothesis (to confirm or kill)

Capture (3DGS) will win decisively on raw photorealism and on *surviving* present-day/recent structures — but the **relighting constraint (criterion 3)** may make **mesh + PBR the better choice for hero buildings specifically**, with 3DGS reserved for present-day/live scenes and static distant backdrops. Likely outcome: **hybrid**, exactly as the Representation Regimes model (PRD §17) predicts — but the spike replaces that prediction with evidence.
