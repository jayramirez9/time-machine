# Year-1 Project Review — July 1, 2026

Full-project review requested a year into the build: PRD + ROADMAP re-read, codebase structural survey (63 lib modules / ~22k lines, 34 tools, 1,549 offline tests), and a technology-landscape check with every plan-changing claim adversarially re-verified against primary sources.

**Verdict:** The core architecture bet — WorldState as single truth, Environment Profiles (Place×Time), Representation Regimes, loose renderer coupling — is validated and should not change. What should change: (1) the project has quietly become a world-generation pipeline while the PRD's actual MVP (a venue with windows and an operator) has had zero investment — year 2 needs to converge on one demonstrable room; (2) verification debt against a real Unreal box is now the biggest risk, bigger than any missing feature; (3) the "Agent Layer" isn't what the PRD promises — it's hand-authored lookup tables, and that's the main thing blocking "any Place×Time"; (4) fresh research pre-answers the 7d.1 spike question and found a bug in the ion client that's blocking the Trinity submission.

---

## 1. The product/pipeline inversion (biggest strategic issue)

PRD §19 defines MVP as: one venue profile, 4 windows, directional audio to speaker zones, 10 presets, an operator who can run it, calibration, panic/recovery. A year in, none of that exists — no multi-camera scene, no exposure matching, no speaker-zone output (the audio engine is a browser tab), no operator UX beyond the launcher, no calibration flow. "Multi-window installation" has drifted into the ROADMAP **backlog** while the PRD constitution still says it's the definition of done.

That's not a criticism of the year — the content pipeline was the harder, more novel problem. But the constitution and the work now point in different directions, and by the PRD's own rule ("if a future decision contradicts this, the decision is wrong — unless we amend"), an amendment or course correction is owed.

**Recommendation: make year 2 converge on one physical room.** The forcing function exists — the concept-trailer spec (`docs/roadster-trailer-hardware.md`) and the 5090 workstation decision. Pick a "first room" milestone (even 2 windows + 4 speakers in the ADU), and let it pull the venue-side work (multi-camera, exposure matching, zone audio output, calibration v1) out of the backlog. The pipeline is far enough ahead that deepening it further has diminishing returns until something displays it.

## 2. Verification debt is compounding — buy the box, then verify before building

All 1,549 tests are offline, and the RC-API tests assert the *string content* of generated Python — nothing has ever verified that Unreal accepts those scripts. Meanwhile the pile of "code-complete, live-verify pending" keeps growing: the entire 7d.2-A splat path (enum name, property setters, KHR rendering), the 7b editor work (master weathering material, Niagara systems, foliage meshes, RVT/POM material nodes), the Megalights migration, and the routes.json actor paths. Each new offline build adds to a stack that all cashes out against hardware that doesn't exist yet.

- **The 5090 workstation is now the single highest-leverage spend.** Research strengthened the case: UE6 early access slipped to **end of 2027** (Epic, State of Unreal June 17, 2026), and 5.8 is confirmed as the *last* UE5 release — the target is frozen and stable for 18+ months. No obsolescence risk.
- **When it arrives, run a verification sprint before any new feature.** Build a `verify:live` smoke suite: `GET /remote/info`, one ExecutePythonScript round-trip, spawn one of each `TM_*` actor type, one splat tileset render, one full routes dispatch. That converts a one-time manual checkout into a durable regression net — the thing the offline tests structurally can't give.
- **Install cesium-unreal v2.28.0 specifically** (released July 1, 2026): adds UE 5.8 support and contains three 3DGS crash/rendering fixes since the version the April announcement described (splat-accumulation crash fixed v2.26, Tick crash v2.27, splats-not-rendering-in-Standalone v2.28).

## 3. The Agent Layer should become actually agentic

