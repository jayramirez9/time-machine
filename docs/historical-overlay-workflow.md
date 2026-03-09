# Historical Overlay Workflow

How modern terrain becomes a base for historical content. Defines the contract between Phase 5 (terrain) and Phase 6 (urban form).

## Problem

Phase 5 produces accurate modern terrain. Phase 6 needs to place 1884 buildings on it. But between then and now:

- Landfill changed coastlines (Battery Park City didn't exist in 1884)
- Streets were regraded (subway construction, utility tunnels)
- Water bodies disappeared (Collect Pond filled 1811, marshes drained)
- The street grid shifted (Broadway straightened, avenues extended)

The overlay system describes these differences so Phase 6 tools can compensate.

## Layer Model

Modern terrain is the base layer. Historical overlays are additive/subtractive modifications stacked on top.

```
┌─────────────────────────────────────────┐
│  Phase 6: Historical meshes + materials │  ← Sanborn buildings, cobblestone, gas lamps
├─────────────────────────────────────────┤
│  Overlay: Modifications                 │  ← Height deltas, surface swaps, feature masks
├─────────────────────────────────────────┤
│  Phase 5: Modern terrain base           │  ← USGS 3DEP DEM + NAIP imagery + OSM vectors
└─────────────────────────────────────────┘
```

### Modification Types

| Type | What it does | Example |
|------|-------------|---------|
| `terrain_delta` | Adjust terrain height in an area | Remove Battery Park landfill (−5m, replace with water) |
| `surface_swap` | Replace modern material with historical | Asphalt → granite cobblestone below 14th St |
| `feature_add` | Add a feature that no longer exists | 2nd Ave Elevated Railway (built 1878, demolished 1940) |
| `feature_remove` | Hide a modern feature | Remove FDR Drive (built 1934–42) |
| `coastline` | Define historical shoreline | 1884 Manhattan waterfront (pre-landfill) |
| `osm_filter` | Date-filter OSM buildings | Hide buildings with `start_date` > 1884 |

## Overlay File Format

Overlay files live in `terrain-data/{slug}/` alongside the DEM and vectors. Schema defined in `lib/historicalOverlay.js`.

```
terrain-data/manhattan-ny/
  ├── metadata.json
  ├── heightmap.r16
  ├── overlay-nyc-1884.json    ← historical overlay
  └── ...
```

### Schema (v1)

```json
{
  "schemaVersion": 1,
  "location": "Manhattan, NY",
  "targetYear": 1884,
  "baseTerrainSlug": "manhattan-ny",
  "createdAt": "2026-03-10T00:00:00.000Z",
  "modifications": [
    {
      "id": "unique-id",
      "type": "terrain_delta|surface_swap|feature_add|feature_remove|coastline|osm_filter",
      "description": "Human-readable description of the change",
      "extent": { "type": "Polygon|LineString|Point", "coordinates": [...] },
      "confidence": "verified|estimated|inferred|unavailable",
      "source": "Citation for the data"
    }
  ],
  "heightAnchoring": {
    "strategy": "modern_ground",
    "gradeToleranceMeters": 2,
    "historicalDEMAvailable": false
  },
  "osmBuildingFilter": {
    "enabled": true,
    "maxConstructionYear": 1884
  },
  "sources": [
    { "id": "source-id", "name": "Source Name", "type": "atlas|survey|insurance_map|topo_map", "url": "..." }
  ]
}
```

See `docs/overlay-example-nyc-1884.json` for a complete working example.

## Confidence Tracking

Four levels, from most to least reliable:

| Level | Meaning | Phase 6 rendering strategy |
|-------|---------|---------------------------|
| `verified` | Primary source with coordinates (surveys, engineering records) | Apply modification directly |
| `estimated` | Derived from maps, photos, secondary sources | Apply with visual approximation marker |
| `inferred` | Extrapolated from patterns or general knowledge | Apply but flag as speculative |
| `unavailable` | No data | Use modern terrain as-is |

`confidenceSummary()` in `lib/historicalOverlay.js` produces a distribution count for reporting.

## Height Anchoring

When Phase 6 places 1884 buildings on modern terrain, vertical alignment is needed.

### Rules

1. **Buildings anchor at modern ground level.** Even if the historical street grade was different, we place building foundations at today's DEM elevation. This avoids floating or buried buildings.

2. **Grade tolerance: 2 meters.** Manhattan street grades have changed < 2m in most locations since 1884 (exceptions: Murray Hill, landfill areas). Within tolerance, modern ground is good enough.

3. **Historical DEM flag.** The `heightAnchoring.historicalDEMAvailable` field defaults to `false`. When set to `true` (future: reconstructed from topographic maps), Phase 6 tools can use the historical DEM for placement instead.

4. **Terrain delta zones.** Areas where the grade changed significantly (> 2m) are captured as `terrain_delta` modifications. Phase 6 can either apply the delta to the Landscape or offset building foundations.

## OSM Building Date Filtering

OSM buildings sometimes carry a `start_date` tag. The overlay's `osmBuildingFilter` section enables date-based filtering:

```json
{
  "enabled": true,
  "maxConstructionYear": 1884
}
```

When enabled, the vector import pipeline (`lib/osmVectors.js`) can filter buildings by construction date, hiding post-era structures. Coverage is sparse (~5-10% of NYC buildings have `start_date`), so this is a best-effort filter — Phase 6 supplements with Sanborn map data.

## How Phase 6 Consumes This

Phase 6 tools read the overlay file and use it to:

1. **Filter OSM buildings** — hide post-era construction via `osm_filter` entries and `osmBuildingFilter` config
2. **Spawn historical meshes** — `feature_add` entries define where to place period structures (elevated railways, wharves, markets)
3. **Apply terrain modifications** — `terrain_delta` entries can be baked into a modified heightmap or applied as Landscape sculpt operations
4. **Swap surface materials** — `surface_swap` entries map modern → historical materials on the Landscape material layers
5. **Define historical coastlines** — `coastline` entries mask water vs land at the period shoreline

### Locale Preset Integration

Historical locale presets in `lib/localePresets.js` can reference an overlay:

```js
nyc_city_1884: {
  audioBaseDb: 28,
  activity: 0.40,
  hazeBias: 0.04,
  audioProfileId: 'nyc_city_1884',
  scalePreset: 'neighborhood',
  overlay: 'nyc_city_1884'
}
```

The `overlay` field is resolved to `terrain-data/{slug}/overlay-{id}.json`. Non-historical locales omit it.

## Schema Evolution

The `schemaVersion: 1` field allows future changes. Possible v2 additions:

- Per-modification height offset (for fine-grained building placement)
- Material property maps (roughness, color for cobblestone variants)
- Temporal ranges (feature existed from year X to year Y)
- Linked Sanborn map sheet references
