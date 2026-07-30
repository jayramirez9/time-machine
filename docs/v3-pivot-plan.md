# v3.0 Pivot Plan — where the code must move to represent the Flinch Standard

**Generated:** 2026-07-30, from a multi-agent review of the codebase against PRD v3.0 (8 subsystem surveyors → synthesis → adversarial completeness critique → final merge; 60 raw findings).

**What this is.** PRD v3.0 (the Flinch Standard) changed the constitution; the code still runs the old one end-to-end. This is the ranked map of where the code embodies the *old* constitution (the Accuracy Contract / citation apparatus, the Place×Time-first pipeline, historical-only assumptions) and what must pivot. Companion to `docs/scope-code-provenance-refactor.md` (which specs one of these themes in depth) and `docs/temporal-asset-library.md`.

**The headline.** Two gaps every surveyor independently confirmed: (1) there is **no photo-first code path anywhere** — the whole codebase is still Place×Time→research→assemble→generate, the exact arrow §3.1 inverts; (2) the **confidence/citation apparatus is load-bearing** far beyond the scope doc's grep — it's republished on WorldState every tick and two tests break the moment it's removed.

---

## How to read this: rank ≠ build order

Themes below are ranked by **centrality to representing v3.0 for a guest, weighed against effort** — the goal is the product experience, not code tidiness. But the *build order* differs from the rank because of dependencies (the highest-value fix, wildlife gating, is partly entangled with the refactor). Build from the **Sequenced build order** section, not the rank list.

---

## Ranked themes

| # | Theme | Severity | Effort |
|---|---|---|---|
| 1 | Wildlife diurnal + temperature gating (the cicada/katydid flinch) | core | M |
| 2 | Retire confidence/citation → Provenance Declaration (Builds A/B) | core | L |
| 3 | Provenance modes — behavioral routing, not a bolt-on field | core | L |
| 4 | Wire the Representation Regimes selector into the spawn pipeline (§17) | core | L |
| 5 | Render-side diurnal state authoring (§25) + canonical hour | core | XL |
| 6 | Generalize the universal date-gate to signage/typography + vehicle model-year (§5.6) | significant | M |
| 7 | Witness / Acceptance tooling — Photo Test + Witness Test (§26/§27) | significant | M |
| 8 | Coherence-loss recovery in the tick/publish loop (§16 / §5.3) | significant | M |
| 9 | Photo-first pipeline inversion (§3.1) — the North Star primary mode | core | XL |
| 10 | Personal Memory Reconstruction (§3.5) + the no-synth-people non-negotiable (§5.5) | core | XL |
| 11 | Temporal Asset Library — versioned assets keyed by location+date (moat, Phase 10) | significant | XL |

---

### 1 — Wildlife diurnal + temperature gating (the cicada/katydid flinch) · core · M
Insects and birds are blended into single averaged micro-events, gated only by season — never by hour or temperature. A Georgia scene fires annual cicadas at 10pm, the exact flinch §5.6 names as canonical. Fix spans three layers: (1) `worldStateCompiler` must **extract and expose the sim month** — it currently has NO month reference at all, so this is new extraction, not a re-expose; (2) **temperature must be threaded to the audio scheduler** — `audio-engine.html` has ZERO temperature references today, so this is genuinely new plumbing across compiler→WorldState→audio; (3) split the single `insect_chorus` into separately-gated day/night events (cicada=day+temp, katydid=night, birds suppressed at night). A first cut kills the midnight-cicada flinch using the `diurnalWeights` that already exist plus the new temperature input; ecology-agent per-species/temperature enrichment is Build C of the provenance refactor.
**Key files:** `lib/agents/ecologyAgent.js`, `lib/profileGenerator.js`, `audio-engine.html`, `lib/worldStateCompiler.js`, `docs/scope-code-provenance-refactor.md`
**Why #1:** highest guest-visible flinch-removal per effort — the single wrongness the PRD elevates to a named canonical example, reproducible in the current build. (The inputs do **not** already exist at the consumer boundary — month absent from the compiler, temperature absent from the audio scheduler, both grep-confirmed — so effort M is at the light end, not free.)

