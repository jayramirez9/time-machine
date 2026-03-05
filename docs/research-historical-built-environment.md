# Research: Era-Accurate Built Environment

**Status**: Future research spike
**Problem**: Cesium OSM Buildings reflects today's skyline. Historical simulations need period-correct structures — no Twin Towers pre-1973, no Empire State pre-1931, and 1884 Manhattan had nothing taller than Trinity Church (86m). The physical geography itself changes: coastlines shift (lower Manhattan is largely landfill), bodies of water disappear (Collect Pond, filled 1811), and infrastructure comes and goes (Wall Street's wooden palisade, removed 1699).

---

## Approaches

### 1. Per-Feature Filtering on OSM Tiles

Cesium 3D Tiles supports per-feature styling via `Cesium3DTileStyle`. OSM buildings sometimes carry `start_date` metadata.

**Strategy**: Query or tag buildings by construction year. Hide anything built after the sim year. Show everything else.

**Pros**: Leverages existing tileset, no new geometry needed for "subtractive" accuracy.
**Cons**: OSM `start_date` coverage is spotty (~5-10% of buildings globally, better in NYC). Doesn't handle demolished buildings that should *appear*. Doesn't handle coastline/terrain changes.

**Implementation sketch**:
```js
// Cesium3DTileStyle condition
tileset.style = new Cesium.Cesium3DTileStyle({
  show: "${feature['start_date']} === undefined || Number(${feature['start_date']}) <= 1884"
});
```

Via RC API, this could be set as a property on the Cesium3DTileset actor.

### 2. Historical Building Footprint Datasets

Several digitized historical sources exist with precise building footprints:

**Sanborn Fire Insurance Maps** (Library of Congress)
- Coverage: US cities, ~1867–1970
- Detail: Individual building footprints, heights (in stories), construction material, use
- NYC coverage is exceptional — nearly every block documented
- Format: Digitized TIFF scans; some cities have vectorized GIS versions
- LOC digital collection: https://www.loc.gov/collections/sanborn-maps/
- NYC-specific vectorized: NYC Open Data has PLUTO (tax lot data back to ~1960s)

**Historical Atlases**
- Bromley atlases (NYC, 1879-1915) — block-level footprints with lot numbers
- G.W. Bromley & Co. atlases digitized by NYPL
- David Rumsey Map Collection — georeferenced historical maps

**Procedure**: Vectorize footprints from Sanborn/Bromley → extrude to story heights (assume ~3m/story) → generate simple box meshes or 3D Tiles → load as a second tileset alongside (or replacing) OSM Buildings.

**Pros**: Historically accurate at the building level. Public domain sources.
**Cons**: Labor-intensive vectorization. Only US cities with good Sanborn coverage. No architectural detail (just extruded boxes).

### 3. Era-Specific Tileset Layers

Maintain multiple building tilesets, each representing a time period:

| Layer | Period | Source |
|-------|--------|--------|
| `buildings_pre1900` | Pre-1900 | Sanborn/Bromley vectorization |
| `buildings_1900_1950` | 1900-1950 | Sanborn + early aerial photos |
| `buildings_1950_2001` | 1950-2001 | OSM filtered + manual edits |
| `buildings_post2001` | 2001-present | OSM Buildings (current) |

Load only the layers matching the sim year. The engine already knows the sim date — this becomes a tileset selection decision at launch time.

**Pros**: Clean separation, each layer can be refined independently.
**Cons**: Significant upfront work. Transition boundaries (what if a building spans eras?).

### 4. Landmark-Only Historical Models

For hero locations, model only the landmarks that define the skyline:

**1884 NYC landmarks**:
- Trinity Church (1846, 86m — tallest structure)
- Brooklyn Bridge (completed 1883)
- Western Union Building (1875, 70m)
- New York Tribune Building (1875, 79m)
- Elevated railways (Second Ave, Third Ave, Sixth Ave, Ninth Ave)
- Horse-drawn streetcar lines
- Gas lamp infrastructure

