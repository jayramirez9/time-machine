# D002 — The Baton Rouge Port Is the 1985 Witness Scene

**Date:** 2026-08-05
**Status:** Ratified (Jay's call, in session)
**Amends:** `docs/refactor-plan.md` (P6, Migration Rule 2), `docs/architecture-v3.md` (stage examples, locales layout), `contracts/locale-package-v0.1.md` (reference manifest), `tasks.md`
**Resolves:** the "witness-window sequencing" trade-off in `docs/refactor-plan.md` §Accepted Trade-offs; open product question 4 in `docs/v3-pivot-plan.md`

## Context

The refactor plan carried the Baton Rouge port as `baton-rouge-1978` — a conformance test inherited from the existing locale preset and v1 audio profile. Separately, PRD §26 (the witness window) argues living-witness scenes come first because the ground truth is expiring, and the pivot review recommended Baton Rouge 1985 as the photo-first pilot: Jay is the living witness, so the Photo Test (§27), the Witness Test (§26), and memory mode (§3.5) all converge on a scene he can personally validate. NYC 1884 can never pass the Witness Test.

The deciding fact: **Jay's family photos anchor 1985, not 1978.** Under the photo-first constitution (§3.1, "the photograph is the spec"), the anchor photo picks the date — not the preset we happen to have.

## Decision

1. **The P6 port is `baton-rouge-1985`, and it is the witness scene.** Historical mode, `binding: archive` (1985 is comfortably inside both Open-Meteo and Visual Crossing range; provider confirmed at port time per the contract's provisional-binding rule). Acceptance for scene content is the Witness Test: Jay sits in it and records every flinch. **Gate mapping:** the Witness Test is the manual run of the existing `flinch-historical` suite for scenes with a living witness — no new suite id, so the publish gate already sees it (`flinch-historical` is in `evals.required` for every historical package).
2. **The canonical date resolves from the anchor photo.** When Jay selects the anchor photo from the family archive, its date becomes `date_policy.date` and the photo becomes `provenance.anchor.photo_ref`. Until then the manifest carries a provisional 1985 date clearly marked as placeholder. Selecting the anchor is a Jay task with lead time — it gates P6 content authoring, not P1 manifest drafting.
3. **Scope discipline: this does NOT pull photo-first tooling forward.** The scene is authored with the existing pipeline, using the anchor photo as the spec by hand (mount it beside the render — the §27 Photo Test). `photoIngestAgent` and the ingest pipeline remain the sequenced XL bet. The pilot proves the *product* shape; the tooling industrializes it later.
4. **Parity re-scoped for P6.** "Parity before improvement" (Migration Rule 2) still applies to the engine path — provider→timeline→world-state→router replay parity is date-agnostic. Scene *content* is no longer parity-to-the-1978-preset; its bar is the Witness Test. Primary regeneration inputs for P6 already exist and are closer than the 1978 preset: `profiles/baton_rouge_la_1983.json` (full environment profile, year 1983) and `audio-profiles/gen_baton_rouge_louisiana_united_states_1983.json` (schemaVersion 2, ecology-populated) — two years off the target and structurally current. The 1978 v1 profile is the fallback. Era-tells differ from both — vehicles are the loudest 1985 tell.
5. **U3's kit is renamed `us-suburban-1970s-80s`** (it does not exist yet — renaming now is free): it covers the housing stock of a 1985 Baton Rouge suburb (70s-built homes); 1985-specific era-tells are per-locale stage-7 props, not kit content.
6. **Era ground truth shifts to mid-1980s aerials.** USGS NHAP (National High Altitude Photography, 1980–87) is the primary program covering 1985, via EarthExplorer; state GIS archives secondary. Family photos are ground truth for the anchor parcel itself.

## Consequences

- `locales/baton-rouge-1978/` → `locales/baton-rouge-1985/` throughout the plan, contract reference manifest, and tasks.md — done in the amendment commit ratifying this record.
- The Accepted Trade-offs deferral in the refactor plan is resolved: no fourth scene is added; the witness scene and the conformance port are the same build, so the witness window costs nothing extra in sequence.
- P6 gains a Jay-side prerequisite with lead time: anchor-photo selection + mid-80s aerial acquisition (start now; sourcing is the long pole per architecture stage 3).
- **If the anchor photo lands outside 1985** (1984, 1986…), the package id, `locales/` directory, and `content_ref` rename together per CLAUDE.md rule 17 — do it before P4 while it is still a text edit, not an Unreal content rename.
- Memory mode (§3.5) gets its first real-world validation case for free when P6 passes the Witness Test.

## Alternatives considered

- **Keep 1978 as planned.** Rejected: the photos anchor 1985; keeping 1978 would make the preset the spec and the photograph the reference material — the exact inversion v3.0 §3.1 forbids.
- **Add BR-1985 as a fourth scene after P6.** Rejected: pays for the same suburb twice and defers the Witness Test behind a scene no witness can validate.
