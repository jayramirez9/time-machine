# Scope — Provenance Refactor (code side of PRD v3.0)

**Status:** Scoped, not started. Deferred deliberately from the PRD v3.0 doc pass because it is a breaking schema change across ~8 agents + the profile lib + ~20 test files, and belongs in its own build(s) with the suite green — not rushed alongside documentation work.

**Origin:** PRD v3.0 (Flinch Standard). Part 2 of the amendment: "`lib/environmentProfile.js`: Accuracy manifest → provenance declaration. Remove the confidence/citation envelope as a schema contract." / "`lib/agents/*.js`: Strip confidence-score emission. Ecology agent gains diurnal and temperature gating."

## Why it's a real build, not a scrub

`grep` at scope time found `confidence` woven through **8 agents** (`weatherAgent`, `urbanFormAgent`, `materialsInfraAgent`, `profileAssembler`, `ecologyAgent`, `culturalAgent`, `photoArchiveAgent`, `buildingDateAgent`), the **validated layer envelope** in `lib/environmentProfile.js` (`{ data, confidence, sources, knownCompromises }`, plus `validateAccuracyManifest`, `confidenceLabel`, `generateAccuracyManifest`, `createLayer`), and **~20 test files** that assert on those fields. Changing the envelope is close to all-or-nothing — it is the shape the whole profile system validates against.

## The one hard carve-out (do NOT over-correct)

**Keep `evidenceConfidence` in `lib/representationSelector.js`.** It is a live engineering input — the per-feature capture-vs-procedural decision consumes it (PRD §17). It is not a product promise and is not surfaced. The refactor removes confidence as a *published layer contract*; it does **not** remove confidence where a module genuinely computes with it. `lib/representationSelector.js` and its tests should come through essentially untouched.

## Work items

### 1. `lib/environmentProfile.js` — envelope → provenance
- `validateLayerEnvelope`: stop requiring `confidence` (0–1) and `sources[]` as contract fields. A layer is `{ data, knownCompromises? }` plus optional internal metadata that is not validated as a promise.
- `validateAccuracyManifest` → `validateProvenanceDeclaration`: validate mode (`historical|observed|authored`), date window, and gates-in-force — not `overallConfidence`, not the verified/likely/interpolated/assumed `layerSummary`.
- `generateAccuracyManifest` → `generateProvenanceDeclaration`: emit mode + date window + gates + where density was reduced (Silence Over Wrongness). Drop the confidence rollup and status taxonomy from the *product* output. Keep `confidenceLabel`/thresholds only if an internal consumer still needs them; otherwise delete.
- `createLayer(data, confidence, sources, knownCompromises)` → `createLayer(data, { knownCompromises })`. Update all call sites.
- Keep backward-compat reads if any on-disk profile (`profiles/nyc_1884.json`) carries the old fields — either migrate the file or tolerate-and-ignore extra fields.

### 2. `lib/agents/*.js` — emit gates and content, not scores
- Remove `confidence` computation/emission from each agent's returned layer. Remove `sources`/`citation` emission as a contract (agents may still *use* sources internally to decide content; they don't publish a citation envelope).
- Agents return **content + gates**: species pools with season/hour/density/temperature (ecology), vendor calls + language (cultural), driveable curves (weather), etc.
- `profileAssembler.js`: assemble the Provenance Declaration (mode, date window, gates) instead of the accuracy manifest.

### 3. Ecology agent — diurnal + temperature gating (NEW behavior, PRD §5.6)
This is a feature add, not just a strip. Wildlife gating is now absolute (PRD §5.6): a species may appear only if **present AND seasonally AND diurnally active** at the scene date/hour, and temperature-gated where relevant.
- Day↔night species handoff: birds peak at dawn, suppressed at night; the night belongs to the appropriate nocturnal set. (The audio engine already has `diurnalWeightAt()` / seasonal cooldowns from Phase 7c.1 — this is the *ecology-agent* side supplying the gates, extended and made authoritative.)
- Cicada/katydid exchange: cicadas are temperature-gated **daytime** singers; katydids hold the night. A Georgia scene running annual cicadas at 10pm is the canonical flinch (PRD §5.6). Gate cicada activity on daytime + temperature; gate katydids on night.
- Periodical-brood awareness (stretch): Southern 13-year broods — do not render the brood chorus in a year the brood was not out. Requires a brood-year table; scope separately if it balloons.
- Inputs the weather engine already produces (temperature, time-of-day phase, month) drive these gates — no new data source.

### 4. Tests (~17 files) — update assertions
- Drop assertions on `confidence`/`sources`/`overallConfidence`/status taxonomy as *contract*.
- Add assertions on provenance-declaration shape (mode, date window, gates) and on the new ecology gates (cicada silent at night, birds suppressed at night, katydids present at night, temperature gating).
- `representationSelector.test.js` should be minimally affected (carve-out above). Verify it still passes untouched.
- Target: full suite green (was 1592 at scope time).

## Suggested build split (one concern per build)
1. **Build A — schema flip:** `environmentProfile.js` envelope → provenance + its tests. Get green with agents still emitting confidence (tolerate-and-ignore) so the blast radius is contained to one module first.
2. **Build B — agent strip:** remove confidence emission across the 8 agents (which include the `profileAssembler` orchestrator) + their tests.
3. **Build C — ecology gates:** the diurnal/temperature/cicada-katydid feature + tests. This is the one with real product value (a top flinch source), so it deserves its own focused build.

Cap-review each build's diff before commit (house rule). Do not push a red suite.

## Definition of done
- Profiles emit a Provenance Declaration (mode, date window, gates), not an Accuracy Manifest.
- No agent publishes a confidence/citation envelope as a contract.
- `evidenceConfidence` still lives and works inside `representationSelector.js`.
- Ecology gating makes cicadas-at-midnight impossible and hands day↔night species over correctly.
- `docs/environment-profile-schema.md` banner removed and the body rewritten to the provenance shape (it currently documents v1 with a "where it's going" banner).
- Suite green — **note:** the suite is currently CI-green but 1591/1 *locally* due to a pre-existing timezone-dependent flake (`test/worldStateCompiler.test.js:55` anchors `now` + timestamp in UTC strings — the exact anti-pattern the project conventions forbid). This refactor touches ecology gating that reads the same time-of-day classification, so **fix that flake first** (its own small build) rather than inheriting a false "green."