**Strategy**: Use the greybox spawner pattern (`tools/spawn-greybox.js`) to place landmark meshes at correct geolocated positions. These overlay the Cesium terrain, which provides the ground surface. OSM Buildings tileset is hidden entirely for deep historical dates.

**Pros**: High visual impact for key structures. Manageable scope.
**Cons**: Only works for well-researched locations. Background buildings missing.

### 5. Procedural Historical Generation

Use era-appropriate building archetypes + Sanborn footprints to procedurally generate a full historical streetscape:

- Parse Sanborn data for footprint + story count + material (brick, wood, iron)
- Select from a library of era-appropriate facade meshes (brownstone, cast iron, wood frame)
- Extrude and texture automatically
- Place at geolocated positions

This is essentially a city generator constrained by historical data. Ambitious but would scale to any well-documented US city.

---

## Physical Geography Changes

Beyond buildings, the land itself changes over time:

### Coastline / Landfill
- Manhattan's west side was extended ~200m by landfill (Battery Park City, 1970s-80s)
- Lower Manhattan east side: South Street Seaport area is largely fill (1800s)
- The original 1625 shoreline is dramatically different from today

**Data source**: Historical shoreline surveys (NOAA, NYC Municipal Archives). Georeferenced historical maps showing waterfront.

**Implementation**: For deep historical dates, use a historical coastline polygon to clip the terrain. Water where land hasn't been filled yet.

### Disappeared Water Features
- Collect Pond (Foley Square area, drained/filled 1811)
- Minetta Brook (Greenwich Village, culverted 1820s)

### Terrain Changes
- Hills leveled (Murray Hill was actually a hill)
- Streams and springs paved over

These could be modeled as terrain modifications: load the modern DEM, then apply historical corrections (raise where hills were, lower where fill was added).

---

## Data Sources Summary

| Source | Coverage | Era | Format | License |
|--------|----------|-----|--------|---------|
| Sanborn Maps (LOC) | US cities | 1867-1970 | Scanned TIFF | Public domain (pre-1929) |
| Bromley Atlases (NYPL) | NYC | 1879-1915 | Scanned/vectorized | Public domain |
| PLUTO (NYC Open Data) | NYC | ~1960s-present | Shapefile/GeoJSON | Open |
| OSM Buildings | Global | Present | 3D Tiles | ODbL |
| NOAA Historical Shorelines | US coast | Various | Shapefile | Public domain |
| David Rumsey Collection | Global | 1500s-1900s | Georeferenced TIFF | Free for non-commercial |

---

## Recommended Phased Approach

**Phase A (Quick win)**: Date-based OSM filtering. Hide buildings with `start_date` after sim year. Handles post-2001 NYC reasonably well (Twin Towers era vs. One WTC).

**Phase B (1884 NYC hero)**: Model 10-15 landmark structures as static meshes placed via the greybox spawner. Hide OSM Buildings entirely for pre-1900 dates. Use Cesium terrain + NAIP imagery for ground surface.

**Phase C (Sanborn integration)**: Vectorize Sanborn maps for the 1884 NYC focal area (~10 blocks). Extrude to box meshes. This gives a full streetscape without OSM.

**Phase D (Procedural city gen)**: Build an archetype library (brownstone, cast iron, wood frame) and a generator that reads Sanborn footprints and produces textured meshes. Scales to other cities/eras.

---

## Integration with Existing System

The locale preset system (`lib/localePresets.js`) already associates a location+era with specific configurations. A natural extension:

```js
// In localePresets.js
nyc_city_1884: {
  // ... existing audio/lighting config ...
  buildings: {
    osmFilter: { maxYear: 1884 },       // Phase A
    landmarks: 'greybox/nyc_1884',       // Phase B
    sanborn: 'sanborn/nyc_1884_blocks',  // Phase C
    coastline: 'coastlines/manhattan_1884' // Historical shoreline
  }
}
```

The engine would read this at launch and configure Cesium tileset styling + spawn historical meshes via RC API.
