# Time Machine Experience Bible

PRD + Brand Constitution for the Time Machine Platform

## Version

v2.0 — Experience Bible / Product Requirements Document
Owner: Henhouse Holdings / Time Machine
Status: North Star + v2 build specification (Historical Environment Reconstruction)

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

You can step into any time and place in history and navigate the world naturally — walk alleys, cross plazas, look down streets — and every cue agrees. The weather is what actually happened that day. The buildings are what actually stood there. The sounds are what you would actually have heard. The world is assembled from archival truth, not artistic interpretation.

An AI research layer scours historical archives — weather records, fire insurance maps, photographs, ornithological surveys, newspaper archives, published music catalogs — and assembles a complete environment profile for any Place × Time coordinate. Every fact is cited. Every gap is acknowledged. The system knows what it knows and what it doesn't.

Every cue agrees:

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

1. **World State Engine** — Authoritative simulation state (weather, time, atmosphere, controls)
2. **Visual Rendering System** (Windows) — Unreal Engine driving multi-window photoreal output
3. **Environmental Audio System** — 5-layer spatially-aware soundscape engine
4. **Synchronization + Timing System** — Master clock discipline across all nodes
5. **Calibration System** (Visual + Audio) — Repeatable setup for venues
6. **Environment Profile System** — Place × Time data bundles (weather, soundscape, urban form, ecology, culture)
7. **Environment Router** — Config-driven mapping from WorldState to downstream renderers
8. **Agent Research Layer** — AI agents that assemble Environment Profiles from archival sources
9. **Operator UX + Health + Recovery** — Non-technical operation, monitoring, graceful degradation
10. **Telemetry + Diagnostics** — State logging, replay, soak testing

Everything hangs off WorldState. Everything upstream of WorldState is research and data. Everything downstream is rendering and output.

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

## 17) Architecture

### The Full Stack

Time Machine is a layered system. Each layer can be built and tested independently, and each layer makes the experience more real.

```
┌─────────────────────────────────────────────────────────┐
│                    RENDERERS (Output)                    │
│  Unreal (visual) │ Audio Engine │ DSP │ Lighting │ OSC  │
└──────────────────────┬──────────────────────────────────┘
                       │ Environment Router (routes.json)
┌──────────────────────┴──────────────────────────────────┐
│                 WORLD STATE ENGINE                       │
│  WorldState = states + controls + metadata               │
│  One simulation clock. One authoritative truth.          │
└──────────────────────┬──────────────────────────────────┘
                       │ compileWorldState()
┌──────────────────────┴──────────────────────────────────┐
│              ENVIRONMENT PROFILE (Place × Time)          │
│  Weather │ Soundscape │ Urban Form │ Culture │ Ecology   │
│  Each dimension is a data layer that feeds WorldState    │
└──────────────────────┬──────────────────────────────────┘
                       │ Research + Curation
┌──────────────────────┴──────────────────────────────────┐
│               AGENT LAYER (Assembly)                     │
│  Autonomous agents that scour archives, cross-reference  │
│  sources, and assemble Place×Time profiles               │
└──────────────────────┬──────────────────────────────────┘
                       │ Historical sources
┌──────────────────────┴──────────────────────────────────┐
│                  DATA SOURCES                            │
│  NOAA │ Open-Meteo │ Sanborn Maps │ NYPL │ LOC │        │
│  Audubon │ Census │ Photo Archives │ Sheet Music         │
└─────────────────────────────────────────────────────────┘
```

### Core Principle: Everything Hangs Off WorldState

WorldState is the single source of truth for every renderer. It doesn't care whether its inputs come from a live API, a 1940s weather archive, an 1884 NOAA daily observation reconstructed into hourly curves, or a hand-curated preset. The downstream pipeline is identical.

This means every new capability — pre-1940 weather, historical soundscapes, period-accurate urban geometry — plugs into the same architecture. We never rebuild the engine. We feed it richer inputs.

### Environment Profiles (Place × Time)

An Environment Profile is the complete description of a place at a moment in history. It replaces the simpler "locale preset" concept as the system matures. A profile contains:

