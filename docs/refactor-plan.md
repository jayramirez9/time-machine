# Time Machine — Locale Package Refactor Plan (Implementation Plan)

**Status:** Ratified 2026-08-04; **paused by D003 on 2026-08-06 until the Experience Proof exits**
**Governing decision:** `docs/decisions/D001-locale-package-contract.md`
**Contract:** `contracts/locale-package-v0.1.md` + `contracts/locale-package.schema.json`
**Architecture:** `docs/architecture-v3.md`
**Companion:** `docs/v3-pivot-plan.md` (content-level pivot map this plan absorbs the structural half of), `docs/scope-code-provenance-refactor.md` (Builds A/B/C spec)

> **D003 priority override:** This remains the restart plan for Locale Packages, provenance cleanup, and the Unreal content rebuild, but it is not the active queue. Complete `docs/experience-proof-plan.md` first. Scene 0 uses the existing engine path directly; P1 resumes when a second real scene makes package switching/configuration duplication a felt problem, or when Jay explicitly reactivates it after the guest sessions.

---

## Objective

Bring the codebase into alignment with PRD v3.0 (Flinch Standard): three provenance modes (historical reconstruction, observed, authored), the Flinch Standard replacing the Accuracy Contract, and the environment engine as a future platform layer.

The structural move: **promote the planned preset system into a Locale Package contract.** All environment content compiles to one versioned package format. The runtime loads packages and nothing else. Provenance logic lives exclusively in authoring pipelines and build-time evals — never in the engine.

This is a refactor of the *plan* more than the *code*. The World State Engine, provider abstraction, Environment Router, rate limiter, and Unreal transport survive unchanged. The components that must change under v3.0 — preset system, runtime historical accuracy layer — were never built.

## Reconciliation (packet vs. repo reality)

The planning packet was generated off-repo. These corrections are load-bearing; the build sequence below already incorporates them.

