# Research: Apple TV Single-Viewport Architecture

**Date:** 2026-03-05
**Status:** Complete
**Relevance:** Consumer port of Time Machine as a "window into another world" on Apple TV

---

## Summary / Key Takeaways

- **Pixel Streaming + Native Audio is the recommended v1 architecture.** Stream the existing Unreal scene from a local server via WebRTC; handle spatial audio natively on Apple TV with AVAudioEngine.
- **Unreal Engine officially supports tvOS** (UE 5.5+), but the Apple TV's A15 GPU is limited to mobile-quality rendering. Nanite/Lumen are not available.
- **WKWebView does not exist on tvOS** -- the existing browser-based audio engine cannot run on Apple TV. A native Swift port of the audio engine is required.
- **RealityKit now supports tvOS** (WWDC 2025) and could power a standalone renderer in Phase 2, but it cannot match Unreal's visual fidelity.
- **Spatial audio with AirPods works** at the system level on Apple TV, and the system anchors audio to the TV position -- which is exactly correct for the "window" metaphor.
- **Background audio is supported** on tvOS -- the app can keep playing ambient audio when the screen dims.
- The AVAudioEngine API maps nearly 1:1 to Web Audio API, making the audio engine port mechanical rather than architectural.

---

## 1. Rendering Approaches on Apple TV

### 1a. Native Metal / GPU Capability (Apple TV 4K, A15 Bionic)

**Current hardware (3rd gen, 2022):**
- A15 Bionic with 4- or 5-core GPU (reports vary on which bin the Apple TV gets)
- 4 GB RAM
- Metal 2 support, ~10,600 Geekbench 5 Metal score (4-core), ~14,200 (5-core)
- HDMI 2.1 output, 4K@60Hz HDR10+ / Dolby Vision
- Roughly comparable to an iPhone 13 Pro GPU

**Upcoming hardware (expected 2026):**
- A17 Pro chip, 6-core GPU with hardware ray tracing, full Metal 3
- Expected 8 GB RAM (needed for Apple Intelligence)
- Wi-Fi 7, likely 4K@120Hz support

**Realistic limits for the A15:** The GPU can handle mobile-quality 3D scenes -- think Genshin Impact or console-era-quality environments. A stylized or carefully optimized sky/weather scene with procedural clouds, fog, rain particles, and dynamic lighting at 4K@30fps is feasible. You will NOT get Unreal Engine 5 Nanite/Lumen quality natively. The 4 GB RAM constraint is the real bottleneck -- large textures, complex geometry, and multi-layer particle effects will need careful budgeting.

### 1b. Unreal Engine on tvOS

**Officially supported.** UE 5.5+ (through 5.7) lists tvOS as a supported platform alongside iOS/iPadOS. The requirements are tvOS 15+ and an A8 processor or later. Key details:

- Builds require macOS + Xcode, deployment over LAN (no USB on Apple TV)
- Metal RHI is the rendering backend; Epic has been improving Metal parity with DX12
- Nanite requires M2+, so it is NOT available on Apple TV's A15
- TSR (Temporal Super Resolution) has known performance issues on Apple Silicon
- No shipped tvOS game examples surfaced in research -- the tvOS UE path exists but appears lightly trafficked by developers

**Practical assessment:** You could build a UE5 tvOS app with mobile-tier rendering (forward shading, baked lighting, simple materials). A sky/weather scene with dynamic time-of-day, volumetric fog approximations, and particle rain is plausible at mobile quality settings. However, this is a significant engineering investment for what would be a constrained version of the desktop Unreal scene.

### 1c. Pixel Streaming from Cloud/Local Server

**Architecture:** Unreal runs on a powerful GPU server, renders frames, streams via WebRTC to a thin client. The client just decodes video and sends input back.

