# Time Machine — Architecture v3

**Repo placement:** `docs/architecture-v3.md`
**Status:** Ratified 2026-08-04
**Aligns with:** PRD v3.0 (`PRD.md`, Flinch Standard) · Companion: `docs/v3-pivot-plan.md` (content-level pivots), `docs/refactor-plan.md` (merged build sequence)
**Governing decision:** `docs/decisions/D001-locale-package-contract.md`

---

## The Shape

Three layers, one contract between them:

```
┌─────────────────────────────────────────────────────────────┐
│  AUTHORING PIPELINES  (E09 — mode-specific front ends)       │
│                                                              │
│  historical_reconstruction   observed        authored        │
│  photo → reconstruct →       capture /       direct DCC /    │
│  procedural extension        geodata         Unreal work     │
│         │                       │                │           │
│         └───────────┬───────────┴────────────────┘           │
│                     ▼                                        │
│  SHARED BACK END: 24h authoring · weather/audio binding ·    │
│  packaging · flinch evals (per-mode suites, publish gate)    │
└─────────────────────┬───────────────────────────────────────┘
                      ▼
        ╔═════════════════════════════╗
        ║   LOCALE PACKAGE            ║   ← the contract
        ║   manifest.json + assets    ║     contracts/locale-package.schema.json
        ╚═════════════╤═══════════════╝
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  ENGINE RUNTIME  (provenance-free; future platform layer)    │
│                                                              │
│  loader → provider (live/archive/authored) → world state →   │
│  router/transforms/rate-limit → transport (Unreal RC API)    │
│  schedule player → event stream ──────────────┘              │
└─────────────────────┬───────────────────────────────────────┘
                      ▼
              VENUE PROFILE (engine config, per installation)
              aperture → viewpoint mapping · audio channel map
```

The runtime knows how to do exactly one thing with content: load a Locale Package. Every provenance pipeline compiles to that one format. This is the chassis/cartridge move applied to the content layer — the engine is the chassis, the package is the cartridge interface, the pipelines are fabricators.

## What Survives Unchanged

| Component | Why it survives |
|---|---|
| World State Engine | Already compiles renderer-independent control values; already mode-agnostic |
| Provider abstraction | Mock + Open-Meteo + Visual Crossing + NOAA GHCN-Daily (`lib/noaa.js`) all exist behind one seam; packages declare which one they bind |
| Environment Router + transforms + rate limiter | Operates on control values; has no concept of provenance |
| Unreal transport (Remote Control API) | Delivery mechanism, content-blind |
| WebSocket/HTTP server, logging, replay tools | Replay becomes the parity-testing backbone for the ports |
| Multi-window / nDisplay plan | Mode-agnostic; unchanged on its roadmap |

## What Changes

| Old (pre-v3 PRD) | New | Why |
|---|---|---|
| Preset system (scene + audio + weather + locale + **accuracy manifest**) | **Locale Package** with provenance block, separate schedule and weather channels, eval results, lineage | The accuracy manifest carried the retired Accuracy Contract doctrine into the bundle format |
| Historical accuracy layer (runtime component, "silence over wrongness") | **Deleted from runtime scope.** Reborn as per-mode flinch eval suites — build-time publish gates in the authoring pipeline | Flinch Standard: accuracy is worth exactly what it costs to prevent felt wrongness. That is an authoring-time cost decision, verified before shipping — not runtime enforcement paid forever |
| Content = bespoke Unreal scenes | Content = packages under `locales/`, conformant to the contract | Three existing locales become the conformance tests; the a7500 rebuild happens directly into package structure |
| Implicit single-mode product (historical) | Three provenance modes, identical flinch bar, different truth standards, one package format | PRD v3.0 |

## Core Rules

1. **Provenance opacity.** The engine never branches on `provenance.mode`. The block is metadata for display, logging, and evals. If a runtime task appears to require mode-specific behavior, the design is wrong — the difference belongs in the pipeline or the package data. This rule is what keeps the engine liftable to platform level.
2. **Schedule ≠ weather.** Two composable channels. Weather is environmental data (live, archive, or authored). Schedule is authored life — the coffee cart at 6am, garbage trucks at 5, birds at civil dawn. They meet only at the router's output stream. This matters most for observed mode: live data drives the sky, but live data does not author life. Observed-mode packages composite an authored schedule over live environmental data — that separation is the difference between a product and a webcam.
3. **Publish gate.** `status: published` requires all required eval suites passed, enforced by the loader. Draft packages load only with an explicit dev flag.
4. **Anchors are semantic.** Schedule events anchor to clock time or solar time (`dawn`, `sunrise`, `sunset`, `dusk` + offset). Garbage trucks run on the clock; birds run on the sun. The schedule player resolves solar anchors via its own solar module (Build P3 — standard NOAA solar equations); weather providers supply only per-hour altitude/azimuth, so dawn/dusk event times are new math, not reuse.
5. **Package = world, venue profile = installation.** The package declares `viewpoints` (named camera anchors in the world). Which physical aperture shows which viewpoint — and how audio beds map to the 5.1.2 layout — is venue-profile configuration on the engine side, not package content. Same world, different rooms.

