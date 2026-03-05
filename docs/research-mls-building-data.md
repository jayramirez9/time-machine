# Research: MLS & Property Data for Building Reconstruction

**Date:** 2026-03-05
**Research Spike:** PRD #9 — MLS data as building source

## Key Takeaways

1. **Skip MLS, go straight to county assessor data + open building footprints.** MLS access requires real estate licensing or expensive vendor agreements, and photos are stripped from sold listings within 30-90 days. County assessor/tax records are public, unrestricted, and contain the critical structured fields (year built, sq ft, stories, lot size).

2. **Microsoft Building Footprints + Open City Model = free grey cubes at city scale.** Microsoft has 130M+ US building footprint polygons (free, ODbL license). Open City Model has 125M US buildings as CityGML LOD1 (extruded footprints with heights). These are ready-made 3D block models.

3. **ATTOM Data (~$95/mo) is the best enrichment source.** Aggregates county assessor data from 3,000+ counties. Provides year built, sq ft, stories, building class, lot dimensions via API. 30-day free trial available.

4. **Google Street View fills the photo gap** for facade reference images ($7/1000 requests). Not bulk-friendly but useful for spot-checking material/style for the AI texture pipeline.

5. **Year built is 90%+ complete** across most US markets via tax records — the critical field for era filtering.

---

## Recommended Stack for Grey-Cube Reconstruction

| Layer | Source | Cost | What It Provides |
|-------|--------|------|-----------------|
| Building footprints | Microsoft Building Footprints | Free (ODbL) | 130M+ US polygons with some height estimates |
| LOD1 block models | Open City Model | Free | 125M US buildings as extruded CityGML |
| Structured enrichment | ATTOM Data API | ~$95/mo | Year built, sq ft, stories, building class, lot size |
| Parcel geometry | Regrid | Per-county or enterprise | 151M parcels + 156M matched footprints |
| Building tags | OpenStreetMap | Free | `building:levels`, `building:material`, `roof:shape` (variable coverage) |
| Facade photos | Google Street View Static API | $7/1K requests | Exterior reference images for texture pipeline |

---

## MLS Data Access — Why It's Not the Right Path

### Access Restrictions
- **RETS is deprecated** (retired 2018). RESO Web API is the modern standard.
- Direct MLS access requires a real estate license or signed vendor/IDX agreement with a participating broker. No public developer signup.
- Using MLS photos for 3D reconstruction would likely violate most MLS terms of service.

### Photo Problem
- Active listings have 15-40 photos, but **photos are stripped from sold/delisted listings within 30-90 days**.
- Historical photos are essentially unobtainable programmatically.
- Photos are not standardized angles — they vary wildly by agent.

### Third-Party Aggregators

| Provider | Coverage | Key Fields | Pricing | Access |
|----------|----------|------------|---------|--------|
| Zillow/Bridge Interactive | 148M properties | Year built, sq ft, photos, Zestimates | ~$500/mo | Invite-only |
| ATTOM Data | 158M properties, 9K+ fields | Year built, sq ft, lot, tax data, permits | ~$95/mo | 30-day free trial |
| CoreLogic | 99.9% US market | Year built, sq ft, exterior wall type, roof type, construction class | Enterprise ($$$$) | Sales contact |
| BatchData | 155M properties | Year built, sq ft, tax records, transactions | $500/mo (20K records) | API key |
| Regrid | 151M parcels + 156M footprints | Parcel geometry, building footprint polygons, land use | Per-county | Self-serve store |

**CoreLogic** is the strongest for exterior materials and roof type classification, but it's enterprise-only pricing.

---

## County Assessor / Tax Records — The Better Path

### Why This Works
- **Public record** — no licensing restrictions. Anyone can access.
- **Foundational source** — ATTOM, CoreLogic, and others aggregate FROM county assessor data.
- Year built, sq ft, lot dimensions, stories, building class are consistently available.
- Some counties include exterior wall material, roof type, foundation type.
- Some counties provide **improvement sketches** (building footprint drawings with dimensions).