### 2 — Retire the confidence/citation apparatus → Provenance Declaration (Builds A/B) · core · L
The v1 constitution is still load-bearing: layer envelopes hard-require `confidence`+`sources`; `generateAccuracyManifest` rolls up `overallConfidence` with a verified/likely/interpolated taxonomy. Builds A/B are spec'd in `docs/scope-code-provenance-refactor.md`. **Beyond the doc's grep, the stray-site inventory must include:** `worldStateCompiler.metadata.confidence` (republished every tick over WS, ~:308/:364), `sanborn.js`/`buildingMassing.js` per-footprint confidence, `profileGenerator` + `audio-profiles/*.json` `era.confidence`, `lib/historicalOverlay.js` CONFIDENCE, `tm-engine.js` `/api/profile` + WS `state.profile`, `tools/generate-environment-profile.js` CLI dashboard, `launcher.html` traffic-light dot — **AND two test files the scope doc missed: `test/goldenState.test.js:185,213` and `test/phase1.test.js:31`**, both of which assert `metadata.confidence` and go red the moment the compiler removal lands. Build A introduces the `mode` field on the envelope; the deeper mode ROUTING is theme #3.
**Key files:** `lib/environmentProfile.js`, `lib/agents/profileAssembler.js`, `tm-engine.js`, `launcher.html`, `test/goldenState.test.js`, `test/phase1.test.js`, `docs/scope-code-provenance-refactor.md`
**Why #2:** the constitutional substrate — spec'd and ready, establishes the provenance-mode field that unblocks #3 and #7. Ranked below #1 because most of it is internal tidy-up with low direct guest value. **Carve-out: leave `representationSelector.js` + its test untouched** (the sanctioned `evidenceConfidence` internal-engineering use).

### 3 — Provenance modes — behavioral routing, not a bolt-on field · core · L
The least-covered dimension, and NOT a one-field addition. It is behavioral routing: `architectureStyles.resolveEra()` (~:541) always returns a historical era with no observed/authored branch — observed scenes should route to *capture*, not historical classification; `tools/era-audit.js` applies one anachronism regime regardless of mode; classifier output carries no mode tag; `profileAssembler` must stop assuming historical is the only case. The `worldStateCompiler` is the natural origin of the active mode, threaded downstream to consumers — **including `environmentRouter.js`/`dispatch.js`/`routes.json`**, which no other theme names as a mode target. Naming hazard: `cli.js` already has a `--mode` flag (output format) that collides with a future §17 `--provenance-mode`.
**Key files:** `lib/architectureStyles.js`, `tools/era-audit.js`, `lib/agents/profileAssembler.js`, `lib/worldStateCompiler.js`, `lib/environmentRouter.js`, `cli.js`
**Why #3:** core constitutional work; consumes Build A's mode field and is the branch point every downstream classifier/audit/router needs. Observed→capture routing is partly blocked on the same capture assets as #4, but classifier mode-tagging, era-audit branching, and router/dispatch threading are independently deliverable.

### 4 — Wire the Representation Regimes selector into the spawn pipeline (§17) · core · L
`selectRepresentation()` is fully built and tested but has **zero callers** — no spawn tool or massing module consults it, so every building still spawns 100% procedural and the §17 capture-vs-procedural model is inert. Wiring requires `buildingDateAgent`/`urbanFormAgent` to emit per-footprint fields the selector needs (`survivesToday`, `isHero`, `photoCount`, `photoMaxResolutionPx`, `evidenceConfidence` — none exist today), `buildingMassing.js` to consume them, and capture-regime features to route to `TM_SplatTileset` instead of procedural cubes.
**Key files:** `lib/representationSelector.js`, `lib/buildingMassing.js`, `tools/spawn-buildings.js`, `lib/cesiumTileset.js`, `lib/agents/buildingDateAgent.js`
**Why #4:** the on-ramp to photo-first (#9) and the per-feature record the Temporal Asset Library keys on — but an **enabler, not a payoff**. Wiring yields no guest-visible change and does NOT make capture non-inert: the ion token still lacks write scope, the Trinity live-verify is owed, and in-engine visuals also depend on the 7d.4 editor-side assets, so every feature resolves to procedural even after wiring. It activates the *decision*, not the outcome.

