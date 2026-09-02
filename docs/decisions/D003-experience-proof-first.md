# D003 — Experience Proof Before Further Platform Refactors

**Date:** 2026-08-06
**Status:** Ratified (Jay's direction)
**Amends:** `ROADMAP.md`, `tasks.md`, `builds.md`, `docs/refactor-plan.md`, `PROJECT_CONTEXT.md`
**Plan:** `docs/experience-proof-plan.md`

## Context

Time Machine has accumulated multiple valid but competing definitions of “next.” The Notion build plan still described Phase 0 and the old PC. `ROADMAP.md` named Phase 7d capture work active. The v3 refactor plan queued Locale Package validation, provenance cleanup, and three package ports. The year-1 review instead identified a product/pipeline inversion: the content and verification systems had advanced while the room, apertures, multi-surface experience, and physical audio had not been tested.

The a7500 removes the old rendering ceiling and creates the first practical opportunity to test the product in its intended medium. A recent working note also proposed the immediate physical move: tape the trailer footprint inside the Henhouse office and make the office the lab.

The strategic problem is no longer lack of software capability. It is lack of experiential evidence.

## Decision

1. **The active milestone is the Experience Proof.** Build one convincing world on the a7500 and experience it through a temporary office lab approximating the first room.
2. **Presence precedes witness accuracy.** Scene 0 is observed or authored and must pass the Presence Gate. Baton Rouge 1985 remains the first witness-validated historical scene, but becomes Scene 1 after presence is demonstrated.
3. **Platform expansion is paused.** Locale Package P1–P9, provenance A1–A4, Phase 7d capture work, new agent/catalog work, and additional historical depth remain preserved but parked until the Experience Proof exits.
4. **The existing engine path is used directly.** Scene 0 must not depend on completing the Locale Package refactor.
5. **The office is the temporary first room.** Use available screens and speakers, approximate the ADU hero-wall plus side-aperture concept, control ambient light, and avoid final hardware purchases. Implement only the bounded nDisplay venue profile needed for correctly transformed apertures; do not mirror or hand-tune views.
6. **Observed guest behavior writes the next roadmap.** After 3–5 sessions, prioritize the highest-leverage felt defects. Resume an abstraction only when the room exposes the need.
7. **Scene 0 still declares what it is.** Keep the lightweight Provenance Declaration required by PRD §14.6 while deferring automated validation, Locale Package integration, and publishing infrastructure.

## Rationale

- The project already has a capable engine and extensive offline validation; another schema or research layer does not answer whether the experience feels real.
- The PRD's software MVP is experiential. The Experience Proof is a smaller stage gate aligned to it, not a competing product definition.
- An observed/authored Scene 0 isolates the portal illusion from historical reconstruction cost.
- A reversible office lab produces evidence before committing to final panels, audio, cabinetry, or trailer construction.
- Defect-driven work restores a single forcing function: improve the room.

## Options Considered

### Continue the Locale Package refactor

Preserves architectural momentum and cleans up the v3 contract, but produces little immediate guest-visible learning. Rejected as the next milestone; retained as the restart plan.

### Begin Baton Rouge 1985 immediately

Emotionally strong and witness-testable, but immediately reintroduces photo selection, aerial acquisition, historical vehicles, date-specific content, and validation work before the physical illusion is proven. Sequenced second instead.

### Continue capture and 3DGS work

Potentially improves asset fidelity, but the project has not yet shown that asset fidelity is the binding barrier to presence. Parked until a named scene or asset proves otherwise.

### Build the office Experience Proof

Messier and less architecturally complete, but directly tests the product's highest-risk claim: that screens, sound, light, and room geometry can become a coherent outside world. Accepted.

## Consequences

### Positive

- The project gets one current definition of next.
- New workstation value is realized immediately.
- Physical, rendering, audio, and content defects become observable together.
- Historical accuracy spend moves behind evidence that the underlying experience works.
- Future platform work gains concrete requirements from real use.

### Negative

- E08/E09 architectural cleanup pauses with known stale concepts still in code and docs.
- Scene 0 may use temporary paths that are later replaced by Locale Packages.
- The office setup will not represent final display, acoustic, or calibration quality.
- Some existing plans remain historically valid but inactive, requiring clear status labels.

## Exit

D003 is satisfied only when the Experience Proof criteria in `docs/experience-proof-plan.md` pass, an evidence-backed Presence Gate decision is recorded as **pass**, and the next roadmap is prioritized from observed guest sessions. Completing the sessions with a failed gate does not close D003; EP2/EP3 iterate and the guest check runs again. After a pass, Jay explicitly chooses whether the next work is room/display treatment, multi-aperture rendering, audio, Locale Packages, operator UX, or Baton Rouge 1985.