### Aggregated Access

| Source | Coverage | Access |
|--------|----------|--------|
| ATTOM Assessor Data | 3,000+ counties | API + bulk |
| TaxNetUSA | 300+ counties (TX, FL focus) | API + bulk, includes improvement sketches |
| Regrid | 151M parcels | API + bulk + county store |
| County GIS portals | Varies | Web, sometimes WFS/API |

### Completeness vs MLS
- **Stronger than MLS:** Year built, lot dimensions, building class, assessed value (more consistent)
- **Weaker than MLS:** No interior photos, no listing descriptions, no real-time market data
- **Comparable:** Square footage, stories, basic building characteristics

---

## Free / Open Data Sources for 3D Buildings

### Microsoft Global ML Building Footprints
- **130M+ US footprint polygons** with height estimates for ~20%
- Free, ODbL license
- Download GeoJSON for area of interest
- https://github.com/microsoft/GlobalMLBuildingFootprints

### Open City Model
- **125M US buildings** as CityGML/CityJSON LOD1 (extruded footprints)
- Free, ready-made 3D block models
- https://github.com/opencitymodel/opencitymodel

### OpenStreetMap Simple 3D Buildings
- Crowd-sourced `building:levels`, `building:material`, `roof:shape` tags
- Excellent in cities, variable elsewhere
- Supports LOD1/LOD2 generation via OSM2World
- https://wiki.openstreetmap.org/wiki/Simple3DBuildingsV1

### GlobalBuildingAtlas (TU Munich, Dec 2025)
- Satellite-derived LOD1 3D models globally
- Building polygons + heights
- https://essd.copernicus.org/articles/17/6647/2025/

### GeoTexBuild (April 2025)
- AI framework generating textured 3D building models from map footprints
- Uses ControlNet + Text2Mesh
- Directly relevant to our grey-cube → skinned-mesh pipeline
- https://arxiv.org/html/2504.08419v1

---

## Recommended Approach for Time Machine

### Present-Day / Modern Scenes
1. **Microsoft footprints + Open City Model** — free LOD1 block models
2. **ATTOM** ($95/mo) — enrich with year built for era filtering
3. **Google Street View** — facade photos for AI texture pipeline

### Historical Scenes (Pre-Photography Era, e.g., 1884 NYC)
1. Year built from tax records is the critical filter
2. Cross-reference with **Sanborn fire insurance maps** (Library of Congress, free) for historical footprints and building materials
3. Sanborn provides what assessor data can't: the actual footprint and material at a specific historical date

### Mid-Century Scenes (1940s-2000s)
This is where the approach shines — assessor year-built data is near-complete for this era:
1. Start with Open City Model / Microsoft footprints for current geometry
2. Filter by year built: remove buildings constructed after target date
3. Use Street View + any available historical aerial imagery for facade reference
4. AI texture pipeline: reference photos → PBR materials

### Pipeline Summary
```
Location input
    ↓
Microsoft Footprints → building polygons + heights (free)
    ↓
ATTOM enrichment → year built, stories, sq ft, building class ($95/mo)
    ↓
Era filter → remove buildings newer than WorldState date
    ↓
Grey cubes placed on terrain (from Phase 5 DEM pipeline)
    ↓
Facade reference (Street View / historical photos)
    ↓
AI photo→PBR texture extraction
    ↓
Skinned buildings in Unreal
```

---

## Next Steps

1. **Download Microsoft Building Footprints** for a test area (Baton Rouge or Manhattan) and verify coverage/quality
2. **Sign up for ATTOM free trial** — test year-built enrichment for a neighborhood
3. **Evaluate Open City Model** LOD1 output — can it be imported directly into Unreal?
4. **Test GeoTexBuild** — the AI framework for generating textured buildings from footprints is directly relevant
5. **Prototype grey-cube pipeline** — footprints → extruded cubes → placed on DEM terrain → year-built filtering
