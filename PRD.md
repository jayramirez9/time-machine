# Time Machine Experience Bible

PRD + Brand Constitution for the Time Machine Platform

## Version

v1.0 — Experience Bible / Product Requirements Document
Owner: Henhouse Holdings / Time Machine
Status: North Star + v1 build specification

## 1) What This Is

This document is the constitution for Time Machine: product intent, non-negotiables, experience principles, and the system requirements that make it real.

If a future decision contradicts this, the decision is wrong—unless we explicitly amend this document.

## 2) Product Summary

Time Machine recreates a specific time and place and renders it through multiple displays that behave like real architectural windows, plus environmental audio that is invisible but essential. The room becomes a portal into a coherent, living world: one universe, many windows.

The platform supports:

* Multi-window realism (directional accuracy + synchronization + exposure/color coherence)
* World-state simulation (time-of-day, weather, atmosphere, environment semantics)
* Environmental audio driven by the same world state (directional, contextual, non-looping, period-aware)
* Content presets that are versioned and operable by non-technical staff

## 3) The Dream State (North Star)

The best expression of Time Machine is a fully immersive, historically accurate "Google Street View you can inhabit."

You can step into any time and place in history and navigate the world naturally—walk alleys, cross plazas, look down streets—and every cue agrees:

* Period-accurate lighting
* Authentic weather for that place/time
* Period-accurate environmental sounds
* Period-accurate speech and slang
* Period-accurate media
* Period-accurate brands and products
* Period-accurate materials and physics (down to how objects sound when they contact surfaces of the era)

Historical accuracy is the true north. Not "vibes." Not "close enough."
Absolute realism is the product.

Examples of the bar:

* Turn on a radio in 1981: only songs released on or before that date exist. DJ tone and slang are era-correct. Ads are era-correct.
* "News at noon, 6, and 10" appears only where/when that phrasing was common.
* "Groovy" shows up only in its actual era window.
* "Pop vs soda vs coke" is location + time specific, not a generic Americanism.
* Car horns, church bells, fog horns, work whistles—all period-correct.

Rule: Missing detail is forgivable. Incorrect detail breaks trust.

## 4) The Experience Promise

Time Machine must feel like:

* You are inside a real room.
* Outside that room is a real world.
* Windows are not screens; they are portals with physics.
* Sound is not a soundtrack; it's the outside world bleeding in.

If someone says "It felt like a display," we failed.

## 5) Non-Negotiables (The Laws)

These are the product's "Haunted Mansion rules." They do not get negotiated away during implementation.

### 5.1 One Universe

All windows + audio share one authoritative WorldState.
No freelancing. No per-window "looks good" tuning that breaks coherence.

### 5.2 Directional Truth

A north window shows northward. East is east. Always.
Audio beds respect direction too.

### 5.3 Synchronization or Death

Windows update in lockstep. Audio runs on the same timebase.
If sync breaks, fade gracefully—never show a broken universe.

### 5.4 Realism Over Features

We choose fewer features at higher realism over more features at lower believability.

### 5.5 Silence Over Wrongness

If we can't be accurate, we must be neutral—not incorrect.
(Examples: reduce event density, remove specific brand references, shift to generic ambience.)

### 5.6 No Anachronisms

Nothing modern leaks into a past world: language, UI metaphors, products, media, signage, behaviors.

### 5.7 Audio Is Essential and Invisible

If muting audio makes the illusion collapse, that means audio is doing its job.

## 6) Product Goals

### G1 — Coherent Universe (Audio + Visual)

One simulation clock. One weather state. One sun position. Deterministic procedural systems.

### G2 — Spatial and Directional Accuracy

Window views match cardinal orientation and physical placement. Audio feels anchored to "outside space," not stuck to speakers.

### G3 — Believability (Photoreal + Psychoacoustic)

Lighting correctness, motion coherence, black levels, exposure matching, non-looping ambience, and physically plausible cues.

### G4 — Operability

Non-technical staff can run sessions, select presets, and recover from errors using guided flows.

### G5 — Scalability of Content Without Destroying Quality

A content pipeline that supports growth while enforcing accuracy constraints.

## 7) Non-Goals (for v1)

* Perfect multi-person individualized binaural rendering.
* Infinite global coverage at film-quality from day one.
* Full "walk anywhere" tracking in a huge space.
* Consumer DIY kits (v1 is pro install / owned-and-operated quality).

## 8) Users

**Guest**
* Wants presence. Doesn't want "tech."

**Operator (Host / Staff)**
* Starts/stops sessions, selects presets, monitors health, handles recovery.

**Experience Owner (You / Team)**
* Builds worlds, sets accuracy rules, tunes realism, ships presets, reviews telemetry.

## 9) Core Use Cases

1. **Preset Playback** — "Venice — 1903 — foggy morning" with coherent visuals + ambience.
2. **Live Mode** — "Right now outside this location" with live weather and day/night.
3. **Historical Mode** — "NYC — Aug 1945 — afternoon" with era-locked media, soundscape, commerce.
4. **Narrative Mode** — Time-lapse or scripted transitions while maintaining a consistent universe.
5. **Directional Window Room / Trailer Install** — Fast calibration, stable sync, resilient to drift and setup variation.

