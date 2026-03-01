# Audio Architecture: WAMM Master Chronosonic Target

Notes from planning session — March 2026.

## Context

Designing the audio pipeline for ultimate realism, planned around Wilson Audio WAMM Master Chronosonic speakers. These resolve to ~5 microsecond time alignment across drivers and will expose every loop point, synthetic artifact, and algorithmic regularity.

## Core Principle

**Captured reality, spatially reconstructed** — not synthesized, not panned mono sources. The speakers will instantly reveal the difference between algorithmic reverb and a real space, between a synthesized rain loop and captured rain.

## Signal Chain

```
WorldState controls (weather engine)
        ↓
Ambisonic scene graph (selects/crossfades field recordings,
    positions events in spherical field, applies convolution)
        ↓
HOA bus (16+ channels for 3rd order)
        ↓
Room-calibrated ambisonic decoder
        ↓
Speaker feeds (time-aligned at the DAC)
        ↓
WAMMs
```

## Key Decisions

### 1. Ambisonics Over Channel-Based Mixing

Work in Higher-Order Ambisonics (3rd order minimum, ideally 4th). Capture and process the full spherical sound field, then decode to actual speaker positions in the actual room as the very last step. The spatial field is authentic — reconstructing where sound existed in space, not placing mono sources at pan positions.

### 2. Field-Recorded Source Material Exclusively

Every sound asset must be ambisonic field recordings:

- **Ambient beds**: Multi-hour ambisonic captures of real locations (Baton Rouge suburb at 3am, NYC street corner at dusk, a field in summer rain). Captured with Sennheiser AMBEO VR, Zylia ZM-1, or custom higher-order array.
- **Weather events**: Thunder captured ambisonically (spatial decay of thunder rolling across a sky is extraordinarily complex — no synthesis recreates it). Rain on different surfaces. Wind through specific vegetation. These need to be purpose-recorded.
- **Micro-events**: Insects, birds, distant cars, screen doors — all captured in-situ with spatial context intact. A cricket chirp has a location in the field with reflections from nearby surfaces baked into the capture.

### 3. Convolution Over Algorithmic Processing

Use impulse responses captured from real environments for space and distance modeling. A porch in a Louisiana suburb has a specific acoustic signature — overhang reflection, yard absorption, neighbor's house 40 feet away. Capture that IR and convolve. Algorithmic reverb has a regularity the WAMMs will betray.

### 4. Spectral Completeness

Process and deliver at 192kHz / 32-bit float minimum through the entire chain:
- The WAMMs' transient response benefits from oversampled content (less pre-ringing in reconstruction filter)
- Environmental sound has complex ultrasonic content that affects perception of texture through intermodulation
- Preserves headroom for convolution and decode stages

### 5. Room-Specific Decoder

The ambisonic-to-speaker decode must be measured and calibrated for the exact room. Speaker positions, room reflections, listener position — all measured and compensated. This is a bespoke decode matrix, not a generic surround decode.

## Scene Graph Concept

Instead of "play rain.mp3 at gain 0.7 panned left," the model is:

> "Crossfade into the 4th-order ambisonic capture of moderate rain on a shingled roof with a covered porch, oriented so the street is North."

WorldState controls select and blend between captured realities. The controls are already well-suited — they're semantic (`rainLevel`, `windLevel`, `gustiness`, `thunderProb`, `timeOfDayPhase`), not implementation-specific.

## Transport

OSC from the weather engine to a dedicated spatial audio workstation:
- SPAT Revolution, IEM Plugin Suite in Reaper, or custom Max/MSP patch
- Owns ambisonic processing, scene graph, and room-specific decode
- Multi-channel DAC (Merging HAPI, Ferrofish, or similar)

## Current Engine Role

The browser WebAudio engine (`audio-engine.html`) becomes a **preview/authoring tool only**. It demonstrates the control mapping and lets you audition the scene graph logic, but production playback goes through the ambisonic pipeline above.

The `dispatch.js` OSC transport stub would be the integration point — routed WorldState controls sent as OSC messages to the spatial audio workstation.

## Required Investment

- **Recording expeditions**: Weeks of ambisonic field recording across locations, seasons, weather conditions, times of day. This is the irreplaceable asset.
- **Room build-out**: Acoustic treatment calibrated for the WAMMs, measurement and decode calibration, dedicated playback hardware.
- **Spatial audio engine**: Likely SPAT Revolution or Reaper+IEM, driven by OSC from the weather engine.

## Relationship to Existing Architecture

The weather engine's WorldState pipeline remains unchanged. What changes is the downstream consumer:

| Current | WAMM Target |
|---------|------------|
| Browser WebAudio | Dedicated spatial audio workstation |
| Mono/stereo samples | Ambisonic field recordings |
| Channel panning | HOA scene graph |
| Algorithmic processing | Convolution with captured IRs |
| Generic speaker output | Room-calibrated decode matrix |
| 48kHz/16-bit | 192kHz/32-bit float |
