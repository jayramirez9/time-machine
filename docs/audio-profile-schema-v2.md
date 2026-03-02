# Audio Profile Schema v2

Extension of the audio profile format to support object-based spatial audio (Dolby Atmos, HOA) and AI-generated asset metadata.

## Backward Compatibility

All v2 fields are optional. Profiles without `schemaVersion` are treated as v1. The browser preview engine (`audio-engine.html`) uses v2 spatial fields when present — replacing `StereoPannerNode` with HRTF `PannerNode` for true binaural 3D positioning (azimuth, elevation, distance). Motion paths (`passby`, `approach`, `recede`) are automated via `positionX/Y/Z.linearRampToValueAtTime()`. For v1 profiles, the engine falls back to `pan`/`direction` stereo positioning.

## Top-Level Fields (New in v2)

### `schemaVersion`
Integer. Set to `2` for v2 profiles. Absent = v1.

### `era`
Historical context for the soundscape.

| Field | Type | Description |
|-------|------|-------------|
| `year` | number | Target year |
| `period` | string | Historical period name (e.g., "Gilded Age") |
| `confidence` | number | 0-1, how historically certain the soundscape is |

### `listener`
Describes the listener's physical position in the scene.

| Field | Type | Description |
|-------|------|-------------|
| `position` | string | Human-readable description |
| `elevation` | number | Meters above street level |
| `facing` | string | Default listener orientation (cardinal direction) |
| `enclosure` | string | Acoustic context: `open_window`, `porch`, `street`, `indoor` |

### `spatialConfig`
Target spatial rendering configuration.

| Field | Type | Description |
|-------|------|-------------|
| `order` | string | Target decode format: `HOA3`, `HOA4`, `Atmos7.1.4`, `stereo` |
| `irProfile` | string | Convolution impulse response set ID for this environment |

### `assetGeneration`
Metadata for the AI audio generation pipeline.

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `pending`, `generated`, `recorded`, `mixed` |
| `generator` | string/null | AI service used (future: `elevenlabs`, `udio`, `custom`) |
| `promptContext` | string | Historical description for AI generation prompt |

## Spatial Object Fields

Added to source objects and micro-events. Uses ADM-compatible coordinate system.

### `spatial` (on source objects or micro-events)

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `azimuth` | number | -180 to +180 | Horizontal angle. 0=front, 90=right, -90=left, 180=behind |
| `elevation` | number | -90 to +90 | Vertical angle. 0=ear level, 90=directly above, -90=below |
| `distance` | number | 0 to 1 | Normalized distance. 0=intimate, 1=horizon |
| `spread` | number | 0 to 360 | Angular width of source. 0=point source, 360=omnidirectional |
| `height` | number | 0 to 180 | Vertical spread in degrees |

### `motion` (on micro-events only)

Describes moving sound objects for Atmos object automation.

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `type` | string | `static`, `passby`, `approach`, `recede`, `orbit` | Movement pattern |
| `azimuthStart` | number | -180 to +180 | Starting azimuth (for non-static types) |
| `azimuthEnd` | number | -180 to +180 | Ending azimuth (for non-static types) |
| `durationSec` | number | >0 | Duration of the motion path |
| `dopplerFactor` | number | 0 to 1 | Doppler shift intensity. 0=none, 1=full |

### `surface` (on micro-events only)

String identifier for the surface material the sound interacts with. Used for convolution IR selection.

Examples: `granite_sett`, `asphalt`, `wood_plank`, `iron_rail`, `iron_chute`, `cobblestone`

## Migration from v1

v1 micro-events use `pan` (-1 to 1) and `direction` (N/E/S/W/null). These remain valid in v2 — the engine uses them when `spatial` is absent.

Mapping from v1 to v2 spatial coordinates:

| v1 `direction` | v2 `azimuth` |
|----------------|--------------|
| N (front) | 0 |
| E (right) | 90 |
| S (behind) | 180 |
| W (left) | -90 |
| null (center) | 0 |

`pan` maps roughly to azimuth: `azimuth = pan * 90` (left-right only, no elevation).

## ADM (Audio Definition Model) Mapping

For Dolby Atmos rendering via ADM BWF export:

| Profile Field | ADM Parameter |
|---------------|---------------|
| `spatial.azimuth` | `audioBlockFormat.position.azimuth` |
| `spatial.elevation` | `audioBlockFormat.position.elevation` |
| `spatial.distance` | `audioBlockFormat.position.distance` |
| `spatial.spread` | `audioBlockFormat.width` |
| `spatial.height` | `audioBlockFormat.height` |
| `motion.azimuthStart/End` | `audioBlockFormat` keyframes over `rtime`/`duration` |
| `motion.dopplerFactor` | Not in ADM; applied in pre-render processing |
| `gainDb` | `audioBlockFormat.gain` |

## Example: v2 Micro-Event

```json
{
  "id": "horse_cart",
  "description": "Horse and cart on granite setts",
  "sources": [
    { "url": "/audio-assets/nyc_city_1884/horse-cart-1.mp3", "label": "horse-cart-1" }
  ],
  "avgCooldownSec": 15,
  "gainDb": -14,
  "spatial": {
    "azimuth": 90,
    "elevation": -5,
    "distance": 0.5,
    "spread": 20
  },
  "motion": {
    "type": "passby",
    "azimuthStart": -60,
    "azimuthEnd": 60,
    "durationSec": 8,
    "dopplerFactor": 0.2
  },
  "surface": "granite_sett",
  "timeOfDay": { "min": 0.22, "max": 0.88 },
  "activityRange": [0.3, 1]
}
```
