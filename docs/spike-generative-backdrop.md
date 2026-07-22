# Spike: Generative Far-Field Backdrop (Phase 7d.5)

**Status:** Scoped — runs after the Phase A / 7d.4 sprint (needs the near-field 1884 scene standing to judge the seam).
**Type:** Bounded-application spike, **gated by a free pre-test** (§1). Time-box: pre-test ~2 hours (no spend); if it passes, ~1–2 days including new plumbing.
**Subject:** The horizon band of the 1884 Manhattan scene — everything beyond the walkable near-field.
**Trigger:** [`image-blaster`](https://github.com/neilsonnn/image-blaster) (MIT) — single image → 3DGS + collider mesh + panorama + SFX as Claude skills over World Labs **Marble** (`marble-1.1`) and FAL. Reviewed at commit `4acb43b` (2026-05-14), read 2026-07-22.

## This is not a request to amend the PRD

**PRD §17 already rules on this.** The "generative-world-model boundary" paragraph (`PRD.md:485`) puts generative world models out of bounds for the historical core, and then names the exception:

> They may be used only where invention is honest: present-day/live scenes, or **clearly-flagged low-confidence distant background that no archival source covers**. They are never a source of historical truth.

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
| **B — Splat backdrop** | Plate → Marble `marble-1.1` → `.spz` → UE 5.8 | ~$1.20/world | ⚠️ SPZ→UE path unproven on our stack |
| **C — Panorama backdrop** | Same Marble call → `assets.imagery.pano_url` → backdrop geometry with a WorldState-driven material | same call, $0 extra | ⚠️ **new** — see below |

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

**⚠️ Colour is an unsolved input risk.** Every archival plate on hand is black-and-white. Marble from a B&W plate will likely produce a monochrome or oddly-toned world, and the fix is not the Arm C material (that shifts tint, it does not invent chrominance). **Lead with the Gemini plate** and treat the archival plate as a control for how badly monochrome degrades the result. Score it (criterion 5).

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
