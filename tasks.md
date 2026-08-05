# Tasks — Current Build

Current-build task list (Forge Lazar stack). Read `builds.md` for the next build number; `docs/refactor-plan.md` for the full sequence; `ROADMAP.md` for phase context. Update this file and `builds.md` at every build boundary.

## Queue position

Per `docs/refactor-plan.md` §Merged Build Sequence, two in-flight builds precede P1:

- [ ] **W1** — finish simMonth + temperatureC threading (branch `wip-b047-simmonth-temperature`: compiler/contract halves committed; remaining: WS payload → `audio-engine.html`, plus fixture surgery in `test/goldenState.test.js` / `test/phase1.test.js` since `simMonth` joined `REQUIRED_FIELDS`)
- [ ] **W2** — wildlife day/night split (cicada=day+temp, katydid=night, birds off at night)

P1 is set up below and can be picked up as soon as W1/W2 land (or first, if Jay reorders — P1 touches no runtime code, so there is no dependency either way).

## Build P1 — Locale Package contract validation (E08-locale-package)

**Scope guard: no runtime code changes.** Manifests, validator, fixtures, eval registration only. The engine does not learn to load packages until P2.

### Reference manifests
- [ ] `locales/nyc-present/manifest.json` — observed / `binding: live` / open_meteo (draft; spatial ref may point at the not-yet-rebuilt level)
- [ ] `locales/baton-rouge-1985/manifest.json` — historical / `binding: archive` / provider provisional (confirmed at P6) / `date_policy: fixed` — 1985 placeholder date until Jay selects the anchor photo (D002)
- [ ] `locales/nyc-1884/manifest.json` — historical / `binding: archive` / ghcn_daily + `augmentation_ref` / lineage sources with `id`s so `lineage:{id}` anchors resolve
- [ ] All three carry `status: draft`, per-mode `evals.required` sets, viewpoint = single eye-origin entry (v2 semantics)

### Validator (`engine/loader/localePackageContract.js` — new code lands in the target layout per CLAUDE.md rule 11; "pattern: `lib/worldStateContract.js`" means hand-rolled style, not location. P2's loader imports this same module)
- [ ] Implements the schema (hand-rolled, no new deps — recorded decision, accepted drift risk)
- [ ] Implements every rule in `contracts/locale-package-v0.1.md` §Validator Rules:
  - [ ] `format: date` asserted (draft-07 treats format as annotation)
  - [ ] id uniqueness: `viewpoints`, `schedule.events`, `audio.beds`, `lineage.sources`
  - [ ] binding×provider matrix (mock valid under every binding); `augmentation_ref` archive-only
  - [ ] `binding: authored` → `date_policy` fixed|window
  - [ ] `era_bounds` contains `date_policy.date` when both present
  - [ ] per-mode anchor grounding (historical: photo_ref+date+location_text; observed: location_text; authored: source_text)
  - [ ] `evals.required` ⊇ per-mode minimum suite set
  - [ ] `lineage:{id}` anchor refs resolve to a `lineage.sources[].id`
  - [ ] errors discriminated before deep validation (`date_policy` on `type`, events on `anchor`) — self-describing, no oneOf noise
- [ ] Reserved `content_type` values (`gaussian_splat_v1`, `hybrid_v1`) are **schema-valid** — do NOT reject here (loader rejects in P2)

### Fixture corpus (`test/fixtures/locale-packages/`)
- [ ] The three reference manifests as positive fixtures
- [ ] Negative matrix, each failing with a self-describing error: bad mode enum · missing evals block · empty `evals.required` · unknown suite id · clock+solar on one event · duplicate event ids · malformed dates (`1978-13-45`) · anchor grounding missing per mode · binding×provider violation (e.g. `live` + `ghcn_daily`) · `authored` binding + `date_policy: live` · augmentation_ref on live binding · era_bounds excluding the fixed date · dangling `lineage:{id}` ref · two viewpoints (maxItems: 1)

### Eval registration
- [ ] `locale-package` suite added to `SUITES` in `tm-eval.js`
- [ ] `tm-eval --json` exit 0 with the suite green; suite failure exits 1

### Build boundary
- [ ] Cap reviews the diff (hard rule)
- [ ] Commit `B{NNN}: locale package contract validation suite` (number from `builds.md` head)
- [ ] Update `builds.md` (entry + E08 first build), this file, `ROADMAP.md`