| Layer | What It Describes | Example: NYC 1884 |
|-------|-------------------|-------------------|
| **Weather** | Hourly atmospheric conditions | NOAA Central Park daily obs → interpolated hourly |
| **Soundscape** | Audio profile: beds, directional, micro-events, weather sounds | Horse hooves on cobblestone, barrel organs, house sparrows |
| **Urban Form** | Physical environment: buildings, streets, infrastructure | Sanborn maps → block massing, brownstone facades, gas lamps |
| **Ecology** | Flora and fauna present at that place/time/season | Audubon records → species pools with seasonal/diurnal weights |
| **Culture** | Music, language, commerce, social patterns | Published song catalogs, slang dictionaries, newspaper archives |
| **Materials** | Surface types that affect sound and visual character | Cobblestone, dirt, granite flagstone, wood plank, brick |
| **Infrastructure** | Technology present: lighting type, transport, utilities | Gas street lamps (electric only on Broadway below 14th), elevated railway, horse-drawn carriages |

Each layer has a **confidence rating** and an explicit **known compromises** manifest, honoring the "Silence Over Wrongness" law.

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

### Rendering

* Unreal Engine as the renderer (best path to photoreal real-time skies/lighting/atmosphere).
* Multi-node rendering recommended for multi-window scaling.
* Scene geometry sourced from Environment Profile urban form layer.

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

## 21) Roadmap (From Today to the Dream State)

This roadmap is grounded in what exists today and builds toward the full vision in concrete steps. Each phase delivers a usable product. Each phase makes the next one possible.

### What Exists Today (Baseline)

Working and tested:
* Weather Engine with real-time + historical weather (Open-Meteo, 1940+)
* WorldState compiler producing states + controls for lighting, audio, atmosphere, visual
* Runtime engine with tick loop, timeline caching, state smoothing, publish cycle
* Environment Router mapping WorldState fields to downstream endpoints
* Rate limiter with EMA smoothing preventing transition pops
* Unreal integration: sun position (DirectionalLight), cloud coverage (VolumetricCloud material), fog density (ExponentialHeightFog) — all driven live from weather data
* 5-layer browser audio engine (base bed, directional, micro-events, weather, occlusion stub)
* Audio profile system (JSON-defined soundscape presets per locale/era)
* Daemon with HTTP/WebSocket transport, browser dashboard
* State logging (JSONL) and replay tool for soak testing
* Locale preset system (`baton_rouge_suburb`, `nyc_city`)
* One complete audio profile: `baton_rouge_suburb_1978`

In progress:
* Niagara rain particle system (placed, user parameter exposed, wiring to weather engine)

---

### Phase 0 — Complete the Weather Loop *(Current)*

**Goal:** One location, one era, full weather→visual+audio loop running end-to-end in Unreal.

| Step | Task | Status |
|------|------|--------|
| 0.1 | Sun position driving DirectionalLight | Done |
| 0.2 | Cloud coverage driving VolumetricCloud material | Done |
| 0.3 | Fog density driving ExponentialHeightFog | Done |
| 0.4 | Rain particles (Niagara) driven by precipDensity | In Progress |
| 0.5 | Ground wetness material parameter | Not Started |
| 0.6 | Heat distortion post-process | Not Started |
| 0.7 | Wind effect on vegetation/particles | Not Started |
| 0.8 | Full 24-hour soak test: Baton Rouge, July 4 1978 | Not Started |

**Exit Criteria:** Run the daemon for 24 simulated hours. Sun rises and sets. Clouds form and clear. Rain starts and stops with visible particles. Fog rolls in. No pops, no discontinuities. Logged state replays clean.

---

### Phase 1 — Audio-Visual Coherence

**Goal:** Sound and picture agree. Weather you see is weather you hear.

| Step | Task | Description |
|------|------|-------------|
| 1.1 | Wire audio engine to daemon WebSocket | Browser audio engine receives WorldState push, drives all 5 layers |
| 1.2 | Rain surface audio | Rain-on-roof, rain-on-asphalt audio assets matched to precipDensity |
| 1.3 | Wind audio coherence | Wind audio level + gustiness + direction matched to visual wind |
| 1.4 | Thunder model | Lightning flash (visual) → thunder delay (audio) using distance model |
| 1.5 | Second audio profile | `nyc_city_1978` — validates the profile system works for different locales |
| 1.6 | Transition soak test | Verify weather transitions (clear→rain→clear) sound and look coherent |

**Exit Criteria:** Close your eyes and the audio tells you the same story as the visuals. Open them and nothing contradicts. 30-minute session with no repetition noticed.

---

### Phase 2 — Multi-Window + Spatial Audio

