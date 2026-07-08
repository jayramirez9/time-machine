# Time Machine — Concept Trailer Compute & A/V Hardware

**Purpose:** Hardware spec for the first physical Time Machine install — the "concept trailer" with 2–3 windows. Written to be shared with the ADU / trailer build project, so it covers electrical, thermal, rack, display, and audio integration alongside the compute spec.

**Date:** June 2026 · **Status:** Recommendation (validate render budget + thermals during build) · **Owner:** Henhouse Holdings / Time Machine

**Related:** `PRD.md` §17 (Topology — single-box vs. node cluster) and §21 (Mac hardware-ceiling risk).

> **Update (July 2026):** the compute in this spec is not a separate future purchase — it is bought early as the R&D workstation and moves into the trailer for its final phase. Build spec, GPU swap-path decision, and current pricing: **`rd-workstation-spec.md`**.

---

## What this powers

A Time Machine room is a portal: 2–3 displays behave like real architectural **windows** into a specific place and time (e.g. Manhattan, 1884), each showing the correct cardinal direction, all sharing one weather/lighting/time-of-day simulation, with directional room audio. The compute job is:

- **Unreal Engine** rendering 2–3 synchronized camera views at near-AAA fidelity (real-time global illumination, dynamic sky/weather, captured photoreal geometry).
- The **Time Machine engine** (lightweight Node.js service: simulation clock, world-state, audio mixing) — runs on the same machine; negligible load.

The heavy cost is Unreal rendering + displays + audio. Everything else is rounding error.

## TL;DR recommendation

> **One workstation. One top-tier GPU. 2–3 windows rendered as multiple viewports from a single Unreal process.**

A single machine running one render process keeps all windows **frame-perfectly synchronized for free** — no genlock/sync hardware — which is the install's hardest non-negotiable. Recommended GPU: **NVIDIA RTX PRO 6000 Blackwell (96 GB)** for headroom; **RTX 5090 (32 GB)** is the value alternative (comfortable for 2 windows, 3 at reduced resolution).

All-in budget: **~$18–28k** (Max) / **~$8–12k** (Value), including displays and audio. Pricing is volatile (see note).

---

## Architecture decision (why one box)

| Topology | Window sync | Cost / complexity | Verdict |
|---|---|---|---|
| **A. One box, one GPU, multi-viewport** | **Inherent** (one render loop = one clock) | Lowest | **Recommended** |
| B. One box, dual-GPU, multi-process | Inherent (one machine) | Medium | Fallback if A can't hit 3×4K |
| C. Cluster — one PC per window | Needs Quadro Sync II + genlock generator + BNC per node | Highest | Overkill for 2–3 windows |

