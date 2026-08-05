# Locale Package Contract — v0.1

**Repo placement:** `contracts/locale-package-v0.1.md`
**Schema:** `contracts/locale-package.schema.json` (draft-07)
**Status:** Ratified 2026-08-04 (v0.1 — pre-Build-1 edits allowed; post-Build-1 changes follow contract discipline)
**Governing decision:** `docs/decisions/D001-locale-package-contract.md`

A Locale Package is the unit of environment content in Time Machine. It is the only thing the engine runtime knows how to load. All three provenance pipelines — historical reconstruction, observed, authored — compile to this format. The schema is the contract; runtime validation enforces it (Forge: documented by contract).

---

## Package Layout

```
locales/{package-id}/
  manifest.json          # this contract
  assets/                # audio beds, schedule data, augmentation curves, etc.
```

`package-id` is kebab-case (`nyc-1884`). Spatial content (Unreal levels) lives in the Unreal project; the manifest references it by name.

## Versioning

- `schema_version` (root): version of this contract. Semver. Additive fields and new enum values = minor. Breaking = major.
- `package.version`: version of the content itself. Semver, bumped by the authoring pipeline.
- `package.engine_min_version`: oldest engine this package is known to run on.
- Contract changes require: bump + updated reference manifests + amendment note on the D-record, same commit.
- The `schema_version` pattern pins `0.1.x`. A minor bump widens the pattern in this file (same commit as the manifest updates); a major bump is a new schema file.

## Manifest Sections

### `package` (required)
`id`, `name`, `version`, `status` (`draft` | `published`), `created` (ISO date), `engine_min_version`.

**Publish gate:** the loader refuses `published` packages whose required evals have not all passed. `draft` packages load only with an explicit dev flag (`--allow-draft`).

### `provenance` (required — opaque to the engine)
- `mode`: `historical_reconstruction` | `observed` | `authored`
- `truth_standard`: one-line statement of what wrongness means for this package (see Truth Standards in `docs/architecture-v3.md`)
- `anchor`: mode-appropriate grounding —
  - historical: `{ photo_ref, date, location_text }` — the dated, located photo the pipeline starts from
  - observed: `{ capture_ref?, location_text }`
  - authored: `{ source_text }` — license or creative source

**The engine MUST NOT branch on any field in this block.** It is metadata for display, logging, and evals. Runtime behavior differences between packages arise from data (weather binding, schedule, assets) — never from mode.

### `spatial` (required)
- `content_type`: versioned enum. **Implemented:** `unreal_level_v1`. **Reserved, not implemented:** `gaussian_splat_v1`, `hybrid_v1`. Implementing a reserved type requires loader support and a new D-record.
- `content_ref`: level/map name the transport resolves (e.g., `/Game/Locales/NYC1884/Main`)
- `extension_method` (optional, informational): how the world was extended beyond the anchor frame (e.g., `procedural_sanborn`)

### `weather` (required)
Environmental data channel. One binding per package:
- `binding`: `live` | `archive` | `authored`
- `provider`: `open_meteo` | `visualcrossing` | `ghcn_daily` | `authored` | `mock`. `ghcn_daily` is implemented by the existing `lib/noaa.js` (NOAA CDO API, GHCND dataset). A package-declared provider overrides the CLI auto-selection chain; the auto-chain remains for non-package CLI use.
- `location`: `{ lat, lon, elevation_m? }`
- `date_policy`: exactly one of —
  - `{ "type": "live" }` — now, at location (observed mode)
  - `{ "type": "fixed", "date": "1978-07-04" }` — one canonical day
  - `{ "type": "window", "start", "end", "loop": true }` — a season or range
- `era_bounds` (optional): validity range of the archive source
- `augmentation_ref` (optional): authored hourly texture composited over daily-resolution records (the GHCN-Daily case — daily obs bound the day; authored curves supply hourly life within max/min)

### `schedule` (required; `events` may be empty in draft)
The authored life channel — "the other 23 hours." Separate from weather end to end; the two meet only at the router's output stream. Observed-mode packages still carry a schedule: live data drives the sky, authored schedule drives the life.