## Truth Standards (per mode, one flinch bar)

The shared bar: *would someone who was there flinch?*

- **historical_reconstruction** — Anchored to dated, located evidence (photo, Sanborn, station records). Wrongness = contradicting what a witness of that place and time would know. Accuracy spend stops at the flinch threshold.
- **observed** — Anchored to the real, present place. Live data is authoritative for environment. Wrongness = divergence from the place as it verifiably is: landmarks, light, weather coherence.
- **authored** — Anchored to its own declared rules. No external referent. Wrongness = internal incoherence — the world breaking its own physics, light, or continuity. "Someone who was there" means someone inside the world's own rules.

## Target Module Layout (directional)

```
engine/               # runtime — provenance-free, future platform lift
  loader/             # package loading, schema validation, publish gate
  worldstate/         # control-value compilation (existing)
  providers/          # open_meteo, ghcn_daily, authored, mock
  schedule/           # 24h life player, clock + solar anchors
  router/             # transforms, rate limiter (existing)
  transport/          # Unreal Remote Control (existing)
pipeline/             # E09 authoring — seam only in this refactor
locales/              # packages: nyc-present/, baton-rouge-1978/, nyc-1884/
  {id}/manifest.json
  {id}/assets/
contracts/            # locale-package.schema.json (worldStateContract stays in lib/ until a dedicated move build)
evals/                # tm-eval suites incl. flinch harness
```

New code lands here. Existing `lib/` modules migrate only in a dedicated build per the Migration Rules in `docs/refactor-plan.md` — no moves mixed into feature work.

## The Platform Seam

