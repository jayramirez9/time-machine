# Research: MLS & Property Data for Building Reconstruction

**Date:** 2026-03-05
**Status:** Complete
**Relevance:** Building geometry data for 3D scene reconstruction in Time Machine

---

## Summary / Key Takeaways

- Direct MLS access is **restricted to licensed agents/brokers** -- not a viable path for our use case.
- **County assessor/tax records** are the best practical path: public record, no licensing restrictions, and provide year built, sq ft, lot size, and stories for 90%+ of US residential properties.
- **Microsoft Building Footprints** (free, 130M+ US polygons) + **Open City Model** (free, 125M CityGML LOD1 models) provide ready-made building geometry for grey-cube generation.
- **ATTOM Data** (~$95/mo) is the best value aggregator for enriching footprints with tax assessor data (year built, stories, building class).
- **CoreLogic** has the richest building detail (exterior materials, roof type) but requires enterprise sales contact.
- For historical scenes (pre-photography), **year built from tax records** is the critical filter -- cross-reference with **Sanborn fire insurance maps** (Library of Congress, free) for historical footprints and materials.
- MLS photos are **not usable** for our purposes: restricted by licensing terms, removed after sale, and not standardized.

---

## 1. MLS Data Access Methods

### RETS (Deprecated)

RETS (Real Estate Transaction Standard) is **deprecated**. RESO officially retired it in 2018 and MLSs have been shutting down RETS feeds. It required MLS membership or a data-sharing agreement with a member broker. Not a viable path forward.

### RESO Web API (Current Standard)