- `timezone`: IANA string (solar anchors also need `weather.location`)
- `events[]`: each event has `id`, `type` (`audio_event` | `trigger` — closed enum, schema-minor bump to extend), `ref` (asset or trigger target), optional `recurrence`, and exactly one anchor:
  - clock anchor: `{ "anchor": "clock", "time": "05:10" }` — garbage trucks
  - solar anchor: `{ "anchor": "solar", "solar": { "event": "dawn" | "sunrise" | "sunset" | "dusk", "offset_min": -15 } }` — birds
- `ambient` (optional): `{ curves_ref }` — background-life density curves

Micro-events that make sound do so by carrying audio asset refs in `ref`; the schedule player emits, the audio host (deferred) renders.

### `audio` (required; host-agnostic)
- `beds[]`: `{ id, role: "base" | "directional" | "weather", ref, facing_deg? }` — `facing_deg` is required when `role: directional` (schema `if/then`)
- No engine- or host-specific parameters. Channel mapping to the physical 5.1.2 layout is venue-profile configuration, not package content.

### `viewpoints` (required)
Named eye anchors in the world: `{ id, label, position: {x, y, z}, facing_deg, fov_hint? }`. Units for `unreal_level_v1` are centimeters (Unreal convention); future content types define their own frames.

**Semantics:** `position` is the **eye origin** — where the room's viewer stands in the world. `facing_deg` and `fov_hint` are authoring/framing hints (default orientation, band planning), **not** camera parameters. Screen geometry — the physical size, position, and orientation of each aperture relative to the eye — lives entirely in the venue profile, which derives off-axis frusta from it. A package never describes apertures. Same world, different rooms.

The array holds one entry in v0.1. It is an array for shape, not as a commitment to any future multi-position design (see movement deferral in `docs/architecture-v3.md`).

### `motion` (optional, v0.1 placeholder)
`cues[]`: `{ id, trigger, ref }`. Loose by design until the motion story firms up.

### `evals` (required)
- `required[]`: suite ids this package must pass to publish. Per-mode defaults:
  - all modes: `schedule-validity`, `loop-detection`, `lineage-completeness`
  - historical_reconstruction: + `flinch-historical` (anachronism checklist), `sun-astro`, `weather-record-diff`
  - observed: + `flinch-observed` (landmark fidelity checklist), `live-coherence`
  - authored: + `flinch-authored` (internal-consistency checklist), `plausibility`
- `results`: `{ suiteId: { status: "pass" | "fail" | "pending", date, run_ref?, notes? } }` — written by `tm-eval`, read by the loader's publish gate.

**Suite-id registry (closed enum in the schema):** `schedule-validity`, `loop-detection`, `lineage-completeness`, `flinch-historical`, `sun-astro`, `weather-record-diff`, `flinch-observed`, `live-coherence`, `flinch-authored`, `plausibility`. Adding a suite id is a schema-minor bump.

**Gate integrity:** `required` has `minItems: 1`, and the contract validator asserts it contains at least the per-mode minimum set above — a package cannot self-certify by declaring an empty or typo'd suite list. This is build-time mode branching; the *runtime* opacity invariant is untouched (the loader reads only `status` + `results`).

Manual suites are structured checklists with recorded results in v0. Automate incrementally; never block publishing machinery on automation.

### `lineage` (optional, required-by-eval for historical mode)
- `sources[]`: `{ type: "photo" | "map" | "record" | "dataset" | "license" | "other", id?, ref, date?, note? }` — `id` makes a source referenceable as `lineage:{id}` from `provenance.anchor`
- `licenses[]` (optional)

This is where the Sanborn refs, LoC photo ids, and station records live. `lineage-completeness` enforces per-mode expectations so the contract doesn't have to.

---

## Validator Rules (beyond the schema)

The P1 validator implements the schema and additionally asserts what draft-07 cannot express:

