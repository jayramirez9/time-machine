# Build Log

Epics and builds for the Time Machine project. See `~/.claude/memory/programming-system.md` for the numbering system.

## Epics

| ID | Name | Status |
|----|------|--------|
| E01 | Weather Providers | Core active; P5 extension paused by D003 |
| E02 | World State Pipeline | Active |
| E03 | Audio Engine | Active |
| E04 | Unreal Dispatch | Active for Experience Proof EP0–EP2; U2/U3 extensions paused by D003 |
| E05 | Terrain Pipeline | Active |
| E06 | Eval System | Core active; P8 extension paused by D003 |
| E07 | Cesium Integration | Active |
| E08 | Locale Package | Paused by D003 — restart plan preserved in `docs/refactor-plan.md` |
| E09 | Authoring Pipeline | Paused by D003 (provenance refactor A/B/C preserved) |
| E10 | Experience Proof | Active — a7500 → office lab → Scene 0 → guest sessions (`docs/experience-proof-plan.md`) |

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

---

### Numbering gap note (2026-08-04)
Work from 2026-03 through 2026-08 (Phases 4–7d and PRs #1–#8: era soundscapes, geo pipeline, historical urban form, agent layer, capture pipeline, PRD v3.0) was tracked in `ROADMAP.md` and PR history, not as numbered builds here. Numbering resumes at **B047** with the Locale Package refactor (`docs/refactor-plan.md`).

### B047 — simMonth + temperatureC threading (E02-world-state-pipeline)
- **Date**: 2026-08-05
- **What**: WorldState carries scene-local calendar month and raw air temperature end-to-end (refactor-plan W1, wildlife-flinch prerequisite). Compiler emits root `simMonth` (1–12, local clock) and `controls.audio.temperatureC` (raw °C — the `comfort` category is too coarse for ectotherm chorus gating); contract adds bounds [-90, 60], `simMonth` to REQUIRED_FIELDS, 1–12 integer check. **Bug caught in-build**: `easeWorldState` rebuilds `controls.audio` field-by-field and silently dropped `temperatureC` from every published state — added to the ease block with a `??` fallback for pre-B047 states (old logs/replays). `audio-engine.html` status strip shows month + temp (live plumbing verification; scheduler already receives full state — W2 adds the gates).
- **Files**: `lib/worldStateCompiler.js`, `lib/worldStateContract.js`, `lib/runtimeEngine.js`, `audio-engine.html`, `test/goldenState.test.js`
- **Eval**: 1601/1601 `npm test`; `tm-eval` exit 0. New tests: simMonth July=7 / December=12 (off-by-one guard), temperatureC bounds + equals rounded provider celsius, out-of-range/missing simMonth rejected, ease-path survival (simMonth carried, temperatureC eased not dropped, legacy-state fallback, eased state validates).
- **Status**: Complete

### B048 — Wildlife day/night split (E03-audio-engine)
- **Date**: 2026-08-05
- **What**: Kills the canonical midnight-cicada flinch (PRD §5.6, pivot-plan #1, refactor-plan W2). The single `insect_chorus` event — whose density-weighted average blended cicada (day 0.9/night 0.0) with cricket/katydid (night 1.0) into one night-windowed bed naming cicadas — is split into `insect_chorus_day` (day window 0.3–0.78, `temperatureGate.minC: 24` — cicadas need real heat) and `insect_chorus_night` (night + pre-dawn windows, `minC: 8` — crickets quiet near freezing). Ecology extraction splits species by diurnal dominance so each chorus draws only its own species (names, diurnalWeights, seasonal); **ecology is authoritative** — a profile whose ecology lists no day-singing insects gets the day chorus suppressed rather than a generic cicada bed. Suppression is a real `suppressed` flag — the scheduler skips the pool and `elevenlabs-fetch` skips its assets (cap caught that a 9999 cooldown alone still fires ~0.36×/hr, unweighted). `sonorous: false` added to SPECIES_DB (Firefly) so silent species never reach SFX prompts; honeybee/mosquito kept (audible, defensible in an ambient bed — logged call). Scheduler (`audio-engine.html`) gains the `temperatureGate` check on B047's `temperatureC` (null = pre-B047 state, gate stays open). Bird night-suppression verified already enforced by the `bird_song` window (regression-guarded). Committed generated profiles (`gen_*_1884/1983`) still carry the old blended event — unchanged behavior until regenerated with assets at P6. **`simMonth` note:** still no runtime consumer after B047/B048 (seasonal suppression is generation-time via the `month` option; the runtime seasonal defense is the temperature gate) — the named future consumers are P3's schedule channel and provenance Build C; a `date_policy: window` package spanning seasons keeps its generation-time season until then.
- **Files**: `lib/profileGenerator.js`, `audio-engine.html`, `test/profileGenerator.test.js`
- **Eval**: 1610/1610 `npm test`; `tm-eval` exit 0. New tests: split presence, day/night windows + gates, species routing (cicada never in the night description, katydid/cricket never in day), split diurnalWeights (day event night-weight ≤0.1), ecology-authoritative suppression, winter suppression of both choruses.
- **Status**: Complete

### B049 — U1: fresh Unreal project bootstrap, Mac side (E04-unreal-dispatch)
- **Date**: 2026-08-05
- **What**: Mac-side half of refactor-plan U1. New **`time-machine-unreal`** repo created (private, jayramirez9) with LFS attributes (.uasset/.umap/art/audio binaries), UE ignores (DDC/Intermediate/Saved/Binaries/Cesium caches/Fab-Megascans), content conventions README (`/Game/Locales/{Name}/Main`, `/Game/Core/`, `/Game/Shared/`, `/Game/Kits/{era}/`; level paths = contract surface; no view-dependent geometry; old project = Migrate-tool quarry), and `SETUP.md` — the ordered a7500 bootstrap checklist folding the 7d.4 Phase A first-boot items (Win11 Pro, chipset/Studio drivers, Defender exclusions, DDC on NVMe, DX12+SM6/Lumen+HWRT/Nanite/VSM, plugin set, RC LAN bind 30010/30020 + firewall, Git+LFS adoption). **Single RC-host resolution introduced**: `defaultRcHost()` in `lib/rcHelpers.js` with one precedence everywhere — `--host` flag > `routes.json` unreal endpoint (tracked source of truth) > `UNREAL_RC_HOST` env > localhost — threaded through **15** call sites (14 tools + `tm-engine.js /api/unreal-status`, which cap caught as a missed 15th) and the `unreal` dispatch transport; `teleport.js`'s private routes-reading chain collapsed into it. Scheme-less hosts normalized (`http://` prefixed), trailing slash stripped. Every tool now prints `Unreal RC target: <host>` to stderr before writing (an env/routes-steered destination must be visible pre-write), and `--help` text states the real default chain. Note: only the daemon sources `.env` — `UNREAL_RC_HOST` must be exported in the shell profile for directly-run tools; routes.json-first makes that mostly moot. New `test/rcHelpers.test.js`: precedence + normalization + a **tripwire** asserting no code line in `tools/`, `lib/dispatch.js`, `tm-engine.js`, `lib/runtimeEngine.js` hardcodes `localhost:30010` (the tripwire caught its own first offenders — the help strings). This is the fourth hand-enumerated-site class in three builds (easeWorldState, event assembler, agent species mapping, RC hosts) — the tripwire pattern is the answer. **MCP-vs-Aura call logged (plan's named decision):** keep UE 5.8's **native Unreal MCP** plugin (first-party, experimental; loopback-only by design — usable only by an agent session on the box itself; the Mac drives Unreal exclusively via RC API). **Aura skipped** — a second proprietary in-editor AI agent authoring content outside the deterministic spawn/replay pipeline; re-evaluate at U3 if interactive kit authoring earns it. Old custom `unrealMCP` Python server (flopperam-family, now Aura-owned/deprecated, pointed at the dead project) and **Ludus AI** removed from MCP config.
- **Files**: `lib/rcHelpers.js`, `lib/dispatch.js`, `tm-engine.js`, `tools/{spawn-*,set-*,teleport,import-terrain}.js` (14 tools), `test/rcHelpers.test.js`, `CLAUDE.md` (rule 17 pin → unreal README; env-var precedence doc), `.env` (untracked); `time-machine-unreal`: `README.md`, `SETUP.md`, `.gitignore`, `.gitattributes`
- **Eval**: 1615/1615 `npm test` (3 new). Cap round 1: 2 blockers (split-brain host resolution incl. missed 15th site; malformed SETUP exit-eval command + no CesiumGeoreference in a blank project) + 5 concerns — all fixed in-commit (RC security rationale written down, firewall scoped `-RemoteAddress <mac-ip>`, venue-deployment warning in both repos, LFS quota note, `.mcp.json` ignored, `curl.exe`). **Box-side half + U1 exit eval owed**: RC `/remote/info` from the Mac, property set/get round-trip (needs step 4's Cesium Quick Add), LFS round-trip — checklist steps 1–7 in `time-machine-unreal/SETUP.md`; a7500 IP to confirm (routes.json's `192.168.68.79` may be the old PC).
- **Status**: Complete (Mac side; box-side checklist is Jay's hands-on pass)