The [RESO Web API](https://www.reso.org/reso-web-api/) is the modern replacement -- RESTful, OData v4 query syntax, JSON responses, OAuth 2.0 auth. NAR requires all REALTOR-affiliated MLSs to provide production RESO Web API access.

**How to get access:** You must contact individual MLSs directly. RESO creates standards, not data. Each MLS has its own licensing policies. In practice, **access is restricted to licensed brokers, agents, or technology vendors with a signed data-sharing agreement**. There is no public developer signup.

### Third-Party Aggregators

| Provider | Coverage | Key Building Fields | Pricing | Access |
|---|---|---|---|---|
| **[Zillow/Bridge Interactive](https://www.bridgeinteractive.com/developers/bridge-api/)** | 148M properties, 3,200 counties | Year built, sq ft, beds/baths, lot size, photos, Zestimates | From ~$500/mo; enterprise contracts | Invite-only, commercial use |
| **[ATTOM Data](https://www.attomdata.com/solutions/property-data-api/)** | 158M properties, 9,000+ fields | Year built, sq ft, lot size, ownership, tax data, building permits | From ~$95/mo; enterprise pricing | 30-day free trial, API key |
| **[CoreLogic](https://www.corelogic.com/360-property-data)** | 99.9% US housing market | Year built, sq ft, **exterior wall type**, **roof type**, construction class, ownership | Enterprise only (no public pricing) | Sales contact required |
| **[BatchData](https://batchdata.io/pricing)** | 155M properties, 700+ data points | Year built, sq ft, beds/baths, tax records, transaction history | From $500/mo (20K records); $0.01/call | API key, tiered plans |
| **[Regrid](https://regrid.com/)** | 151M parcels + 156M footprints | Parcel geometry, **building footprint polygons**, land use, tax data | County-level or nationwide bulk; contact for pricing | Self-serve store or enterprise |

**Which ones provide the fields we need:**
- **Year built**: All providers (ATTOM, CoreLogic, BatchData, Zillow)
- **Square footage**: All providers
- **Lot dimensions**: ATTOM, CoreLogic, Regrid (parcel geometry)
- **Stories**: ATTOM, CoreLogic, BatchData
- **Exterior materials**: **CoreLogic** is the strongest here -- classifies buildings by construction type (Frame, Masonry, Pre-Engineered Metal, etc.)
- **Roof type**: **CoreLogic** has explicit roof classification
- **Photos**: MLS listings (via Zillow/Bridge) have photos; tax/assessor records generally do not

---

## 2. Data Fields and Photo Availability

### Typical MLS Listing Fields

Address, price, sq ft, bedrooms/bathrooms, year built, lot size, property type, exterior construction, roof type, heating/cooling, garage, pool, HOA, days on market, agent info, listing status, and photos.

### Photos

- Active MLS listings typically have **15-40 photos** per property
- At least one exterior photo is required by most MLSs
- Photos are **not standardized angles** -- they vary wildly by agent
- Resolution is typically 1024-2048px on the long edge
- **Sold/delisted listings**: Photos are usually removed within 30-90 days after closing. Historical photos are extremely difficult to obtain programmatically

### Historical/Sold Data

- MLS data for **sold properties** is available through aggregators like ATTOM and Zillow (transaction history, sale price, date), but **photos are stripped**
- Tax assessor records persist indefinitely and include year built, sq ft, assessed value

### Year Built Completeness

Year built is one of the most reliably populated fields -- available for **90%+ of residential properties** across most markets via tax assessor records. Coverage is weaker for very old properties (pre-1900) and rural areas.

---

## 3. Licensing and Cost

### MLS Access Restrictions

- **Direct MLS access requires** a real estate license (agent/broker) or a signed vendor/IDX agreement with a participating broker
- NAR's IDX policy governs how listing data can be displayed; it was **not designed** for 3D reconstruction use cases
- Using MLS photos for building reconstruction would likely violate most MLS terms of service

### Third-Party Costs Summary

| Provider | Entry Price | Notes |
|---|---|---|
| ATTOM | ~$95/mo | 30-day free trial |
| BatchData | $500/mo (20K records) | Pay-as-you-go at $0.01/call |
| Zillow/Bridge | ~$500/mo | Invite-only |
| CoreLogic | Enterprise ($$$$) | Sales contact required |
| Regrid | Per-county or bulk | Self-serve store available |

### Free/Research Options

- **County assessor websites**: Free manual lookup, rarely have APIs
- **[Cook County (IL) open data](https://datacatalog.cookcountyil.gov/stories/s/Assessor-2025-Open-Data-Refresh/gzdr-q7c4/)**: Downloadable property characteristics
- **Microsoft Building Footprints**: Free, open data (ODbL), includes height estimates
- **OpenStreetMap**: Free building footprints with crowd-sourced height/stories tags
- **[Open City Model](https://github.com/opencitymodel/opencitymodel)**: Free CityGML LOD1 models for ~125M US buildings

---

## 4. County Assessor / Tax Records as Alternative

This is likely the **best practical path** for structured building data.

### What County Assessors Provide

- Year built, square footage, lot dimensions, number of stories, building class/use code
- Some counties include: exterior wall material, roof type, foundation type, number of units
- Assessed value, tax history, ownership records
- **Improvement sketches** (building footprint drawings with dimensions) -- available from some counties

### Aggregated Access

| Source | Coverage | Access | Notes |
|---|---|---|---|
| **[ATTOM Assessor Data](https://www.attomdata.com/data/property-data/assessor-data/)** | 3,000+ counties | API + bulk | Aggregates county assessor data nationwide |
| **[TaxNetUSA](https://www.taxnetusa.com/)** | 300+ counties (TX, FL focus) | API (XML/JSON) + bulk | Includes **improvement sketches** with building dimensions |
| **[Regrid](https://regrid.com/)** | 151M parcels | API + bulk + county store | Parcel geometry + matched building footprints |
| **County GIS portals** | Varies by county | Web, sometimes WFS/API | Many large counties have open GIS data with parcels |

### Key Advantage

Public record -- **no licensing restrictions**. Anyone can access tax assessor data. It is the foundational source that ATTOM, CoreLogic, and others aggregate from.

### Completeness vs MLS

- **Stronger**: Year built, lot dimensions, building class, assessed value (more consistent than MLS)
- **Weaker**: No interior photos, no listing descriptions, no real-time market data
- **Comparable**: Square footage, stories, basic building characteristics

---

## 5. Best Path for 3D Building Reconstruction

### Given an address, can you reliably get footprint, height, year built, material, photos?

| Data Point | Best Source | Reliability |
|---|---|---|
| **Footprint dimensions** | Microsoft Building Footprints (free) + Regrid parcels | High (AI-derived, 156M+ footprints) |
| **Height / stories** | Microsoft footprints (height estimate) + ATTOM/CoreLogic (stories) | Medium-High |
| **Year built** | ATTOM or county assessor | High (90%+) |
| **Exterior material** | CoreLogic (best), county assessor (varies) | Medium |
| **Photos** | Google Street View API, Bing Streetside | Medium (exterior only, modern) |

### Recommended Stack for Grey-Cube Reconstruction

1. **[Microsoft Global ML Building Footprints](https://github.com/microsoft/GlobalMLBuildingFootprints)** (free, ODbL) -- 130M+ US footprint polygons with height estimates for ~20%. Download GeoJSON for your area of interest. This gives you footprint geometry and estimated height.

2. **[Open City Model](https://github.com/opencitymodel/opencitymodel)** (free) -- 125M US buildings as CityGML/CityJSON LOD1 (extruded footprints). Ready-made 3D block models.

3. **ATTOM API** (~$95/mo) -- Enrich footprints with year built, stories, building class, sq ft from tax assessor records. Query by lat/lon or address.

4. **OpenStreetMap** (free) -- Crowd-sourced building tags including `building:levels`, `building:material`, `roof:shape`. Coverage varies but is excellent in cities. The [Simple 3D Buildings](https://wiki.openstreetmap.org/wiki/Simple3DBuildingsV1) spec supports LOD1/LOD2 generation.

5. **Google Street View Static API** -- For facade reference images. $7/1000 requests. Not bulk-friendly but useful for spot-checking material/style.

### Existing 3D Reconstruction Projects

- **[Open City Model](https://github.com/opencitymodel/opencitymodel)**: LOD1 CityGML for all US buildings. Free. Closest existing project to what we need.
- **[GlobalBuildingAtlas (TU Munich)](https://essd.copernicus.org/articles/17/6647/2025/)**: Satellite-derived LOD1 3D models globally, with building polygons + heights. Published December 2025.
- **[GeoTexBuild](https://arxiv.org/html/2504.08419v1)**: AI framework that generates textured 3D building models from map footprints using ControlNet + Text2Mesh. Published April 2025.
- **[awesome-citygml](https://github.com/OloOcki/awesome-citygml)**: Curated list of open CityGML datasets worldwide (many European cities have LOD2 with roof shapes).
- **OSM-3D / OSM2World**: Generates LOD1/LOD2 buildings from OpenStreetMap data including roof types.

---

## Recommendations

For generating grey cubes representing historical buildings in Time Machine:

1. **Start with Microsoft footprints + Open City Model** -- free LOD1 block models for any US location
2. **Enrich with ATTOM** ($95/mo) for year built filtering (exclude buildings built after your target date)
3. **Use OSM `building:levels`** where available to refine heights
4. **For historical scenes** (pre-photography era like 1884 NYC): year built from tax records is the critical filter. Cross-reference with Sanborn fire insurance maps (Library of Congress, free) for historical footprints and building materials

This approach avoids MLS licensing entirely, uses public/open data, and provides the footprint + height + year-built data needed for grey-cube generation at city scale.

---

## Sources

- [RESO Web API](https://www.reso.org/reso-web-api/)
- [NAR RETS/Web API Policy](https://www.nar.realtor/about-nar/policies/mls-policy/real-estate-transaction-standards-rets-web-api)
- [Zillow/Bridge Interactive API](https://www.bridgeinteractive.com/developers/bridge-api/)
- [ATTOM Property Data API](https://www.attomdata.com/solutions/property-data-api/)
- [ATTOM Assessor Data](https://www.attomdata.com/data/property-data/assessor-data/)
- [CoreLogic 360 Property Data](https://www.corelogic.com/360-property-data)
- [BatchData Pricing](https://batchdata.io/pricing)
- [Regrid Parcel Data + Building Footprints](https://regrid.com/)
- [TaxNetUSA Property Data API](https://www.taxnetusa.com/data/web-service-api/)
- [Cook County Assessor Open Data 2025](https://datacatalog.cookcountyil.gov/stories/s/Assessor-2025-Open-Data-Refresh/gzdr-q7c4/)
- [Microsoft US Building Footprints](https://github.com/microsoft/USBuildingFootprints)
- [Microsoft Global ML Building Footprints](https://github.com/microsoft/GlobalMLBuildingFootprints)
- [Open City Model (CityGML for US)](https://github.com/opencitymodel/opencitymodel)
- [GlobalBuildingAtlas (TU Munich)](https://essd.copernicus.org/articles/17/6647/2025/)
- [GeoTexBuild (arXiv)](https://arxiv.org/html/2504.08419v1)
- [awesome-citygml](https://github.com/OloOcki/awesome-citygml)
- [OSM Simple 3D Buildings](https://wiki.openstreetmap.org/wiki/Simple3DBuildingsV1)
- [SimplyRETS (RESO API wrapper)](https://simplyrets.com/)
