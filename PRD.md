# Time Machine Experience Bible

PRD + Brand Constitution for the Time Machine Platform

## Version

v3.1 — Experience Bible / Product Requirements Document
Owner: Henhouse Holdings / Time Machine
Status: North Star + v3 build specification (Programmable Environment Engine — historical, observed, and authored provenance; Personal Memory Reconstruction as a second application)

**v3.1 amendment (September 2026):** Extends the photo-first inversion (§3.1) into memory mode (§3.5): **the guest's photographs are the primary source of the reconstruction — the ingredients, not a quality check.** The v2.2 text of §3.5 "Why it is buildable" had ruled the opposite ("the guest's photographs are not the geometry source"), making present-day capture the geometry source reconciled back to the memory's date; that direction is inverted. Present-day capture of a still-standing venue is demoted to optional supporting evidence — scaffolding reconciled *to the photographs*, never the reverse (also recorded at the §17 selector) — and the remodeled or demolished venue is a first-class case, not an exception. The division-of-truth **principle** (guest supplies the *what*, Time Machine supplies the *when*) is unchanged; its statement is sharpened to name the photographs the primary source. The relocated-authority principle and the historical North Star's primacy are unchanged. The **no-synthesized-people law is unchanged but its enforcement surface hardens**: the primary source is now photographs that contain people, and their presence in frame is explicitly not a license — §3.5 now says so in place.

**v3.0 amendment (July 2026):** Replaces the **Accuracy Contract** with the **Flinch Standard** (§5.0) as the governing law — accuracy is worth exactly what it costs to prevent the flinch of someone who was there, and nothing beyond that. Inverts the authoring pipeline to **photo-first** (§3.1): a dated, located photograph is the specification, not reference material. Reframes Time Machine's identity as a **programmable environment engine** spanning three provenance modes — historical, observed, authored (§2, §17 Provenance Modes) — rather than one product's render layer. Demotes the confidence/citation envelope from a product contract to internal engineering metadata (§17, §23), and the accuracy manifest to a **provenance declaration**. Adds diurnal state authoring (§25), the witness window (§26), and the Photo/Witness acceptance tests (§27).

**Scope boundary (software vs. hardware).** v3.0 draws the line between the *engine* and the *venue*. This PRD governs software only — world state, provenance, authoring, audio logic, acceptance. The physical display and audio architecture the same July 2026 working session specified (surface classes, panel-vs-LED, aperture emitters, the side-aperture pre-provision rule) lives in `../henhouse-adu`, the venue project, cross-referenced in `docs/time-machine-crossref.md` there. This document does not spec hardware; where earlier versions did, those references are demoted to pointers.

**v2.2 amendment (July 2026):** Adds **§3.5 — The Second Mode (Personal Memory Reconstruction)**, a second application of the same engine in which the source of ground truth is the guest's own photographs and memory rather than the archival record. It introduces one constitutional refinement — the **relocated-authority principle** (§3.5, §17): the Laws are not suspended in this mode, but their ground-truth source shifts from *the cited archive* to *the person whose memory it is, present to verify*. Under v3.0 this is recognizable as the Flinch Standard's own logic — the guest **is** the witness. The historical North Star (§3) is unchanged and remains primary.

**v2.1 amendment (June 2026):** Adds the **Representation Regimes** model (§17) — geometry representation is chosen per-feature by available evidence, not by a single pipeline — and codifies the **generative-world-model boundary** (§17). Under v3.0 its justification rests on date-gating (§5.6) rather than citation. All specific technologies (3D Gaussian Splatting, Unreal versions, asset generators) are deliberately kept out of this document and tracked in `ROADMAP.md`, per the §3 principle that the pipeline rides the quality curve without architectural change.

## 1) What This Is

This document is the constitution for Time Machine: product intent, non-negotiables, experience principles, and the system requirements that make it real.

If a future decision contradicts this, the decision is wrong—unless we explicitly amend this document.

## 2) Product Summary

Time Machine is a **programmable environment engine**. It recreates a specific place — historical, present-day, or authored — and renders it through surfaces that behave like real architectural apertures, with environmental audio driven by the same world state. The room becomes a portal into a coherent, living world: one universe, many windows.

The environment is not tied to one product. The immersive cartridge is simply the configuration where the environment *is* the product rather than the backdrop; the same engine can dress any room. (How the environment is *displayed* — surface count, panel classes, speaker topology — is a venue-hardware decision and lives in `../henhouse-adu`, not here.)

The engine supports:

* Programmable environments across three **provenance modes**: historical, observed, and authored (§17 Provenance Modes)
* World-state simulation (time-of-day, weather, atmosphere, environment semantics) driving a full 24-hour cycle
* Environmental audio driven by the same world state (directional, contextual, non-looping, period-aware)
* Multi-surface coherence where the configuration calls for it (directional accuracy + synchronization + exposure/color coherence)
* Content presets that are versioned and operable by non-technical staff

## 3) The Dream State (North Star)

The best expression of Time Machine is **being inside a photograph, and staying there for a day.**

You look out and the place is real — not a documentary reconstruction of it, but the place, at that hour, in that weather, with that light and those sounds. You can navigate it naturally — walk alleys, cross plazas, look down streets — and every cue agrees. The weather is what actually happened that day. The buildings are what actually stood there. The sounds are what you would actually have heard. Then the hour moves: the light changes, the signs come on, the street empties and refills, the soundscape hands off from day to night, and none of it tells you it is a screen.

The places are programmable — 1970s Chinatown, Fremont Street in 1958, 1985 Baton Rouge, Lake Oconee at 6am, snowy woods. The engine does not care which; it cares that the place is coherent. A research layer still does the work of establishing what was there — weather records, fire insurance maps, photographs, ornithological surveys, newspaper archives, published music catalogs — but under v3.0 its output is *gates and content that feed the scene*, not a cited dossier that certifies it (§23).

**The measure is a person, not a source.** Someone who was actually there sits in the room and does not flinch. That, not a footnote, is what "accurate" means here (§5.0).

Every cue agrees:

* Period-accurate lighting
* Authentic weather for that place/time
* Period-accurate environmental sounds
* Period-accurate speech and slang
* Period-accurate media
* Period-accurate brands and products
* Period-accurate materials and physics (down to how objects sound when they contact surfaces of the era)

Coherence is the true north. Not "vibes." Not "close enough." The bar is a witness who does not flinch — a harder standard than a citation, and pointed somewhere useful (§5.0).

### §3.1) The Photograph Is the Spec

A dated, located photograph is not reference material. It is the specification.

A single frame already contains what archival research reassembles from scattered sources and mostly fails to recover: exact signage and typography, the specific colors of awnings and paint, how much sky the fire escapes eat, light quality, what people wore and how they stood, what was stacked on the sidewalk. No fire-insurance map contains any of that. The photograph contains all of it at once, and it is self-validating — the evidence *is* the brief.

The pipeline therefore runs:

```
Photo (dated, located)
  → reconstruct the view in frame
  → extend procedurally beyond frame edge
  → author the other 23 hours (§25)
  → drive with weather, sound, motion
```

This inverts the v2 pipeline (Place × Time → research → assemble → generate → validate). Research does not disappear — it moves downstream, and its job changes from *establishing what was there* to *filling what the frame does not show and gating what may appear.*

**Where no dated frame exists** — a demolished side street known only from a Sanborn footprint and a stereograph of the wrong block — the photo cannot be the spec, and the procedural + archival regime (§17) carries the scene as it did under v2. Photo-first is the *primary* mode wherever a dated frame survives, not the only one. What both modes answer to is the same witness.

**Product definition, one sentence: make me be inside this photograph.**

### Visual Fidelity Bar

The visual quality target is the best real-time and near-real-time rendering in the world: Crimson Desert (Pearl Abyss), Red Dead Redemption 2 (Rockstar), The Mandalorian virtual production (ILM StageCraft), The Last of Us (Naughty Dog). These productions share a common trait: every surface has material depth, every scene has atmospheric density, nothing is clean, and light behaves correctly. That is the bar.