Synchronization across windows is a product non-negotiable ("if sync breaks, fade gracefully — never show a broken universe"). A single Unreal process gives that automatically. Splitting across machines (Option C — the technique used for *The Mandalorian*'s LED volume) requires dedicated sync hardware per node and identical-spec PCs; unjustified at 2–3 windows in a movable trailer.

## Why 2–3 windows on one GPU is feasible (2026)

- **Gaussian-splat (3DGS) capture renders cheap** — rasterized, not ray-marched: 100–200+ FPS at 1080p, ~200–650 MB VRAM per captured scene. The photoreal environment costs a fraction of full traditional geometry.
- **Unreal 5.8** ships *Lumen Lite* (2× faster global illumination; announced as "Lumen Medium") and *Megalights* (hundreds of shadow-casting lamps/window-glows at near-zero cost).
- **DLSS 4** (Blackwell) renders below native and upscales to 4K.

Caveat that shapes the design: the dynamic sky/weather loop needs **relightable** geometry, and 3DGS bakes its lighting. So the scene is a **hybrid** — splats for the static backdrop, traditional mesh for the near/relightable buildings and the live sky. That hybrid is a mixed GPU load, which is why VRAM headroom (the 96 GB card) earns its place.

---

## Bill of materials

| Component | Roadster-Max (no compromise) | Roadster-Value |
|---|---|---|
| **GPU** | RTX PRO 6000 Blackwell **96 GB** (4× DP 2.1) | RTX 5090 **32 GB** (1× HDMI 2.1b + 3× DP 2.1b) |
| **CPU** | Threadripper 7000 / Xeon-W (high clock + many cores) | Ryzen 9 9950X |
| **RAM** | 128 GB | 64–128 GB |
| **Storage** | 4 TB Gen5 NVMe | 2 TB Gen5 NVMe |
| **PSU** | 1200 W Platinum (single 600 W GPU) | 1000–1200 W Platinum |
| **Displays** | 2–3× 4K **OLED**, portrait, ~43–55" (black levels matter for night) | 2–3× 4K IPS |
| **Audio** | Multi-output interface (RME / MOTU) → zoned speakers | Same |
| **Sync hardware** | None (single-process multi-viewport) | None |
| **OS** | Windows (UE virtual-production + NVIDIA drivers are Windows-first) | Windows |

**Display output capacity is not a constraint:** both GPUs drive 4 displays; the limit is render compute / VRAM, not ports. 2 windows ≈ comfortable on a 5090; 3 windows at full 4K hybrid fidelity is where the 96 GB card (or a second GPU) earns its keep.

**Pricing note (June 2026):** a GDDR7 memory shortage has inflated GPUs — RTX PRO 6000 listings ~$13,250 (vs ~$8.5k MSRP); RTX 5090 ~$2.5–4k+ (vs $1,999 MSRP). *July 2026 update: prices are climbing, not easing — shortage forecast into late 2027. Current numbers and sources in `rd-workstation-spec.md`.*

---

## Build / install considerations (for the ADU + trailer team)

These are the numbers the physical build needs to design around.

**Electrical** *(figures estimated from component TDP — confirm actual draw at the wall during commissioning)*
- Workstation under full render load: **~1.0–1.1 kW** (600 W GPU + ~250 W CPU + rest).
- Displays: 3× 4K OLED ≈ **300–450 W** total. Audio amp: ~100–300 W.
- **Peak system draw ≈ 1.5–1.8 kW**, sustained for the whole session = a **continuous load** under NEC 210.20(A).
- On 120 V that's ~13–15 A. A 20 A circuit's *continuous* limit is **16 A** (NEC 80% rule), so at the 1.8 kW upper bound there's only ~1 A of margin — too little once GPU/PSU inrush is considered.
- **Recommendation: a dedicated 30 A / 120 V circuit** (24 A continuous — comfortable margin), separate from HVAC and lighting. A 20 A circuit is acceptable **only** if sustained peak is held ≤ ~1.4 kW (≤ ~12 A). A 240 V circuit is fine too if the rack PSU supports it. Do not share the circuit with HVAC/lighting.

**Thermal**
- The compute alone dumps **~3,400–3,800 BTU/hr** of heat into the cabin under load; with displays + audio, plan for **~5,000–6,000 BTU/hr** (≈ 1,760 W). Treat this as **peak sustained, not average** — the rig runs at load for the entire session.
- A small trailer/ADU will heat up fast — **size cooling/AC to remove the full ~6,000 BTU/hr on top of occupant and solar load.** The machine should live in a **ventilated equipment rack** with clear intake/exhaust, not a sealed cabinet.

**Physical / rack**
- One mid/full-tower workstation (or 4U rackmount). Reserve rack space + service access.
- Cable runs: GPU → 2–3 displays (DisplayPort, keep runs short or use active/fiber DP for >3 m), audio interface → speaker zones, one network drop, one power feed.

**Displays as windows**
- Mount to read as architectural windows: appropriate height, portrait orientation, minimal/clad bezels (frame them as window casings).
- OLED preferred for black levels — night scenes look like TV on a poor-contrast panel.
- Match brightness/white-point across panels (calibration is part of commissioning).

**Audio**
- Multi-zone (the experience places sound directionally — east traffic should feel east). Plan speaker positions per window/direction + a low-frequency element.

**Networking**
- One LAN drop for setup/telemetry/content updates. The experience runs fully offline once loaded (no internet dependency during operation).

**Noise**
- A 600 W GPU workstation is audible. Acoustically isolate the rack from the guest space, or the room hum competes with the soundscape.

---

## Strategy: this is the Roadster, not the Model 3

Tesla shipped the expensive, low-volume Roadster first to prove EVs could be desirable, then used what they learned to build the affordable Model 3. Same play here:

- **This trailer = the Roadster.** Cost-no-object on the *experience* (best GPU, OLED windows, zoned audio). Volume of one. Its job is the "it's a window into another time" reaction that proves desirability and funds the roadmap. **Do not cost-optimize it.**
- **Then instrument it to define the production baseline.** Measure real per-window frame times, VRAM, thermals, and which fidelity settings actually sell the illusion. That reveals the *cheapest* hardware a repeatable trailer needs — likely a single 5090- or even 5080-class card once the must-have settings are known — which sets the volume BOM for the affordable version.

The Roadster sets the ceiling and proves the dream; the next version sets the price.

---

## Open questions to validate during the build

1. **Real frame budget** at the actual window resolution/orientation with the hybrid (3DGS backdrop + Lumen-lit near geometry + dynamic sky) scene — confirms whether one GPU holds 3×4K@60, or whether to drop resolution / add a second GPU.
2. **Trailer thermals** under sustained load in a real ambient — the single biggest physical-integration risk.
3. **Display selection** — final size/orientation/panel tech once the window apertures are designed.

---

## Sources

- RTX 5090 specs/price — [Wccftech](https://wccftech.com/roundup/nvidia-geforce-rtx-5090/), [Spheron](https://www.spheron.network/blog/nvidia-rtx-5090-specs/)
- RTX PRO 6000 Blackwell 96 GB price — [VideoCardz](https://videocardz.com/newz/nvidia-now-lists-rtx-pro-6000-blackwell-96gb-gpu-at-13250), [Thunder Compute](https://www.thundercompute.com/blog/nvidia-rtx-pro-6000-pricing)
- Unreal nDisplay multi-display + sync — [Epic docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/rendering-to-multiple-displays-with-ndisplay-in-unreal-engine), [Epic sync docs](https://dev.epicgames.com/documentation/unreal-engine/ndisplay-synchronization-with-nvidia-gpus-in-unreal-engine)
- 3DGS rendering performance / NanoGS — [CG Channel](https://www.cgchannel.com/2026/03/free-plugin-nanogs-puts-nanite-style-gaussian-splatting-in-unreal-engine/), [Radiance Fields](https://radiancefields.com/nanogs-brings-nanite-style-gaussian-splatting-to-unreal-engine-5)
