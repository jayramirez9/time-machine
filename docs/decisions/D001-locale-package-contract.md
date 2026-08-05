# D001 — Locale Package as the Environment Engine's Content Contract

**Number:** D001 — first decision record in this repo (`docs/decisions/` created with this commit).
**Repo placement:** `docs/decisions/`
**Date:** 2026-08-03
**Status:** Ratified 2026-08-04
**Drives:** `docs/refactor-plan.md`, `contracts/locale-package-v0.1.md`, `docs/architecture-v3.md`

## Context

PRD v3.0 (`PRD.md`, Flinch Standard amendment integrated 2026-07-29) established three provenance modes — historical reconstruction, observed, authored — under one governing standard: the Flinch Standard ("would someone who was there flinch?"), replacing the Accuracy Contract. It also established the environment engine as a platform layer alongside Container OS: every Henhouse room can run one.

The pre-v3 architecture carried the retired doctrine in two planned components: a **preset system** whose bundle format embedded an *accuracy manifest*, and a runtime **historical accuracy layer** ("silence over wrongness"). Neither was built. What was built — World State Engine, provider abstraction, Environment Router, rate limiter, Unreal transport, replay tooling — is provenance-agnostic and survives.

The codebase must now catch up to the doctrine change. The Unreal rebuild on the a7500 workstation makes this the cheapest possible moment: the scenes are being reconstructed regardless.

## Decision

1. **The Locale Package is the sole unit of environment content.** A versioned package (`manifest.json` + assets, schema at `contracts/locale-package.schema.json`) is the only thing the engine runtime loads. All three provenance pipelines compile to this one format.

2. **Provenance logic lives exclusively in authoring pipelines and build-time evals.** The manifest's `provenance` block is opaque to the engine — read for display, logging, and evals; never branched on. Runtime behavior differences arise from package *data*, never from *mode*.

3. **Accuracy enforcement moves to build-time flinch eval gates.** The runtime historical accuracy layer is removed from scope. Per-mode eval suites (identical flinch bar, mode-specific truth standards) gate `published` status; the loader enforces the gate. Accuracy is an authoring-time cost decision — the direct architectural expression of the Flinch Standard. The contract validator asserts at build time that each manifest's required suite set contains the per-mode minimum; build-time mode branching in the validator/schema does not violate the runtime opacity invariant (decision 2), which governs engine behavior only.

4. **Schedule and weather are separate, composable channels.** Weather is environmental data (live, archive, or authored). Schedule is authored life — "the other 23 hours." Observed mode composites an authored schedule over live data; live data does not author life.

5. **Package declares the world; venue profile declares the installation.** Packages carry `viewpoints` (named camera anchors). Aperture-to-viewpoint mapping and physical audio channel mapping are venue-profile configuration on the engine side. Same world, different rooms — the chassis/cartridge separation applied at the content layer.

6. **Module seams now, repo split later.** `engine/` (provenance-free, package-fed), `pipeline/`, `locales/` boundaries are drawn in this repo. The engine's eventual lift to platform level is deferred until it has a second consumer; the contract makes that lift a directory move plus a handshake — the same pattern as the Spatial → Container OS system manifest.

7. **The gaussian splat question defers behind a versioned enum.** `spatial.content_type` implements `unreal_level_v1` and reserves `gaussian_splat_v1` / `hybrid_v1`. Implementing a reserved type requires loader support and a new D-record — a schema-minor change, not a contract break or phase restructure.

## Consequences

- The planned preset system and runtime accuracy layer are **superseded** before being built — the components requiring change under v3.0 are almost entirely unbuilt plans, so migration cost concentrates in the three locale ports, which coincide with the already-committed Unreal rebuild.
- The three existing locales (nyc-present, baton-rouge-1978, nyc-1884) become the contract's conformance tests, conveniently spanning all three modes and both sides of the 1940 weather-data boundary.
- New epic **E08-locale-package** (E07 is already Cesium Integration in `builds.md`); **E09-authoring-pipeline** stubbed; **E01-weather-providers** gains the GHCN-Daily adaptation (the provider itself already exists as `lib/noaa.js`); **E06-eval-system** gains the flinch harness. Build sequence in `docs/refactor-plan.md`.
- The audio runtime host remains deferred (resolved with the environment-engine host decision); package audio fields are host-agnostic refs only.
- The Notion Time Machine Page Index still describes the superseded architecture and requires correction (tracked in refactor plan Build 9).

## Alternatives Considered

- **Provenance modes as runtime behavior** (engine branches on mode). Rejected: pays accuracy costs at runtime forever, contradicts the Flinch Standard's authoring-time framing, and contaminates the engine ahead of its platform lift.
- **Per-mode renderer forks.** Rejected: three products masquerading as one; multiplies every downstream cost.
- **Repo split now** (engine extracted to a platform repo). Rejected: coordination tax for a solo builder with no second consumer. Seams are cheap; splits are not.
- **Keep the preset system and extend it.** Rejected: the accuracy manifest is load-bearing residue of the retired doctrine; renaming it invites the drift back in.

## References

- PRD v3.0 (`PRD.md` — Flinch Standard, provenance modes) and `docs/v3-pivot-plan.md` (the ranked code-pivot map this refactor absorbs the structural half of)
- Environment engine as platform layer (prior decision)
- Forge v0.2 — contract-first, eval-driven, one build per session
- `henhouse-adu` E07-system-manifest (the contract-handshake precedent)

## Amendments

- **2026-08-05 — planning packet v2 absorbed.** Viewpoint semantics clarified: `position` is the eye origin, `facing_deg`/`fov_hint` are authoring hints, screen geometry and off-axis frusta belong to the venue profile — a package never describes apertures. Unreal Project Architecture section added to `docs/architecture-v3.md` (bounded world, fidelity bands A/B/C, no-view-dependent-geometry invariant, nDisplay config as the venue profile, historical pipeline stages). New Build U3 (era kit + PCG foundation) gates the Baton Rouge port. Movement within a locale explicitly deferred pending its own D-record. Pre-P1 schema edits: viewpoints description updated and `maxItems: 1` added (enforcing the one-entry-in-v0.1 rule; widening later is the schema-minor bump the versioning section already describes) — sanctioned pre-Build-1, no `schema_version` bump. `/Game/Display/` (nDisplay venue-profile configs) lives in the Unreal repo for asset-format reasons but is installation config: never package content, never referenced from a manifest — decision 5 stands.