This is not aspirational hand-waving. The gap between procedural reconstruction and hand-authored AAA content is real today — but it is closing fast. AI-generated 3D assets, materials, and textures are on a trajectory where the quality ceiling rises every quarter. The pipeline is designed to ride that curve: agents assemble what goes where, then the best available generation technology produces the assets. As AI model quality improves, the same pipeline produces better output without architectural changes.

The implication: invest in *systems* (material libraries, weathering functions, vegetation placement, atmospheric particles, lighting pipelines) rather than hand-crafting individual assets. Systems scale. Hand-crafted assets don't. When AI-generated assets reach parity with hand-authored ones, a system-driven pipeline will match AAA quality at any location and any era — something no hand-authored production can do.

A note on which curve bent: as of 2026 the steepest quality gains are in **capture-based reconstruction** (neural/splat techniques that reconstruct a photorealistic scene from imagery) rather than in polygonal mesh generation alone. This does not change the principle — it sharpens it. Where photographic evidence exists, capture is now the best system; where it does not, procedural reconstruction remains the only system. The pipeline must therefore choose the right representation per feature (see §17, Representation Regimes), and stay loosely coupled to whatever produces the best result this quarter.

Examples of the bar:

* Turn on a radio in 1981: only songs released on or before that date exist. DJ tone and slang are era-correct. Ads are era-correct.
* "News at noon, 6, and 10" appears only where/when that phrasing was common.
* "Groovy" shows up only in its actual era window.
* "Pop vs soda vs coke" is location + time specific, not a generic Americanism.
* Car horns, church bells, fog horns, work whistles—all period-correct.
* Stand at street level in 1884 Manhattan: Lumen GI bounces warm afternoon light into an alley between brownstones. Water stains streak below every cornice. Cobblestones have grass in the mortar joints. Coal smoke trails from chimneys. A shop awning ripples in the wind. Gas lamps glow with moth halos at dusk. It looks like a place where people live, not a diagram of where buildings were.
* Walk a 1978 Baton Rouge suburb: the concrete driveway has oil stains and crabgrass in the expansion joints. Vinyl siding is sun-faded on the south face. A garden hose is coiled by the spigot. Cicadas pulse in the live oaks. It doesn't look generated — it looks remembered.

Rule: Missing detail is forgivable. Incorrect detail breaks trust.

## 3.5) The Second Mode — Personal Memory Reconstruction

The North Star (§3) points at *history* — any Place × Time, assembled from the archival record, for anyone. The same engine, pointed at a different source of truth, produces a second thing that may matter to people even more: **a day you can walk back into.**

A guest brings photographs of a place that mattered to them and the date it happened — a wedding, a childhood home, a grandparent's shop, a last summer. Time Machine reconstructs that specific place and re-creates the true environment of that specific day, and the guest sits inside it again. Not a slideshow. Not a recreation "in the style of." **The actual day.**

### The division of truth: the guest supplies the *what*, Time Machine supplies the *when*

This mode works because responsibility splits cleanly, and each half is sourced from what is actually good at it:

* **The guest supplies the *what*** — the place, as geometry. Their photographs are the **primary source**: they establish the space and how it was dressed that day — the flowers, the arch, the arrangement of a room. The photograph is the spec here exactly as it is in §3.1.
* **Time Machine supplies the *when*** — the true environment of that date, from the same factual engine that drives historical mode. The **real weather** that day (NOAA records reach back to the 1800s), the **season's real sound** (cicadas in an August dusk, the birds that were actually singing), the **wind**, the **light** — the golden hour as the evening actually ran long. This is the product's most mature capability, and here it does exactly what it was built to do: make the environment *true*, not evocative.

"Sit in that day" is therefore not a metaphor. The world outside the windows is the world that was actually there. The room within is the room the guest remembers. Every cue still agrees (Law 5.1) — it is simply a different day being made coherent.

### The relocated-authority principle

Historical mode forbids invention (Laws 5.5, 5.6) because there is a knowable ground truth in the archival record that invention would *falsify*. Memory reconstruction fills in what the photographs did not capture — the far wall, the back of the room. This is not a violation of those Laws; it is those Laws operating under a **different authority.**

In historical mode, the arbiter of truth is **the archival record.**
In memory mode, the arbiter is **the person whose memory it is, present to verify.**

Under v3.0 this is not a separate principle but the Flinch Standard (§5.0) at its purest: the witness is not someone we go find who happened to be there — the witness is the guest, sitting in the room, verifying in real time. Memory mode is the case where the person who would flinch is the customer.

Filling in the unseen wall is not falsifying history — it is *collaboration with the memory's owner*, who can say "no, the light came from the other side" and be right. The Laws still bind: **Silence Over Wrongness becomes deference to the person over wrongness** (where the guest is unsure, the system stays neutral rather than inventing a confident detail), and **No Anachronisms still holds absolutely** (nothing from after that date leaks into that date). What changes is only the *source* of ground truth, not the obligation to it.

### What this mode reconstructs — and what it must never

Memory reconstruction rebuilds a **place and a day.** It does **not** synthesize people.

The guests in the memory are the real people who physically return to the room — not AI recreations of them, and never a resurrection of the deceased. Time Machine reconstructs the church, the weather, the cicadas, the cake on the table; it does not generate a likeness of the person who sat at that table. This is a bright ethical line, not a technical limitation, and it is a **non-negotiable** of this mode. The product returns people to a place. It does not return people to people.

### Why it is buildable — and buildable early

The mode softens the two hardest problems in the historical program:

* **The photographs are the spec — here as everywhere (§3.1).** *(v3.1)* The guest's photographs are the **primary source and the authority** for the reconstruction: the ingredients, not a quality check — and, as under v2.2, still the **date evidence** that anchors the day. Because the photographs are family photographs, they will contain people; persons in frame are **excluded from reconstruction**, and their presence in the source is not a license against the no-synthesized-people law below. Sparsity is survivable here in a way it is not in historical mode, for two reasons the archive can never supply. First, when the venue still stands, a dense present-day capture — possibly a guest-captured walkthrough; intake mechanics are an open product question — provides **supporting scaffolding** for what the photographs under-cover; it carries post-date reality (a later renovation, new signage, a tree since planted) and is therefore **reconciled to the photographs and the memory's date, never the reverse.** Law 5.6 (No Anachronisms) governs the result exactly as it governs the historical core. Second, the memory's owner is present to verify the fill — the relocated-authority principle carries what neither source covers. The remodeled sanctuary, the gutted childhood home, and the demolished reception hall are first-class cases of this mode, not exceptions: there, the photographs plus the guest's verification *are* the whole record. First-class does not mean equally cheap — the still-standing venue remains the early, buildable case; the photographs-only case leans on reconstruction capability still maturing.
* **No relighting-of-history puzzle for the shell** — though the guest will want that day's actual evening light, which is why the hero structure favors relightable representation (mesh + PBR) over frozen capture, consistent with the Representation Regimes model (§17).

The engine that makes each bespoke reconstruction affordable rather than an artisan project is the automation already built for historical mode — scene bootstrap, the capture pipeline, the profile assembler. Historical mode scales *breadth* (any place, automatically). Memory mode scales *depth* at the places people care about most. They are complementary uses of one system.

### The sensory completion (dream-state extension)

Memory mode makes the strongest case for extending "every cue agrees" (Law 5.1) into the two senses the platform does not yet reach — **smell and taste** — because smell is the sense most directly wired to memory. This decomposes into two distinct workstreams, not one:

* **Ambient scent is an environmental cue** — flowers, fresh bread, rain on stone, June air. It belongs on a venue control-plane actuator (e.g., container-os) as another WorldState-driven output, exactly as fog or wind-audio are: *WorldState → scent.* No partner required.
* **Food and drink is a hospitality service** — the actual cake, the actual meal, recreated through partners (a recreation-specialist bakery, a caterer). This is business development, not rendering, and it is what turns the room from an immersive display into a full-sensory venue.

Both are dream-state, not v1. They are recorded here because this mode is where they become obvious.

### Exit criteria (the day, made real)