The environment engine is decided as a platform layer (every Henhouse room can run one). This refactor does **not** split repos — a solo builder pays coordination tax with no consumer. It draws the seam instead: `engine/` stays provenance-free and package-fed, so the eventual lift out of `time-machine` (leaving pipelines + locales as the Time Machine cartridge's content operation) is a directory move plus a contract handshake — the same pattern as the Spatial → Container OS system manifest (E07 in `henhouse-adu`).

## Unreal Project Architecture

The render side of the contract. Detail lives in the Unreal Track of `docs/refactor-plan.md`; this is the shape.

### Bounded world, not open world

The viewpoint is fixed and the room is small, so the visible set is bounded and enumerable at design time. No streaming, no traversal budget, no World Partition — plain persistent level with Level Instances organized by spatial region (block, parcel, street segment) for parallel authoring and legibility. **World Partition conversion trigger is memory: convert when a locale won't fit, not on principle.**

### Level structure mirrors manifest structure

One-to-one, which is what makes the loader's job obvious:

| Manifest section | Level counterpart |
|---|---|
| `spatial` | Baked geometry layers (Level Instances) |
| `weather` | Core Environment Rig instance, RC-driven |
| `schedule` | Schedule receiver actors |
| `audio` | Emitter placement (host deferred) |
| `viewpoints` | Viewpoint anchor actor (one in v0.1) |

**The build-time / runtime seam:** geometry is authored and frozen; atmosphere and life are driven at runtime over Remote Control. Weather is not the first layer of the world-build — it is a separate axis that plays over whatever geometry exists.

### Fidelity bands

The Flinch Standard's geometric expression. Felt wrongness scales with scrutiny; scrutiny scales with angular size and dwell. So accuracy spend is distributed radially, keyed **per aperture** — the hero wall earns a Band A wedge, the smaller side apertures oblique to the viewer may never need better than Band B.

| Band | Source | Treatment |
|---|---|---|
| **A — Hero** | The anchor photo's frame | Hand-finished, era-verified props and materials |
| **B — Procedural** | Sanborn / historical aerials | PCG from era kits — correct massing, rhythm, density |
| **C — Silhouette** | Massing only | Low-detail real geometry, atmosphere, haze |

Bands are authored against the **occupied region of the room** — four occupants, several feet of parallax, three apertures reading different wedges — not a single point.

**No view-dependent geometry.** Band C is low-detail real geometry, never a painted plane. Required by the multiple sightlines, the parallax, and Lumen HWRT sampling offscreen geometry for reflections and bounce light. Band C wraps the full 360° for light and reflection coherence even where nothing is directly visible.

### Multi-aperture rendering

Three apertures in different walls are three windows, not a contiguous wraparound: one world, one eye origin, three off-axis frusta. nDisplay's root hierarchy is a to-scale digital twin of the trailer interior — view origin at the design eye position, Screen components at the physical size, position, and orientation of each aperture. Frusta derive from room geometry; FOV is never hand-tuned. **That config file is the venue profile.**

Single node, one process, three outputs — frame sync within a process is free; cluster mode solves a multi-machine problem Time Machine does not have. The MX40 adds processing latency the consumer panels don't share; because nothing moves across non-contiguous windows, the tolerance is one-frame-ish for global events (a lightning flash), not sub-frame. Measure the delta at install and offset in config.

nDisplay is **not** part of U2 — single viewport proves the rig; nDisplay arrives as its own build with the second aperture.

### Content conventions

```
/Game/Core/          Environment rig, RC presets, master materials
/Game/Shared/        Cross-era common assets
/Game/Kits/{era}/    Modular era kits
/Game/Data/          Footprints, road vectors, canopy masks
/Game/PCG/           Building, road, and scatter graphs
/Game/Locales/{Name}/Main
/Game/Display/       nDisplay configs (venue profiles)
```

**`/Game/Display/` is installation config, never package content** — nDisplay configs live in the Unreal repo because they must be Unreal assets, but they belong to the venue profile side of D001 decision 5: no manifest ever references them, and no aperture data ever migrates into a package.

**Kits are the reuse unit and the accruing asset.** If every locale is bespoke, locale #2 costs what locale #1 cost and there is no content platform — only a series of one-offs. Kit and PCG quality is therefore worth more investment than any single locale.

### Historical pipeline stages

Address + year in, package out. Stage 0 precedes everything; stages 1→2→3 are strict dependencies; 4–7 parallelize; 8–10 are geometry-independent; 11 gates publish.

| # | Stage | Notes |
|---|---|---|
| 0 | Specify | Address → lat/lon, target date. The manifest anchor |
| 1 | Georeference | Cesium GeoReference; origin rebased to the viewpoint. Every downstream source now agrees on one coordinate system |
| 2 | Terrain | USGS 3DEP DEM → R16 → Landscape (existing fetcher). **Per-locale judgment: is present terrain valid for the target year?** Baton Rouge 1978 mostly yes; NYC 1884 emphatically no (landfill) |
| 3 | Era ground truth | The most era-dependent input. Source changes per era: ~1978 = historical aerial photography (USGS EarthExplorer single frames, USDA surveys, state GIS archives); 1884 = Sanborn plus bird's-eye lithographs. Directly observed for the actual year beats reprojecting present-day OSM backward |
| 4 | Roads and parcels | Vectorize from ground truth → Landscape/PCG splines. Road width and curb presence are strong era tells |
| 5 | Structures | Footprints + inferred height → PCG extrusion from the era kit |
| 6 | Vegetation | Canopy mask → PCG scatter. Species matters; often the highest flinch value per dollar |
| 7 | Era-tell props | Per-locale explicit list — the checklist `flinch-historical` runs against. Vehicles are typically the single most era-legible object in a residential scene |
| 8–10 | Rig, schedule, viewpoint | Rig instance + RC binding, schedule receivers, viewpoint anchor |
| 11 | Evals → publish | Per-mode flinch suites; publish gate |

**Open acquisition problem:** era ground truth (stage 3) is the input the entire historical pipeline depends on and the only stage with no engineering answer — it is a per-locale sourcing problem.

## Deferred, With the Door Held Open

- **Splat/Worldforge hybrid:** `spatial.content_type` is a versioned enum. `unreal_level_v1` is the only implemented type; `gaussian_splat_v1` and `hybrid_v1` are reserved names. Adding a type is a schema-minor bump plus loader support plus a new D-record — not a contract break, not a phase restructure.
- **Audio runtime host:** package audio fields are host-agnostic asset refs and roles. Host resolves with the environment-engine host decision, per standing principle: close hardware cleanly, defer software to its phase.
- **Movement within a locale:** the ability to change position within a locale — including operating the hero aperture as a navigation surface — is a future feature. The model is undecided: v0.1 commits to nothing about how movement works, its granularity, or how it interacts with the venue profile. `viewpoints` is an array and can hold multiple positions if that proves to be the shape; this is not an assertion that it will. Implementation requires a new D-record. The no-view-dependent-geometry rule is justified by present conditions and is not a movement provision.
