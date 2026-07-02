# Build Log

Epics and builds for the Time Machine project. See `~/.claude/memory/programming-system.md` for the numbering system.

## Epics

| ID | Name | Status |
|----|------|--------|
| E01 | Weather Providers | Active |
| E02 | World State Pipeline | Active |
| E03 | Audio Engine | Active |
| E04 | Unreal Dispatch | Active |
| E05 | Terrain Pipeline | Active |
| E06 | Eval System | Active |
| E07 | Cesium Integration | Active |

---

## Builds

### B001–B040: Pre-tracking
All work prior to 2026-03-06. Not individually tracked. Covers the full foundation: CLI, weather providers (Visual Crossing, Open-Meteo, NOAA, Mock), world state compiler, locale presets, runtime engine, daemon, browser clients (launcher, dashboard, audio engine, viz), environment router, dispatch system, rate limiter, state logger, replay CLI, audio profiles (v1 + v2), spatial audio, convolution reverb, era audit, ElevenLabs/Freesound fetchers, voice generation, Cesium georeference, terrain pipeline (DEM + imagery + import), timezone utilities.

---

### B041 — WorldState contract module (E06-eval-system)
- **Date**: 2026-03-06
- **What**: Codified all valid WorldState enum values and numeric bounds into `lib/worldStateContract.js`. Exports `STATES_ENUM`, `CONTROL_BOUNDS`, `validateWorldState()`.
- **Files**: `lib/worldStateContract.js`
- **Eval**: `npm test` — contract validation tests pass
- **Status**: Complete

### B042 — Golden state + route config tests (E06-eval-system)
- **Date**: 2026-03-06
- **What**: Deterministic golden state tests using mock provider (16 tests). Production route config deep validation (7 tests). Tests: 181 → 205.
- **Files**: `test/goldenState.test.js`, `test/routeConfig.test.js`
- **Eval**: `npm test` — all 205 tests pass
- **Status**: Complete

### B043 — Audio profile validator (E06-eval-system)
- **Date**: 2026-03-06
- **What**: Structural validator for audio profile JSONs. Checks v1/v2 schema, directional beds, source completeness. Exports `validateAudioProfile()`.
- **Files**: `lib/audioProfileValidator.js`
- **Eval**: `./tm-eval.js --only profiles` — all 4 profiles pass
- **Status**: Complete

### B044 — Unified eval CLI (E06-eval-system)
- **Date**: 2026-03-06
- **What**: `tm-eval.js` — single CLI orchestrating 6 eval suites (unit, contract, routes, profiles, era, golden). Supports `--only` and `--json`. Exit 0/1 for CI.
- **Files**: `tm-eval.js`, `package.json` (added `eval` script)
- **Eval**: `./tm-eval.js` — all 6 suites pass, `./tm-eval.js --json` outputs valid JSON
- **Status**: Complete

### B045 — GitHub Actions eval workflow (E06-eval-system)
- **Date**: 2026-03-06
- **What**: CI workflow runs `tm-eval.js --json` on push to main and on PRs.
- **Files**: `.github/workflows/eval.yml`
- **Eval**: Push to branch, verify Actions run passes
- **Status**: Complete

### B046 — Code review agent (E06-eval-system)
- **Date**: 2026-03-06
- **What**: Separate AI agent reviews PRs via GitHub Actions. Uses Anthropic API (Claude Sonnet) with project-specific review prompt. Posts structured comments. Includes eval results in review context.
- **Files**: `.github/review-prompt.md`, `.github/scripts/review-pr.js`, `.github/workflows/review.yml`
- **Eval**: Push test PR with `ANTHROPIC_API_KEY` secret set, verify review comment posted
- **Status**: Complete (requires `ANTHROPIC_API_KEY` repository secret)