Five years on, the couple returns to the room — with the people who were actually there. Outside the windows is the church where they married, captured true. The light falls exactly as it fell that June evening, because the system knows the sun's real position on that date. It is warm, because it actually was. A cicada drone rises as the light goes gold, because that is the season that was. On the table is the cake — the real one, recreated by a partner from the couple's own photographs — and there are drinks in their hands. Nothing is anachronistic. No one has been synthesized. They are simply, again, in that day.

## 4) The Experience Promise

Time Machine must feel like:

* You are inside a real room.
* Outside that room is a real world.
* Windows are not screens; they are portals with physics.
* Sound is not a soundtrack; it's the outside world bleeding in.

If someone says "It felt like a display," we failed.

## 5) Non-Negotiables (The Laws)

These are the product's "Haunted Mansion rules." They do not get negotiated away during implementation.

### 5.0 The Flinch Standard (governing law)

**Would someone who was there flinch?**

Every scene has a witness — a person who lived that place at that time. Accuracy is worth exactly what it costs to prevent their flinch, and nothing beyond that.

Nobody fact-checks a room; everybody feels wrongness. No guest will catch a mis-attributed source. Every guest will feel a synthesizer in 1958, a seagull a mile from open water, cicadas singing at midnight — instantly, and without being able to say what is wrong.

This law governs every other law in §5. Where a rule serves the flinch, keep it. Where it serves the record, cut it. **This is not a lowered bar. It is a harder one, pointed somewhere useful** — documentation is checkable and forgiving; a witness is neither.

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

If we can't render a detail convincingly, we reduce density rather than assert it—we must be neutral, not incorrect.
(Examples: fewer events, generic ambience over specific signage, massing over modeled facade.)

Justification under §5.0: an asserted wrong detail flinches; an absent detail does not. Absence reads as the ordinary emptiness of a real place; wrongness reads as a mistake. The law is unchanged in practice and now rests on perception rather than on epistemic honesty.

### 5.6 Date-Gating Is Absolute

Nothing may appear in a scene that did not exist at the WorldState date — language, UI metaphors, products, media, signage, behaviors. This is mechanical, automated, and admits no exception.

The Phase 4.5 music rule — nothing released after the scene date, enforced automatically, no manual curation for the hard cutoff — is the model. **Generalize it to every asset class:**

| Class | Gate |
|---|---|
| Music | Release date ≤ scene date |
| Vehicles | Model year ≤ scene date |
| Signage & typography | Introduction date ≤ scene date |
| Materials & surfaces | Availability date ≤ scene date |
| Clothing | Period bracket contains scene date |
| Technology & infrastructure | Installation date ≤ scene date |
| Language & speech | Regionally and generationally correct for scene date |
| Wildlife | Species present *and seasonally and diurnally active* at scene date |

Date-gating is cheap, mechanical, and does more to prevent flinch than any other single mechanism. **It is the one place where rigor pays for itself at scale.**

Wildlife gating is not a footnote. A Georgia scene running annual cicadas at 10pm is wrong to every person who grew up there — cicadas are temperature-gated daytime singers and katydids hold the night. Periodical broods run on a 13-year clock in the South; rendering that chorus in a year the brood was not out makes a false claim about a specific summer to someone who was there for it. Both gates take inputs the weather engine already produces.

### 5.7 Audio Is Essential and Invisible

If muting audio makes the illusion collapse, that means audio is doing its job.

## 6) Product Goals

### G1 — Coherent Universe (Audio + Visual)

One simulation clock. One weather state. One sun position. Deterministic procedural systems.

### G2 — Spatial and Directional Accuracy

Window views match cardinal orientation and physical placement. Audio feels anchored to "outside space," not stuck to speakers.

### G3 — Believability (AAA Visual Fidelity + Psychoacoustic Realism)

The visual bar is AAA real-time rendering: Crimson Desert, Red Dead 2, The Mandalorian, The Last of Us. Every surface has material depth and weathering. Atmosphere is volumetric. Light bounces correctly. Nothing is clean. Nothing is empty. The audio bar is psychoacoustic realism: non-looping, spatially anchored, era-correct, and invisible. See Section 3 (Visual Fidelity Bar) for the full statement.

### G4 — Operability

Non-technical staff can run sessions, select presets, and recover from errors using guided flows.

### G5 — Scalability of Content Without Destroying Quality

A content pipeline that supports growth while enforcing accuracy constraints.

## 7) Non-Goals (for v1)

* Perfect multi-person individualized binaural rendering.
* Infinite global coverage at AAA quality from day one. (AAA fidelity is the goal, but it scales city-by-city, not everywhere at once.)
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
6. **Memory Reconstruction Mode** — "Our wedding — St. Mary's — that June evening." Guest-supplied geometry and date dressing, fused with the true weather, light, and soundscape of the actual day (§3.5). One-to-one, bespoke, authored under the guest's authority rather than the archive's.

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
11. **Geographic Data Pipeline** — Real-world terrain, elevation, and satellite imagery ingestion from geographic data services into Unreal Engine

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

The engine treats every surface as a **camera into one world**. How many surfaces there are, at what pixel pitch, on what panel technology, and how they are wired is a **venue-hardware decision** and is specified in `../henhouse-adu` (surface classes, panel-vs-LED, wiring), not here. This section governs only what the software must do to make any such surface read as an aperture rather than a screen.

### Surface Model (software view)

Each surface the engine drives has:

* Surface ID
* Physical position in room coordinates (x,y,z) and orientation (yaw/pitch/roll) — supplied by the venue calibration profile
* A **scene-authored opening shape.** An aperture is authored content: the scene masks the surface down to an opening it defines — a tenement window, a shop front, a bay onto water — so that in a dark room the unlit area reads as real wall, not as the edge of a display. This is a rendering/authoring responsibility; the hardware property that makes it possible (true per-pixel black) is an adu concern.

Concrete display specs (size, resolution, color profile, max nits, black performance) are hardware and live in the venue spec, not in this document.

### Rendering Requirements

* Each surface is a camera into the same world with correct relative transform and off-axis projection.
* Exposure/white balance match across surfaces.
* Motion coherence across the gaps (clouds, shadows, precipitation, moving objects).
* Single machine, single Unreal process at install scale (see §17 Topology) — no nDisplay, no genlock, no drift detection at this scale.
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

The physical speaker topology — driver type, count, placement, aperture-anchored emitters, room acoustic treatment — is a **venue-hardware decision specified in `../henhouse-adu`**, not here. This section governs the software: how the engine positions sound in the world, independent of how many drivers realize it.

Software behavior (minimum: 4-zone N/E/S/W mapping, more where the install provides it):

* Panning based on world azimuth relative to room orientation
* Distance cues via EQ roll-off and dynamic shaping
* Conservative reverb tuned for "outside," not "cathedral"
* **Anchored near-field events vs. the ambient bed are routed separately.** The bed (wind, rain, room tone, distance, thunder) and anchored near events (hooves, a vendor, a shutter, a door) are distinct routing classes so that a near event can originate exactly where the eye sees it. The engine emits this distinction; whether the install has dedicated aperture emitters to receive it is an adu concern. Where it does not, anchored events fall back to the nearest zone.

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

### 14.5 Period Music System

Music is date-locked to the exact WorldState date — not the year, the day. If the simulation is July 4, 1978, no recording released after July 3, 1978 may play. This is a hard constraint enforced by the system, not a guideline.

The system uses a two-layer architecture:

**Date Authority Layer** — Determines what music is eligible. Uses MusicBrainz (open music metadata database with exact release dates and Lucene-based date range queries) as the primary source of truth. Given a WorldState date, location, and locale context, produces a set of valid recording identifiers (MusicBrainz IDs + ISRCs). This layer enforces:

* **Hard date cutoff:** No recording with a release date after the WorldState date. Recordings without a verified release date are excluded (Silence Over Wrongness).
* **Geographic availability:** Was this record available in this market at this time? A 1978 Japanese pressing that never reached US shelves doesn't play on a Baton Rouge radio.
* **Contextual filtering:** What would actually be heard in this locale? Genre, format (AM/FM radio, jukebox, street performer repertoire), and cultural context narrow the pool. A 1978 Baton Rouge afternoon skews Southern rock, R&B, country, gospel — not London punk.
* **Pre-recording era handling:** For dates before commercial recordings (~pre-1890), the music layer shifts to sheet music catalogs, known performer repertoires, and instrument-appropriate selections (barrel organ cylinders, brass band standards, parlor piano). These are curated, not streamed.

