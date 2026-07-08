# Time Machine — R&D Workstation ("the box")

**Purpose:** Spec for the single workstation that carries Time Machine from code-complete to a running room. One machine, three phases of life:

1. **Phase A — R&D / live-verify.** Burn down the verification backlog: UE 5.8 + cesium-unreal v2.28.0, the 7d.2-A splat streaming path, the 7b UE-editor work, Megalights migration, `verify:live` smoke suite (see `review-year1-2026-07.md` §2).
2. **Phase B — Pre-rendered trailer videos.** Movie Render Queue cinematic renders of the demo scenes — the "window into another time" footage that exists before the real-time scene hits frame rate.
3. **Phase C — Real-time across 3 windows.** The box moves into the trailer and becomes the Roadster compute (see `roadster-trailer-hardware.md`). Final state.

**Date:** July 2026 · **Status:** **ORDERED 2026-07-08** (prebuilt — see "What was actually ordered" below) · **Owner:** Henhouse Holdings / Time Machine

**Related:** `roadster-trailer-hardware.md` (venue integration: electrical, thermal, displays, audio — this box is that doc's compute, bought early), `review-year1-2026-07.md` §2 (why now), PRD §17 (topology) and §21 (Mac hardware ceiling).

---

## Design principle: spec to the end state, swap only the GPU

The most demanding phase is the last one (3 synchronized 4K windows, real-time, hybrid 3DGS + Lumen scene). The platform — CPU, RAM, storage, PSU, case, cooling — is therefore specced for the top-tier GPU from day one, but the initial GPU purchase is the **RTX 5090 (32 GB)**, not the RTX PRO 6000 Blackwell (96 GB).

Why: the Roadster doc's open question #1 — *does one GPU hold 3×4K@60 with the hybrid scene?* — can only be answered by measurement, and this box is the instrument. There is a chicken-and-egg otherwise. So:

- **Buy the 5090 build now.** It is unambiguously sufficient for Phase A (live-verify) and Phase B (MRQ renders are offline — render time scales, quality doesn't cap).
- **Instrument during Phases A/B**: per-window frame times at window resolution/orientation, VRAM under the hybrid scene, sustained thermals.
- **GPU swap is the only fork.** If measurements show 3×4K@60 doesn't hold on the 5090, the resolutions are (in order of preference): drop per-window resolution / lean harder on DLSS 4 → swap to the 96 GB RTX PRO 6000 → add a second GPU (Roadster doc topology B). The rest of the machine doesn't change.

### GPU swap decision gate (evaluate at end of Phase B)

Swap to the 96 GB card only if **either**:
- sustained frame rate < 60 fps at the *chosen* per-window resolution with DLSS 4 and Lumen Lite (UE 5.8's faster GI tier) already applied, **or**
- VRAM pressure (> ~28 GB working set) causes hitching with the full hybrid scene (3DGS backdrop + relightable near geometry + dynamic sky) across 3 viewports.

Record the measurements either way — they set the production BOM for the repeatable trailer (Roadster doc, "Strategy" section).

---

## Bill of materials

| Component | Spec | Notes |
|---|---|---|
| **GPU** | NVIDIA RTX 5090 32 GB | 1× HDMI 2.1b + 3× DP 2.1b — drives 3 windows + a service monitor. Swap candidate per gate above. |
| **CPU** | AMD Ryzen 9 9950X (16C/32T) | High clock for UE editor + RC API work; cores for MRQ encode. Matches Roadster-Value. |
| **Motherboard** | X870E, PCIe 5.0 x16 + ≥2× Gen5 M.2 | Must feed a 600 W-class GPU and Gen5 storage; 2.5/5 GbE onboard is fine. |
| **RAM** | 128 GB DDR5 (2×64 GB) | Buy the full 128 GB **now** — see market note. MRQ + UE editor + Cesium streaming are memory-hungry; 64 GB is a false economy at today's upgrade prices. |
| **Storage (OS/projects)** | 2 TB Gen5 NVMe | UE 5.8 + projects + Cesium caches. |
| **Storage (render output)** | 4 TB NVMe (Gen4 fine) | MRQ EXR/ProRes sequences: a 4K EXR frame is ~50–100 MB → a 3-minute 60 fps sequence is ~0.5–1 TB *per window*, so 4 TB holds roughly one 3-window take at worst case. Treat as scratch: archive to external and flush between takes. |
| **PSU** | 1200–1500 W ATX 3.1 Platinum | Sized for a 600 W GPU swap + 9950X + headroom. Native 12V-2×6 connectors. |
| **Case / cooling** | Full tower, high airflow; 360 mm AIO on CPU | Sustained-load duty cycle (MRQ runs for hours; the room runs all session). Noise matters in Phase C — pick quiet fans now. |
| **OS** | Windows 11 Pro | UE virtual production + NVIDIA drivers are Windows-first (unchanged from Roadster doc). |
| **Displays (Phase A/B)** | Whatever's on hand + one decent 4K | Real window displays are a Phase C / trailer-build decision (`roadster-trailer-hardware.md`, "Displays as windows"). Don't buy OLEDs for the desk. |

**Estimated cost (July 2026, volatile):** ~$7.5–9k for the box (no displays). The GPU (~$3k) and RAM (~$2.2–2.8k — 128 GB kits have roughly tripled) dominate the overage vs. 2025 pricing. Concrete SKUs below.

### Parts list (checked July 2026 — re-verify prices at order time)

| # | Part | SKU | Price seen | Note |
|---|---|---|---|---|
| 1 | GPU | ASUS TUF Gaming GeForce RTX 5090 | ~$2,910 | Cheapest reputable AIB in stock. Founders Edition is $1,999 but sells out in minutes — worth a stock alert, not worth waiting for. |
| 2 | CPU | AMD Ryzen 9 9950X | ~$475 | At a 2026 low — one of the few deflating parts. |
| 3 | Motherboard | ASUS ROG Strix X870E-E Gaming WiFi | ~$500 | 2× Gen5 + 2× Gen4 M.2, dual USB4, 5 GbE, strong VRM. |
| 4 | RAM | G.Skill 2×64 GB DDR5-6000 CL30-ish EXPO (Flare X5 / Trident Z5 Neo) | ~$2,200–2,800 | The painful line. Corsair Vengeance 2×64 GB 6400 seen at $2,799. Shop this one hardest; buy whichever reputable 2×64 EXPO kit is cheapest that week. Dual-rank 64 GB DIMMs stress AM5's memory controller — expect to run at 5600 if 6000 won't stabilize (harmless for this workload). |
| 5 | SSD (OS/projects) | Samsung 9100 PRO 2 TB (Gen5) | ~$350–430 | On deep sale from $679 list — SSDs are the one component *not* inflated. |
| 6 | SSD (render scratch) | Samsung 990 PRO 4 TB (Gen4) | ~$320–650 | Listings vary wildly (WD SN850X 4 TB alt at ~$650). Grab whichever 4 TB TLC drive is near the low end. |
| 7 | PSU | Corsair HX1500i (ATX 3.1, 12V-2×6) | ~$400–450 | Seasonic Prime TX-1600 is the premium alternative if HX1500i is short. |
| 8 | Cooler | Arctic Liquid Freezer III Pro 360 | ~$130 | Quiet under sustained load — matters in Phase C. |
| 9 | Case | Fractal Design Torrent | ~$200 | High-airflow, fits 4-slot GPU + 360 mm AIO (mount the radiator on the bottom — keep the 2×180 mm front intakes that are the point of this case). |
| 10 | OS | Windows 11 Pro (retail license) | ~$150 | |

**Total ≈ $7,600–8,700 pre-tax** depending mostly on the RAM kit and which 5090 is in stock the day you order. GA sales tax adds ~$550–690, so plan on **~$8.2–9.4k out the door**.

> **Superseded by the prebuilt order below.** The DIY list stays as the reference spec — it defines the upgrade targets and the GPU-swap-gate context.

---

## What was actually ordered (2026-07-08)

**Corsair Vengeance a7500 prebuilt** — ~$6,000 pre-tax (base $5,799.99 sale price + $200 CPU swap), ~$1.6–2.7k under the DIY list. The likely reason prebuilts undercut parts: system integrators get 5090 allocation near MSRP rather than at ~$2,910 street (inferred, not invoiced). Includes 2-year parts+labor warranty, 60-day returns.

| Component | Ordered | vs. reference spec |
|---|---|---|
| GPU | RTX 5090 32 GB | ✅ as specced |
| CPU | **Ryzen 9 9900X3D** (12C/24T, swapped from 9800X3D for +$200; 9950X-class not offered) | 12 vs 16 cores — most of the MRQ/compile gap closed; V-cache is a bonus for Phase C real-time |
| RAM | 64 GB (2×32) DDR5 | Half the spec. Board has 4 slots — upgrade **only if** MRQ pressure shows |
| Storage | 2× 2 TB NVMe Gen4 | 4 TB fast storage, but 2 TB short of the reference spec and no dedicated render-scratch drive — add a 4 TB NVMe (~$350) if EXR sequences overflow |
| Motherboard | MSI PRO X870E-P WiFi | ✅ X870E as specced |
| PSU | 1200 W Gold | Within the 1200–1500 W band; handles a future 600 W GPU swap |
| Case / cooling | Corsair 3500X mid-tower, 240 mm AIO, 6 fans | Weakest link for all-day duty; acceptable because Phase C puts the box in a ventilated, isolated rack |
| OS | Windows 11 **Home** | **Upgrade to Pro (~$99) on day one** — Remote Desktop + BitLocker |

**First-boot additions to the Phase A checklist:** Windows 11 Pro upgrade; AMD chipset driver install (dual-CCD X3D thread-placement — the scheduler needs it to pin game/render threads to the V-cache CCD).

**Deferred upgrades (buy only when a measurement demands it):** 128 GB RAM (if MRQ pinches), 4 TB scratch NVMe (if EXR sequences overflow), GPU swap per the gate above (if 3×4K@60 fails).

---

## Market note (July 2026): prices are climbing, not easing

The June Roadster doc said GPU pricing "may ease." The evidence now points the other way — this is the strongest argument for buying sooner rather than later:

- **RTX 5090** street ≈ **$3,000** (launch MSRP $1,999), with listing spikes past $5k; NVIDIA passed a ~$300 wholesale hike to board partners on the 5090 as GDDR7 costs rose.
- **RTX PRO 6000 Blackwell 96 GB** now lists at **$13,250** on NVIDIA's own marketplace — +55% over its March 2025 MSRP ($8,565). If the swap gate triggers, this is the exposure.
- **DRAM/DDR5**: shortage forecast to last **until at least Q4 2027**; one supplier advised planning for 10–20% *per-month* increases through end of 2026. DDR5 kits up >100% year-over-year in places. Hence: buy 128 GB up front.
- Root cause is structural (AI datacenter demand absorbing memory fab output; IDC projects datacenters could consume ~70% of world memory output in 2026), and new fab capacity doesn't land until 2027+.

Sources: [Tom's Hardware RAM index](https://www.tomshardware.com/pc-components/ram/ram-price-index-2026-lowest-price-on-ddr5-and-ddr4-memory-of-all-capacities), [TechPowerUp on the 5090 wholesale hike](https://www.techpowerup.com/349050/nvidia-reportedly-prepares-rtx-5090-price-hike-amid-rising-gddr7-costs), [tech-insider GPU price tracking](https://tech-insider.org/gpu-prices-2026/), [Wccftech on RTX PRO 6000 pricing](https://wccftech.com/nvidia-96-gb-rtx-pro-6000-blackwell-price-hits-13250-over-50-percent-hike/), [VideoCardz](https://videocardz.com/newz/nvidia-now-lists-rtx-pro-6000-blackwell-96gb-gpu-at-13250), [Wccftech on memory shortage through 2027](https://wccftech.com/memory-ddr5-ddr4-shortages-last-till-q4-2027-higher-prices-throughout-2026/), [Framework memory pricing update](https://frame.work/blog/updates-on-memory-pricing-and-navigating-the-volatile-memory-market), [IDC memory shortage analysis](https://www.idc.com/resource-center/blog/global-memory-shortage-crisis-market-analysis-and-the-potential-impact-on-the-smartphone-and-pc-markets-in-2026/).

**Obsolescence risk: none.** UE 5.8 is confirmed as the last UE5 release and UE6 early access slipped to end of 2027 — the software target this box serves is frozen for 18+ months (`review-year1-2026-07.md` §2).

---

## Phase A — setup and verification sprint (first weeks)

Software checklist, in order:

1. Windows 11 Pro, NVIDIA Studio driver, **Unreal Engine 5.8**, **cesium-unreal v2.28.0** (contains three 3DGS crash/render fixes: splat-accumulation v2.26, Tick crash v2.27, Standalone splats v2.28).
2. Enable Remote Control API; confirm `GET /remote/info` from the dev Mac over LAN (192.168.68.x).
3. **`verify:live` smoke suite** (build it as durable regression, not a one-time checkout): `GET /remote/info` → one ExecutePythonScript round-trip → spawn one of each `TM_*` actor type → one splat tileset render (`TM_SplatTileset`, KHR_gaussian_splatting) → one full routes dispatch.
4. **routes.json label-based discovery** — do this before heavy level iteration (year-1 review §5: UAID objectPaths break on level rebuilds).
5. The stacked UE-editor work: master weathering material function, M_TM_Landscape RVT nodes, POM node on M_TM_Surface, Niagara systems, foliage meshes, cloth physics.
6. **Megalights migration** (7d.3) — move `TM_Lamp_` / window-glow PointLights onto Megalights; update `configureLampShadows()`.
7. Begin frame-budget instrumentation (feeds the GPU swap gate and the production BOM).

## Phase B — pre-render notes

- MRQ with high-quality anti-aliasing (temporal samples) at final window resolution/orientation — render time is free on a dedicated box overnight.
- Render to EXR for grading headroom; encode deliverables to ProRes/H.265 on the CPU (9900X3D as ordered).
- Keep the render-output drive as scratch; archive finished sequences off-box.
- Every MRQ run doubles as a measurement pass: log per-frame times and VRAM at the same settings the real-time scene will use.

## Phase C — hand-off to the trailer

The box physically moves into the trailer rack and everything in `roadster-trailer-hardware.md` applies from that point: dedicated 30 A/120 V circuit, ~6,000 BTU/hr cooling, ventilated + acoustically isolated rack, OLED window displays, multi-zone audio interface. The GPU swap gate has been decided by then; the Roadster doc's open question #1 arrives answered.