1. **Epic numbers.** The packet's `E07-locale-package` collides with the existing **E07 Cesium Integration** in `builds.md`. Assigned instead: **E08-locale-package**, **E09-authoring-pipeline**.
2. **The GHCN-Daily provider already exists.** `lib/noaa.js` (Phase 3, DONE) is a GHCN-Daily provider via the NOAA CDO API, including hourly synthesis from daily obs. Packet Build 5 is re-scoped from "build the provider" to "adapt it to the contract": expose it as `provider: ghcn_daily`, add `augmentation_ref` compositing (authored hourly texture bounded by daily max/min), and a hand-checked fixture eval.
3. **Provider enum extended.** The schema now includes `visualcrossing` — the engine's preferred paid 1940+ provider; packages must be able to declare it. A package-declared provider **overrides** the CLI auto-selection chain (the chain remains for non-package CLI use). This is new loader semantics, noted in Build P2.
4. **Tracking files.** No `implementation-plan.md` or `masterplan.md` exist here. Mapping: epic registration + build log → `builds.md`; current-build tasks → `tasks.md` (created 2026-08-05 at Jay's direction, packet v2); phase tracking → `ROADMAP.md`; product vision → `PRD.md`. The PRD v3.0 amendment is integrated in `PRD.md` (there is no separate `amendment-v3-flinch-standard.md`).
5. **Solar-event math is new work.** Providers deliver per-hour solar altitude/azimuth; nothing computes dawn/sunrise/sunset/dusk *times* as a utility (`lib/noaa.js` has only an internal estimate). Build P3 includes a small astro module (standard NOAA solar equations) for schedule solar anchors.
6. **`preset` grep hazard (Build P9).** `lib/localePresets.js`, `lib/scalePresets.js`, and Remote Control presets are legitimate and are *not* the retired preset system. The supersession grep must not sweep them. Open item: locale-preset tuning values are expected to migrate into package data over the ports; `localePresets.js` retires only when the last non-package path stops using it.
7. **Provenance-mode routing doctrine.** `v3-pivot-plan` step 6 wanted the mode threaded compiler→router/dispatch. Under D001's provenance-opacity invariant, that engine-side threading is **superseded**: the engine reads mode for display/logging only. The authoring-side half survives intact (mode-aware `resolveEra()` observed→capture, per-mode `era-audit`, mode-tagged classifier output, assembler dropping the historical-only assumption). This partially answers open product question 3 in `v3-pivot-plan.md`: routing is authoring-time.
8. **7d.4 Live Verification Sprint is absorbed, not dropped.** The fresh UE 5.8.1 project (U-track) changes 7d.4's context: code-complete live-verify items (rendering config, capture client, splat streaming) get verified against the *new* project during U1/U2 and the ports — fold the 7d.4 first-boot checklist (`docs/rd-workstation-spec.md`) into U1.
9. **In-flight work lands first.** In-flight WIP on branch `wip-b047-simmonth-temperature` (simMonth + temperatureC in `worldStateCompiler`/`worldStateContract`) is pivot-plan step 2, half done. It and the wildlife split (step 3) are guest-facing, independent of this refactor, and complete before Build P1.

## Scope

**In scope:**
- Locale Package contract v0.1 (schema, spec, reference manifests) — placed at `contracts/` with this commit
- Engine package loader (manifest → provider selection, scene resolution, publish-gate enforcement)
- Schedule channel v0 (authored "other 23 hours" as a separate channel from weather) + solar-event astro module
- GHCN-Daily contract adaptation (see Reconciliation 2)
- Porting the three locales to packages (`nyc-present`, `baton-rouge-1985` per D002, `nyc-1884`) — this IS the Unreal rebuild on the a7500; do not rebuild the scenes bespoke and port later
- Fresh Unreal project on the a7500 — UE 5.8.1, new `time-machine-unreal` repo, Core Environment Rig, kit/PCG foundation (U3)
- Flinch eval harness v0 extending `tm-eval.js` (`SUITES` registry)
- Removal/supersession of preset-system and accuracy-layer references in docs and code (coordinated with provenance Builds A/B)

**Non-goals (explicitly deferred):**
- Gaussian splat / Worldforge hybrid implementation — `content_type` enum reserves the slot; implementation requires a new D-record
- Audio engine runtime host — resolves with the environment engine host decision; audio manifest fields stay host-agnostic
- Operator UI, multi-window/nDisplay, calibration tools — unchanged on their existing roadmap
- Repo split (engine → platform level) — module seams only
- Mass directory reorganization — see Migration Rules
- Pivot-plan XL bets (photo-first ingest, memory mode, Temporal Asset Library) — sequenced after this refactor; the E09 seam is where photo-first lands
- **Movement within a locale.** The ability to change position within a locale — including operating the hero aperture as a navigation surface — is a future feature. The model is undecided: v0.1 commits to nothing about how movement works, its granularity, or how it interacts with the venue profile. `viewpoints` is an array and can hold multiple positions if that proves to be the shape; this is not an assertion that it will. Implementation requires a new D-record.

## Epic Registration (in `builds.md`)

| Epic | Status | Purpose |
|------|--------|---------|
| **E08-locale-package** | NEW | Package contract, loader, schedule channel, three conformance ports |
| **E09-authoring-pipeline** | NEW (stub) | Mode-specific authoring front-ends + shared back-end; also home of the provenance refactor Builds A/B/C (Environment Profile envelope + agents). Seam only in this refactor — no front-end builds |
| **E01-weather-providers** | EXTENDED | GHCN-Daily contract adaptation |
| **E04-unreal-dispatch** | EXTENDED | Unreal Track (U1–U3; a second era kit lands as its own U build when P7 approaches) |
| **E06-eval-system** | EXTENDED | Flinch eval harness |

## Merged Build Sequence

**Paused.** The sequence below is preserved intact so the work can restart without re-planning. D003's EP0–EP4 queue in `tasks.md` takes precedence.

Build numbers are assigned from the head of `builds.md` at execution time. One build per session. Commit format `B{NNN}: description`; update `builds.md`, `tasks.md`, and `ROADMAP.md` at each boundary. Letters below are plan-labels, not build numbers.

**Tracks:** W (wildlife, in flight) → P (package, Mac-side) ∥ U (Unreal, a7500) ∥ A (provenance refactor, Mac-side). U-gating: P4 requires U2; **P6 additionally requires U3** (the kit/PCG foundation — Baton Rouge is the first geometry-heavy port). **P5 and P8 are Mac-side and U-independent** (P5 needs P2; P8 needs P1+P2), so if the a7500 slips again (it was DOA once), run them ahead of P4. A-track slots into Mac-side gaps while U-track renders/installs.

**Ports run as drafts until P8.** The required eval suites named in the manifests do not exist until P8, so P4–P7 packages stay `status: draft` and load via `--allow-draft`. That is the sanctioned path — CLAUDE.md rule 3 forbids weakening the *gate*, not using drafts.

### W1 — Finish simMonth + temperature threading (E02) — *WIP on branch `wip-b047-simmonth-temperature`*
Compiler/contract halves are committed on that branch. Remaining: expose `simMonth`/`temperatureC` through the WS payload to `audio-engine.html`, tests. `simMonth` joined `REQUIRED_FIELDS`, so hand-built fixtures in `test/goldenState.test.js` and `test/phase1.test.js` need surgery, not just new assertions. Eval: contract suite green; both fields present in published state.

### W2 — Wildlife day/night split (E03)
Split `insect_chorus` into separately gated day/night events on existing `diurnalWeights` + new temperature input: cicada=day+temp-gated, katydid=night, birds suppressed at night. Kills the canonical midnight-cicada flinch. Eval: profile-generator output + audio-engine gating tests; manual audition at simulated 22:00 July Georgia scene.

### P1 — Contract (E08)
Contract + schema are committed (this commit). Build: three draft reference manifests `locales/{nyc-present,baton-rouge-1985,nyc-1884}/manifest.json` (drafts — spatial refs may point at not-yet-rebuilt levels), plus a `locale-package` suite in `tm-eval.js` implementing the schema **and the contract's Validator Rules section** (pattern: `lib/worldStateContract.js` — hand-rolled, no new deps; a recorded decision, accepted drift risk). The JSON Schema is normative; the suite pins behavior with a fixture corpus — the three references plus a negative matrix — so validator/schema drift is caught by fixtures, not luck. The validator asserts `format: date` (annotation-only in draft-07) and shapes errors by discriminating before deep validation (`date_policy` on `type`, events on `anchor`). Eval: all three manifests validate; invalid fixtures (bad mode enum, missing evals block, empty `evals.required`, unknown suite id, clock+solar on one event, duplicate event ids, malformed dates) fail with self-describing errors; `tm-eval --json` exit 0. Reserved `content_type` is **schema-valid by design** — rejection is loader behavior, tested in P2. **No runtime code changes.**

### P2 — Package Loader (E08)
Engine loads a manifest: validate, select provider from `weather.binding`/`weather.provider` (declared provider **overrides** auto-selection), resolve `spatial.content_ref`, expose package metadata. Publish gate: `status: published` + unpassed required evals → refuse to load; `--allow-draft` for dev. `provenance` is opaque — display/logging only. Reserved `content_type` values rejected with "not implemented". Loader lands in `engine/loader/` per `docs/architecture-v3.md`. Eval: engine boots from stub manifest with mock provider; existing golden-state tests pass unchanged; publish-gate refusal test; reserved-type rejection test.

### P3 — Schedule Channel v0 + solar astro module (E08)
Schedule player reads `schedule.events`, emits event triggers into the router stream alongside weather-driven state — two channels end to end, never merged. New `engine/schedule/solar.js` (NOAA solar equations: dawn/sunrise/sunset/dusk for date+lat/lon) since no such utility exists. Eval: deterministic 24h replay — clock events at clock times, solar events at astronomically correct offsets (fixture-checked against published almanac values for the three locales' dates); replay captures both channels independently.

### U1 — Fresh project bootstrap (E04) — *parallel with P1–P3*
a7500 prep (NVIDIA Studio driver, Defender exclusions, DDC on NVMe — fold in the 7d.4 first-boot checklist from `docs/rd-workstation-spec.md`). UE 5.8.1 pinned, blank project: DX12+SM6, Lumen+HWRT, Nanite, VSM. Plugins: Remote Control API, Sun Position Calculator, Cesium for Unreal (verify 5.8 compat, re-auth ion token — write-scoped token still owed), Unreal MCP Server (evaluate vs Aura; keep one, log the call), Ludus AI only if it earns its slot. RC bind in `DefaultEngine.ini` (LAN, 30010/30020) + firewall rules. New `time-machine-unreal` repo (Git LFS; ignore DDC/Intermediate/Saved/Binaries/Cesium caches/Fab-Megascans). Content conventions locked: `/Game/Locales/{Name}/Main`, `/Game/Core/`, `/Game/Shared/`; old project is a quarry via Migrate tool, never bulk-copy. Point `UNREAL_RC_HOST` at the a7500. Eval: RC info endpoint responds from the Mac Mini; transport round-trips property set/get; LFS round-trip verified. Old PC untouched until P7 lands.

### U2 — Core Environment Rig (E04)
Reusable weather-receivable rig in `/Game/Core/`: SunSky/directional + Sky Atmosphere + Volumetric Clouds + Exponential Height Fog + Niagara precipitation, RC preset exposing exactly the router-driven properties (sun angles, cloud/fog/precip density, color temperature). Empty test level instancing it. Eval: golden-state replay tracks on the a7500; accelerated 24h cycle renders correct light progression (the Phase 0 exit bar, re-proven); RC preset committed.

### A1–A4 — Provenance refactor (E09) — *Mac-side, slots between P3 and P4 while U-track runs*
Per `docs/scope-code-provenance-refactor.md` + pivot-plan steps 1, 4, 5, 7, in order: **A1** complete stray-confidence inventory (incl. `test/goldenState.test.js:185,213`, `test/phase1.test.js:31`); **A2** Build A — envelope flip to `{data, knownCompromises?}` + provenance declaration; **A3** Build B — strip confidence emission across the 8 agents + all stray consumers, launcher dot → mode badge; **A4** Build C — ecology agent emits per-species diurnal/temperature gates on the reshaped envelope. **Carve-out:** `representationSelector.js` + its test untouched (`evidenceConfidence` is sanctioned internal metadata). Authoring-side mode routing (mode-aware `resolveEra`, per-mode `era-audit`) follows as its own build; engine-side mode threading is superseded (Reconciliation 7).

### U3 — Kit and PCG foundation (E04) — *before P6*
The reuse machinery the locale ports consume. Content conventions in `/Game/Kits/{era}/`, `/Game/Data/`, `/Game/PCG/`. First era kit (`us-suburban-1970s-80s` — massing, roof forms, cladding materials, era-tell props) and the footprint-to-building PCG graph that extrudes structures from imported footprint data. Fidelity band convention as an authoring standard: Band A (photo-verified, hand-finished), Band B (evidence-derived, PCG from kit), Band C (low-detail real geometry, massing and atmosphere only) — bands authored against the **occupied region of the room** (four occupants, parallax, three apertures), not a single point. Locale geometry organizes into Level Instances by spatial region. **No view-dependent geometry:** all locale geometry is real geometry — no billboards, no omitted backs; Band C is low-detail real geometry, never a painted plane (three sightlines + parallax + Lumen HWRT sampling offscreen geometry). Eval: a hand-authored fixture footprint set (~10 buildings) runs through the PCG graph and produces era-legible massing with complete geometry; band assignment inspectable per Level Instance; kit committed and reusable — a second same-era locale consumes it without modification.

### P4 — Port `nyc-present` (E08) — *requires U2*
First conformance port. Observed mode, `binding: live`, Open-Meteo. Rebuild the level on the a7500 *as this package*. Reuse path: Cesium World Terrain + OSM Buildings and the existing terrain pipeline — present-day geometry needs no era kit, so P4 gates only on U2. Eval: replay parity against recorded golden states; live smoke test (sun, clouds, conditions coherent with actual NYC weather).

### P5 — GHCN-Daily contract adaptation (E01)
Expose `lib/noaa.js` as `provider: ghcn_daily` behind the loader; implement `augmentation_ref` compositing (authored hourly curves bounded by daily max/min); hand-checked historical fixture set. Eval: known dates return correct daily values; WorldState contract conformance; missing station days fall back to authored texture with no visual pop (rate-limiter path), logged.

### P6 — Port `baton-rouge-1985` (E08) — *requires U3; the witness scene (D002)*
Historical mode, `binding: archive`, `date_policy: fixed` — the 1985 date resolves from Jay's anchor photo (provisional until selected; D002 decision 2). Exercises the schedule channel with a real authored day. Consumes the `us-suburban-1970s-80s` kit (70s housing stock; 1985 era-tells are stage-7 props — vehicles loudest) and the footprint PCG graph from U3. Era ground truth: mid-1980s aerials (USGS NHAP 1980–87 via EarthExplorer; state GIS secondary; family photos for the anchor parcel) — stage 3 is per-locale sourcing, start early. Engine-path parity (replay) still applies; scene content is witness-validated, not preset parity. Regeneration inputs: the existing 1983 profiles (`profiles/baton_rouge_la_1983.json`, `audio-profiles/gen_baton_rouge_louisiana_united_states_1983.json` — v2, ecology-populated) primary, 1978 v1 fallback (D002 §4). Photo-first *tooling* stays deferred — the anchor photo is the spec by hand. **Provider note:** parity replay must compare like-for-like — golden states recorded from Visual Crossing don't diff cleanly against Open-Meteo archive; pick the binding at port time and record fresh goldens from it. Eval: full 24h golden replay; archive weather matches recorded values; schedule events fire per P3 semantics; no channel bleed; §27 Photo Test mount (anchor photo beside the render, same view/hour/weather) + recorded Witness Test session (§26).

### P7 — Port `nyc-1884` (E08)
Historical mode, GHCN-Daily + authored hourly augmentation. Stresses the pre-1940 path and lineage fields (photo, Sanborn refs). **Kit dependency:** needs an 1880s era kit (rowhouse/brownstone massing, Sanborn-derived footprints) that U3 does not build — a second kit build on the U track, scoped as its own build when P7 approaches; the U3 PCG graph is reused, only kit content is new. Eval: 24h replay on a documented 1884 date; daily values match station record; augmentation respects daily max/min bounds.

### P8 — Flinch eval harness v0 (E06)
Per-mode suites in `tm-eval.js`, results written to each manifest's `evals.results`: all modes — schedule-validity, loop-detection, lineage-completeness; historical — sun-astro, weather-record-diff, anachronism checklist (manual runner); observed — landmark-fidelity checklist, live-coherence; authored — internal-consistency checklist, plausibility. Manual suites are structured checklists with recorded results — automate incrementally, never block publishing machinery on automation. Eval: failing required suite blocks `published` load end-to-end (P2 gate proven); passing flips it loadable; `tm-eval --json` reports per-package status.

### P9 — Supersession cleanup (E08)
Grep and resolve: `preset`, `accuracy layer`, `accuracy manifest`, `silence over wrongness` — **minding Reconciliation 6** (localePresets/scalePresets/RC presets are not targets; most code-level confidence strippage already landed in A1–A4, so this is largely docs). Update `ROADMAP.md`, `builds.md` epic notes, PRD cross-references. Log the follow-up: correct the Notion Time Machine Page Index (still teaches the pre-Flinch architecture). Eval: zero live references to the superseded architecture outside `docs/decisions/` history and the PRD amendment record.

## Accepted Trade-offs

**Witness-window sequencing — RESOLVED by `docs/decisions/D002-baton-rouge-1985-witness-scene.md` (2026-08-05).** The Baton Rouge port *is* the 1985 witness scene: Jay's family photos anchor 1985, so the anchor photo picks the date (§3.1) and the witness scene and the conformance port are the same build — the witness window costs nothing extra in sequence. Photo-first tooling remains the deferred XL bet; the pilot proves the product shape by hand.

## After This Refactor

Remaining `v3-pivot-plan.md` steps continue in its stated order (numbers below refer to its **sequenced build order**, not the rank table), re-anchored: representation-selector wiring (#8), render-side diurnal authoring (#9), date-gate generalization (#10), witness/Photo-Test tooling (#11 — becomes extensions of the P8 harness), coherence-loss recovery (#12), then the gated XL bets — photo-first ingest (#13, lands in the E09 seam), memory mode (#14), Temporal Asset Library (#15). The 8 open product questions in `v3-pivot-plan.md` still gate the XL bets (question 3 partially resolved — see Reconciliation 7).

## Migration Rules

1. **No file moves mixed into feature builds.** Target layout in `architecture-v3.md` is directional; new code lands there, existing `lib/` modules move only in a dedicated build, or not at all if churn outweighs benefit. Judgment call, logged in `builds.md`.
2. **Parity before improvement.** Ports (P4, P6, P7) reproduce current behavior first, verified by replay. Enhancements are separate builds. **P6-only carve-out (D002):** engine-path replay parity applies; scene *content* is witness-validated instead of preset-parity. The carve-out does not extend to P4 (referent: the real present-day place) or P7 (no living witness).
3. **The Unreal rebuild and the ports are the same work.** Scenes rebuild on the a7500 directly into package structure — building bespoke and porting later pays the migration cost twice.
4. **Epic boundaries hold.** Providers → E01. Unreal → E04. Evals → E06. Package/loader/ports → E08. Profile/agent refactor + future front-ends → E09.
5. **Contract changes** after P1 require a semver bump, updated reference manifests, passing contract suite, and an amendment note on D001 — same commit.

## File Placement (resolved with this commit)

| File | Destination | Status |
|---|---|---|
| `refactor-plan.md` | `docs/refactor-plan.md` | ✅ this file (adapted) |
| `architecture-v3.md` | `docs/architecture-v3.md` | ✅ placed, corrected |
| `D0XX-locale-package-contract.md` | `docs/decisions/D001-locale-package-contract.md` | ✅ numbered, corrected |
| `locale-package-v0.1.md` | `contracts/locale-package-v0.1.md` | ✅ placed, corrected |
| `locale-package.schema.json` | `contracts/locale-package.schema.json` | ✅ placed, provider enum extended |
| `CLAUDE-addendum.md` | merged into `CLAUDE.md` | ✅ merged, adapted |