### 5 — Render-side diurnal state authoring (§25) + canonical hour · core · XL
The dream state is "inside a photograph, and staying there for a day" — but the render side can only draw the one hour. The audio side has `activityMultiplierAt()`/`diurnalWeightAt()`; the render side has nothing: no lit-signage schedule, no business open/close hours, no traffic/pedestrian density curves, no dusk-ignition/dawn-extinguish lighting handoff. `viz.html` is a pure sky/weather shader with no signage/business/traffic concept. `startEngine()` and every profile also lack the §25 canonical-hour hint. Needs a new profile authoring layer, a `controls.diurnal` block out of `worldStateCompiler` mirroring the audio pattern, and consumers in `viz.html`, the spawn tools, and (routing) `environmentRouter.js`/`dispatch.js`. In-engine payoff also gates on the 7d.4 editor-side assets.
**Key files:** `lib/worldStateCompiler.js`, `lib/architectureStyles.js`, `viz.html`, `tools/spawn-particles.js`, `lib/runtimeEngine.js`, `docs/environment-profile-schema.md`
**Why #5:** half the North Star (§3's "then the hour moves…") and an acknowledged open PRD scoping item. XL, but reuses the proven audio-side diurnal shape. Independent of the provenance refactor; lands cleaner after the schema flip.

### 6 — Generalize the universal date-gate to signage/typography + vehicle model-year (§5.6) · significant · M
Props, foliage, particles, decals, clutter and music **already** implement the mechanical year-gate §5.6 wants — this dimension is mostly right, do not re-litigate. Two named classes have no data source: **signage/typography introduction dates**, and **vehicle model-year** (`materialsInfra` gates transport MODE — "automobile 1900+" — not model year). Also: `lib/eraData.js`, positioned as the shared universal-gate timeline, has **zero direct test coverage** (grep-confirmed). Add a signage/typography-by-era table alongside `INFRASTRUCTURE_TIMELINE`, a vehicle model-year gate (partly spawn-tooling), and an `eraData.js` test file.
**Key files:** `lib/agents/materialsInfraAgent.js`, `lib/eraData.js`, `lib/agents/culturalAgent.js`, `test/`
**Why #6:** contained M closing two real anachronism vectors a witness would catch, plus cheap correctness insurance on the module all gating leans on. Mid-pack because most classes are already gated and the sharpest wildlife gap is #1.

### 7 — Witness / Acceptance tooling — Photo Test + Witness Test (§26/§27) · significant · M
Acceptance today is the `accuracyManifest` confidence gate and a `buildReviewChecklist()` keyed purely on confidence thresholds. §26/§27 replace this with the Photo Test (mount source photo beside the render, same view/hour/weather) and the Witness Test (seat someone who was there, record every flinch), plus living-witness-first content priority. `photoArchiveAgent` enumerates only institutional archives with no living-witness dimension. Needs `buildReviewChecklist()` rewritten against the provenance declaration, a lightweight side-by-side compare tool/endpoint, and a flinch-backlog log.
**Key files:** `lib/agents/profileAssembler.js`, `lib/agents/photoArchiveAgent.js`, `tools/bootstrap-scene.js`, `tm-engine.js`
**Why #7:** the new acceptance gate that pairs with #2 — once the manifest is retired, `buildReviewChecklist` has no valid contract to check. Much of §26/§27 is human process, so the code deliverable is modest. A reference-photo compare + flinch-backlog is a useful down-payment now; the full "same view" Photo Test deepens once photo-first (#9) exists.