**Goal:** The room becomes a portal. Multiple windows, directional audio, spatial coherence.

| Step | Task | Description |
|------|------|-------------|
| 2.1 | Multi-camera Unreal scene | 4 cameras (N/E/S/W) rendering the same world |
| 2.2 | Exposure/color matching across cameras | Same WorldState drives identical tone mapping |
| 2.3 | 4-zone speaker mapping | Audio engine outputs to N/E/S/W speaker zones |
| 2.4 | Directional audio beds | Road-to-east feels east. Trees-to-north feel north |
| 2.5 | Window physics stub | "Glass closed" EQ filtering on audio |
| 2.6 | Operator preset switcher | Select Place×Time from a menu. System configures everything |
| 2.7 | Calibration flow v1 | Cardinal mapping, color alignment, speaker verification |

**Exit Criteria:** Stand in the room. North window shows north. East speaker plays east traffic. Weather wraps around you coherently.

---

### Phase 3 — Historical Depth (Pre-1940 Weather)

**Goal:** Break the 1940 barrier. Reach back to the 1800s with real weather data.

| Step | Task | Description |
|------|------|-------------|
| 3.1 | NOAA historical provider | New weather provider for pre-1940 daily observations (GHCN-Daily) |
| 3.2 | Daily→hourly interpolation | Reconstruct hourly curves from daily high/low/precip using solar position and diurnal models |
| 3.3 | Confidence metadata | Pre-1940 data gets lower confidence scores; WorldState consumers can react accordingly |
| 3.4 | 1884 NYC weather test | Pull actual weather for every day of 1884 in New York City |
| 3.5 | Provider fallback chain | `openmeteo (1940+)` → `noaa_archive (1800s+)` → `mock` — automatic selection by date |

**Exit Criteria:** `./cli.js -l "New York, NY" -d "06-15-1884"` returns real weather. The WorldState pipeline handles it identically to modern data.

---

### Phase 4 — Era-Specific Soundscapes

**Goal:** You hear 1884, not 2024 with old buildings.

| Step | Task | Description |
|------|------|-------------|
| 4.1 | Locale preset: `nyc_1884` | New locale with era-appropriate parameters (no cars, high horse traffic, gas lamps) |
| 4.2 | Audio profile: `nyc_manhattan_1884` | Full profile: horse hooves on cobblestone, barrel organs, church bells, harbor sounds, species-correct birds |
| 4.3 | Surface material system | Locale defines ground surface types → swaps weather audio (rain-on-cobblestone vs rain-on-asphalt) |
| 4.4 | Ecology data model | Species pools keyed to location + month + time-of-day with source citations |
| 4.5 | Cultural audio layer | Period music (barrel organ tunes, brass band in park), street vendor calls, era-correct church bells |
| 4.6 | Infrastructure sounds | Elevated railway (steam, 6th/9th Ave), horse-drawn carriages, work whistles |
| 4.7 | Agent-assisted profile research | AI agent cross-references Audubon records, historical ecology papers, period newspapers to populate species pools and cultural audio metadata |