- `format: "date"` fields are **asserted**, not annotation-only (draft-07 treats `format` as annotation; `"1978-13-45"` must fail).
- Id uniqueness within `viewpoints`, `schedule.events`, `audio.beds`, and `lineage.sources`.
- Binding×provider matrix: `live` → `open_meteo` | `visualcrossing` | `mock`; `archive` → `open_meteo` | `visualcrossing` | `ghcn_daily` | `mock`; `authored` → `authored` | `mock`. `mock` is the offline/test provider (`lib/weather.js`) and is valid under every binding — deterministic-replay test manifests bind `archive` + `mock`. `augmentation_ref` only on `archive` bindings.
- `binding: authored` requires `date_policy.type` of `fixed` or `window` — `live` ("now, at location") is observed-mode semantics.
- `era_bounds`, when present with `date_policy: fixed`, must contain the date.
- Per-mode anchor grounding: `historical_reconstruction` requires `anchor.photo_ref` + `date` + `location_text`; `observed` requires `location_text`; `authored` requires `source_text`.
- `evals.required` ⊇ the per-mode minimum suite set.
- `lineage:{id}` references in `provenance.anchor` resolve to a `lineage.sources[].id`.
- Error messages are discriminated before deep validation (`date_policy` on `type`, schedule events on `anchor`) so failures are self-describing rather than `oneOf` noise.

Reserved `content_type` values are **schema-valid by design** — rejection is loader behavior (Build P2), so drafts can declare future content types before the loader supports them.

## Reference Manifests (abbreviated)

These three are the conformance tests — they span all three provenance modes and both sides of the 1940 data boundary. Full drafts land in `locales/*/manifest.json` at Build P1. Provider bindings in these drafts are provisional — confirmed at port time (refactor-plan P6): replay parity requires recording goldens from the same provider the package binds.

### `nyc-present` — observed, live

```json
{
  "schema_version": "0.1.0",
  "package": { "id": "nyc-present", "name": "New York — Present", "version": "0.1.0",
    "status": "draft", "created": "2026-08-03", "engine_min_version": "0.0.0" },
  "provenance": { "mode": "observed",
    "truth_standard": "Divergence from the place as it verifiably is: landmarks, light, weather coherence.",
    "anchor": { "location_text": "Manhattan, New York, NY" } },
  "spatial": { "content_type": "unreal_level_v1", "content_ref": "/Game/Locales/NYCPresent/Main" },
  "weather": { "binding": "live", "provider": "open_meteo",
    "location": { "lat": 40.7484, "lon": -73.9857 }, "date_policy": { "type": "live" } },
  "schedule": { "timezone": "America/New_York", "events": [
    { "id": "trash-run", "type": "audio_event", "anchor": "clock", "time": "05:10", "ref": "assets/audio/garbage-truck.wav" },
    { "id": "dawn-birds", "type": "audio_event", "anchor": "solar", "solar": { "event": "dawn", "offset_min": 0 }, "ref": "assets/audio/birds-bed.wav" } ] },
  "audio": { "beds": [ { "id": "city-bed", "role": "base", "ref": "assets/audio/city-bed.wav" } ] },
  "viewpoints": [ { "id": "vp-street-n", "label": "Street, facing north", "position": { "x": 0, "y": 0, "z": 170 }, "facing_deg": 0 } ],
  "evals": { "required": ["schedule-validity", "loop-detection", "lineage-completeness", "flinch-observed", "live-coherence"], "results": {} }
}
```

### `baton-rouge-1978` — historical, archive (post-1940)

