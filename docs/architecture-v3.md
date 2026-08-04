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

## Deferred, With the Door Held Open

- **Splat/Worldforge hybrid:** `spatial.content_type` is a versioned enum. `unreal_level_v1` is the only implemented type; `gaussian_splat_v1` and `hybrid_v1` are reserved names. Adding a type is a schema-minor bump plus loader support plus a new D-record — not a contract break, not a phase restructure.
- **Audio runtime host:** package audio fields are host-agnostic asset refs and roles. Host resolves with the environment-engine host decision, per standing principle: close hardware cleanly, defer software to its phase.
