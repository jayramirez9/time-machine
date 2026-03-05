# Research: Apple TV Single-Viewport Architecture

**Date:** 2026-03-05
**PRD Reference:** F3 — Apple TV Single-Viewport Port (future)

## Key Takeaways

1. **RealityKit on tvOS is brand new (WWDC 2025).** Apple brought RealityKit to tvOS 19.0, supported on all Apple TV 4K models. Cross-platform code sharing with iOS/macOS/visionOS. SceneKit is now deprecated — RealityKit is the path forward.

2. **Metal is fully available on tvOS.** Custom vertex/fragment shaders, compute shaders, Metal Performance Shaders — all work. The sky/cloud/rain/fog rendering pipeline from `viz.html` (WebGPU) could be ported to Metal shaders running in a RealityKit `customPostProcessing` pass.

3. **AVAudioEngine + HRTF spatial audio is mature on tvOS.** The full `AVAudioEngine` stack is available including spatial mixer with HRTF rendering, convolution reverb, and multi-channel output. Apple TV supports Spatial Audio with AirPods (head-tracked HRTF) and Dolby Atmos passthrough to receivers. The existing 5-layer audio engine design translates directly.

4. **Thin client architecture is ideal.** Apple TV has full WebSocket/networking support. The app connects to the Time Machine daemon for WorldState updates and renders locally — no need to duplicate the weather engine. Audio assets download via Background Assets framework (up to 70 GB hosted).

5. **Proven market exists.** Fireplace and nature-scene ambient apps are a thriving tvOS category (Winter Fireplace, 4K Nature Relax TV, Magic Window, etc.). Time Machine would be a dramatically more sophisticated entry in this space.

---

## Recommended Architecture

```
Time Machine Daemon (Node.js)          Apple TV App (Swift)
──────────────────────────────         ──────────────────────
Weather Engine                         RealityKit Scene
  ↓                                      ↕
WorldState JSON ──── WebSocket ────→  Scene Controller
  (states + controls)                    ├── Sky/atmosphere (Metal shaders)
                                         ├── Lighting (sun position, color temp)
                                         ├── Particles (rain, snow, fog)
                                         └── Window frame overlay

                                    AVAudioEngine
                                         ├── Base bed (crossfade loop)
                                         ├── Directional beds (HRTF panned)
                                         ├── Micro-events (procedural one-shots)
                                         ├── Weather layer (wind, rain, thunder)
                                         └── Convolution reverb
```

### Tech Stack
- **UI framework:** SwiftUI (native tvOS, focus-based navigation)
- **3D rendering:** RealityKit with `customPostProcessing` for atmosphere effects
- **Custom shaders:** Metal shaders for sky gradient, volumetric clouds, rain/snow particles, fog
- **Audio:** AVAudioEngine with `AVAudioEnvironmentNode` (HRTF spatial mixer)
- **Networking:** URLSessionWebSocketTask for WorldState stream from daemon
- **Asset delivery:** Background Assets framework (replaces legacy ODR) for audio profiles
- **State management:** Combine/async-await for reactive WorldState → scene updates

---

## Rendering on tvOS

### RealityKit (Recommended — New for tvOS 2025)

RealityKit is now the primary 3D framework across all Apple platforms. Key capabilities on tvOS:

| Feature | Status on tvOS |
|---------|---------------|
| PBR materials | Yes |
| Custom materials (Metal shaders) | Yes — `CustomMaterial` with `LowLevelBuffer` for instancing |
| Post-processing effects | Yes — `customPostProcessing` API with Metal/CIFilter |
| USD scene loading | Yes — load from file or in-memory data |
| SwiftUI integration | Yes — `RealityView`, `ViewAttachmentComponent` |
| AVIF texture support | Yes — smaller textures without quality loss |
| Animated entities | Yes — skeletal animation, entity attachment |

**For Time Machine:** A single `RealityView` fills the screen as the "window." The scene contains a sky dome, atmospheric particles, and a simple ground plane or distant cityscape. Metal shaders in `customPostProcessing` handle the atmospheric effects (clouds, fog, rain, heat haze) — similar to what `viz.html` does with WebGPU but native.

### Metal Direct