## 10) System Overview

Time Machine is a set of coordinated systems:

1. World State Engine
2. Visual Rendering System (Windows)
3. Environmental Audio System
4. Synchronization + Timing System
5. Calibration System (Visual + Audio)
6. Preset / Content System (Versioned)
7. Operator UX + Health + Recovery
8. Telemetry + Diagnostics

Everything hangs off WorldState.

## 11) World State Engine

### Inputs

* Location (lat/long), altitude (optional), timezone
* Date/time (absolute)
* Mode: live / historical / curated
* Environment preset (urban, coastal, forest, etc.)
* "Local semantics": road position, water presence, market density, etc.

### Outputs

A canonical WorldState updated over time, including:

* Sun/moon position and lighting parameters
* Cloud fields, wind vectors, visibility, fog density
* Precipitation type/intensity, thunder model
* Ambient activity density (people/cars/boats)
* Deterministic random seeds for procedural elements

Requirement: WorldState must be authoritative for both audio and visuals.

## 12) Visual System: Multi-Window Reality

### Window Model

Each window has:

* Window ID
* Physical position in room coordinates (x,y,z)
* Orientation (yaw/pitch/roll)
* Display specs: size, resolution, color profile, max nits, black performance

### Rendering Requirements

* Each window is a camera into the same world with correct transform.
* Exposure/white balance match across windows.
* Motion coherence across seams (clouds, shadows, moving objects).
* Optional (later): viewer tracking for subtle perspective correction.

### Visual Calibration

Operator-guided flow:

1. Load venue profile
2. Verify mapping (east/west swap detection)
3. Color/exposure alignment
4. Seam test scene (horizon + object crossing windows)
5. Save calibration version + timestamp

Minimum acceptance test: a moving object can cross windows without timing seams.

## 13) Environmental Audio System

Audio is world-driven, layered, spatially plausible, and historically constrained.

### 13.1 Audio Goals

* Invisible but essential
* Directionally anchored
* Non-looping / non-repetitive across typical session lengths
* Synchronized with visual cues and WorldState
* Period accurate in historical modes

### 13.2 Audio Model (Layer Stack)

1. **Base Bed** — The "air" of the environment: broadband ambience with slow evolution.
2. **Directional Beds** — Stable sources mapped to world azimuth (e.g., road to east, harbor to south).
3. **Micro-events** — Incidental one-shots: footsteps at distance, a dog bark, a boat creak, a cart roll-by—scheduled procedurally with cooldowns and variation pools.
4. **Weather Layer** — Wind gust character, rain texture (surface + intensity), thunder model, fog diffusion cues.
5. **Window Physics / Occlusion (light touch)** — "Glass closed vs open" spectral shaping; subtle resonance cues when appropriate. No gimmicks.

### 13.3 Spatial Approach

v1: Multi-zone speakers (4-zone N/E/S/W minimum; 8-zone preferred) + subwoofer

* Panning based on world azimuth relative to room orientation
* Distance cues via EQ roll-off and dynamic shaping
* Conservative reverb tuned for "outside," not "cathedral"

v1.5+: Optional sweet-spot head tracking for subtle stabilization—not theme-park binaural.

### 13.4 Audio-Visual Synchronization

* Audio engine uses the same master clock as visuals.
* Weather changes ramp coherently.
* Lightning-to-thunder is intentional modeled delay, not accidental latency.

### 13.5 Audio Calibration

* Speaker mapping verification
* Level matching across zones
* Basic room EQ profile
* Noise floor measurement (critical for trailer environments)
* Health checks: dropouts, drift, device disconnects

### 13.6 Audio Operator Controls

* Master ambience level (guardrails, no "turn it to 11")
* Realism modes:
   * Subtle (default)
   * Present (slightly more event density)
   * Demo (exaggerated, explicitly non-realistic)
* Glass mode: closed/open if supported by preset
* Panic: fade to neutral air tone + visual frosted glass

## 14) Historical Accuracy System (The "Authenticity Layer")

This is what upgrades "immersive environment" into "Time Machine."

### 14.1 Accuracy Constraints

Every preset is constrained by:

* Location
* Date/time
* Technology maturity (lighting, transport, media)
* Local culture + language + slang windows
* Commerce + brands + product availability
* Materials and infrastructure (street surfaces, vehicles, signage)
* Flora and fauna present in that time/place

### 14.2 Media Rules

* Radio/TV/music catalogs are date-locked.
* DJ formats and slang are era-correct.
* Ads and brands follow availability constraints.
* News phrasing and scheduling conventions match the era.

### 14.3 Language Rules

* Slang is time-bounded.
* Word choice can be geo + era specific ("pop/soda/coke" problem).
* NPC behaviors reflect social norms of the period.

### 14.4 "Silence Over Wrongness" Policy

If we can't verify:

* Default to generic ambience without specific brand/media references
* Reduce specificity rather than introduce inaccuracies