### 8 — Coherence-loss recovery in the tick/publish loop (§16 / §5.3) · significant · M
`tick()` publishes unconditionally; a `weatherTimeline` fetch failure is caught and logged but the engine keeps broadcasting stale state with no signal, and `rateLimiter` reports violations that nothing consumes. §16 Recovery ("fade to frosted glass, neutral air tone, auto-restart, return only when coherence restored") and §5.3 ("if sync breaks, fade gracefully — never show a broken universe") have **no implementation** in the engine that owns sync. `tm-replay.js` — the existing JSONL-through-rate-limiter snap/violation detector — is the tooling that already surfaces the signals this recovery path must react to.
**Key files:** `lib/runtimeEngine.js`, `lib/rateLimiter.js`, `lib/weatherTimeline.js`, `tm-replay.js`
**Why #8:** a broken/frozen universe is the ultimate flinch, and today the engine silently continues on stale data. Pre-existing gap, but the harder Flinch Standard raises its cost. Fully independent — slots into any gap.

### 9 — Photo-first pipeline inversion (§3.1) — the North Star primary mode · core · XL
Every surveyor confirmed the same gap: there is NO code path — agents, profile lib, capture, orchestration, tests — where a dated/located photograph is the input, let alone the spec. The whole codebase is Place×Time→research→assemble→generate (the v2 arrow §3.1 explicitly inverts). `photoArchiveAgent` only catalogs which archives *might* hold reference images; it never ingests one. Requires a new `photoIngestAgent` with a vision/extraction step (signage, color, composition), a photo-seeded profile scaffold (`createProfileScaffold` takes only id/name/location/date), a bootstrap-from-photo orchestration entry, and it plugs into the capture regime from #4. **Any ingest/reconstruction path must be built to the §5.5 no-synth-people non-negotiable from the first line** — never emit person geometry or likeness.
**Key files:** `lib/agents/photoArchiveAgent.js`, `lib/environmentProfile.js`, `tools/bootstrap-scene.js`, `lib/cesiumIon.js`, `lib/representationSelector.js`
**Why #9:** the widest gap between current code and the v3 North Star, and the identity of the new constitution — but ranked by value-per-effort as a *near-term* move, not by symbolic weight: XL, all new-code, gated on product decisions (memory-mode intake, beyond-frame invention policy) AND on the capture executor (#4) being wired. The biggest bet, not the first build.