```json
{
  "schema_version": "0.1.0",
  "package": { "id": "baton-rouge-1978", "name": "Baton Rouge — July 4, 1978", "version": "0.1.0",
    "status": "draft", "created": "2026-08-03", "engine_min_version": "0.0.0" },
  "provenance": { "mode": "historical_reconstruction",
    "truth_standard": "Contradicting what a witness of this place and time would know.",
    "anchor": { "photo_ref": "lineage:photo-br-1978", "date": "1978-07-04", "location_text": "Baton Rouge, LA suburb" } },
  "spatial": { "content_type": "unreal_level_v1", "content_ref": "/Game/Locales/BR1978/Main", "extension_method": "procedural" },
  "weather": { "binding": "archive", "provider": "open_meteo",
    "location": { "lat": 30.4515, "lon": -91.1871 },
    "date_policy": { "type": "fixed", "date": "1978-07-04" } },
  "schedule": { "timezone": "America/Chicago", "events": [
    { "id": "fireworks", "type": "audio_event", "anchor": "solar", "solar": { "event": "dusk", "offset_min": 45 }, "ref": "assets/audio/fireworks-distant.wav" } ] },
  "audio": { "beds": [ { "id": "suburb-bed", "role": "base", "ref": "assets/audio/suburb-summer-bed.wav" } ] },
  "viewpoints": [ { "id": "vp-porch", "label": "Front porch", "position": { "x": 0, "y": 0, "z": 160 }, "facing_deg": 210 } ],
  "evals": { "required": ["schedule-validity", "loop-detection", "lineage-completeness", "flinch-historical", "sun-astro", "weather-record-diff"], "results": {} },
  "lineage": { "sources": [ { "type": "photo", "id": "photo-br-1978", "ref": "family-archive/br-frontyard-1978.jpg", "date": "1978-07" } ] }
}
```

### `nyc-1884` — historical, archive (pre-1940, augmented)

```json
{
  "schema_version": "0.1.0",
  "package": { "id": "nyc-1884", "name": "New York — 1884", "version": "0.1.0",
    "status": "draft", "created": "2026-08-03", "engine_min_version": "0.0.0" },
  "provenance": { "mode": "historical_reconstruction",
    "truth_standard": "Contradicting what a witness of this place and time would know.",
    "anchor": { "photo_ref": "lineage:loc-nyc-1884", "date": "1884-06-15", "location_text": "Manhattan, New York, 1884" } },
  "spatial": { "content_type": "unreal_level_v1", "content_ref": "/Game/Locales/NYC1884/Main", "extension_method": "procedural_sanborn" },
  "weather": { "binding": "archive", "provider": "ghcn_daily",
    "location": { "lat": 40.7789, "lon": -73.9692 },
    "date_policy": { "type": "fixed", "date": "1884-06-15" },
    "era_bounds": { "start": "1869-01-01", "end": "1939-12-31" },
    "augmentation_ref": "assets/weather/hourly-texture-1884.json" },
  "schedule": { "timezone": "America/New_York", "events": [
    { "id": "lamplighter", "type": "trigger", "anchor": "solar", "solar": { "event": "sunset", "offset_min": -20 }, "ref": "triggers/gas-lamps-on" } ] },
  "audio": { "beds": [ { "id": "street-1884-bed", "role": "base", "ref": "assets/audio/street-1884-bed.wav" } ] },
  "viewpoints": [ { "id": "vp-second-floor", "label": "Second-floor window", "position": { "x": 0, "y": 0, "z": 450 }, "facing_deg": 90 } ],
  "evals": { "required": ["schedule-validity", "loop-detection", "lineage-completeness", "flinch-historical", "sun-astro", "weather-record-diff"], "results": {} },
  "lineage": { "sources": [
    { "type": "photo", "id": "loc-nyc-1884", "ref": "loc.gov/item/EXAMPLE", "date": "1884" },
    { "type": "map", "ref": "sanborn/manhattan-1884-v2-p14", "date": "1884" },
    { "type": "dataset", "ref": "ghcn-daily/USW00094728", "note": "Central Park station, records from 1869" } ] }
}
```

---

## Conformance

A build of the engine conforms to this contract if: (1) it validates every manifest against the schema before load, with self-describing errors; (2) it enforces the publish gate; (3) it never branches on `provenance`; (4) it keeps schedule and weather as separate channels through to the router output; (5) it rejects reserved `content_type` values with a clear "not implemented" error rather than undefined behavior.
