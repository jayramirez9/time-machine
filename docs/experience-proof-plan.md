# Time Machine — Experience Proof Plan

**Status:** Active
**Date:** 2026-08-06
**Decision:** `docs/decisions/D003-experience-proof-first.md`
**Owner:** Jay

## Objective

Build one convincing world on the a7500 and experience it through a rough physical approximation of the first room before investing further in platform refactors, provenance systems, or historical reconstruction depth.

The milestone is deliberately experiential:

> One world. One room. Multiple apertures. Coherent sound and weather. A guest feels that something exists outside.

This is not the software MVP in PRD §19. It is the smaller proof needed before spending toward that MVP.

## Why This Is Next

The repository is not short on platform capability. It already contains the WorldState engine, weather providers, routing, Unreal transport, spatial audio logic, procedural content systems, research/profile tooling, and a large offline test suite. The missing evidence is physical: whether those systems create presence when picture, sound, room lighting, viewing position, and aperture geometry meet.

Several plans currently name different next steps. This plan resolves the conflict:

- `ROADMAP.md` had Phase 7d capture work active.
- `docs/refactor-plan.md` queued the Locale Package validator and provenance refactor.
- `docs/review-year1-2026-07.md` recommended convergence on one physical room.
- The office-lab concept provides an immediate, reversible way to test that room.

The Experience Proof is now the forcing function. Work resumes only when a defect felt in the room calls for it.

## Two Gates, In Order

### 1. Presence Gate

Does the installation feel like an aperture into a coherent world?

- Picture reads as outside, not content on a screen.
- Light, weather, and audio agree.
- Multiple views feel like one place.
- At least one directional sound appears to originate where the eye expects it.
- A non-technical guest reacts to the world rather than the technology.

### 2. Witness Gate

Does a specific historical or remembered world hold up for someone who knew it?

The Witness Gate remains the standard for Baton Rouge 1985 and later historical scenes. It does not govern Scene 0. Presence must work before historical exactness can earn its cost.

## Sequence

### EP0 — Close the Workstation Loop

Finish the open box-side U1 checklist in `../time-machine-unreal/SETUP.md`:

- Complete a7500 OS, driver, DDC, UE 5.8, plugin, RC, firewall, Git, and LFS setup.
- Adopt the blank Unreal project into `time-machine-unreal`.
- Confirm the a7500 LAN address and update the RC target if needed.
- Pass the three U1 exit checks: `/remote/info`, property set/get, and LFS round-trip.

**Exit:** The Mac can reliably drive Unreal on the a7500.

### EP1 — Make One Screen Breathe

Build the minimum Core Environment Rig in the fresh Unreal project:

- One camera at window height.
- Sun, sky atmosphere, volumetric clouds, fog, and Niagara precipitation.
- Existing WorldState routing drives the rig.
- Existing browser audio runs from the same state.
- Accelerated day-to-night and a weather transition are visible and audible.

This is a live integration build, not a renderer architecture build. Use the existing engine path; do not require Locale Packages first.

**Exit:** One screen and basic audio produce a coherent accelerated cycle from the current engine.

### EP2 — Build the Office Lab

Use the Henhouse office as a temporary first room:

- Tape the Content Node/trailer occupied area on the floor.
- Establish a fixed seated eye position.
- Approximate the ADU display concept with available hardware: one hero/end-wall view and one or two side apertures.
- Build the minimum nDisplay venue profile required for the proof: one shared design eye origin; Screen components matching each aperture's measured size, position, and orientation; off-axis frusta derived from that geometry; and output mapping for the available displays.
- Do not mirror the hero view or hand-tune independent FOVs. Run a simple cross-surface exposure and motion-coherence check before judging presence.
- Control ambient light and visually frame the displays as openings.
- Use available speakers to test a basic directional bed and one aperture-anchored event.
- Keep installation reversible. Do not buy final panels, mounts, cabinetry, or production audio for this proof.