Nothing in `lib/agents/` calls an LLM. The "agents" are deterministic filters over ~14 embedded, hand-authored databases (SPECIES_DB 26 species, CONSTRUCTION_BOOMS 24 cities, ERA_CULTURE_DB 8 eras, MAJOR_FIRES 12 events, …), and every one is NYC/Northeast-US-centric. That was the right way to bootstrap — deterministic, testable, cheap. But it quietly contradicts PRD §23 ("agents scour archives… every fact is cited"), and it's the actual scaling wall for "any Place×Time": every new region means hand-authoring more rows — the "hand-crafted assets don't scale" trap, applied to data instead of meshes.

**Recommendation:** embedded DBs remain the verified core; an **LLM research pass extends them per-scene, with mandatory primary-source citations**, landing in the accuracy manifest for human review. The skeleton exists: Chronicling America and LOC fetches are real API calls, the accuracy manifest already has a review checklist, and Silence Over Wrongness supplies the rejection rule (no citation → not admitted; reduce specificity instead). This is a bigger unlock than more catalogs, more spawners, or Phase 9's 15-item international list — **defer Phase 9** until this exists; doing it by hand-authoring European DBs would double down on the non-scaling approach.

## 4. Technology corrections (verified July 1, 2026)

Every claim below was re-verified against primary sources.