Metal 2+ is fully available on tvOS. All Metal Performance Shaders work. For maximum control, you could render entirely with Metal via `MTKView`, bypassing RealityKit. However, RealityKit provides PBR, lighting, and scene management for free — Metal shaders via `customPostProcessing` give the best of both.

### SceneKit (Deprecated)

SceneKit still works on tvOS but is officially deprecated as of WWDC 2025. It supports custom Metal shaders via `SCNProgram` and `SCNTechnique`, but new development should target RealityKit.

### Pixel Streaming (Alternative — High Fidelity)

Instead of rendering on the Apple TV, stream the existing Unreal scene via WebRTC from a local rendering server. The Apple TV decodes video while running native audio.

- **How:** Unreal Pixel Streaming encodes frames → WebRTC → tvOS native WebRTC client decodes
- **WebRTC on tvOS:** [swarm-cloud/Apple-WebRTC](https://github.com/swarm-cloud/Apple-WebRTC) provides pre-built tvOS binaries
- **Latency:** 100-250ms on LAN — imperceptible for a passive "window" experience
- **Bandwidth:** 4K@30fps H.265 needs ~15-25 Mbps on LAN
- **Advantage:** Zero rendering re-engineering — existing Cesium terrain, volumetric clouds, atmospheric effects stream as-is
- **Disadvantage:** Requires a GPU server running on the LAN. Not viable for standalone App Store distribution

This is the strongest path for matching the full Unreal visual quality. The Apple TV app becomes a decode + audio client. Could coexist with RealityKit standalone mode (Pixel Streaming when server available, native rendering when standalone).

### WebView Option (Not Viable)

WKWebView is **explicitly prohibited** on tvOS (`__TVOS_PROHIBITED`). No web views of any kind. The existing `viz.html` (WebGPU) and `audio-engine.html` (Web Audio) cannot run on Apple TV — native rewrites are required.

---

## Audio Architecture on tvOS

### AVAudioEngine — Full Stack Available

The entire `AVAudioEngine` API is available on tvOS, including:

| Component | tvOS Support | Time Machine Use |
|-----------|-------------|-----------------|
| `AVAudioPlayerNode` | Yes | Base beds, micro-event one-shots |
| `AVAudioEnvironmentNode` | Yes | HRTF spatial mixing for all sources |
| `AVAudioUnitReverb` | Yes | Built-in reverb presets |
| `AVAudioUnitEQ` | Yes | Per-source EQ, low-pass for distance |
| `AVAudioMixerNode` | Yes | Layer mixing, gain control |
| `AVAudioPCMBuffer` | Yes | Procedural audio generation |
| Convolution reverb | Yes (via `AVAudioUnitEffect` / `AUAudioUnit`) | Custom IR-based room reverb |

### HRTF Spatial Audio

- **Generic HRTF:** Built into `AVAudioEnvironmentNode`'s spatial mixer. Works for all listeners.
- **Personalized HRTF:** When paired with AirPods, uses the listener's ear scan (from iPhone) for personalized spatialization. Syncs automatically via iCloud.
- **Head tracking:** With AirPods Pro/Max, head tracking adjusts spatial audio as the listener moves their head — the soundscape stays fixed relative to the TV/room.
- **Rendering algorithm:** `HRTFHQ` option provides higher-quality frequency response and better localization than standard HRTF.

### Multi-Channel Output

| Output | Support |
|--------|---------|
| Stereo (TV speakers) | Yes — HRTF binaural downmix |
| AirPods (Spatial Audio) | Yes — personalized HRTF + head tracking |
| HomePod (stereo pair) | Yes — spatial audio via AirPlay |
| Dolby Atmos receiver | Yes — passthrough via HDMI eARC |
| 5.1 / 7.1 receiver | Yes — channel-mapped output via HDMI |

### Mapping the Existing Audio Engine

The current Web Audio API engine (`audio-engine.html`) maps cleanly to AVAudioEngine:

| Web Audio API | AVAudioEngine Equivalent |
|--------------|-------------------------|
| `AudioContext` | `AVAudioEngine` |
| `AudioBufferSourceNode` | `AVAudioPlayerNode` |
| `PannerNode` (HRTF) | `AVAudioEnvironmentNode` (spatial mixer) |
| `StereoPannerNode` | `AVAudioMixerNode` with pan |
| `ConvolverNode` | `AVAudioUnitEffect` with custom AU |
| `BiquadFilterNode` | `AVAudioUnitEQ` |
| `GainNode` | Mixer input volume |
| `playbackRate` (doppler) | `AVAudioPlayerNode.rate` / `AVAudioUnitTimePitch` |

The v2 audio profile schema (HRTF positions, azimuth/elevation/distance, motion paths, doppler factors, surface-aware reverb sends) translates 1:1 to AVAudioEngine's spatial mixer. In fact, AVAudioEngine's native HRTF implementation is likely higher quality than Web Audio's.

---

## Network Architecture

### Thin Client Model (Recommended)

```
┌──────────────────────┐          ┌──────────────────────┐
│   Time Machine       │          │   Apple TV App       │
│   Daemon (Node.js)   │  WS/LAN │                      │
│                      │◄────────►│  WorldState consumer │
│  Weather Engine      │          │  RealityKit renderer  │
│  Timeline cache      │          │  AVAudioEngine       │
│  State compilation   │          │                      │
│  Provider selection  │          │  Audio asset cache   │
└──────────────────────┘          └──────────────────────┘
     runs on any server               runs on Apple TV
     (Mac Mini, NAS, cloud)
```

**Why thin client:**
- Weather API keys stay on the server (no secrets on the TV)
- Heavy timeline caching and LLM calls happen server-side
- Apple TV just consumes WorldState JSON and renders — lightweight
- Same daemon serves Unreal, web clients, and Apple TV simultaneously
- `URLSessionWebSocketTask` provides native WebSocket support on tvOS

**Fallback: standalone mode.** For App Store distribution without a daemon, bundle a simplified weather engine (Open-Meteo only, no API key needed) directly in the app. The weather pipeline is pure HTTP + JSON — it could run on-device with minimal porting.

### Discovery

- **Bonjour/mDNS:** The daemon advertises itself on the local network. Apple TV discovers it automatically — zero configuration.
- **Manual:** User enters IP/hostname in settings.

---

## App Store Considerations

### Size Limits

| Category | Limit |
|----------|-------|
| App bundle (initial download) | 4 GB |
| Background Assets (hosted) | 70 GB total |
| Individual asset pack | 8 GB |

Audio profiles are the main asset concern. A single profile (e.g., `nyc_city_1884`) is ~50-100 MB of MP3 audio. Even with 50 profiles, that's ~5 GB — well within limits.

**Critical constraint: 500 KB persistent storage.** tvOS allows only 500 KB of persistent local storage per app. Audio assets must be treated as purgeable cache delivered via Background Assets — the system can purge them at any time. The app must gracefully handle missing assets and re-download on next launch.

### Asset Delivery Strategy

Use the **Background Assets** framework (not legacy On-Demand Resources):
1. Ship app with 1-2 bundled profiles (e.g., default suburban, NYC) — keeps initial download small
2. Additional profiles download in background as the user browses available Place×Time options
3. Audio assets live in system-managed purgeable cache — accept re-downloads after system purges
4. WorldState JSON is tiny (~2 KB) — cache last-known state in the 500 KB persistent store for offline fallback

### Monetization

| Model | Fit |
|-------|-----|
| Free + subscription | Best — free app with 1-2 scenes, subscription unlocks library |
| One-time purchase | Poor — ongoing content (new Place×Time profiles) needs recurring revenue |
| In-app purchase per scene | Possible but friction-heavy |

Subscription aligns with the content model: new Place×Time experiences are added over time, and the daemon/weather engine get ongoing improvements.

### tvOS App Review

- No web browser or arbitrary web content rendering
- Remote-based interaction only (Siri Remote) — design for focus-based navigation
- Must work standalone (can't require external hardware/servers to launch)
- Accessibility requirements: VoiceOver support mandatory

---

## Competitive Landscape

### Existing Ambient Apps on Apple TV

| App | What It Does | Price |
|-----|-------------|-------|
| Winter Fireplace | 18 fire scenes + ambient audio | $3.99 |
| 4K Nature Relax TV | 1,000+ nature videos + soundscapes | Subscription |
| Magic Window Naturescapes | Time-lapse nature views | $4.99 |
| Window – Be Where You Want To Be | Rainforest, fireplace scenes | Subscription |
| Virtual Fireplace in HD | Customizable flames + rain/thunder audio | $2.99 |

**Time Machine differentiation:**
- These apps play pre-recorded video loops. Time Machine renders a **live, real-time simulation** driven by actual historical weather data.
- No existing app offers time-travel — "look out your window on July 4th, 1978 in Baton Rouge" is a unique proposition.
- Spatial audio with HRTF head tracking on AirPods is far beyond what loop-based apps provide.
- The audio layer alone (procedural era-appropriate soundscapes) is more sophisticated than any competitor's entire product.

---

## Build Effort Estimate

| Component | Effort |
|-----------|--------|
| RealityKit scene setup (sky dome, atmosphere, window frame) | 2-3 days |
| Metal shader port (sky gradient, clouds, rain, fog from viz.html) | 3-5 days |
| AVAudioEngine port (5-layer engine from audio-engine.html) | 3-5 days |
| WebSocket WorldState consumer + state interpolation | 1-2 days |
| SwiftUI UI (scene picker, settings, subscription flow) | 2-3 days |
| Audio profile loading + Background Assets integration | 2-3 days |
| Bonjour discovery + daemon pairing | 1 day |
| Testing + tvOS-specific polish (focus navigation, remote) | 2-3 days |
| **Total** | **~16-24 days** |

This assumes one developer familiar with Swift/Metal/AVAudioEngine. The audio engine port is the most complex piece — the Web Audio → AVAudioEngine mapping is conceptually clean but requires careful reimplementation of the scheduling, crossfading, and spatial positioning logic.

---

## Recommended Phased Approach

### Phase 1: Audio-First Prototype (1 week)
- AVAudioEngine 5-layer engine playing a bundled audio profile
- Static gradient sky background (no 3D rendering yet)
- WebSocket connection to daemon for WorldState
- Audio levels driven by WorldState controls
- **Goal:** Validate that the audio experience alone is compelling on Apple TV + AirPods

### Phase 2: Visual Layer (1-2 weeks)
- RealityKit scene with sky dome
- Metal shaders for clouds, sun position, fog, rain particles
- WorldState drives visual atmosphere in real time
- Window frame overlay (configurable aspect ratio)

### Phase 3: App Store Ready (1 week)
- SwiftUI scene browser with preview images
- Background Assets for audio profile delivery
- Subscription integration (StoreKit 2)
- Bonjour auto-discovery of daemon
- Standalone fallback (bundled Open-Meteo weather engine)

### Phase 4: Polish
- Personalized Spatial Audio prompt (AirPods ear scan)
- Dolby Atmos output for receiver setups
- Siri integration ("Hey Siri, take me to New York 1884")
- Cross-device handoff (start on iPhone, continue on Apple TV)

---

## Key Technical Risks

1. **Metal shader porting from WebGPU.** WGSL → MSL is non-trivial but the math is identical. The sky, cloud, and rain shaders from `viz.html` are relatively simple fragment shaders — porting effort is manageable.

2. **AVAudioEngine scheduling precision.** Web Audio's `currentTime`-based scheduling is very precise. AVAudioEngine uses `AVAudioTime` which is similarly precise, but the crossfade and micro-event scheduling logic needs careful testing for glitch-free playback.

3. **Apple TV hardware limits.** Apple TV 4K (A15 chip, current gen) has limited GPU compared to Mac/iPhone Pro. Particle systems (rain, snow) may need lower particle counts. The upcoming A17 Pro model will help.

4. **App Store standalone requirement.** The app must launch and provide value without the daemon running. The standalone Open-Meteo fallback ensures this, but the experience is richer with the daemon (Visual Crossing data, historical NOAA, etc.).

5. **Audio asset size.** High-quality audio profiles can be large. Aggressive MP3 compression (128kbps) and Background Assets framework mitigate this, but download times on first launch need UX consideration (progressive loading — play what's available while rest downloads).