**Playback Layer** — Resolves validated recording identifiers to a streaming service for actual audio playback. Spotify and Apple Music both support ISRC-based lookup. This layer handles authentication, playback control, and streaming service abstraction. The playback layer is swappable — the date authority is the product, the streaming service is a commodity.

The music system adds a `musicRadio` control to WorldState, driven by the locale preset. This control specifies format (radio station format, jukebox, street performer, none), genre weights, and whether music is diegetic (coming from a radio in the scene) or non-diegetic (ambient underscore). For the fixed-room installation, diegetic radio is the primary mode — the music comes from "a radio in the next room" or "a passing car." For headset experiences, spatial positioning anchors the music source in the world.

### 14.6 Authenticity QA — the Provenance Declaration (Required)

Under v3.0 the **Accuracy Manifest is replaced by a Provenance Declaration.** It no longer certifies facts against sources; it declares what the scene *is* and what gates it runs under. The old citation-and-confidence dossier served an auditor no guest ever reads (§5.0, §23); it is not a product requirement.

Every scene declares:

* Provenance mode: historical / observed / authored (§17)
* Date/time window and location scope
* The **gates in force** — the date-gating cutoffs per asset class (§5.6): media, vehicles, signage, materials, clothing, technology, language, wildlife
* Music catalog: date cutoff, genre weights, format
* Where density was reduced under Silence Over Wrongness (§5.5) — i.e. what the scene deliberately does *not* assert

Source citations and the verified/likely/interpolated/assumed confidence taxonomy are **not** part of this declaration. Where confidence is genuinely useful as internal engineering metadata — the representation selector's evidence thresholds (§17) — it stays inside that module as an implementation detail, not surfaced, stored as a contract, or promised to anyone.

## 15) Presets and Content

### Preset Definition (Versioned Bundle)

A WorldPreset includes:

* Environment scene + asset references
* Lighting/atmosphere config
* Weather mode config (live/historical/curated)
* Activity density parameters
* AudioProfile (layer rules, directional sources map, event scheduler config)
* MusicProfile (format, genre weights, date authority source, playback config)
* Optional narrative script (timed transitions)
* Provenance Declaration (§14.6) — mode, date window, gates in force

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
│  Audubon │ Census │ Photo Archives │ Sheet Music │       │
│  MusicBrainz │ Spotify │ Apple Music                     │
└─────────────────────────────────────────────────────────┘
```

### Core Principle: Everything Hangs Off WorldState

WorldState is the single source of truth for every renderer. It doesn't care whether its inputs come from a live API, a 1940s weather archive, an 1884 NOAA daily observation reconstructed into hourly curves, or a hand-curated preset. The downstream pipeline is identical.

This means every new capability — pre-1940 weather, historical soundscapes, period-accurate urban geometry — plugs into the same architecture. We never rebuild the engine. We feed it richer inputs.

### Environment Profiles (Place × Time)

An Environment Profile is the complete description of a place at a moment in history. It replaces the simpler "locale preset" concept as the system matures. A profile contains:

| Layer | What It Describes | Example: NYC 1884 |
|-------|-------------------|-------------------|
| **Terrain** | Elevation, landform, water bodies — the physical ground truth | USGS DEM + Cesium terrain tiles for Manhattan island; unchanged across eras |
| **Weather** | Hourly atmospheric conditions | NOAA Central Park daily obs → interpolated hourly |
| **Soundscape** | Audio profile: beds, directional, micro-events, weather sounds | Horse hooves on cobblestone, barrel organs, house sparrows |
| **Urban Form** | Physical environment: buildings, streets, infrastructure | Sanborn maps → block massing, brownstone facades, gas lamps |
| **Ecology** | Flora and fauna present at that place/time/season | Audubon records → species pools with seasonal/diurnal weights |
| **Culture** | Language, commerce, social patterns | Slang dictionaries, newspaper archives, brand availability |
| **Music** | Date-locked music catalog, format, genre context | MusicBrainz catalog filtered to exact date + locale; barrel organ repertoire (pre-recording era) |
| **Materials** | Surface types that affect sound and visual character | Cobblestone, dirt, granite flagstone, wood plank, brick |
| **Infrastructure** | Technology present: lighting type, transport, utilities | Gas street lamps (electric only on Broadway below 14th), elevated railway, horse-drawn carriages |

Each layer declares its **provenance mode** and, where it reduced density rather than assert a detail, what it left out (Silence Over Wrongness, §5.5). Per-fact confidence ratings and source citations are not a layer contract under v3.0 (§14.6, §23); confidence survives only where a module genuinely consumes it as an engineering input (e.g. the representation selector below).

### Representation Regimes

Geometry is not produced by a single pipeline. The right way to represent a building, street, or landform depends on **what evidence survives for that specific feature**, and the system chooses per feature. The selector consumes evidence as an internal engineering input (the one place confidence survives under v3.0 — §14.6, §23); it is not a contract the profile publishes.

There are two regimes:

* **Capture regime** — for features where the real thing can be reconstructed from imagery: present-day scenes, recent eras, and any structure that still stands. Here the best representation is a photoreal reconstruction built from photographs or aerial capture. This is the strongest path *when the evidence exists*, and it is improving fastest. It is also the path that benefits automatically from external platform progress (mapping providers, capture services) at no architectural cost.
* **Procedural + archival regime** — for features where the real thing no longer exists and was never photographed in a reconstructable way: pre-photographic eras, demolished blocks, changed coastlines. Here representation is assembled from archival record (historical maps, written description, era material libraries) through procedural systems. This regime is the product's **moat** — it is the only path that works where capture cannot reach, and no mapping platform solves it.

The decision is per feature, not per scene. A single 1884 street may contain a surviving church reconstructed from archival photographs (capture), alongside a demolished tenement assembled from a fire-insurance footprint (procedural). The selector is evidence, expressed as confidence:

```
survives today + imagery available        → capture
hero feature + historical photographs     → capture from archival imagery
demolished / no usable imagery             → procedural + archival
low confidence everywhere                  → reduce detail (Law 5.5), do not invent
```

**The generative-world-model boundary.** Generative world models — systems that *invent* navigable environments from a prompt — remain **out of bounds for the historical and observed regimes**. Under v3.0 the reason is no longer citation. It is that **they cannot be date-gated (§5.6).** A generative model asked for 1958 Fremont Street will produce a plausible sign in a typeface introduced in 1971, a car body that never existed, a fixture from the wrong decade — and it has no mechanism to know it did. It produces anachronism it cannot detect, which is precisely the failure §5.6 exists to make impossible. They remain usable where invention is honest: present-day or live scenes, distant background no source covers, and the authored regime (§17 Provenance Modes), where there is no date to violate.

Both regimes feed the same Environment Profile and hang off the same WorldState. As with weather inputs, the downstream pipeline does not care which regime produced a given feature — only that its provenance is recorded (§14.6).

**Authority in memory mode.** The boundary above governs the *historical core*, where the archive is the arbiter and invention is forbidden. In Personal Memory Reconstruction (§3.5), the arbiter is the guest, present to verify — so filling in geometry the guest's photographs did not capture is permitted, because it is corrected against a living authority rather than fabricated against a cited one. *(v3.1)* The selector's `survives today + imagery available → capture` rule is subordinated in this mode: present-day capture of a still-standing venue yields **supporting scaffolding, not authority** — the guest's photographs and the guest's verification outrank it, and the capture is reconciled to them (§3.5). The provenance discipline is unchanged: contributed geometry and dressing are recorded as guest-authored in the same provenance declaration (§14.6). Memory mode reconstructs place and environment only; it never synthesizes people (§3.5).

### Provenance Modes

Provenance is declared per scene. It determines what "correct" means, not how much correctness is required — **the flinch bar (§5.0) is identical across all three.**

| Mode | Truth standard | Characteristic failure |
|---|---|---|
| **Historical** | Date-gated, witness-verified | Anachronism |
| **Observed** (present-day, natural) | Geographic, meteorological, ecological fidelity | Generic-looking place |
| **Authored** (fiction, licensed IP) | Canon fidelity to the source work | Off-model |

**Observed is not the easy mode.** Fewer surfaces can flinch, but each carries far more of the guest's attention and there is nothing to hide behind. In Chinatown, slightly wrong birds are masked by neon, traffic, a radio, conversation, truck idle. At Lake Oconee at 6am the soundscape *is* the scene, and one wrong bird is not one percent of what is perceived — it is a third of it. Visually the same inversion holds: brick and signage is tractable geometry; water, wind-driven vegetation, and dappled canopy light are the hardest problems in real-time rendering, and the natural scene is all three at once with nothing else to look at.

The provenance declaration (§14.6) states which mode a scene runs under. That is the whole of what it declares about truth — not an evidence audit.

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

For the first physical install (the 2–3 window concept trailer), this topology collapses onto a **single workstation running one Unreal process** — which keeps all windows frame-synchronized for free (Law 5.3) without genlock hardware. Master/Render/Audio nodes scale out to separate machines only when window count grows past what one GPU can drive. See `docs/roadster-trailer-hardware.md` for the concept-trailer compute/display/audio spec and install (electrical/thermal/rack) considerations.

### Rendering

* Unreal Engine as the renderer (best path to photoreal real-time skies/lighting/atmosphere).
* Multi-node rendering recommended for multi-window scaling.
* Scene geometry sourced from Environment Profile urban form layer.

### Sync

* Clock discipline across nodes (minimum: network time sync with drift correction; upgrade path to tighter sync solutions).

## 18) Geographic Data Pipeline

The Geographic Data Pipeline solves a foundational problem: before you can place buildings, streets, or vegetation, you need the actual terrain. Type in "Grand Canyon" or "Manhattan" and the system pulls real-world geographic data — elevation, terrain, satellite/aerial imagery — and builds the Unreal landscape from it. Man-made structures, period detail, and environment dressing come after, layered on top of ground truth geography.

### 18.1 Pipeline Overview

```
Location input (string or coordinates)
        ↓