**tvOS client challenge:** There is no browser on Apple TV and no WKWebView (see Section 3). You would need a **native tvOS WebRTC client**. One exists: [swarm-cloud/Apple-WebRTC](https://github.com/swarm-cloud/Apple-WebRTC) provides pre-built WebRTC binaries for iOS, macOS, and tvOS.

**Latency:** WebRTC delivers sub-500ms latency (often 100-250ms on LAN). For a passive "window" experience with no twitch interaction, this is more than acceptable. For a living room setup where the rendering server is on the same LAN, latency would be imperceptible.

**Bandwidth:** 4K@30fps H.264/H.265 streaming requires roughly 15-25 Mbps on LAN. Over internet, 25-50 Mbps recommended. Apple TV 4K supports Wi-Fi 6 and Ethernet.

**This is the most promising path for high-fidelity visuals.** The existing Unreal scene (Cesium terrain, volumetric clouds, dynamic sun, fog) could stream directly to the Apple TV without any re-engineering of the rendering pipeline. The Apple TV app becomes a thin decode + audio client.

### 1d. Pre-rendered Video Loops with Crossfading

**Concept:** Pre-render weather/time-of-day variants as high-quality video loops (e.g., "overcast morning," "sunny afternoon," "rainy night"). The tvOS app crossfades between them based on WorldState updates.

**Pros:** Simplest to implement. Guaranteed visual quality. No GPU rendering needed -- just video decode (which the A15 handles in hardware). Could ship a v1 quickly.

**Cons:** Least flexible. Combinatorial explosion of variants (weather x time x location). Large asset sizes. Transitions between states are limited to crossfades. No true real-time response.

**Hybrid approach worth considering:** Use pre-rendered sky/background video loops with real-time overlay layers (particle rain, fog alpha, lighting color grading) driven by WorldState. This gives 80% of the visual impact with 20% of the rendering cost.

### 1e. RealityKit (New on tvOS as of WWDC 2025)

**Major development:** Apple announced at WWDC 2025 that RealityKit now supports tvOS, across all Apple TV 4K generations. SceneKit is soft-deprecated; RealityKit is the path forward.

**Capabilities relevant to Time Machine:**
- `ParticleEmitterComponent` -- rain, snow, dust, sparks
- `customPostProcessing` API -- bloom, color grading, atmospheric haze via Metal shaders or CIFilters
- `MeshInstancesComponent` -- efficient instanced geometry (trees, buildings)
- Environment lighting, physically-based materials, shadows
- Cross-platform: same code runs on iOS, iPadOS, macOS, and tvOS
- USD format for 3D assets

**Ceiling assessment:** RealityKit is not Unreal Engine. It is designed for AR/mixed reality scenes, not cinematic environment rendering. You could build a stylized sky dome with procedural clouds, dynamic lighting, rain particles, and basic geometry. You would NOT get photorealistic volumetric clouds, Cesium-quality terrain, or film-grade atmospheric scattering. Think "high-quality mobile game environment" rather than "Unreal cinematic."

**Advantage:** Full native integration with AVAudioEngine for spatial audio, SwiftUI for UI, and Apple's ecosystem. No cross-compilation complexity. This is Apple's blessed path.

---

## 2. Spatial Audio on Apple TV

### 2a. AVAudioEngine + AVAudioEnvironmentNode

`AVAudioEngine` with `AVAudioEnvironmentNode` is available on tvOS and provides:
- 3D positioned audio sources via `AVAudioPlayerNode`
- HRTF rendering for headphone output
- Reverb, obstruction, occlusion parameters per source
- Distance attenuation models (inverse, linear, exponential)
- Listener position and orientation control

**Comparison to current Web Audio API engine:** AVAudioEngine is conceptually identical to Web Audio API. The mapping is direct:

| Web Audio API | AVAudioEngine |
|---|---|
| `AudioContext` | `AVAudioEngine` |
| `PannerNode` (HRTF) | `AVAudioEnvironmentNode` + player position |
| `ConvolverNode` | `AVAudioUnitReverb` or custom AU |
| `GainNode` | `AVAudioMixerNode` / volume |
| `StereoPannerNode` | `AVAudioMixing.pan` |
| `playbackRate` | `AVAudioPlayerNode.rate` |

The existing 5-layer audio architecture (base bed, directional beds, micro-events, weather, occlusion) would port to AVAudioEngine with a nearly 1:1 mapping. The bag-draw scheduling, EMA smoothing, and WorldState-driven gain control are all app logic that transfers directly.

### 2b. AirPods Head Tracking

**Critical limitation: `CMHeadphoneMotionManager` is NOT available on tvOS.** It is explicitly marked `API_UNAVAILABLE(tvos)`. This means:

- You CANNOT access raw head rotation data from AirPods on Apple TV
- Apple's built-in spatial audio with head tracking works at the system level for media playback (AVPlayer), but third-party apps cannot drive custom head-tracked spatialization on tvOS
- The system-level spatial audio anchors sound to the TV's position -- when you turn your head, the soundstage stays "at the TV." This is actually ideal for a "window" metaphor

**Silver lining:** For the Time Machine use case, system-level head tracking that anchors audio to the TV is exactly what you want. The "window" should sound like it is in a fixed location. You would NOT want the soundstage to rotate with the listener's head for this product.

### 2c. HomePod Surround Sound

When HomePod(s) are paired with Apple TV 4K as a "Home Theater" setup:
- They become the default audio output
- Support Dolby Atmos, 5.1, and 7.1 surround
- A stereo HomePod pair provides spatial audio from tvOS apps

For the app to output spatial audio to HomePods, use multichannel audio output (5.1/7.1/Atmos) rather than HRTF binaural. The system handles the downmix to the HomePod configuration. Using `AVAudioEnvironmentNode` with the output format set to multichannel should work, though testing with actual hardware is essential.

### 2d. Audio Architecture Recommendation

The AVAudioEngine stack on tvOS is more capable than Web Audio API in several ways:
- Native HRTF quality is generally better than browser implementations
- Lower latency audio path
- Better integration with system audio routing (AirPods, HomePod, HDMI)
- Background audio support (see Section 3)

The tradeoff: you must rewrite the audio engine in Swift. However, the architecture would be identical -- the port is mechanical, not architectural.

---

## 3. tvOS App Architecture

### 3a. SwiftUI for tvOS

SwiftUI is fully supported on tvOS and is Apple's recommended UI framework. Key considerations:

- **Siri Remote input:** Focus-based navigation (not touch-based). SwiftUI handles focus engine automatically. Swipe, click, Menu button, Play/Pause button.
- **For a "window" app**, UI is minimal -- settings overlay, location/date picker, maybe a HUD. The main view would be the rendered scene (RealityView, Metal view, or video player).
- **RealityView** is now available on tvOS via RealityKit, integrating directly into SwiftUI.

### 3b. Background Audio

**Supported.** tvOS apps can play audio in the background when:
1. Background Modes capability is enabled ("Audio, AirPlay, and Picture in Picture")
2. `AVAudioSession` category is set to `.playback`
3. Audio is actively playing

This means the Time Machine app can keep its ambient audio playing when the screen dims or the Apple TV goes to its screensaver. This is important -- the app could serve as a "sound machine" even when the TV display is off.

### 3c. WebSocket Support

**Fully supported.** `URLSessionWebSocketTask` is available on tvOS 13+. The existing WebSocket protocol (WorldState push every 5 seconds from the daemon) works directly. The tvOS app would connect to the same `ws://host:3000/stream` endpoint the browser clients use.

Architecture:
```
tm-engine.js (daemon) --WebSocket--> tvOS app (URLSessionWebSocketTask)
                                      |-> decode WorldState JSON
                                      |-> drive RealityKit scene / video player
                                      |-> drive AVAudioEngine spatial audio
```

### 3d. WKWebView on tvOS

**Not available. Period.** Apple has never provided WKWebView or any web view on tvOS. This is a deliberate platform decision, not an oversight. There is no workaround short of using private APIs (which would be rejected from the App Store).

**This means the existing browser-based audio engine (audio-engine.html) cannot run on Apple TV.** The audio engine must be rewritten as a native AVAudioEngine implementation.

---

## 4. Existing Precedent

### 4a. "Ambient Window" Apps on Apple TV

Several exist and are successful:
- **[Naturescapes 4K - Magic Window](https://apps.apple.com/us/app/naturescapes-4k-magic-window/id1045421220)** -- 4K HDR time-lapse nature views with ambient soundtracks, controllable playback speed
- **[Winterscapes 4K - Magic Window](https://apps.apple.com/us/app/winterscapes-4k-magic-window/id1071185746)** -- Winter scenes, 48 views, 10 ambient soundtracks
- **[Elite 4K Live Wallpapers](https://apps.apple.com/us/app/elite-4k-live-wallpapers/id6502585222)** -- Fireplaces, nature, cityscapes, abstract. Optimized for tvOS 26
- **[Chill Zones: Loop Videos](https://apps.apple.com/us/app/chill-zones-loop-videos/id1515920737)** -- Custom video loops as screensavers

These validate the market category. However, they are all **pre-recorded video** -- none use real-time 3D rendering or respond to live data.

### 4b. Screensaver-style Apps on tvOS

Apple's built-in Aerial screensavers (drone footage of cities/landscapes) set the quality bar. In tvOS 18, Apple added categories like Snoopy, TV/Movies, Music, and "Soundscapes." These use pre-rendered 4K video with metadata-driven transitions.

Third-party screensaver-style apps run as standard tvOS apps (there is no screensaver API for third parties). They rely on the user launching them and the app preventing idle sleep while active.

### 4c. Pixel Streaming on Apple TV

**No known shipping implementations.** The concept is viable (WebRTC decode is supported in native code), but no one appears to have built and shipped a Pixel Streaming client specifically for tvOS. This would be novel.

---

## 5. Recommended Architecture

### V1: Hybrid Pixel Streaming + Native Audio

**The most practical v1 architecture splits rendering and audio:**

```
                        LAN / Internet
                             |
 [Rendering Server]          |          [Apple TV 4K]
 tm-engine.js daemon  ----WebSocket---> Native tvOS app
 Unreal Engine scene  ----WebRTC------> Video decode layer (AVSampleBufferDisplayLayer)
                                        |
                                        v
                             AVAudioEngine (native spatial audio)
                             5-layer audio engine (Swift port)
                             |
                             v
                        AirPods (HRTF) / HomePod (surround) / HDMI (stereo/5.1)
```

**Why this approach:**

1. **Rendering via Pixel Streaming** avoids the massive engineering cost of porting the Unreal scene to mobile-quality RealityKit or constrained UE5-tvOS. The existing Cesium terrain, volumetric clouds, and atmospheric effects stream as-is. The Apple TV just decodes video.

2. **Audio as native AVAudioEngine** gives proper spatial audio integration with AirPods and HomePod, background audio when the screen dims, and avoids the WKWebView impossibility. The port from Web Audio API is mechanical -- same architecture, different API calls.

3. **WorldState via WebSocket** requires zero changes to the daemon. The tvOS app connects to the same endpoint as the browser clients.

4. **Background audio mode** means the app can serve as an ambient sound environment even when the TV display is off -- a feature the browser client cannot offer.

### Minimum Viable Apple TV Experience

1. **Native tvOS app** (SwiftUI + Swift)
2. **WebSocket client** connecting to `tm-engine.js` daemon at `/stream`
3. **Video layer** showing either:
   - (a) Pixel Streamed Unreal scene via WebRTC (requires rendering server), OR
   - (b) Pre-rendered sky/weather video loops with crossfade transitions (standalone)
4. **Native audio engine** (AVAudioEngine port of the 5-layer system) -- start with base bed + weather layer, add micro-events and directional beds iteratively
5. **Minimal UI** -- settings screen for location/date/time, then full-screen "window" mode
6. **Background audio** capability so audio persists when screen dims

### Future Phases

- **Phase 2:** RealityKit scene for standalone mode (no server dependency). Procedural sky, weather particles, basic geometry. Would work on the rumored A17 Pro Apple TV with 8 GB RAM.
- **Phase 3:** Full offline mode with downloaded audio profiles + pre-rendered video packs per location/era.
- **Phase 4:** Multi-Apple-TV sync for the PRD's "one universe, many windows" vision (all TVs showing different angles of the same scene, synchronized via the daemon).

### Key Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| WebRTC tvOS client maturity | Use [swarm-cloud/Apple-WebRTC](https://github.com/swarm-cloud/Apple-WebRTC); test early. Fallback to HLS with 2-3s latency |
| Audio engine port effort | Architecture is 1:1 with Web Audio. Port layer by layer, starting with base bed |
| No head tracking API on tvOS | System-level spatial audio anchors to TV position, which is correct for "window" metaphor |
| 4 GB RAM on current Apple TV | Pixel streaming offloads rendering. Audio engine is lightweight. Not a concern for v1 |
| App Store review for "screensaver" category | Frame as "ambient environment" app, not screensaver. Precedent exists (Magic Window apps) |

---

## Sources

- [Apple TV 4K Technical Specifications](https://www.apple.com/apple-tv-4k/specs/)
- [Apple A15 Wikipedia](https://en.wikipedia.org/wiki/Apple_A15)
- [2026 Apple TV Rumors - MacRumors](https://www.macrumors.com/guide/2025-apple-tv/)
- [UE 5.7 iOS/iPadOS/tvOS Support Documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/ios-ipados-and-tvos-support-for-unreal-engine)
- [UE 5.7 tvOS Development Requirements](https://dev.epicgames.com/documentation/en-us/unreal-engine/ios-ipados-and-tvos-development-requirements-for-unreal-engine)
- [Connecting to tvOS Devices in UE](https://dev.epicgames.com/documentation/en-us/unreal-engine/connecting-to-tvos-devices-in-unreal-engine)
- [UE Metal Parity Progress Report](https://www.unrealengine.com/en-US/tech-blog/bringing-unreal-engine-on-macos-up-to-feature-parity-with-windowsprogress-report)
- [Pixel Streaming Overview - UE Documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/overview-of-pixel-streaming-in-unreal-engine)
- [swarm-cloud/Apple-WebRTC (tvOS WebRTC)](https://github.com/swarm-cloud/Apple-WebRTC)
- [WebRTC Swift Package Index](https://swiftpackageindex.com/stasel/WebRTC)
- [CMHeadphoneMotionManager Documentation](https://developer.apple.com/documentation/coremotion/cmheadphonemotionmanager)
- [Immerse Your App in Spatial Audio - WWDC21](https://developer.apple.com/videos/play/wwdc2021/10265/)
- [AVAudioEngine 3D Audio Example (Apple)](https://developer.apple.com/library/archive/samplecode/AVAEGamingExample/Introduction/Intro.html)
- [What's New in RealityKit - WWDC25](https://developer.apple.com/videos/play/wwdc2025/287/)
- [WKWebView Not Available on tvOS](https://medium.com/bpxl-craft/apple-tv-a-world-without-webkit-5c428a64a6dd)
- [URLSessionWebSocketTask Documentation](https://developer.apple.com/documentation/foundation/urlsessionwebsockettask)
- [tvOS Background Audio - Apple Developer Forums](https://developer.apple.com/forums/thread/19598)
- [Naturescapes 4K - Magic Window](https://apps.apple.com/us/app/naturescapes-4k-magic-window/id1045421220)
- [Experience Spatial Audio on Apple TV 4K](https://support.apple.com/guide/tv/experience-spatial-audio-atvbc542b0ce/tvos)
- [HomePod Dolby Atmos Spatial Audio](https://www.macrumors.com/how-to/enable-spatial-audio-lossless-homepod/)