**Exit Criteria:** Play NYC 1884 with eyes closed. No cars. No airplanes. No electrical hum. Horse hooves on stone. Church bells on the quarter hour. Sparrows, not starlings (starlings weren't introduced until 1890). Every sound has a citation.

---

### Phase 5 — Historical Urban Form

**Goal:** The 3D world looks like 1884, not just sounds like it.

| Step | Task | Description |
|------|------|-------------|
| 5.1 | Sanborn map ingestion | Agent extracts building footprints, heights, materials, use-types from digitized Sanborn fire insurance maps (LOC archive) |
| 5.2 | Block massing generation | Procedural generation of building volumes from Sanborn data — correct footprints, correct heights, correct lot lines |
| 5.3 | Era-appropriate street layout | Cobblestone streets, dirt side streets, granite sidewalks, no asphalt. Gas lamp placement. Horse watering troughs. |
| 5.4 | Architectural style library | Procedural facade system: Brownstone rowhouse, Italianate commercial, Cast-iron front, Federal, Greek Revival — applied based on Sanborn material data + neighborhood + date |
| 5.5 | Hero building modeling | Key landmarks modeled from historical photos: Trinity Church, the Equitable Building, Brooklyn Bridge (1 year old in 1884), City Hall, Grand Central Depot |
| 5.6 | Historical photo → texture pipeline | AI-assisted: reference photo of a specific building → diffuse/normal/roughness texture maps for Unreal materials |
| 5.7 | Street-level props | Gas lamp posts, horse hitching posts, awnings, period signage — procedurally placed based on street type and neighborhood |

**Exit Criteria:** Fly through the Unreal scene. Building heights match Sanborn data. Materials match the era. Hero buildings are recognizable from period photos. Streets are cobblestone where they should be. No anachronistic materials (no steel-and-glass, no asphalt, no electric lights south of 14th Street).

---

### Phase 6 — The Agent Layer

**Goal:** AI agents autonomously research and assemble Place×Time profiles.

| Step | Task | Description |
|------|------|-------------|
| 6.1 | Profile schema specification | Formal JSON schema for Environment Profiles: all layers, all fields, confidence ratings, source citations |
| 6.2 | Weather research agent | Given a place + date range, finds the best available weather data source (Open-Meteo, NOAA GHCN, reconstructed) and produces a weather provider config |
| 6.3 | Ecology research agent | Given a place + date, queries historical biodiversity records (Audubon, eBird historical, natural history surveys) and produces species pools with seasonal/diurnal weights |
| 6.4 | Urban form research agent | Given a place + date, locates Sanborn maps, historical atlases, census records, and produces a GIS-compatible urban form dataset |
| 6.5 | Cultural research agent | Given a place + date, researches period music, language/slang, commerce, social customs, and produces a cultural metadata bundle |
| 6.6 | Photo archive agent | Given a place + date, scours digitized photo archives (NYPL, LOC, Museum of City of NY, stereograph collections) and produces a tagged reference image set with location + angle metadata |
| 6.7 | Profile assembler | Orchestrator agent that invokes specialist agents and assembles a complete Environment Profile with confidence ratings and known compromises |
| 6.8 | Accuracy manifest generator | Auto-generates the Accuracy Manifest (Section 14.5) from agent research, listing sources, confidence, and gaps |

**Exit Criteria:** Tell the system "NYC, June 15, 1884." An agent pipeline produces a complete Environment Profile — weather, soundscape, urban form metadata, cultural context, reference photos — with source citations for every claim. A human reviews it, approves it, and the system can run it.

---

### Phase 7 — Living Street View

**Goal:** The full dream. Walk through a historically accurate 3D reconstruction driven by real weather, real soundscapes, real culture.

| Step | Task | Description |
|------|------|-------------|
| 7.1 | Walkable city blocks | Navigable street-level experience in Unreal — walk, look around, enter plazas |
| 7.2 | Acoustic environment modeling | Reverb/reflection characteristics per street width, building height, surface material |
| 7.3 | Dynamic population | Procedural pedestrians, horse carriages, street vendors — density driven by time-of-day and weather |
| 7.4 | Period-accurate lighting transitions | Gas lamps lit at dusk (a lamplighter NPC), sunrise through building canyons, candlelight in windows at night |
| 7.5 | Interactive audio anchoring | Sound sources anchored to world position — walk toward the harbor and harbor sounds grow, walk into a park and bird density increases |
| 7.6 | Multi-era support | Same city block, different year. 1884 → 1920 → 1955 → 1978 → today. Watch the city transform. |
| 7.7 | Narrative mode integration | Scripted time-lapse: sunrise to sunset, season to season, decade to decade — maintaining coherence throughout |

**Exit Criteria:** Step into 1884 Manhattan. Walk down Broadway. The sun is where it actually was that day. The weather is what actually happened. Trinity Church towers over everything because nothing taller exists yet. You hear horse hooves on cobblestone, a barrel organ on the corner, sparrows in the trees, and the distant whistle of the elevated railway. A gas lamplighter begins his rounds as the sun sets. It is raining because it actually rained that day, and the rain sounds like rain on cobblestone, not rain on asphalt. Nothing is wrong. Nothing is anachronistic. You are there.

---

### Milestone Map

```
TODAY ─── Phase 0 ─── Phase 1 ─── Phase 2 ─── Phase 3 ─── Phase 4 ─── Phase 5 ─── Phase 6 ─── Phase 7
          Weather      Audio+       Multi-       Pre-1940     Era          Urban        Agent        Living
          Loop         Visual       Window       Weather      Soundscapes  Form         Layer        Street
          (Unreal)     Coherence    + Spatial                                                        View
          ▲                                      ▲                                     ▲
          YOU ARE                                 1884 weather                          Autonomous
          HERE                                   becomes real                          research
```

Each phase is independently valuable. Phase 0-1 is a compelling weather simulation. Phase 2 is an installation product. Phase 3-4 makes historical mode real. Phase 5-6 makes it visual. Phase 7 is the dream state.

## 22) The Agent-Driven Research Model

The ambition of Time Machine — absolute historical accuracy at arbitrary Place×Time coordinates — is impossible for humans to achieve manually at scale. The volume of archival research required for a single city block in a single year would take a historian months.

AI agents change this equation. The research model works like this:

### How Agents Build a World

1. **A human says:** "NYC, 1884"
2. **The Weather Agent** queries NOAA GHCN-Daily for Central Park station records. Finds daily high/low/precip for every day of 1884. Reconstructs hourly curves using solar position models. Outputs a weather provider config.
3. **The Ecology Agent** queries historical ornithological surveys of the NYC region. Cross-references Audubon Society records, early Central Park bird censuses, and seasonal migration data. Outputs species pools: house sparrow (year-round, high frequency), American robin (spring-fall, dawn-weighted), chimney swift (summer, dusk), etc.
4. **The Urban Form Agent** locates the Robinson Atlas of NYC (1885) and Sanborn fire insurance maps. Extracts block-level building footprints, heights, materials, use-types. Cross-references with city records for street surface types. Outputs a GIS dataset.
5. **The Cultural Agent** researches 1884 NYC: published song catalogs (what a barrel organ would play), newspaper archives (street vendor calls, social customs), infrastructure records (which streets had gas lamps, the elevated railway schedule, horse car routes). Outputs cultural metadata.
6. **The Photo Agent** searches NYPL Digital Collections, Library of Congress, Museum of the City of New York. Finds stereographs of Broadway, photos of Trinity Church, illustrations of the elevated railway. Tags each with location, date, viewing angle. Outputs a reference image set.
7. **The Assembler** combines all agent outputs into a single Environment Profile. Generates the Accuracy Manifest: what's verified, what's interpolated, what's missing. A human reviews and approves.

### The Accuracy Contract

Every fact in an Environment Profile must have:
* A **source citation** (archive, database, publication)
* A **confidence level** (verified, likely, interpolated, assumed)
* A **known compromise** entry if accuracy is uncertain

The system will never fabricate. If the agent can't find what birds were in Manhattan in June 1884, the profile says "ecology: low confidence, defaulting to modern regional species minus post-1884 introductions." The Silence Over Wrongness law applies to agents too.

### Skinning the World from Photos

The most ambitious agent capability: using historical photographs to texture 3D buildings.

The pipeline:
1. Agent finds a photograph of a specific building (e.g., the Equitable Building at 120 Broadway, photographed 1870s-1880s)
2. Photo is tagged with building ID, camera angle, approximate date
3. AI texture extraction produces diffuse/normal/roughness maps from the photo
4. Maps are applied to the corresponding building geometry (from Sanborn footprint data)
5. For buildings without specific photos, the architectural style library provides era-appropriate procedural textures based on Sanborn material data (brick, brownstone, cast iron, wood frame)

This is the "Google Street View skinned with history" concept. Modern photogrammetry gives us the geometry. Historical photos give us the surfaces. AI bridges the gap.

## 23) What We Decide Next (So This Becomes Buildable)

### Immediate (Phase 0 Completion)

1. Finish Niagara rain particle wiring to weather engine
2. Full 24-hour soak test of Baton Rouge 1978
3. Document all Unreal actor paths and dispatch types

### Near-Term Architecture Decisions

1. Canonical window layout (count, size, placement, cardinal mapping)
2. Canonical speaker topology (4-zone vs 8-zone + subwoofer)
3. Audio engine deployment model (browser WebAudio vs. native DSP vs. hybrid)

### Research Spikes (Can Start Anytime)

1. **NOAA GHCN-Daily feasibility:** Can we get usable hourly reconstructions from daily observations for 1884 NYC?
2. **Sanborn map parsing:** What's the realistic pipeline from scanned Sanborn pages to GIS building footprints?
3. **Historical ecology data:** How complete are pre-1900 species records for major US cities?
4. **AI texture generation:** Current state of the art for photo→PBR texture extraction from a single historical image?

Pick the physical specs and Phase 0 is locked. Start the research spikes and Phase 3-6 planning becomes concrete.