Geocode → lat/lon + bounding box
        ↓
Fetch geographic data layers:
  • DEM / elevation (heightmap)
  • Satellite / aerial imagery (texture)
  • Vector data (roads, water, land use)
  • 3D building footprints (where available)
        ↓
Transform to Unreal-compatible formats:
  • Heightmap → Landscape actor
  • Imagery → Landscape material (base layer)
  • Vector → spline guides for roads, water bodies
  • Buildings → mesh volumes
        ↓
Unreal Landscape assembled automatically
        ↓
Layer in man-made / period content on top
```

### 18.2 Data Sources

| Source | Data Type | Coverage | Resolution |
|--------|-----------|----------|------------|
| **Google Earth / Google Maps** (Photorealistic 3D Tiles) | 3D terrain + building mesh + photographic texture | Global urban areas | Sub-meter in cities |
| **Cesium Ion** (3D Tiles, quantized mesh) | Terrain, 3D buildings, imagery | Global | 1-30m terrain, sub-meter in cities |
| **USGS 3DEP** (via National Map) | Bare-earth DEM (LiDAR-derived) | Continental US | 1m (LiDAR areas), 10m (full US) |
| **Mapbox Terrain** | RGB-encoded heightmaps + vector tiles | Global | ~5m |
| **OpenStreetMap** | Vector: roads, buildings, land use, water | Global | Crowd-sourced, variable |
| **Bing Maps** | Aerial imagery | Global | 15cm in urban areas |
| **USDA NAIP** | Aerial ortho-imagery | US agricultural + urban | 60cm |

### 18.3 Unreal Integration Model

**Landscape from Heightmap:**
The pipeline fetches DEM/elevation data for the target area, converts it to a 16-bit heightmap, and imports it as an Unreal Landscape actor. Landscape size scales to the bounding box — a city block vs. the Grand Canyon are different scales with different LOD strategies.

**Terrain Material from Imagery:**
Satellite or aerial imagery becomes the base landscape material. For present-day scenes this is direct. For historical scenes, the aerial imagery serves as a layout reference — the material gets swapped for period-appropriate textures, but the terrain shape remains (terrain doesn't change on human timescales).

**Vector Data as Guides:**
Roads, water bodies, and land-use boundaries from OSM or similar become spline actors or landscape layer masks in Unreal. These guide procedural placement: roads get road materials, water polygons get water shaders, parks get vegetation scatter.

**3D Buildings (Modern Baseline):**
Google's Photorealistic 3D Tiles or Cesium OSM Buildings provide modern building geometry. For present-day scenes, this is usable directly. For historical scenes, it provides a reference for what's there now — the historical pipeline (Phase 5) replaces buildings with period-accurate versions, but the modern data tells you lot lines, street widths, and general urban density.

### 18.4 The Historical Layering Model

The geographic pipeline and the historical pipeline are complementary:

1. **Terrain is timeless** — The Grand Canyon in 1884 had the same elevation profile as today (geological timescales). Fetch modern DEM, use it directly.
2. **Street grid is semi-stable** — Manhattan's street grid was laid out by the Commissioners' Plan of 1811. Modern vector data gives you the grid. Historical maps tell you which streets existed and what they were surfaced with.
3. **Buildings change** — Modern 3D building data is a starting point, not the answer. For historical scenes, Sanborn maps (Phase 6) replace modern buildings with period footprints. For present-day scenes, the 3D tiles are the answer.
4. **Vegetation changes** — Modern land cover is a starting point. Historical ecology data (Phase 4) overrides it with period-accurate flora.

The key insight: **fetch the real geography once, then dress it for any era.** The terrain and street grid are the foundation that persists across time. Everything above ground level is era-specific content layered on top.

### 18.5 Cesium for Unreal (Primary Integration Path)

Cesium for Unreal is the most mature pipeline for streaming real-world geographic data into Unreal Engine:

* Streams 3D Tiles (terrain + buildings + imagery) directly into the Unreal scene
* Supports Google Photorealistic 3D Tiles as a tile source
* WGS84 georeference system — place the Unreal origin at any lat/lon and the world builds around it
* Level-of-detail streaming — loads detail as needed, handles Grand Canyon and city block scales
* Open source plugin, production-ready

For Time Machine, Cesium provides the fast path: type a location, the plugin places you there with real terrain and (where available) real 3D buildings. From that starting point, the historical content pipeline can selectively replace modern elements with period-accurate versions.

### 18.6 Workflow Vision

**Present-day scene (fastest path):**
1. Enter location: "Grand Canyon, South Rim"
2. Pipeline fetches terrain + imagery via Cesium/Google 3D Tiles
3. Unreal Landscape assembled automatically
4. Weather engine drives sky, lighting, atmosphere over the real terrain
5. Done — you're standing at the Grand Canyon with real weather

**Historical scene (layered):**
1. Enter location + date: "Manhattan, 1884"
2. Pipeline fetches modern terrain (elevation doesn't change)
3. Pipeline fetches modern street grid as reference
4. Historical pipeline (Phase 6) replaces buildings with Sanborn-derived period geometry
5. Historical pipeline (Phase 4) overrides vegetation and soundscape
6. Weather engine drives the atmosphere from 1884 NOAA records
7. You're standing in 1884 Manhattan on real terrain with period buildings

## 19) MVP Definition (What "Done" Means)

The software MVP is stated in experience terms, not hardware counts. Surface count and display type are defined by the venue (`../henhouse-adu`); the engine's MVP is:

**One authored scene, a full 24-hour cycle, a matched soundscape, every surface coherent as a camera into one world, and a living witness who does not flinch (§5.0, §27).**

Acceptance, against whatever surface set the venue provides:

**Visual:**
* Cardinal directions are correct.
* Exposure/white balance matches across all surfaces.
* A moving object can cross the gaps between surfaces without visible seams.
* Stable frame rate with low variance.
* The full diurnal cycle runs: light, signage, activity, and soundscape hand off day-to-night coherently (§25).

**Audio:**
* Directional beds feel anchored (east traffic feels east).
* Anchored near-field events originate where the eye sees them.
* No obvious repetition in a 30-minute continuous run.
* Weather transitions align with visuals (rain/wind coherence).
* No dropouts during a 4-hour session.

**Operations:**
* Non-technical operator can run the system.
* Calibration is repeatable and saved.
* Panic/recovery works and preserves dignity.

## 20) Success Metrics

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

## 21) Risks and Mitigations

**Risk: It still feels like TV**
* Fix black levels, exposure matching, and room lighting integration before adding "features."

**Risk: Audio sounds like a loop pack**
* Enforce large variation pools, cooldown rules, procedural scheduling, and loop-hygiene tooling.

**Risk: Drift kills coherence**
* Single master clock; explicit drift detection; graceful fallback.

**Risk: Accuracy becomes unscalable**
* Automated date-gating (§5.6) does the heavy lifting at scale — it is mechanical and needs no per-scene curator. Silence Over Wrongness (§5.5) covers the rest, and the flinch bar (§5.0) keeps effort pointed only where a witness would notice. What does not scale is the *witness* — see §26.

**Risk: Compute ceilings for the fidelity bar**
* The AAA fidelity bar is a Windows + NVIDIA target (Lumen, Nanite, Megalights, 3DGS streaming). Selecting and provisioning that compute is a **venue-hardware decision**, kept out of this PRD's body; the concept-trailer and R&D-workstation baselines are tracked in `docs/roadster-trailer-hardware.md` and `docs/rd-workstation-spec.md`, and venue integration (electrical/thermal/rack) is an `../henhouse-adu` concern.

## 22) Roadmap (From Today to the Dream State)

This roadmap is grounded in what exists today and builds toward the full vision in concrete steps. Each phase delivers a usable product. Each phase makes the next one possible.

### What Exists Today (Baseline)

Working and tested:
* Multi-provider weather pipeline: Visual Crossing (paid, ~1970+) with Open-Meteo (free, 1940+) as automatic fallback
* WorldState compiler producing states + controls for lighting, audio, atmosphere, visual
* Runtime engine with tick loop, timeline caching, state smoothing, publish cycle
* Environment Router mapping WorldState fields to downstream endpoints
* Rate limiter with EMA smoothing preventing transition pops
* Unreal integration: sun position (DirectionalLight), cloud coverage (VolumetricCloud material), fog density (ExponentialHeightFog) — all driven live from weather data
* 5-layer browser audio engine (base bed, directional, micro-events, weather, occlusion stub) with procedural synthesis fallback
* Audio profile system with Freesound-sourced assets (JSON-defined soundscape presets per locale/era)
* Freesound API fetch tool for automated audio asset sourcing and attribution
* Daemon with HTTP/WebSocket transport, browser dashboard
* State logging (JSONL) and replay tool for soak testing
* Locale preset system (`baton_rouge_suburb`, `nyc_city`)
* One complete audio profile with real audio: `baton_rouge_suburb_1978` (25 MP3 assets from Freesound)

---

### Phase 0 — Complete the Weather Loop ✅

**Goal:** One location, one era, full weather→visual+audio loop running end-to-end in Unreal.

| Step | Task | Status |
|------|------|--------|
| 0.1 | Sun position driving DirectionalLight | Done |
| 0.2 | Cloud coverage driving VolumetricCloud material | Done |
| 0.3 | Fog density driving ExponentialHeightFog | Done |
| 0.4 | Rain particles (Niagara) driven by precipDensity | Done |
| 0.5 | Ground wetness material parameter | Done |
| 0.6 | Heat distortion post-process | Done |
| 0.7 | Wind effect on vegetation/particles | Done |
| 0.8 | Full 24-hour soak test: Baton Rouge, July 4 1978 | Done |

**Exit Criteria:** Run the daemon for 24 simulated hours. Sun rises and sets. Clouds form and clear. Rain starts and stops with visible particles. Fog rolls in. No pops, no discontinuities. Logged state replays clean.

**Result:** 29 publishes over full 24-hour sim cycle, 0 violations on live engine AND replay analysis. All dispatch types verified end-to-end with Unreal Remote Control API.

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
| 3.3 | Confidence metadata | Pre-1940 data gets lower confidence scores, consumed as an internal engineering input (v3.0: internal only, not surfaced as a contract — §14.6) |
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
| 4.4 | Ecology data model | Species pools keyed to location + month + time-of-day, gated by presence and seasonal/diurnal activity (§5.6) |
| 4.5 | Cultural audio layer | Period music (barrel organ tunes, brass band in park), street vendor calls, era-correct church bells |
| 4.6 | Infrastructure sounds | Elevated railway (steam, 6th/9th Ave), horse-drawn carriages, work whistles |
| 4.7 | Agent-assisted profile research | AI agent cross-references Audubon records, historical ecology papers, period newspapers to populate species pools and cultural audio metadata |

**Exit Criteria:** Play NYC 1884 with eyes closed. No cars. No airplanes. No electrical hum. Horse hooves on stone. Church bells on the quarter hour. Sparrows, not starlings (starlings weren't introduced until 1890). Every sound is date-gated and seasonally/diurnally correct (§5.6) — the test is a witness who does not flinch, not a footnote.

---

### Phase 4.5 — Period Music Streaming

**Goal:** Turn on the radio and only hear music that existed on this exact day. Date-locked music playback driven by WorldState.

| Step | Task | Description |
|------|------|-------------|
| 4.5.1 | MusicBrainz date authority module | `lib/musicCatalog.js` — given a date, location, and genre context, queries MusicBrainz for recordings released on or before that date. Returns MusicBrainz IDs + ISRCs. Handles missing release dates (exclude), date-only vs full-precision dates, and regional release filtering |
| 4.5.2 | Locale music profile schema | Add `musicProfile` to locale presets: radio format (AM Top 40, FM album rock, jukebox, street performer, none), genre weights, era-appropriate station identity (call letters, DJ style), diegetic vs non-diegetic mode |
| 4.5.3 | `musicRadio` WorldState control | New control in WorldState compiler driven by locale preset + time-of-day. Output: current genre weight, format, whether music should be playing (e.g., radio off at 3am in a residential neighborhood) |
| 4.5.4 | Streaming playback adapter | Thin adapter that resolves ISRCs to Spotify (or Apple Music) track URIs and controls playback. Handles auth, track queue, crossfade. Swappable backend behind a common interface |
| 4.5.5 | Radio station simulation | Playback sequencing that feels like a radio station: song selection from the date-filtered pool weighted by popularity/genre, gaps between songs, era-appropriate DJ patter cadence (not generated speech — just timing and silence patterns) |
| 4.5.6 | Pre-recording era music | For pre-~1890 dates: curated catalog of period-appropriate compositions. Barrel organ MIDI renderings, brass band recordings of era standards, parlor piano. Locally stored assets, not streamed. Integrated into the same `musicRadio` control |
| 4.5.7 | Baton Rouge 1978 music test | Full integration test: run the daemon for July 4, 1978 Baton Rouge. Radio plays songs released before that date. No disco from Saturday Night Fever soundtrack (Dec 1977 — OK). No Grease soundtrack (April 1978 — OK). No "Don't Stop Me Now" by Queen (Jan 1979 — blocked). Verify 20+ song transitions with zero date violations |

**Exit Criteria:** Start a session. A radio is playing somewhere in the world. Every song on it was released before the WorldState date. Switch to 1884 NYC — the radio disappears, replaced by a barrel organ playing tunes from published 1880s sheet music catalogs. The date rule is absolute and automated. No manual curation required for the hard cutoff — only for genre/format taste.

---

### Phase 5 — Geographic Data Pipeline

**Goal:** Type a location, get real terrain in Unreal. The foundation for every visual scene.

| Step | Task | Description |
|------|------|-------------|
| 5.1 | Cesium for Unreal integration | Install and configure Cesium plugin. Georeference system wired to engine's geocode output (lat/lon) |
| 5.2 | Terrain from DEM | Fetch USGS 3DEP or Cesium terrain tiles for target area. Import as Unreal Landscape with correct elevation |
| 5.3 | Satellite imagery base layer | Fetch aerial/satellite imagery and apply as landscape material. Visual ground truth for present-day scenes |
| 5.4 | Google Photorealistic 3D Tiles | Stream Google's 3D tiles through Cesium — get photorealistic terrain + buildings for any location with coverage |
| 5.5 | Vector data ingestion (OSM) | Pull roads, water bodies, land-use boundaries from OpenStreetMap. Convert to spline guides and landscape layer masks |
| 5.6 | Location → Unreal automation | End-to-end: enter "Grand Canyon" → geocode → fetch terrain + imagery → Landscape actor built. Weather engine drives sky/atmosphere on top |
| 5.7 | LOD and scale strategy | Handle scale differences between a city block and the Grand Canyon. Streaming LOD, tile budget, view distance |
| 5.8 | Historical overlay workflow | Modern terrain as base, with tooling to swap imagery/buildings for period content. Defines the handoff to Phase 6 (Urban Form) |

**Exit Criteria:** Type "Grand Canyon, South Rim" and get a real-terrain Unreal scene with correct elevation, satellite imagery, and weather driving the sky. Type "Manhattan" and get the island with real building geometry. The terrain is the ground truth that all subsequent phases build on.

---

### Phase 6 — Historical Urban Form

**Goal:** The 3D world looks like 1884, not just sounds like it.

| Step | Task | Description |
|------|------|-------------|
| 6.1 | Sanborn map ingestion | Agent extracts building footprints, heights, materials, use-types from digitized Sanborn fire insurance maps (LOC archive) |
| 6.2 | Block massing generation | Procedural generation of building volumes from Sanborn data — correct footprints, correct heights, correct lot lines. Placed on Phase 5 terrain |
| 6.3 | Era-appropriate street layout | Cobblestone streets, dirt side streets, granite sidewalks, no asphalt. Gas lamp placement. Horse watering troughs. |
| 6.4 | Architectural style library | Procedural facade system: Brownstone rowhouse, Italianate commercial, Cast-iron front, Federal, Greek Revival — applied based on Sanborn material data + neighborhood + date |
| 6.5 | Hero building modeling | Key landmarks modeled from historical photos: Trinity Church, the Equitable Building, Brooklyn Bridge (1 year old in 1884), City Hall, Grand Central Depot |
| 6.6 | Historical photo → texture pipeline | AI-assisted: reference photo of a specific building → diffuse/normal/roughness texture maps for Unreal materials |
| 6.7 | Street-level props | Gas lamp posts, horse hitching posts, awnings, period signage — procedurally placed based on street type and neighborhood |

**Exit Criteria:** Fly through the Unreal scene. Building heights match Sanborn data. Materials match the era. Hero buildings are recognizable from period photos. Streets are cobblestone where they should be. No anachronistic materials (no steel-and-glass, no asphalt, no electric lights south of 14th Street).

---

### Phase 7 — The Agent Layer

**Goal:** AI agents autonomously research and assemble Place×Time profiles.

| Step | Task | Description |
|------|------|-------------|
| 7.1 | Profile schema specification | Formal JSON schema for Environment Profiles: all layers, all fields, provenance mode, gates in force. (v2 shipped this with confidence/citation fields; v3.0 demotes those to internal engineering metadata — §14.6, §23.) |
| 7.2 | Weather research agent | Given a place + date range, finds the best available weather data source (Open-Meteo, NOAA GHCN, reconstructed) and produces a weather provider config |
| 7.3 | Ecology research agent | Given a place + date, queries historical biodiversity records (Audubon, eBird historical, natural history surveys) and produces species pools with seasonal/diurnal weights |
| 7.4 | Urban form research agent | Given a place + date, locates Sanborn maps, historical atlases, census records, and produces a GIS-compatible urban form dataset |
| 7.5 | Cultural research agent | Given a place + date, researches period music, language/slang, commerce, social customs, and produces a cultural metadata bundle |
| 7.6 | Photo archive agent | Given a place + date, scours digitized photo archives (NYPL, LOC, Museum of City of NY, stereograph collections) and produces a tagged reference image set with location + angle metadata |
| 7.7 | Profile assembler | Orchestrator agent that invokes specialist agents and assembles a complete Environment Profile with a Provenance Declaration (mode, date window, gates in force) |
| 7.8 | Provenance declaration generator | Auto-generates the Provenance Declaration (§14.6) from agent research: mode, date window, gates in force, and where density was reduced. (Superseded the v2 "accuracy manifest" under v3.0 — §23.) |

**Exit Criteria:** Tell the system "NYC, June 15, 1884." An agent pipeline produces a complete Environment Profile — weather, soundscape, urban form metadata, cultural context, reference photos — emitting gates and content plus a Provenance Declaration (mode, date window, gates in force). A human reviews it, approves it, and the system can run it.

---

### Phase 8 — Living Street View

**Goal:** The full dream. Walk through a historically accurate 3D reconstruction driven by real weather, real soundscapes, real culture.

| Step | Task | Description |
|------|------|-------------|
| 8.1 | Walkable city blocks | Navigable street-level experience in Unreal — walk, look around, enter plazas |
| 8.2 | Acoustic environment modeling | Reverb/reflection characteristics per street width, building height, surface material |
| 8.3 | Dynamic population | Procedural pedestrians, horse carriages, street vendors — density driven by time-of-day and weather |
| 8.4 | Period-accurate lighting transitions | Gas lamps lit at dusk (a lamplighter NPC), sunrise through building canyons, candlelight in windows at night |
| 8.5 | Interactive audio anchoring | Sound sources anchored to world position — walk toward the harbor and harbor sounds grow, walk into a park and bird density increases |
| 8.6 | Multi-era support | Same city block, different year. 1884 → 1920 → 1955 → 1978 → today. Watch the city transform. |
| 8.7 | Narrative mode integration | Scripted time-lapse: sunrise to sunset, season to season, decade to decade — maintaining coherence throughout |

**Exit Criteria:** Step into 1884 Manhattan. Walk down Broadway. The sun is where it actually was that day. The weather is what actually happened. Trinity Church towers over everything because nothing taller exists yet. You hear horse hooves on cobblestone, a barrel organ on the corner, sparrows in the trees, and the distant whistle of the elevated railway. A gas lamplighter begins his rounds as the sun sets. It is raining because it actually rained that day, and the rain sounds like rain on cobblestone, not rain on asphalt. Nothing is wrong. Nothing is anachronistic. You are there.

---

### Milestone Map

```
TODAY ─── Phase 0 ─── Phase 1 ─── Phase 2 ─── Phase 3 ─── Phase 4 ── Phase 4.5 ── Phase 5 ─── Phase 6 ─── Phase 7 ─── Phase 8
          Weather      Audio+       Multi-       Pre-1940     Era        Period        Geo Data     Urban        Agent        Living
          Loop         Visual       Window       Weather      Sound-     Music         Pipeline     Form         Layer        Street
          (Unreal)     Coherence    + Spatial                 scapes     Streaming     (Terrain)                              View
          ▲                                      ▲                      ▲             ▲                         ▲
          YOU ARE                                 1884 weather           Date-locked   Real terrain              Autonomous
          HERE                                   becomes real           radio         in Unreal                 research