1. **The ion client has the wrong sourceType.** The official Cesium example (`cesium-ion-rest-api-examples/tutorials/reconstruction-assets`, published Aug 2025) shows photo reconstruction uses `sourceType: "RASTER_IMAGERY"` — not the `RAW_IMAGERY` guess in `lib/cesiumIon.js` — with `options.outputs: { cesium3DTiles: true, gaussianSplats: true }` (+ `meshQuality`, `useGpsInfo`). **The splat asset ID comes back in `additionalAssets[]`, not as the primary asset** — `CESIUM_SPLAT_ASSET_ID` must be read from there. `tools/cesium-capture.js` needs both fixes before the Trinity re-run (plus the assets:read+write+list token already identified). ion reconstruction is a **tech preview**, metered in gigapixels; the free Community tier's 20 GP/month covers Trinity-scale spikes.
2. **The 7d.1 spike's central question is already answered by research.** Splat relighting remains unsolved in production — splats stay baked at capture-time lighting; the only shipping workaround is proxy-mesh approximation (Volinga Plugin Pro). And **no tool handles B&W archival photos with unknown cameras** — sparse-view 3DGS (InstantSplat, AnySplat, VGGT pipelines) works on modern imagery only. Combined with the LOC finding (≤640px masters), both spike hypotheses are pre-confirmed: `splat_archival` is dead for now, and capture is constrained to present-day / static-backdrop use. **Narrow `representationSelector`'s capture branch by policy now** and demote the Trinity A/B from decision-gate to verification pass. This strengthens the moat story: the procedural+archival regime is even more load-bearing than the June review assumed.
3. **Standards churn warning:** `KHR_gaussian_splatting` is still Release Candidate (not ratified despite the Q2 target); SPZ compression is an open PR (renamed `..._compression_spz_2` mid-flight); splats are headed to 3D Tiles 2.0 (OGC). Cesium already forced one re-tile when an older experimental extension was removed. **Treat splat assets as regenerable, not archival artifacts.**
4. **UE 5.8 confirmations:** released June 17, 2026 (last planned UE5 release). MegaLights is **production-ready** — proceed with the 7d.3 lamp migration. "Lumen Medium" shipped as **"Lumen Lite"** (2× faster; no Lumen Reflections at that tier — SSR instead; runs the software Global-Distance-Field path, so no hardware RT required — actually better for the Mac-ceiling risk). No RC-API/Python breaking changes found (negative evidence; the box smoke test settles it). PCG gained nondestructive manual edits + building/street example graphs; MetaHuman Crowd is Experimental (future Phase 8 candidate, keep off critical path).
5. **Cheap wins in the asset tools:**
   - Meshy retired **meshy-4** March 20, 2026 (check `meshyClient.js` for pins). Adopt **Multi-Image-to-3D** (when LOC has 2+ angles), **`remove_lighting`** (strips baked shadows from archival photo inputs — exactly the pipeline's problem), **`hd_texture` 4K + `emission` maps** (gaslit windows).
   - ElevenLabs SFX (`eleven_text_to_sound_v2`) supports native **`loop: true`** (0.5–30s) — adopt in `elevenlabs-fetch.js` for beds. The voice `create-previews` endpoint was deprecated May 13, 2026 — check `elevenlabs-voice-fetch.js`. Stable Audio 3's SFX model has **open weights** — free local fallback worth a bake-off on the 5090.
   - TRELLIS.2-4B (Microsoft) is self-hostable for zero-marginal-cost background buildings, but carries a license contradiction (MIT tag vs "academic only" project page) — clarify before commercial use.
6. **World Labs Marble** exports gaussian splats (.SPZ/.PLY) with a documented Unreal path — the first *generative* source that composes with the 7d.2 splat streaming pipeline. Per the PRD §17 quarantine: present-day / clearly-flagged background only, never historical truth. Google Photorealistic 3D Tiles ToS unchanged — still scouting-only; offline venue use remains prohibited.

## 5. Code health (real, but secondary)

- **`routes.json` is the one critical fragility:** actor objectPaths embed the level name plus Unreal's auto-generated UAIDs (`/Game/TimeMachine3-2...DirectionalLight_UAID_...`) — any level rebuild silently breaks every route. The fix pattern already exists in-repo (Cesium modules discover actors by label/class at runtime); routes should reference stable `TM_*`/well-known labels and resolve objectPaths at engine start. Do this **before** the box arrives — level iteration is exactly what the box period will be.
- **Placement-engine consolidation:** six `*Placement.js` modules (~1,900 lines) share ~70% structure (catalog filter → era gate → spline walk → seeded PRNG → dedup → spawnScript). Extract a shared placement engine before the next catalog is added. Minor: `propPlacement.js` still carries a local `seededRandom()` duplicating `math.js`.
- **`audio-engine.html` is a 2,410-line untestable monolith** sharing zero code with lib/. When venue work starts (speaker zones, calibration), extract the scheduler/layer logic into modules the page imports and Node tests — otherwise the most guest-facing subsystem stays outside the test net.
- Stubbed transports (http/osc/log in `dispatch.js`) are fine until venue work begins; only `unreal` is live.

## 6. PRD amendments to make

Small and surgical, in the spirit of v2.1:

1. **§17 — record the relighting constraint.** The capture regime carries baked lighting, which bounds it to contexts where WorldState relighting isn't required or a mesh conversion exists. This is a constitutional fact about the regime, not a volatile vendor detail.
2. **§19 — resolve the MVP contradiction.** Either restore venue productization as an explicit phase or amend the MVP definition to match the actual sequencing.
3. **Technology Watch refresh:** UE6 EA → end of 2027 (full 2028–29); KHR splat → still RC; SPZ → open PR; splat relighting → still baked (proxy-mesh only). New watch item: **the fate of Python/Remote Control automation under Verse-first UE6 is unaddressed anywhere** — the entire dispatch layer rides on it.

---

## Suggested year-2 sequence

1. Fix the ion client (`RASTER_IMAGERY`, `outputs.gaussianSplats`, `additionalAssets[]`) → run Trinity as a **verification pass** (no longer a decision gate).
2. Buy the 5090 box → **verification sprint**: `verify:live` smoke suite, routes.json label-based discovery, the 7b UE-editor work, Megalights migration, cesium-unreal v2.28.0.
3. One polished end-to-end demo scene (1884 Manhattan corner or the Baton Rouge block).
4. **First-room venue milestone** — multi-camera, exposure matching, zone audio, calibration v1.
5. LLM research pass on the Agent Layer (citations → accuracy manifest → human review).

Everything else — Phase 9 international, more catalogs, more spawner types — waits behind those.
