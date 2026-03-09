# LOD and Scale Strategy

How terrain detail scales from city block to Grand Canyon, and how Cesium streaming coexists with Unreal Landscape actors.

## Scale Tiers

Six named presets defined in `lib/scalePresets.js`. Each controls DEM fetch radius, heightmap resolution, Landscape actor dimensions, and Cesium streaming budget.

| Tier | Radius | DEM Res | Landscape | Coverage | Use Case |
|------|--------|---------|-----------|----------|----------|
| `city_block` | 150m | 1m/px | 253×253 | ~300m² | Single intersection, building cluster |
| `neighborhood` | 500m | 1m/px | 1009×1009 | ~1km² | Default. ~10 city blocks (Manhattan test) |
| `district` | 1500m | 2m/px | 1009×1009 | ~3km² | Lower Manhattan, campus, small town |
| `valley` | 5000m | 5m/px | 2017×2017 | ~10km² | River valley, large park, small island |
| `canyon` | 15000m | 10m/px | 4033×4033 | ~30km² | Grand Canyon rim, large watershed |
| `region` | 50000m | 30m/px | 4033×4033 | ~100km² | County, large national park |

### Resolution vs Detail Trade-off

Smaller tiers capture more detail per pixel. At `city_block` (1m/px, 253px), every curb and staircase is visible in the heightmap. At `region` (30m/px, 4033px), individual buildings vanish but ridgelines and valleys are clear. The Cesium streaming layer fills in visual detail beyond the Landscape edge.

### Selecting a Tier

- **Locale presets** can specify a `scalePreset` field (e.g., `nyc_city_1884` → `neighborhood`)
- **`startEngine()`** accepts an optional `scalePreset` param that overrides the locale default
- **`fetch-dem.js`** accepts `--scale <tier>` which overrides `--radius` and `--resolution`
- **`inferScale(radiusMeters)`** maps an arbitrary radius to the nearest tier

## Dual-Layer Model

Two terrain systems coexist at runtime:

```
┌──────────────────────────────────────────────┐
│                Cesium Streaming               │
│        (outer context, read-only, LOD)        │
│                                               │
│    ┌──────────────────────────────────┐       │
│    │       Unreal Landscape           │       │
│    │  (inner zone, editable,          │       │
│    │   full material control)         │       │
│    │                                  │       │
│    │   Weather engine drives:         │       │
│    │   - landscape materials          │       │
│    │   - wetness, snow masks          │       │
│    │   - foliage density              │       │
│    └──────────────────────────────────┘       │
│                                               │
│   Cesium provides:                            │
│   - terrain beyond Landscape edge             │
│   - OSM Buildings (1.4B volumes)              │
│   - Google 3D Tiles (scouting only)           │
└──────────────────────────────────────────────┘
```

### Layer Responsibilities

| Aspect | Landscape (inner) | Cesium (outer) |
|--------|-------------------|----------------|
| Terrain source | USGS 3DEP DEM (baked) | Cesium World Terrain (streamed) |
| Resolution | Fixed, high (1-30m/px) | Dynamic LOD |
| Materials | Full control (weather-driven) | Satellite imagery only |
| Buildings | Phase 6 historical meshes | OSM/Google streamed |
| Editable | Yes (masks, layers, foliage) | No (read-only tiles) |

### Overlap Zone

Where the Landscape and Cesium terrain overlap, z-fighting can occur. Two mitigation strategies:

1. **CesiumCartographicPolygon** (preferred): A polygon actor linked to the tileset's `CartographicPolygonExclusions` property. Cesium tiles inside the polygon are clipped, leaving only the Landscape visible. Not yet implemented — tracked for future work.

2. **Height offset** (current fallback): The Landscape is placed at the correct elevation via metadata scale factors. Minor z-fighting at edges is acceptable for scouting workflows.

## Cesium Tile Budget

Each scale tier defines Cesium streaming parameters:

| Parameter | What it controls | Small tier | Large tier |
|-----------|-----------------|------------|------------|
| `maxScreenSpaceError` | Tile detail threshold (lower = more detail, more tiles) | 8 | 48 |
| `maxSimultaneousTileLoads` | Concurrent tile downloads | 12 | 40 |
| `loadingDescendantLimit` | How deep the LOD tree loads | 20 | 80 |

These are written to the `Cesium3DTileset` actor via RC API at engine start. Smaller tiers use aggressive quality (low screen-space error) since the viewport covers a small area. Larger tiers relax quality to avoid streaming budget blowout.

### Performance Guidelines

| Tier | Expected GPU mem | Tile count | Target FPS |
|------|-----------------|------------|------------|
| `city_block` | ~200MB | 20-40 | 60 |
| `neighborhood` | ~400MB | 40-80 | 60 |
| `district` | ~600MB | 60-120 | 45+ |
| `valley` | ~800MB | 80-160 | 45+ |
| `canyon` | ~1.2GB | 120-240 | 30+ |
| `region` | ~1.5GB | 150-300 | 30+ |

These are estimates. Actual performance depends on GPU, scene complexity, and whether Google 3D Tiles are active (which roughly doubles tile count).

## OSM Simplification

Vector data from Overpass API is simplified via Douglas-Peucker before import. The tolerance scales with the tier:

- `city_block`: 0.000005° (~0.5m) — preserves curb geometry
- `neighborhood`: 0.00002° (~2m) — default, preserves block shapes
- `region`: 0.002° (~200m) — only major roads and waterways

## Future Work

- **CesiumCartographicPolygon clipping**: Spawn exclusion polygon matching Landscape bounds to eliminate z-fighting
- **Multi-Landscape tiling**: For `canyon`/`region` tiers, split into multiple Landscape actors for better LOD within the baked area
- **Streaming budget monitoring**: Expose tile count and GPU memory in `/api/status` for runtime tuning
- **Distance-based material quality**: Reduce material complexity on distant Landscape sections