**Exit:** The same Unreal world is visible through at least two correctly transformed physical apertures from the occupied region, with no obvious cross-surface exposure or motion mismatch.

### EP3 — Author Scene 0

Scene 0 is observed or authored, not historical. Choose a world that emphasizes atmosphere and minimizes reconstruction burden—for example Georgia woods or a lake at dawn, present-day Baton Rouge after a storm, or a foggy coast.

Required:

- One canonical view and coherent adjacent views.
- A convincing sunrise/golden-hour/night handoff.
- At least one rain, fog, or wind transition.
- A matched environmental soundscape with no obvious short-loop failure.
- One directional or aperture-anchored cue.
- A lightweight, hand-authored Provenance Declaration naming the scene's observed/authored mode, date/time and location scope, gates in force, music policy, and deliberate omissions. This does not require the Locale Package loader or publish gate.
- A 10–15 minute accelerated experience run.

Not required:

- Exact historical weather for a named day.
- Automated provenance validation, package integration, or publish gate.
- Photo/Witness Test.
- Finished operator UI.
- Production display or audio hardware.

**Exit:** Jay can sit through the run without needing to explain the technology for it to make sense.

### EP4 — Guest Sessions

Run the Experience Proof with 3–5 people who did not build it.

Do not lead with the feature list. Observe:

- What they look at first.
- Whether they call the surfaces screens, windows, or a place.
- Whether audio changes their sense of reality when muted/unmuted.
- Where they visibly disengage or notice a mismatch.
- What occasion, room, or use they imagine without prompting.

Record felt defects, not a general wishlist. Every defect should point to one of: room/display treatment, camera/frustum, rendering, audio, world-state coherence, content, or operation.

**Experiment exit:** The team can name the three highest-leverage barriers to presence from observed sessions and record an evidence-backed Presence Gate pass/fail decision.

Completing the guest sessions does not automatically pass the Presence Gate. If the evidence says the surfaces still read as screens or the world is not coherent, return to EP2/EP3, address the highest-leverage defects, and rerun the guest check. D003 remains active until the gate passes.

## Experience Proof Exit Criteria

The milestone passes when:

1. The a7500 runs the scene from the existing Time Machine engine.
2. At least two physical apertures show coherent views into one world.
3. A 10–15 minute accelerated cycle includes a light transition and a weather or atmosphere transition.
4. Picture and sound remain coherent throughout the run.
5. At least three non-technical guests experience it.
6. A lightweight Scene 0 Provenance Declaration satisfies PRD §14.6.
7. An evidence-backed Presence Gate decision is recorded as **pass**. A failed gate triggers another EP2/EP3 iteration rather than closing the milestone.
8. The next roadmap is written from observed presence failures, not from speculative platform completeness.

## Parked Until Exit

- Locale Package P1–P9 work, including validator, loader, publish gate, and ports.
- Provenance/confidence refactor A1–A4.
- Phase 7d capture, splat, and generative-backdrop experiments.
- New research agents, catalogs, international support, and Temporal Asset Library work.
- NYC 1884 expansion and the Baton Rouge 1985 Witness Test.
- Production operator UI, calibration, and reliability work beyond what Scene 0 exposes.

Parked means preserved, not rejected. `docs/refactor-plan.md` remains the restart plan for platform work.

## Resume Triggers

- **Locale Packages:** resume when a second real scene makes manual content switching or configuration duplication painful.
- **Operator UX:** resume when someone other than Jay must start or recover a session.
- **Calibration:** resume when the physical lab exposes cross-display mismatch that cannot be ignored.
- **Provenance and historical research:** resume when Scene 1 begins and a visible or audible historical detail needs a decision.
- **Capture or splats:** resume only for a named asset or scene problem that conventional Unreal content cannot meet.
- **Baton Rouge 1985:** begin after the Presence Gate passes; it becomes Scene 1 and the first Witness Gate.

## Working Rule

During this milestone, prefer the smallest change that improves the room. If a task cannot be connected to a felt defect or an exit criterion above, it stays parked.
