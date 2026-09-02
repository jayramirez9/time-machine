# Spike: Generative Far-Field Backdrop (Phase 7d.5)

**Status:** Scoped, **parked under D003** (Experience Proof first). When it resumes it still runs after the Phase A / 7d.4 sprint — it needs the near-field 1884 scene standing to judge the seam.
**Type:** Bounded-application spike, **gated by a free pre-test** (§1). Time-box: pre-test ~2 hours (no spend); if it passes, ~1–2 days including new plumbing.
**Subject:** The horizon band of the 1884 Manhattan scene — everything beyond the walkable near-field.
**Trigger:** [`image-blaster`](https://github.com/neilsonnn/image-blaster) (MIT) — single image → 3DGS + collider mesh + panorama + SFX as Claude skills over World Labs **Marble** (`marble-1.1`) and FAL. Reviewed at commit `4acb43b` (2026-05-14), read 2026-07-22.

## This is not a request to amend the PRD

**PRD §17 already rules on this.** The "generative-world-model boundary" paragraph (`PRD.md` §17) puts generative world models out of bounds for the historical and observed regimes, and then names the exception:

> They remain usable where invention is honest: present-day or live scenes, **distant background no source covers**, and the authored regime (§17 Provenance Modes), where there is no date to violate.

*(Quotation updated 2026-08-13 to PRD v3.0 wording. An earlier draft of this doc quoted the pre-v3.0 text — "clearly-flagged low-confidence distant background that no **archival** source covers" — whose extra word narrowed the exception more than the constitution does. Under v3.0 the reason for the boundary is also different: not citation, but that generative models **cannot be date-gated** (§5.6) — they produce anachronism they cannot detect.)*

So the far-field backdrop use case is **already permitted, conditionally**. The same position is applied to World Labs Marble by name in `docs/review-year1-2026-07.md`, and the ROADMAP's *Quarantined* bucket carries the same carve-out. This spike does not propose admitting a new regime; **the policy is settled and stays settled.**

What is genuinely open is narrower and mostly mechanical:

1. **Does our specific zone satisfy the PRD's qualifier?** — the "no archival source covers" test. This is a *precondition*, not a finding, and it is free to check (§1).
2. **If it does, can we actually build it** so the backdrop stays coherent as WorldState moves — and what does that cost? (§3)
3. **If we build it, how is it labelled** so the manifest stays honest? (§2)

`lib/representationSelector.js` currently exports `REGIMES = ['capture', 'procedural']`. Making the PRD's existing carve-out *expressible in code* means adding a third value plus a manifest provenance class. That is implementation catching up to the constitution, not a constitutional change — and it should be described that way in any writeup, or a later reader will think an amendment happened when it didn't.

## 1. Pre-test (free, run first, may end the spike)

**The 1884 Manhattan horizon may already be archivally covered — in which case the PRD routes it to procedural+archival and Arm A wins before a dollar is spent.**

The project holds Sanborn coverage for Manhattan (`lib/sanborn.js`, `SANBORN_COVERAGE`) and the era is rich in published panoramic views and bird's-eye lithographs. Check, in this order:

- [ ] Does Sanborn coverage extend across the horizon band, or only the near-field blocks already built?
- [ ] Do period panoramas / bird's-eye views of the relevant sightlines exist in LOC or NYPL at usable resolution?
- [ ] Is the horizon band actually *visible* from the guest's walkable positions, or is it occluded by near-field massing? (If largely occluded, the whole question is moot and Arm A wins on cost.)

**If archival sources cover it, stop.** Record that as the verdict, extend procedural massing, and note that the generative path was correctly excluded by the PRD's own qualifier. Only proceed if the horizon is genuinely uncovered.

## 2. Decide before running: who reads the accuracy manifest?

The North Star promises *"every fact is cited, every gap is acknowledged"* (`PRD.md:36`) and that *"the buildings are what actually stood there"* (`:34`). Phase 7d's exit criteria says a guest *"cannot tell which pipeline produced which — only the accuracy manifest knows."*

Put invented geometry in the frame and that sentence resolves to: **the guest cannot distinguish fact from fiction, and the only thing that can is a document they may never see.**

- If the manifest is **internal** (a build-time provenance record), a `generative` class is cheap and this is fine.
- If the manifest is **guest-facing** — which the North Star implies — then a provenance class reading "invented" is a liability, and that may pre-decide the verdict regardless of how the backdrop looks.

**Answer this before spending anything.** It is a product decision, not a spike finding.

## 3. Arms

| Arm | Method | Cost | Plumbing needed |
|-----|--------|------|-----------------|
| **A — Baseline** | Horizon as it stands (procedural massing falloff) | $0 | none |
| **B — Splat backdrop** | Plate → Marble `marble-1.1` → `.spz` → UE 5.8 | ~$1.20/world | ⚠️ still unproven **on our stack**; vendor now claims a documented path (2026-08, unverified) — see 2026-08-13 watch note |
| **C — Panorama backdrop** | Same Marble call → `assets.imagery.pano_url` → backdrop geometry with a WorldState-driven material | same call, $0 extra | ⚠️ **new** — see below |
| **D — Mesh seed** *(not scoped; watch only)* | Plate → Marble **HQ mesh export** → UE as geometry, then enhanced in-editor | ~$1.20 + $2.80 HQ tier (vendor-stated; additive-vs-replacement unconfirmed) | Unknown — no arm authored, see below |

### Watch note (2026-08-13): the vendor Unreal path, and the seed-vs-backdrop distinction

**Source and trust level:** a World Labs marketing email, read 2026-08-13, claiming Unreal import tutorials across three plugin workflows (scene import, collision geometry, lighting). **Nobody here has read the tutorials or run the plugin.** This is a vendor claim, not a verification — and note the repo already recorded "a documented Unreal path" a month earlier (`review-year1-2026-07.md` §4) *while deliberately keeping* Arm B's ⚠️, because the flag was always about **our stack**, not about whether documentation exists. Nothing about our stack changed. §6 criterion 6 — *does `.spz` land in UE 5.8, and does it survive the near-field's Lumen/Megalights setup* — remains the honest statement of where the risk lives.

The claimed "lighting" workflow is assumed to mean scene lighting placed *around* a baked splat, not splat relighting. If it turned out to be the latter it would contradict a position the year-1 review calls a constitutional fact about the regime (§4 item 2, §6 item 1) — and it would be genuine news. Unverified either way.

The note's real value is a distinction this doc never drew. Arms B and C both treat Marble output as a **finished backdrop**. A third posture is Marble as a **seed** — generate rough geometry, then enhance it in-editor with our own weather, sun, and materials (the posture taken toward City Sample in the local `Unreal/` working dir).

That posture only works off the **mesh** export, not the splat:

- **Splat output is a dead end for seeding.** Baked capture-time lighting, not editable geometry. It cannot obey the WorldState sun/weather loop, which is the whole point of enhancement. Same constraint as `review-year1-2026-07.md` §4 item 2 and §6 item 1.
- **Mesh output is at least the right *kind* of thing** — geometry Lumen could relight and an artist could edit, though nobody here has run the export to confirm. Cost is the HQ tier ($2.80/world, vendor-stated), previously dismissed as unnecessary because backdrop arms don't need it. A seed arm would.

Three open risks before Arm D is worth authoring, in governing order:

0. **PRD §17 still fences this, and Arm D does not escape §7.** The carve-out is *distant background no source covers*. "Seed" implies geometry promoted toward the near-field, and in-editor cleanup does **not** cure anachronism the model cannot detect — which is §17's actual reason under v3.0, and the §5.6 failure it exists to prevent. Arm D inherits §7 unchanged: heroes or anything a guest can approach are out of bounds, as is anything carrying a historical claim, **regardless of how good the mesh is.**
1. **CLAUDE.md rule 15 (no view-dependent geometry).** Single-image generative worlds degrade away from the source viewpoint — thin backs, invented occluded volumes. Three apertures with different sightlines, occupant parallax, and Lumen HWRT sampling offscreen geometry are exactly the conditions that expose it. Whether a Marble mesh survives that is unmeasured.
2. **Mesh quality as a starting point.** Unknown whether the export is a usable base or costs more cleanup than procedural massing. This is the real question, and it is not answered by an import tutorial.

**Verdict: watch, do not schedule.** Risks 1 and 2 are cheap to test later; risk 0 may close the question outright. None of this is a felt defect in the room. Revisit per the D003 resume trigger in `docs/experience-proof-plan.md` — "only for a named asset or scene problem that conventional Unreal content cannot meet."

### Watch note (2026-09-02): Atlas — the model behind future Marble

**Source and trust level:** World Labs' public blog post announcing **Atlas** (worldlabs.ai/blog/atlas, 2026-09-01, read 2026-09-02). A vendor announcement, not a hands-on — same trust level as the 2026-08-13 note. Early access only, no pricing, no engine-integration or mesh-export claims.

Atlas is a multimodal autoregressive diffusion transformer that "will power future versions of Marble." Announced capabilities: camera-controlled video generation (up to 1 min / 1440p on designed camera paths), **spatial reconstruction from as few as 2–3 images** (up to 100+ in spatial context, claimed to outperform specialized 3D-reconstruction models), space-time simulation, and image/360-pano generation. Outputs: video, point clouds, Gaussian splats, depth maps.

**What does not change:** the post says nothing about lighting (except as a training-data variation axis) or generation latency — its only speed claim is about *rendering* the finished splat scene on-device, a different thing. The following is therefore **our inference, unverified either way** (same voice as the note above): splat and video outputs are assumed to carry baked generation-time lighting and so cannot obey the WorldState sun/weather loop (same dead-end as the splat-seed analysis above), and generation is assumed offline, so nothing here touches the Experience Proof. Point clouds and depth maps are the one geometry-shaped exception worth naming — depth carries no lighting at all, and the post describes jointly generating views and estimating their geometry — but an unstructured coloured point cloud is not Lumen-relightable, material-bearing geometry either, so the honest disposition is still watch. Arm B's ⚠️ and §6 criterion 6 stand; risks 0–2 above stand; the §17 quarantine and the no-synthesized-people law stand.

**What to re-test at re-read time:** the few-image reconstruction claim aims squarely at sparse **archival** reconstruction — the sparsity that the 7d.1 prep finding showed makes archival→splat marginal. It does *not* gate PRD §3.5 memory-mode capture: §3.5's "Why it is buildable" rules that most memory venues still stand and the guest's photographs are the set dressing and date evidence, **not the geometry source** (present-day dense capture is; the 7d.2 Cesium ion photos→3DGS path is the named candidate there), and D002 routes the BR-1985 anchor photo to the §27 Photo Test wall, not an ingest pipeline. There is a live tension inside §3.5 — its division-of-truth paragraph says the guest's photos "establish the space" — recorded here, not resolved here. Where few-image reconstruction *would* matter: demolished or remodeled memory venues, unseen-wall fill under §3.5's relocated authority, and the archival far-field this spike already covers. Two questions decide whether Atlas ever graduates past watch: (1) does faithful few-image reconstruction hold up on *our* inputs — old, sparse, non-overlapping photos, often B&W or faded (the §4 colour risk applies); (2) does any Atlas-era product emit **relightable geometry** rather than baked splats/video — the criterion that would actually move the seed posture from watch to a scoped arm. Re-read this note (a $0 act — this is not authorization to resume capture work) when the capture resume trigger in `docs/experience-proof-plan.md` §Resume Triggers fires, or when memory-mode/BR-1985 work begins.

**Verdict unchanged: watch, do not schedule.**

### Correction: how Arm C's grading actually has to work

An earlier draft of this doc claimed the panorama could be re-tinted per era **and per weather state** through `resolveToneMapping(year)`. **That was wrong**, and the error mattered enough to be worth recording:

- `resolveToneMapping(year)` (`lib/localePresets.js:66`) branches on **year alone**. `controls.postprocess` (`lib/worldStateCompiler.js:343`) is a straight passthrough of `locale.toneMappingPreset` with no input from `cloudCoverage`, `solarAltitude`, or `precipType`. It is **constant for the whole session** and does not move when the weather does.
- Every `PP.*` route in `routes.example.json` dispatches `type: "postprocess"` at a **single scene-wide `PostProcessVolume`**. It grades near-field and far-field *together, by the same amount* — so it is structurally incapable of closing a near/far seam. It translates both sides of the seam equally.

Had the spike run on the original claim, criterion 4 below would have "failed" against a static global film curve that was never a candidate mechanism — producing a wrong verdict on a question the PRD treats as constitutional.

**The mechanism that could work** is a per-backdrop Material Instance Dynamic on the panorama, driven from WorldState via the existing `material_scalar` dispatch type (the same path cloud coverage already uses) — sun-angle tint, overcast desaturation, and haze bias applied to the *backdrop only*. That is **new plumbing**: a backdrop actor, an MID, and new route entries. It is not free, and Arm C is no longer a "run the same call and look at it" arm.

`resolveToneMapping` still applies — as the **static era grade over the whole frame**, which it already does. It is simply not a seam remedy.

## 4. Inputs

- World Labs API key (`platform.worldlabs.ai`). **~$5 covers the spike** — 1,500 credits/world at $1.00/1,250 ≈ **$1.20/generation**; HQ mesh export ($2.80) is not needed.
- A source plate. Both candidates carry problems, and the comparison is itself a finding:
  - `photos/spike-trinity/01_wall-st-trinity_c1903_503x640.jpg` — real archival, but **monochrome and ≤640px**.
  - A Gemini-generated period street view (`lib/geminiImageGen.js`) — color and full resolution, but fully invented.
- Unreal 5.8 with the near-field 1884 scene standing.

**⚠️ Colour is an unsolved input risk.** Every archival plate on hand is black-and-white. Marble from a B&W plate will likely produce a monochrome or oddly-toned world, and the fix is not the Arm C material (that shifts tint, it does not invent chrominance). **Lead with the Gemini plate** and treat the archival plate as a control for how badly monochrome degrades the result. Score it (criterion 4).

**Single image only.** The client sends one `image_prompt` (+ optional `text_prompt`); no multi-image. That is precisely why it's interesting — the 7d.1 prep found LOC holdings too sparse for photogrammetric capture (~9 items, all ≤640px). Generative needs only one image. It solves sparsity *by inventing*, which the PRD permits **only** in the uncovered-background case tested in §1.

## 5. Anachronism control (test explicitly)

`image-blaster` synthesizes a "clean plate" prompt by *subtracting* removed objects from the scene caption. Invert it: inject `getExclusionText(year)` (`lib/eraData.js:70`) into the `text_prompt` to suppress anachronisms, then audit output against `getAuditPatterns(year)` (`:82`).

A world model that smuggles a 1950s sedan onto the 1884 horizon **fails the spike outright**, however good it looks — Law 5.6 (No Anachronisms) is not tradeable against pixels.

## 6. Evaluation criteria

Judge from **street level in the running scene**, at the distance the backdrop actually sits — never in an asset viewer.

1. **Horizon read** — does it beat Arm A, or just add noise? Be willing to conclude the baseline is fine.
2. **Anachronism leakage** — count and photograph every violation. Any → fail.
3. **★ Seam coherence under WorldState.** Drive dawn / noon / dusk / storm and watch the near/far boundary. **Test this against the §3 material mechanism, not the global tone-mapping path** — grading both sides equally cannot close a seam. If the horizon holds golden while the near-field goes to storm, it breaks **Law 5.1 (One Universe)** exactly as a splat hero would, just further away. **The spike turns on whether distance forgives what proximity would not.**
4. **Monochrome degradation** — archival (B&W) vs Gemini (colour) plate, same scene. Determines whether the archival path is viable at all.
5. **Cost / effort** — dollars *and* the §3 plumbing, against simply extending procedural massing to the horizon.
6. **Ingestion** (Arm B only) — does `.spz` land in UE 5.8, and does it survive the near-field's Lumen/Megalights setup?

## 7. Out of scope

- **Heroes, or anything a guest can approach.** Settled by 7d.1; unchanged.
- **Anything carrying a historical claim.** Set dressing, never evidence — PRD §17.
- **Replacing the Cesium ion capture path (7d.2).** Different regime, different evidence class. The ion client corrections at `lib/cesiumIon.js:38` remain the next code item regardless.
- **The FAL side** (Hunyuan-3D, ElevenLabs SFX). We already have Meshy and a direct ElevenLabs pipeline; no reason to add a broker.

## Deliverable

Update this file with: the §1 pre-test result, the §2 manifest-audience answer, stills of each arm at matched camera across 3 lighting states with the seam visible, the filled scorecard, and a one-paragraph **verdict**. If the backdrop is adopted, open tasks for the third `REGIMES` value, the manifest provenance class, and the §3 material plumbing — described as *implementing* PRD §17's existing carve-out, not amending it.

## Hypothesis

**The §1 pre-test is the most likely place this ends** — 1884 Manhattan is well documented, and if the horizon is archivally covered the PRD already routes it to procedural. That would be a good outcome: a constitutional question closed for free.

If it survives §1, expect **Arm C to beat Arm B** — not on fidelity, where the splat should win, but because a textured backdrop can be driven from WorldState per-parameter while a splat's baked lighting cannot, and because it carries no SPZ ingestion risk. Expect **monochrome archival input to be the binding practical constraint**, pushing toward Gemini plates — which weakens the "archival" justification considerably and is worth noticing early.

Hold open the honest possibility that **the baseline is simply good enough**. A $5 pre-test is cheaper than the argument about it.

---

## Separate finding: the skill architecture is worth stealing regardless

Independent of Marble and not gated on this spike. `image-blaster` structures its pipeline as **Claude skills** — `.claude/skills/*/SKILL.md` with `context: fork` + `agent:` frontmatter and scoped `allowed-tools`, backed by thin `.mjs` helpers that write request-metadata JSON beside every artifact and resume cleanly from an interrupted run.

That is the job `tools/bootstrap-scene.js` does (chain 7 tools, skip-detect, parallel phases), decomposed into individually-invokable, independently-resumable units. Worth evaluating as a refactor target on its own merits. `.claude/scripts/world/generate-world.mjs` is a clean reference for the resume/idempotency pattern — near-zero-dep, polls an async operation, writes provenance alongside artifacts, never leaves an asset pointed at a provider URL. Structurally the same shape as `lib/cesiumIon.js`.

**Security — scoped claim.** Reviewed at commit **`4acb43b` (2026-05-14)**, read 2026-07-22: MIT; hooks (`SessionStart`, `UserPromptSubmit`) only inject read-only status text into context; permissions scoped to its own scripts; no exfiltration paths found. **That claim covers that commit only — re-review before running a later HEAD.** Run it with a **World-Labs-only key in its own `.env`**, never from a shell sourcing this project's `.env` (which holds ELEVENLABS, GOOGLE_AI, MESHY, and CESIUM_ION credentials). FAL is not needed for this spike.
