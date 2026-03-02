# Time Machine — Roadmap

Living document. Phases are sequential but items within a phase are not prioritized.

---

## Phase 1 — Foundation (DONE)

- [x] Weather engine with Visual Crossing, Open-Meteo, NOAA providers
- [x] WorldState compiler: categorical states + normalized controls
- [x] Runtime engine with tick loop, timeline caching, state smoothing
- [x] Environment router + endpoint dispatcher (Unreal, DSP, lighting)
- [x] Rate limiter with EMA smoothing
- [x] 5-layer audio engine (PRD Section 13)
- [x] Audio profile v1 (Baton Rouge Suburb 1978)
- [x] WebGPU viz client
- [x] Daemon with HTTP/WebSocket transport

## Phase 2 — Spatial Audio + Unreal Integration (DONE)

- [x] HRTF spatial panning (v2 audio profiles)
- [x] Doppler pitch shift on micro-events
- [x] Synthetic convolution reverb (enclosure-aware, surface-aware sends)
- [x] Audio profile v2 schema (NYC 1884)
- [x] ElevenLabs SFX pipeline — era-aware AI audio generation (replaced Freesound)
- [x] 40 NYC 1884 audio assets generated via ElevenLabs (0 era audit errors)
- [x] HRTF panner refDistance fix (micro-events audible in mix)
- [x] Live Unreal dispatch (sun, fog, clouds, wind, precip, wetness, haze)
- [x] Greybox scene spawner (12 brownstones, 4 gas lamps, player position)
- [x] NOAA GHCN-Daily provider for pre-1940 historical data

## Phase 2.5 — Immersion Polish (NEXT)

- [ ] **Occlusion layer (Layer 5)**: Building-edge diffraction for street sounds below listener, room LPF for sounds behind, distance-dependent urban canyon filter. The listener is at a 2nd floor open window — this is the last missing psychoacoustic cue. Plan complete, ready to implement.
- [ ] **Real convolution IRs**: Source recorded impulse responses from OpenAIR or similar. A narrow stone street IR would replace the synthetic approximation for spatial scale accuracy.
- [ ] **AI voice generation**: Period-appropriate vendor calls, newsboy cries, conversation fragments via ElevenLabs Speech API. Replace generic SFX one-shots for the 8 human micro-events (vendor_oyster, vendor_ice, newsboy, lamplighter, watchman_whistle, etc.) with actual spoken phrases.
- [ ] **Doppler + reverb tuning pass**: Listening session to dial dopplerFactors, reverb send levels, IR decay times, and surface coefficients by ear.
- [ ] **Unreal scene art pass**: Materials (brownstone brick, granite sett, cast iron), window geometry, stoops, awnings, period signage. Marketplace assets or custom modeling.
- [ ] **Gas lamp light configuration**: Set warm color temperature (2200K), intensity, and attenuation on the 4 PointLight actors once Unreal is back up.

## Phase 3+ — Dream State

Long-horizon items. No timeline, no commitment. Ideas that would meaningfully advance realism but require resources, research, or external dependencies.

- [ ] **Foley session / sound library upgrade**: The 40 NYC 1884 assets are now ElevenLabs AI-generated (a major step up from Freesound keyword search), but a dedicated Foley session with period-appropriate props or a curated sound library (Sonniss, Boom, Pro Sound Effects) would push source material quality further. Particularly: horse hooves on real granite, wooden wheel rumble, coal chute impact, iron-on-iron rail sounds. The spatial pipeline (HRTF, doppler, reverb, surface sends) benefits proportionally from source quality improvements.

- [ ] **Present-day weather modeling for historical reconstruction**: Use modern meteorological models (reanalysis datasets like ERA5, 20CRv3) to reconstruct sub-daily weather conditions for historical dates where only daily NOAA observations exist. NOAA GHCN-Daily gives us daily min/max temperature and total precipitation, but not hourly progression, cloud cover, humidity, or wind patterns. A reanalysis-informed interpolation layer could synthesize realistic hourly weather curves from sparse daily observations — turning "high of 85F, 0.2in rain" into a plausible hour-by-hour arc with morning fog, afternoon buildup, evening thunderstorm, and post-storm clearing. This would dramatically improve the temporal texture of pre-1940 simulations.

- [ ] **Ambisonic output for WAMM speakers**: Full ambisonic rendering pipeline for Wilson WAMM speaker array. See `docs/audio-architecture-wamm.md` for architecture notes.

- [ ] **Multi-locale support**: Generalize the system beyond NYC 1884 and Baton Rouge 1978. Template for rapid locale/era onboarding: locale preset + audio profile + Unreal scene package.

- [ ] **Crowd simulation**: Persistent ambient human presence beyond discrete micro-events. Murmur layers, footstep density tied to activityLevel, crowd noise that responds to time-of-day and weather.

- [ ] **Dynamic music / score layer**: Generative or adaptive musical underscore that responds to weather state, time of day, and dramatic arc. Not a soundtrack — a subtle tonal bed that shifts with the environment.
