# Tasks — Current Build

Current-build task list (Forge Lazar stack). Read `docs/experience-proof-plan.md` for the active sequence, `builds.md` for the next build number, and `ROADMAP.md` for phase context. `docs/refactor-plan.md` is the parked restart sequence. Update this file and `builds.md` at every build boundary.

## Queue position

**Current direction: Experience Proof (D003).** The active queue is the a7500 + office-lab milestone in `docs/experience-proof-plan.md`. Locale Package P1 and the rest of `docs/refactor-plan.md` are preserved below but parked until the Experience Proof exits.

### EP0 — Close the workstation loop

- [x] **W1** — simMonth + temperatureC threading — **B047, 2026-08-05.** (Fixture surgery turned out unnecessary — golden tests compile states, and the hand-built fixtures are invalid-case tests; they got `simMonth` added for single-failure hygiene. Real find: `easeWorldState` was dropping `temperatureC` from every published state.)
- [x] **W2** — wildlife day/night split — **B048, 2026-08-05.** (Birds turned out already night-suppressed by the `bird_song` window — now regression-guarded. Follow-up owed at P6: regenerate `gen_*` profiles + ElevenLabs assets for the new event ids; committed profiles keep the old blended event until then.)
- [x] **U1 (Mac side)** — fresh Unreal project bootstrap — **B049, 2026-08-05.** `time-machine-unreal` repo live (LFS + conventions + `SETUP.md` a7500 checklist); `UNREAL_RC_HOST` threaded through all RC tools + dispatch; native UE 5.8 MCP kept, Aura skipped, old unrealMCP + Ludus removed from config. **Open box-side (Jay, `SETUP.md` steps 1–7):** drivers/Defender/DDC, project settings + plugins, RC LAN bind + firewall, repo adoption, then the U1 exit eval (RC `/remote/info` from Mac, property round-trip, LFS round-trip). Confirm the a7500's LAN IP (routes.json assumes `192.168.68.79`).
- [ ] Complete `../time-machine-unreal/SETUP.md` steps 1–7 on the a7500.
- [ ] Confirm the a7500 LAN IP and the RC target in `routes.json`.
- [ ] Pass `/remote/info`, property set/get, and LFS round-trip checks.

### EP1 — Make one screen breathe

- [ ] Build the minimum Core Environment Rig in the fresh UE 5.8 project.
- [ ] Drive sun, clouds, fog, precipitation, and light progression from existing WorldState routing.
- [ ] Run existing browser audio from the same state.
- [ ] Complete a 10–15 minute accelerated light + weather cycle.

### EP2 — Build the office lab

- [ ] Tape the Content Node/trailer occupied area in the Henhouse office.
- [ ] Establish a fixed seated eye position.
- [ ] Arrange available displays as one hero/end-wall view plus one or two side apertures.
- [ ] Build the minimum nDisplay venue profile: one design eye origin, measured Screen transforms, geometry-derived off-axis frusta, and output mapping for the available displays.
- [ ] Reject mirrored or hand-tuned-FOV shortcuts; pass a simple cross-surface exposure and motion-coherence check.
- [ ] Control ambient light and frame the displays as openings.
- [ ] Route a basic directional bed and one aperture-anchored audio cue through available speakers.

### EP3 — Author Scene 0

- [ ] Choose one observed/authored atmospheric world; do not begin with Baton Rouge 1985.
- [ ] Author coherent adjacent views, a canonical hour, one atmosphere/weather transition, and a matched soundscape.
- [ ] Write the lightweight PRD §14.6 Provenance Declaration for Scene 0; no package loader or publish gate required.
- [ ] Run the complete 10–15 minute Experience Proof without explanation or operator UI.

### EP4 — Guest sessions

- [ ] Run 3–5 non-technical guest sessions.
- [ ] Record felt defects by room/display, camera/frustum, rendering, audio, world-state coherence, content, or operation.
- [ ] Rank the three highest-leverage barriers to presence.
- [ ] Record an evidence-backed Presence Gate pass/fail decision.
- [ ] If the gate fails, iterate EP2/EP3 and rerun the guest check; do not close D003.
- [ ] After a pass, write the next roadmap from observed failures and explicitly choose which parked work resumes.

## Parked queue

P1 is fully scoped below so no planning is lost. It resumes only when D003 exits or when a second real scene makes manual configuration/content switching the binding problem.

## Parked — Build P1: Locale Package contract validation (E08-locale-package)

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