```

Each phase is independently valuable. Phase 0-1 is a compelling weather simulation. Phase 2 is an installation product. Phase 3-4 makes historical mode real. Phase 4.5 adds period music. Phase 5 gives you real terrain for any location. Phase 6-7 makes it historically visual. Phase 8 is the dream state.

## 23) The Agent-Driven Research Model

The ambition of Time Machine — absolute historical accuracy at arbitrary Place×Time coordinates — is impossible for humans to achieve manually at scale. The volume of archival research required for a single city block in a single year would take a historian months.

AI agents change this equation. The research model works like this:

### How Agents Build a World

1. **A human says:** "NYC, 1884"
2. **The Weather Agent** queries NOAA GHCN-Daily for Central Park station records. Finds daily high/low/precip for every day of 1884. Reconstructs hourly curves using solar position models. Outputs a weather provider config.
3. **The Ecology Agent** queries historical ornithological surveys of the NYC region. Cross-references Audubon Society records, early Central Park bird censuses, and seasonal migration data. Outputs species pools: house sparrow (year-round, high frequency), American robin (spring-fall, dawn-weighted), chimney swift (summer, dusk), etc.
4. **The Urban Form Agent** locates the Robinson Atlas of NYC (1885) and Sanborn fire insurance maps. Extracts block-level building footprints, heights, materials, use-types. Cross-references with city records for street surface types. Outputs a GIS dataset.
5. **The Cultural Agent** researches 1884 NYC: newspaper archives (street vendor calls, social customs), infrastructure records (which streets had gas lamps, the elevated railway schedule, horse car routes). Outputs cultural metadata. For the music dimension, queries MusicBrainz for recordings available at the target date and cross-references published song catalogs (pre-recording era) to build a date-locked music profile.
6. **The Photo Agent** searches NYPL Digital Collections, Library of Congress, Museum of the City of New York. Finds stereographs of Broadway, photos of Trinity Church, illustrations of the elevated railway. Tags each with location, date, viewing angle. Outputs a reference image set.
7. **The Assembler** combines all agent outputs into a single Environment Profile and emits the Provenance Declaration (§14.6): mode, date window, and the gates in force. A human reviews and approves.

### What Agents Emit

Agents emit **gates and content, not scores.** The ecology agent does not report a confidence level in its species pool; it reports which species may appear, in what season, at what hour, at what density, at what temperature. The cultural agent does not cite its sources for street-vendor calls; it produces the calls and the language they are in. The weather agent produces a driveable curve.

The source-citation requirement and the verified/likely/interpolated/assumed confidence taxonomy are **removed as product requirements** (this is the old "Accuracy Contract," deleted under v3.0 — §5.0, §14.6). Where confidence is genuinely useful as internal engineering metadata — the representation selector's evidence thresholds (§17) — it remains an implementation detail of that module and is not surfaced, stored as a contract, or promised to anyone.

Silence Over Wrongness still binds the agents: where the record is thin, they reduce density rather than assert — if the agent can't establish what birds were in Manhattan in June 1884, the ecology layer thins to regional species minus post-1884 introductions rather than inventing a specific dawn chorus. What changed is that this is now a *content* decision the agent makes, not a confidence score it reports.

This deletes a compliance department, not a research layer. The agents (ecology, cultural, urban form, photo archive, assembler) are all retained; only their citation output is gone.

### Skinning the World from Photos

The most ambitious agent capability: using historical photographs to texture 3D buildings.

The pipeline:
1. Agent finds a photograph of a specific building (e.g., the Equitable Building at 120 Broadway, photographed 1870s-1880s)
2. Photo is tagged with building ID, camera angle, approximate date
3. AI texture extraction produces diffuse/normal/roughness maps from the photo
4. Maps are applied to the corresponding building geometry (from Sanborn footprint data)
5. For buildings without specific photos, the architectural style library provides era-appropriate procedural textures based on Sanborn material data (brick, brownstone, cast iron, wood frame)

This is the "Google Street View skinned with history" concept. Modern photogrammetry gives us the geometry. Historical photos give us the surfaces. AI bridges the gap.

## 24) What We Decide Next (So This Becomes Buildable)

### Immediate (Phase 0 Completion)

1. Finish Niagara rain particle wiring to weather engine
2. Full 24-hour soak test of Baton Rouge 1978
3. Document all Unreal actor paths and dispatch types

### Near-Term Architecture Decisions

1. Canonical surface layout (count, size, placement, cardinal mapping) — **venue-hardware decision, owned by `../henhouse-adu`** (§12). The engine consumes it via the calibration profile; it does not make it.
2. Canonical speaker topology (zone count, driver placement, aperture emitters) — **venue-hardware decision, owned by `../henhouse-adu`** (§13.3). The engine emits directional/anchored audio against whatever the install provides.
3. Audio engine deployment model (browser WebAudio vs. native DSP vs. hybrid) — genuinely software, and this document's to decide.

### Research Spikes (Can Start Anytime)

1. **NOAA GHCN-Daily feasibility:** Can we get usable hourly reconstructions from daily observations for 1884 NYC?
2. **Sanborn map parsing:** What's the realistic pipeline from scanned Sanborn pages to GIS building footprints?
3. **Historical ecology data:** How complete are pre-1900 species records for major US cities?
4. **AI texture generation:** Current state of the art for photo→PBR texture extraction from a single historical image?
5. **MusicBrainz date precision:** How complete are exact release dates (day-level) for US releases in the 1970s-80s? What percentage are year-only vs month vs exact day? How does coverage degrade for pre-1950 recordings?
6. **Streaming API ISRC resolution:** What percentage of MusicBrainz ISRCs resolve to playable tracks on Spotify vs Apple Music? Are there rate limits or licensing gaps that would block a "radio station" use case with continuous playback?
7. **Geographic data pipeline:** Evaluate Cesium for Unreal + Google Photorealistic 3D Tiles as the terrain/building ingestion path. Key questions: API access and licensing for Google 3D Tiles, Cesium Ion tile budgets at scale, DEM resolution for natural terrain (Grand Canyon, coastlines), workflow for converting streamed 3D tiles into editable Unreal Landscape actors (vs. runtime streaming only), and feasibility of selectively replacing modern buildings with historical geometry on top of the same terrain base.

Pick the physical specs and Phase 0 is locked. Start the research spikes and Phase 3-6 planning becomes concrete.

## 25) Diurnal State Authoring

The photograph is one keyframe. It is ground truth for a single instant and silent about the other twenty-three hours.

1970s Chinatown at 10pm is a different image entirely: neon lit, restaurant interiors glowing through glass, the truck and crates and dolly gone, the sidewalk crowd thinner and moving differently, fire escapes reduced to black shapes against lit windows. None of that is in the frame.

Each scene therefore carries **state declarations the photo cannot supply:**

* Which signage is lit, and on what schedule
* Business open/close hours by establishment
* Traffic density curve across the day
* Pedestrian density and behavior curve
* Which surfaces are wet-capable, and how they read wet
* Lighting handoff points (dusk ignition, dawn extinguish)
* Soundscape handoff points (the day-to-night species and event exchange)

This is the visual counterpart to `activityMultiplierAt()`. The machinery exists on the audio side and does not yet exist on the render side — scoping it is an open item.

**Photo is truth for one state. The day is authored.**

**Canonical hour.** Some places live at one hour. Fremont Street at noon is a mediocre scene; Fremont Street at dusk is the reason anyone came. Scenes may declare a canonical hour, and the 24-hour cycle exists partly so that arriving at it feels earned rather than staged.

## 26) The Witness Window

The Flinch Standard (§5.0) has teeth only where a witness is alive.

Someone who was eight on Fremont Street in 1958 is seventy-six. Someone who worked Mott Street in 1972 is in their seventies or eighties. These people are findable now — neighborhood historical societies, church congregations, the "I grew up in ___" groups that exist for every neighborhood in America. In fifteen years many of these scenes move from *verifiable* to *merely researched*, and the standard becomes unenforceable on them.

**This sets content priority.** Build scenes with living witnesses first — not because they are easier, but because they are the only ones where the standard can be tested at all.

**This also creates a role that is not on the org chart.** Not a historian. Someone whose job is to find the person who was there and sit them in front of the render.

**The ground truth is expiring. That is a real deadline and it is not ours.**

## 27) Scene Acceptance (The Photo Test and The Witness Test)

These replace the accuracy manifest as the scene acceptance gate. They work identically for historical, observed, and authored scenes, and they measure the only failure that costs anything.

**The Photo Test.** Print the source photograph. Mount it beside the aperture. Render the same view, same hour, same weather. Show a person. Ask what is different. Every gap they name is a backlog item.

**The Witness Test.** Seat someone who was there (§26). Run the full cycle. Record every moment their face changes. Every flinch is a defect.