### 14.5 Authenticity QA (Required)

Every historical preset ships with an Accuracy Manifest:

* Date/time window
* Location scope
* Media catalogs included + cutoff rules
* Slang/lexicon set + citations/source notes (internal)
* Brand/product list + availability rationale (internal)
* Audio source taxonomy (what types exist and why)
* Known compromises (explicitly listed)

## 15) Presets and Content

### Preset Definition (Versioned Bundle)

A WorldPreset includes:

* Environment scene + asset references
* Lighting/atmosphere config
* Weather mode config (live/historical/curated)
* Activity density parameters
* AudioProfile (layer rules, directional sources map, event scheduler config)
* Optional narrative script (timed transitions)
* Accuracy Manifest (for historical presets)

### Offline Reliability

Presets must be downloadable and runnable offline with cached data.

## 16) Operator UX + Health + Recovery

### Operator Must Be Able To

* Select preset (time/place)
* Start/stop sessions
* Switch weather modes
* Monitor health
* Recover quickly

### Health Dashboard

* FPS per window/node
* Sync drift indicators
* Audio device health + dropout counters
* GPU temps/load
* Network status
* Calibration version in use

### Recovery (Non-negotiable)

If coherence degrades:

* Fade to "frosted glass" visuals
* Maintain neutral air tone
* Auto-restart subsystems
* Return to scene only when coherence is restored

## 17) Architecture (Recommended v1)

### Rendering

* Unreal Engine as the renderer (best path to photoreal real-time skies/lighting/atmosphere).
* Multi-node rendering recommended for multi-window scaling.

### Topology

* **Master Node**
   * Authoritative WorldState + simulation clock
   * Operator UI + telemetry
   * Distributes state to render and audio nodes
* **Render Nodes**
   * Render assigned window cameras
   * Maintain sync discipline
* **Audio Node** (can be master or separate)
   * Generates/mixes soundscape from WorldState
   * Outputs multi-channel to room zones
   * Enforces non-looping logic and layer fallbacks

### Sync

* Clock discipline across nodes (minimum: network time sync with drift correction; upgrade path to tighter sync solutions).

## 18) MVP Definition (What "Done" Means)

MVP = one venue profile + 4 windows + directional audio + 10 presets where:

**Visual:**
* Cardinal directions are correct.
* Exposure/white balance matches across windows.
* A moving object can cross windows without visible seams.
* Stable frame rate with low variance.

**Audio:**
* Directional beds feel anchored (east traffic feels east).
* No obvious repetition in a 30-minute continuous run per preset.
* Weather transitions align with visuals (rain/wind coherence).
* No dropouts during a 4-hour session.

**Operations:**
* Non-technical operator can run the system.
* Calibration is repeatable and saved.
* Panic/recovery works and preserves dignity.

## 19) Success Metrics

**Believability:**
* Unprompted "this feels real" comments
* "Mute test": muting significantly reduces realism
* Time-to-notice-screen (longer is better)

**Technical:**
* Sync drift over 4 hours
* Audio dropout rate (near zero)
* Color match delta across windows
* Repetition index for audio micro-events

**Operational:**
* Setup time (especially for trailer moves)
* Steps to start a session (<5)
* Crash-free session rate

## 20) Risks and Mitigations

**Risk: It still feels like TV**
* Fix black levels, exposure matching, and room lighting integration before adding "features."

**Risk: Audio sounds like a loop pack**
* Enforce large variation pools, cooldown rules, procedural scheduling, and loop-hygiene tooling.

**Risk: Drift kills coherence**
* Single master clock; explicit drift detection; graceful fallback.

**Risk: Historical accuracy becomes unscalable**
* Accuracy Manifest per preset + "silence over wrongness" + constrained environment scopes.

**Risk: Mac hardware ceilings**
* Prototype on Mac; define production hardware baseline that can hit realism targets.

## 21) Roadmap (Phases)

### Phase 0 — Prototype

* 2-4 windows
* Basic sky/time-of-day + coherent weather
* 4-zone directional audio bed
* Operator preset switcher

### Phase 1 — MVP

* Calibration tools (visual + audio)
* 10 presets (curated)
* Health dashboard + recovery system
* Preset versioning + offline support

### Phase 2 — Presence Upgrade

* Optional head tracking sweet spot
* Glass occlusion modes
* Higher-fidelity weather/audio coupling (wind/rain surfaces, thunder model)

### Phase 3 — Scale

* More venue profiles (repeatable installation)
* Content pipeline at volume
* Remote monitoring and updates
* Fleet-ready packaging

## 22) What We Decide Next (So This Becomes Buildable)

To lock v1, we must freeze two physical specs:

1. Canonical window layout (count, size, placement, cardinal mapping)
2. Canonical speaker topology (4-zone vs 8-zone + subwoofer)

Pick those, and this Bible becomes an executable v1 spec with:

* venue coordinate system definition
* calibration tolerances
* recommended node topology
* minimum audio variation pool sizes and cooldown rules
* acceptance tests (the "no bullshit" checklist)