### 10 — Personal Memory Reconstruction (§3.5) + the no-synth-people non-negotiable (§5.5) · core · XL
The SECOND PRODUCT MODE landed in PRD v2.2/v3.0 with **no build plan**: a guest brings photos of a meaningful place+date (a wedding church), TM rebuilds it and layers the actual weather/birds/sound of that day. It sits on top of photo-first (#9) but carries its own product surface — guest-mediated intake, the relocated-authority principle (guest is arbiter, not the archive), in-session approval of beyond-frame invention, and the sensory-completion (scent/food) dream-state question. Critically, this is the code home the plan otherwise lacked for the **§5.5 "never synthesizes people" non-negotiable**: a guard/policy + test asserting no ingest, reconstruction, or capture path emits person geometry or likeness, indexed as a Law in §5.
**Key files:** `docs/prd-memory-mode-draft.md`, `lib/environmentProfile.js`, `lib/agents/photoArchiveAgent.js`, `tools/bootstrap-scene.js`
**Why #10:** half the product and the stated justification for photo-first. XL and strictly gated on #9 plus open product decisions — but naming it forces the intake/authority/approval design and the no-synth-people gate to be *planned rather than assumed*.

### 11 — Temporal Asset Library — versioned assets keyed by location+date (moat, Phase 10) · significant · XL
No subsystem persists or versions generated assets by (location, date). Profiles are addressed by an arbitrary slug id with no version field; `bootstrap-scene` idempotency is raw path-existence, not a queryable library; every run re-derives geometry/audio/profile from scratch, so multi-era or repeat visits are always full rebuilds. The moat (`docs/temporal-asset-library.md`) makes multi-era a lookup. Integration points: `environmentProfile.js` id/versioning shape, `profileAssembler` pre-run lookup, `bootstrap-scene` index; #4's per-feature regime decisions are the natural versioned records.
**Key files:** `lib/environmentProfile.js`, `lib/agents/profileAssembler.js`, `tools/bootstrap-scene.js`, `docs/temporal-asset-library.md`
**Why #11:** strategically the moat, but explicitly a future ROADMAP Phase 10 and correctly deferred — a whole storage/versioning subsystem with no guest-visible payoff until multiple eras of the same place exist. Ranked last unless memory-mode repeat-visit economics pull it forward (open question below).

---

## Sequenced build order (build from THIS, not the rank list)

1. **Confirm base green + build the COMPLETE stray-confidence inventory** — including `worldStateCompiler.metadata.confidence` (~:308/:364), sanborn/buildingMassing, profileGenerator + audio-profiles `era.confidence`, historicalOverlay, tm-engine `/api/profile`+WS, generate-environment-profile CLI, launcher dot, **AND `test/goldenState.test.js:185,213` + `test/phase1.test.js:31`** (assert `metadata.confidence`, go red on removal). → unblocks the refactor without a surprise red suite.
2. **Extract the sim month in `compileWorldState()` and thread temperature to the audio scheduler.** New plumbing (verified), independent of the schema flip, front-loads cheaply. → unblocks the wildlife split + Build C.
3. **Audio-side wildlife split** — separate `insect_chorus` into day/night; cicada=day+temp, katydid=night, birds off at night, on existing `diurnalWeights` + the new temperature input. → kills the canonical midnight-cicada flinch *before* the schema work. **This is the first high-value guest-facing build.**
4. **Provenance refactor Build A** — flip `environmentProfile.js` envelope to `{data, knownCompromises?}` + provenance declaration (mode / date-window / gates-in-force); agents tolerate-and-ignore old fields. → introduces the mode field; unblocks #3, #7.
5. **Provenance refactor Build B** — strip confidence emission across the 8 agents + assembler; patch every stray consumer (tm-engine, CLI, launcher badge, sanborn/buildingMassing, profileGenerator/audio-profiles, historicalOverlay) and fix goldenState/phase1; replace the launcher traffic-light dot with a mode badge (done HERE — it depends on Build A's field + tm-engine emitting it, so it is NOT a standalone quick win). Leave `representationSelector.js` untouched.
6. **Provenance modes — behavioral routing** (#3) — observed/authored branches in `resolveEra()` (observed→capture), `era-audit.js` branches on mode, classifier output tagged, assembler stops assuming historical, mode originates in `worldStateCompiler` and threads to router/dispatch. Resolve the `cli.js --mode` collision.
7. **Provenance refactor Build C** — ecology agent emits per-species diurnal/temperature gates in the new envelope shape. Sequenced AFTER Build B so gate fields land on the reshaped envelope (adding them before B reshapes causes merge friction).
8. **Wire `representationSelector`** into buildingMassing/spawn-buildings; buildingDateAgent/urbanForm emit the per-footprint evidence fields. Depends on Build B's reshaped output. No guest-visible change until real ion capture assets exist + 7d.4 renders.
9. **Render-side diurnal authoring (§25)** — new profile layer + `controls.diurnal` + `canonicalHour` hint, then viz/spawn/router-dispatch consumers. Independent; lands cleaner post-schema-flip.
10. **Generalize the date-gate** to signage/typography + vehicle model-year; add an `eraData.js` test file.
11. **Witness / Photo-Test tooling** — rewrite `buildReviewChecklist` against the provenance declaration; add a side-by-side compare harness + flinch-backlog.
12. **Coherence-loss recovery (§16/§5.3)** — detect stale/failed data in `tick()`, fade to neutral, auto-restart, return on restore; consume rateLimiter violations; lean on `tm-replay.js`.
13. **Photo-first ingest (§3.1)** — new `photoIngestAgent` + vision extraction, photo-seeded scaffold, bootstrap-from-photo entry, wired to the capture regime — built to no-synth-people from line one.
14. **Personal Memory Reconstruction (§3.5)** + the §5.5 no-synth-people guard/test.
15. **Temporal Asset Library (Phase 10)** — versioned assets keyed by location+date; seeded by the selector step's per-feature records.

---

## Quick wins
- Extract the sim month in `compileWorldState()` and expose it on WorldState — small, and the named prerequisite for wildlife gating. (New extraction, not a re-expose — the compiler has zero month references today.)
- Before the refactor, fold the **full** stray-confidence inventory into the scope doc — including the two test files it missed (`goldenState.test.js:185,213`, `phase1.test.js:31`). The plan's best defensive move.
- Add a dedicated test file for `lib/eraData.js` — the universal anachronism gate currently has zero direct coverage.
- Rename "accuracy manifest" in code comments/docstrings (`representationSelector.js summarizeRegimes`, `docs/scope-7d2-capture-pipeline.md`) as part of the refactor — mechanical, no logic change.
- Explicitly mark `representationSelector.js` + its test "do not touch" during the refactor so nobody over-corrects the sanctioned `evidenceConfidence` carve-out.

## Biggest bets (XL, gated — sequence deliberately)
- **Photo-first ingest (§3.1)** — the v3 identity and the only path to §3.5. All new-code; needs product decisions + the wired capture executor first.
- **Personal Memory Reconstruction (§3.5)** — the second product mode; carries its own intake/authority/approval surface and is the code home for §5.5. Gated on photo-first.
- **Render-side diurnal authoring (§25)** — the "stay for a day" half of the dream state. In-engine payoff gates on the 7d.4 editor-side assets.
- **Temporal Asset Library (Phase 10)** — the moat; deferred unless memory-mode repeat-visits pull it forward.

## Open product questions (yours, not engineering's)
1. **Photo-first / memory intake:** guest-uploads vs operator-mediated, and how much beyond-frame invention is acceptable before the guest approves it in-session? The relocated-authority principle makes the guest the arbiter — is a live approval step part of the product? Gates the entire ingest design.
2. **§5.5 "never synthesizes people":** where does enforcement live — a lint/CI gate on ingest+capture outputs, a human review checkpoint, or both? Confirm it is indexed as a Law in §5 (re-scoped from §7) so it is a hard test, not a convention.
3. **Provenance-mode routing scope:** build observed→capture / authored routing behavior now, or only tag+declare the mode until an observed/authored scene is on the roadmap? Determines how much of #3 is behavioral vs declarative near-term.
4. **Photo-first pilot scene:** does the Witness Window (§26, "build living-witness scenes first") point at a Jay-childhood scene (Baton Rouge 1985, where Jay is the witness) vs continuing Place×Time for NYC 1884 where the witnesses are gone?
5. **Canonical hour (§25):** operator-set per-scene? Should arriving at it drive the default entry point of the 24-hour cycle?
6. **Provenance visibility:** surface the provenance declaration (mode + date window + gates) to guests/operators as a badge, or purely internal ops health? Scopes the launcher dot replacement in Build B.
7. **7d.4 gate:** capture visuals (#4) and in-engine diurnal consumers (#5) depend on editor-side deliverables (master weathering matfn, Niagara, foliage meshes, cloth, animation BPs) stacked into 7d.4. Sequence 7d.4 before/during/after these code themes — and does the still-owed write-scoped ion token block capture regardless?
8. **Temporal Asset Library timing:** keep Phase 10 deferred, or does memory-mode (repeat visits to the same place across dates) make location+date-keyed versioning worth pulling forward?
