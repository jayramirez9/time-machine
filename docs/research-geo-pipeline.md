# Geographic Data Pipeline Research

Research compiled March 2026 for the Time Machine project.
Covers approaches, tools, community recommendations, licensing, and a recommended path forward.

---

## Executive Summary

**The recommended approach is a two-track strategy:**

1. **Cesium for Unreal + Cesium World Terrain + Cesium OSM Buildings** for the core pipeline (terrain + building volumes). This is free, open-source, proven, and has no restrictive licensing.

2. **USGS 3DEP / SRTM heightmaps** imported as native Unreal Landscape actors for scenes where you need editable terrain (which is most Time Machine scenes, since we'll be dressing terrain with period content).

**Google Photorealistic 3D Tiles are NOT recommended** for Time Machine due to licensing restrictions that likely prohibit use in an immersive experience product, mandatory always-online streaming, and inability to create derivative content. They're useful for reference and previewing, but not for production scenes.

---

## Approach 1: Cesium for Unreal (Primary)

### What It Is

Cesium for Unreal is a free, open-source (Apache 2.0) plugin that streams real-world 3D geospatial data into Unreal Engine. Funded by an Epic MegaGrant. Actively maintained with monthly releases. Supports UE 5.5, 5.6, and 5.7 as of late 2025.

### What You Get

- **Cesium World Terrain**: Global terrain with up to 50cm resolution. Quantized mesh format. Fuses USGS 3DEP (US), EU-DEM, ArcticDEM, and other sources. Included free with all Cesium ion plans.
- **Cesium OSM Buildings**: ~1.4 billion buildings from OpenStreetMap, extruded with realistic heights. Simple geometry (not photorealistic), but clean and accurate footprints. Free.
- **Bing Maps Aerial Imagery**: 2D satellite imagery draped on terrain. Up to 15cm resolution. (Note: Bing Maps being retired for standard accounts June 2025, but Cesium maintains enterprise access through at least September 2026.)
- **WGS84 Georeference**: Full-scale globe with Earth curvature, correct gravity direction. Place Unreal origin at any lat/lon.

### How It Works

1. Install Cesium for Unreal plugin (free on Fab/Marketplace)
2. Create Cesium ion account (free Community tier for personal/evaluation use)
3. In Unreal, open Cesium panel → Quick Add → Cesium World Terrain + imagery
4. Set CesiumGeoreference lat/lon/height to your target location
5. Terrain streams in automatically with LOD

### Strengths

- **Free and open source** (plugin is Apache 2.0; Cesium ion Community is free for non-commercial)
- **Global coverage** — works for Grand Canyon, Manhattan, anywhere
- **Physics and collision** supported on streamed terrain
- **Level-of-detail streaming** handles any scale
- **Active development** — monthly releases, responsive community
- **No derivative content restrictions** on Cesium's own terrain data
- Supports importing your own datasets: GeoTIFF, OBJ, FBX, glTF, LAS/LAZ, CityGML, KML

### Limitations

- **Streaming-only by default** — terrain is streamed, not baked as a native Landscape actor
- **No direct conversion to editable Landscape** — this is the biggest gap. You can't take Cesium terrain and turn it into Unreal's native Landscape with sculpting/painting tools. Workarounds exist (Geometry Script, render-to-heightmap) but they're not first-class
- **Texture coordinates issue** in UE 5.3/5.4 caused 8x GPU memory overhead (fixed in later versions)
- **Tiles unload when off-screen** — physics objects can fall through terrain that's not in view
- **Internet required** for streaming (offline possible with Cesium ion Self-Hosted, commercial license)

### Pricing (Commercial Use)

| Plan | Cost/mo | Notes |
|------|---------|-------|
| Community (Free) | $0 | Personal, evaluation, unfunded education only |
| Commercial (Individual) | $149 | Required if revenue > $50K/year |
| Commercial (Team) | $524 | Multiple users |
| Premium | $499-874 | Higher quotas |
| Self-Hosted | Contact sales | On-premises, offline capable |

All plans: unlimited apps, unlimited end users.

### Tutorials & Resources

- **Official Quickstart**: https://cesium.com/learn/unreal/unreal-quickstart/
- **Adding Datasets**: https://cesium.com/learn/unreal/unreal-datasets/
- **Epic Dev Community — "Cesium For Architects and World Builders"**: Free course on integrating Cesium with Unreal
- **Medium — "Step-by-Step Guide: Creating a 3D World with Cesium in UE5"** by The Engineer's Mindset
- **Geoawesome (Aug 2025)** — "Using Real World Terrain in Games" overview article

---

## Approach 2: Heightmap Import (Editable Terrain)

### Why This Matters for Time Machine

Cesium streams terrain but you can't edit it. For Time Machine, we need to:
- Replace modern ground textures with period-appropriate materials
- Paint landscape layers (cobblestone, dirt, grass) per era
- Place foliage, props, and buildings on terrain that responds to Unreal's native tools
- Work offline for reliability

The answer: **import real-world heightmaps as native Unreal Landscape actors**.

### Pipeline

```
1. Get elevation data (USGS 3DEP, SRTM, OpenTopography)
        ↓
2. Process in QGIS (merge tiles, reproject, clip to area)
        ↓
3. Export as 16-bit GeoTIFF or R16 heightmap
        ↓
4. Import into Unreal as Landscape (Import from File)
        ↓
5. Apply materials, paint layers, place foliage
```

### Elevation Data Sources

| Source | Resolution | Coverage | Format |
|--------|-----------|----------|--------|
| **USGS 3DEP** (National Map) | 1m (LiDAR), 10m (full US) | Continental US | GeoTIFF DEM |
| **NASA SRTM GL1** (OpenTopography) | ~30m | Global (56°S to 60°N) | HGT, GeoTIFF |
| **ALOS World 3D** | ~30m | Global | GeoTIFF |
| **Copernicus DEM** (ESA) | 30m (GLO-30) | Global | GeoTIFF |
| **US National Elevation Dataset** | 10m | US only | GeoTIFF |
| **Viewfinder Panoramas** | 3 arc-sec (~90m) | Global, void-filled | HGT |

Best for Time Machine: **USGS 3DEP at 1m** for US locations (Baton Rouge, NYC, Grand Canyon). This is LiDAR-derived, bare-earth elevation — extremely accurate.

### Tools

- **QGIS** (free, open source): Merge tiles, reproject to UTM, clip to bounding box, export GeoTIFF
- **GeotiffLandscape plugin** (GitHub: iwer/GeotiffLandscape): Direct GeoTIFF import into Unreal's Landscape system. Handles projection, scaling, interpolation from 30m DEM to 1m Landscape resolution
- **Terrain.party**: Still online, but inconsistent. Better to go directly to USGS/OpenTopography
- **GIMP/Photoshop**: Convert GeoTIFF to 16-bit PNG/R16 if needed

### Strengths

- **Fully editable** — native Unreal Landscape with sculpting, painting, foliage, material layers
- **Works offline** — data is baked into the project
- **Period-appropriate materials** — paint cobblestone, dirt, grass layers per era
- **No licensing restrictions** — USGS/SRTM data is public domain
- **Deterministic** — terrain doesn't change between sessions

### Limitations

- **Manual process** — not "type a location and go" (yet)
- **Resolution ceiling** — 30m global, 1m US. Urban canyons may need additional detail
- **No buildings included** — just bare terrain. Buildings come from other sources (OSM, Sanborn, photogrammetry)
- **Flat water** — water bodies need separate treatment

### Community Workflow (Unreal Forums, Nov 2024)

> "My workflow is USGS/NOAA to QGIS to GIMP to Unreal."
> — Unreal Engine forum user, "Importing Real World Geo Data Into UE5" thread

---

## Approach 3: Google Photorealistic 3D Tiles (Reference Only)

### What It Is

Google's Photorealistic 3D Tiles provide textured 3D mesh data for ~2,500 cities across 49 countries. Streamed via the Map Tiles API through Cesium for Unreal.

### Why NOT for Production Use in Time Machine

**Licensing is the hard blocker:**

1. **"Visualization only"** — Google's Map Tiles API policies state tiles must be used for "map visualizations." An immersive environmental simulation is arguably not a "map visualization."

2. **No derivative content** — You cannot: trace features from tiles, create 3D models derived from tiles, build terrain models from elevation values, or use ML/image analysis on tile data. This directly conflicts with our plan to use geographic data as a base for historical content.

3. **No caching or offline use** — Tiles must stream live. Cannot pre-fetch or store. Hard blocker for a reliable installation.

4. **Attribution requirements** — Must display Google Maps logo and copyright at all times. Conflicts with immersive experience design.

5. **Promotional video cap** — Max 30 seconds, must be labeled "promotional purposes only."

6. **Data instability** — Tiles can change without notice between sessions. No version locking.

7. **EEA restriction** — As of July 2025, Map Tiles API is not available in the European Economic Area.

### Where Google 3D Tiles ARE Useful

- **Previewing and scouting locations** before committing to full scene builds
- **Reference material** for modeling teams (view a location from multiple angles)
- **Validating terrain accuracy** (compare your heightmap import against Google's 3D mesh)
- **Quick demos** showing "this is the location we'll build"

### Pricing

| Item | Cost |
|------|------|
| Root tileset request | $6.00 per 1,000 requests |
| Free tier | ~1,000 requests/month |
| Session duration | 3 hours per root request |
| Tile fetches within session | Unlimited, not separately billed |

### Tutorial

Official: https://cesium.com/learn/unreal/unreal-photorealistic-3d-tiles/

Two methods:
1. **Via Cesium ion** — one-click add, Cesium handles attribution
2. **Direct URL** — set tileset URL to `https://tile.googleapis.com/v1/3dtiles/root.json?key=YOUR_API_KEY`

---

## Approach 4: Blender GIS → Unreal (Supplementary)

### Pipeline

```
USGS/SRTM data → QGIS (process) → BlenderGIS/BlenderOSM (3D scene) → FBX export → Unreal
```

### When to Use

- Building OSM-sourced building geometry with materials
- Custom photogrammetry processing
- When you need hand-tuned 3D environments from real-world data

### Key Tools

- **BlenderGIS addon**: Imports DEM heightmaps into Blender's 3D workspace
- **BlenderOSM addon**: Constructs building geometry from OSM data with heights and roof types
- **World Creator 2025.1**: Commercial terrain sculpting tool with real-world data import and direct Unreal export

---

## Approach 5: Custom Photogrammetry (Future)

For maximum quality at specific locations, capture your own:

1. **Drone capture** of the target location
2. **Bentley ContextCapture** or **OpenDroneMap** to process into 3D Tiles
3. Import via Cesium for Unreal or as FBX/glTF

This gives you:
- Full licensing control
- Sub-centimeter resolution where you fly
- Period-neutral terrain (trees/buildings can be removed in post)
- Offline capability

Cost: Drone + processing time per location. Scales poorly to many locations but gives the best result for hero locations.

---

## YouTube Creators & Tutorials

| Creator / Source | Focus | Notes |
|-----------------|-------|-------|
| **Cesium (official)** | Cesium for Unreal tutorials | Best starting point. Quickstart, datasets, Google 3D Tiles |
| **Epic Games Dev Community** | "Cesium For Architects and World Builders" | Free multi-module course |
| **Unreal Sensei (Zach)** | General UE5 tutorials | California-based, beginner-friendly |
| **Smart Poly** | UE4/UE5 tutorials | Wide range of UE content |
| **Freedom Arts** | Terrain generation | Step-by-step terrain workflows |
| **DevAddict** | Game dev / UE tutorials | Dynamic visuals focus |
| **Underscore (Bev)** | Game creation in UE | Australian artist, practical focus |
| **George Maestri** (LinkedIn Learning) | Real-world terrain import | Uses OpenTopography data |
| **The Gab Meister** | "3D Geospatial Landscapes with Cesium for UE" | Detailed writeup with workflow |

**Additional creators from deeper research:**

| Creator / Source | Focus | Notes |
|-----------------|-------|-------|
| **Freedom Arts** | Google Map 3D → UE5 (full tutorials) | Uses RenderDoc + Blender pipeline to extract Google Maps 3D meshes. "Google Map 3D to Unreal Engine 5 — Full Tutorial" (23 min) |
| **Matt Linkert** (@mattlinkert_) | "Import Earth into UE5 Speedrun" | Quick-hit tutorials, fastest path from Google Earth to UE5 |
| **World of Level Design (AlexG)** | Heightmap import mastery | "Secrets to Generating Real-World Heightmaps from Terrain Party for UE4" — the definitive heightmap guide |
| **Undini** | Houdini + LiDAR → UE | "Importing Terrain Data into Unreal using Lidar & Houdini" — 30-min complete pipeline |
| **Cinematography Database (Matt Workman)** | Filmmaking in UE, environments | "Unreal Engine for Filmmakers" series |
| **William Faucher** | VFX, lighting, volumetric clouds | Credits on Black Panther, HBO Watchmen; UE5 Lumen/Nanite focus |
| **UnrealCG** | Environment art techniques | Wide range of UE tutorials |
| **AccuCities** | 3D city models in UE5 | 3-part tutorial using accurate 3D London models with Nanite |
| **Simon Blakeney** | VR + Cesium + Google 3D Tiles | Published Jan 2024, covers VR-specific setup, LOD, below-surface issues |

Search YouTube for: "Cesium for Unreal tutorial", "Google Photorealistic 3D Tiles Unreal", "real world terrain Unreal Engine 5", "CityBLD Unreal", "Houdini LiDAR Unreal"

---

## Community Consensus (Forums, Hacker News, Cesium Community)

### What Works

- **Cesium for Unreal is the clear winner** for streaming real-world terrain into UE. No serious competitor for global-scale geospatial data in Unreal.
- **Google 3D Tiles look incredible** for covered urban areas. Best photorealistic quality available.
- **Heightmap import** remains the most reliable path for editable terrain in game-style projects.
- **NBC Sports used Cesium for Unreal** for 3D graphics during the 2024 Summer Olympics.
- **Parametrix** used Cesium + Google 3D Tiles to help Las Vegas secure a $25M grant.

### What Doesn't Work

- **Converting Cesium tiles to editable Landscape** — no clean path exists. This is the #1 community complaint. Users describe trying to convert Cesium terrain to UE's editable Landscape as "grueling, tedious, and generally terrible."
- **Ground-level viewing of Google 3D Tiles** — quality degrades significantly. Photogrammetry was captured from aerial angles (40-60° tilt). Street-level views look distorted.
- **Fast camera movement** — tiles load late or in lower resolution during rapid maneuvers.
- **Cesium + Pixel Streaming** — had packaging conflicts in UE 5.4 (library collision).
- **Baked shadows in satellite imagery** — Cesium terrain textures have shadows/clouds baked in, which conflicts with dynamic lighting.

### Known Cesium Visual Issues (from GitHub/Forums)

- **Flickering artifacts**: White pixel flickering from DitherFade material during LOD transitions (GitHub issue #1388). Workaround: remove DitherFade layer, disable occlusion culling
- **Google 3D Tiles look blurrier in UE than in Google Earth** — even with MaximumScreenSpaceError set to 1. Different rendering pipelines
- **Performance**: User with RTX 4090 / AMD 7950X3D / 64GB DDR5 at 3840x1440 reported only 50-70 FPS with 25% GPU utilization, suggesting CPU-bound streaming bottlenecks
- **Baked shadows in satellite imagery** conflict with dynamic lighting (our weather engine). Cesium terrain textures have shadows/clouds baked into the satellite imagery

### Common Pitfalls

- Free Cesium ion Community plan is **not licensed for commercial use** if revenue > $50K
- Google 3D Tiles ToS are more restrictive than most people realize
- Heightmaps from terrain.party are often 8-bit — make sure to get 16-bit from USGS
- DEM resolution (30m) needs interpolation for Unreal's 1m-per-pixel Landscape system
- Always check CRS (coordinate reference system) before importing — projection errors cause terrain distortion

---

## Recommended Strategy for Time Machine

### Phase 5 Implementation Plan

**Track A — Cesium Streaming (Fast Preview & Scouting)**

Use Cesium World Terrain + OSM Buildings as the "type a location, see it instantly" tool. This is for:
- Location scouting and framing
- Validating that our weather engine looks right over real terrain
- Quick demos and concept validation
- Understanding building density, street layout, sight lines

**Track B — Heightmap Pipeline (Production Scenes)**

For every production scene (a location that will actually ship):
1. Pull USGS 3DEP DEM for the bounding area
2. Process in QGIS → export 16-bit GeoTIFF
3. Import as native Unreal Landscape
4. Apply era-appropriate landscape materials (cobblestone, dirt, grass, etc.)
5. Place buildings from Sanborn data (Phase 6) on the native Landscape
6. Drive lighting/atmosphere from the weather engine

**Track C — Photogrammetry (Hero Locations)**

For the handful of locations where maximum quality matters:
- Drone capture + ContextCapture/OpenDroneMap
- Full control over licensing, resolution, and offline access

### The Handoff

Cesium gives you the quick "Grand Canyon in 30 seconds" experience. The heightmap pipeline gives you the editable, offline, licensable terrain for production. Historical content (Phase 6) layers on top of the production terrain.

The key automation target: **a script/tool that takes a location string, fetches the USGS DEM, processes it, and produces an Unreal-ready heightmap + landscape material** — eliminating the manual QGIS step.

---

## Additional Tools Worth Investigating

### CityBLD (Procedural City Generator)

A UE5 plugin that recreates real-world cities from OpenStreetMap data. Has a demo video recreating 1:1 Manhattan. 3-part tutorial on Epic Dev Community covers OSM data integration with GIS coordinates. This could be very relevant for Time Machine's urban scenes — it bridges the gap between raw OSM building footprints and a navigable Unreal city.

- [Part 1](https://dev.epicgames.com/community/learning/tutorials/wP8j/unreal-engine-creating-procedural-urban-environments-with-citybld-a-step-by-step-ue-guide-part-1)
- [Part 2](https://dev.epicgames.com/community/learning/tutorials/EkYe/unreal-engine-creating-procedural-urban-environments-with-citybld-a-step-by-step-ue-guide-part-2)
- [Part 3](https://dev.epicgames.com/community/learning/tutorials/Zm5a/unreal-engine-creating-procedural-urban-environments-with-citybld-a-step-by-step-ue-guide-part-3)

### TerraForm PRO (GIS → UE Plugin)

Paid plugin that imports GIS data (GeoTIFF DEMs, SHP vector files) directly into UE. Creates native Landscapes, Landscape Splines (roads from GIS road data), and procedural meshes. Uses QGIS for data preparation. Millimeter-precision geographic accuracy. Community describes it as "really fast and powerful" and a "game changer."

- [TerraFormPRO.com](https://www.terraformpro.com/)
- Free tier available (TerraForm Lite)

### Houdini + LiDAR Pipeline

The highest-fidelity approach. SideFX Houdini processes LiDAR point cloud data into UE5-compatible heightfields. A YouTuber called **Undini** has tutorials showing the complete pipeline in ~30 minutes. SideFX has an official "Advanced Terrains using LiDAR" course.

- [80 Level — Undini LiDAR Tutorial](https://80.lv/articles/tutorial-importing-terrain-data-into-unreal-using-lidar-houdini)
- [SideFX — Advanced Terrains with LiDAR](https://www.sidefx.com/tutorials/advanced-terrains-in-houdini-using-lidar/)

### StreetMap Plugin (Mike Fricker / Epic Games)

Open-source plugin that imports OpenStreetMap XML directly into UE. Generates renderable meshes from road and building data with full road connectivity for navigation.

- [GitHub — StreetMap Plugin](https://github.com/ue4plugins/StreetMap)

### Landscape Combinator Plugin

Free for personal use. Creates real-world landscapes from heightmap data in a few steps. Available on UE Forums.

- [UE Forum Thread](https://forums.unrealengine.com/t/plugin-landscape-combinator-a-plugin-to-create-real-world-landscapes-free-for-personal-use/772305)

### ArcGIS Maps SDK for Unreal Engine

Esri's enterprise GIS SDK. Similar to Cesium but backed by Esri's ecosystem. Supports 3D Tiles, buildings, point clouds, vector/image tiles. Has sample projects for real-time weather and time-of-day controls. Enterprise pricing — overkill for our needs but worth knowing about.

- [ArcGIS SDK for UE](https://developers.arcgis.com/unreal-engine/)

---

## Weather Engine Integration with Cesium

Cesium provides `CesiumSunSky`, a globe-aware sun and atmosphere system. This is directly compatible with our weather engine:

- **CesiumSunSky's Solar Time** can be driven dynamically — maps to our time progression
- **Light intensity** (default 111,000 lux) can be adjusted for overcast/storm conditions
- **Sky Atmosphere** settings control Rayleigh/Mie scattering — suitable for weather state transitions
- You can **replace CesiumSunSky's Directional Light** with a custom one for more control

Our existing `unreal` transport dispatch types map cleanly:
- `rotation` → DirectionalLight sun position (drives CesiumSunSky's Solar Time)
- `property` → ExponentialHeightFog density
- `material_scalar` → Volumetric cloud coverage
- `niagara` → Precipitation particles
- `landscape_scalar` → Ground wetness (**requires editable Landscape, NOT Cesium tiles** — reinforces the hybrid approach)
- `postprocess` → Heat haze

**Critical note**: Baked shadows in Google 3D Tiles satellite imagery will conflict with our dynamic lighting. This is another reason to use Cesium tiles only for distant context, not the focal area.

---

## Recommended Prototype Steps

1. **Install Cesium for Unreal** and add Google Photorealistic 3D Tiles for Baton Rouge. Evaluate ground-level quality firsthand.
2. **Test Cartographic Polygons**: Clip a neighborhood block and place a test building to validate the replacement workflow.
3. **Test weather integration**: Connect the existing `unreal` transport to CesiumSunSky properties. Verify dynamic time-of-day and atmosphere control work together.
4. **Import a USGS DEM heightmap** for the same area as an editable Landscape. Blend with Cesium tiles using Cartographic Polygons.
5. **Benchmark performance**: Run the weather engine alongside Cesium tile streaming. Identify frame-rate or latency conflicts.
6. **Evaluate Landscape Combinator plugin** as a potential automation tool for the heightmap import pipeline.

---

## Key Decision Points

1. **Cesium ion plan**: Community (free) for evaluation, Commercial ($149/mo) once we ship anything commercially
2. **Google 3D Tiles**: Use for reference/scouting only, not production. Avoid ToS risk entirely
3. **Primary terrain source**: USGS 3DEP for US locations, SRTM/Copernicus for international
4. **Building data**: Cesium OSM Buildings for modern reference, Sanborn maps for historical
5. **Offline requirement**: Yes — Time Machine installations must work without internet. This rules out streaming-only approaches for production

---

## Reference Videos

### "Google Maps in Unreal Engine 5 is INSANE!!" — Bad Decisions Studio (June 2023)

https://youtu.be/mrC5IencIKA

The baseline tutorial that introduced the Cesium + Google 3D Tiles pipeline. Shows the complete workflow in 5 minutes:

1. Install Cesium for Unreal plugin from Epic Marketplace
2. Enable Google Map Tiles API, get API key
3. Add CesiumSunSky + blank Cesium3DTileset
4. Set tileset source to "From URL" with Google's 3D Tiles endpoint + API key
5. Set CesiumGeoreference lat/lon to teleport to any location

**Still works in 2026.** Core workflow is unchanged. Their practical findings also still hold:
- Low MaxScreenSpaceError burns through API quota fast (they hit the limit mid-project)
- CesiumSunSky has limited controllability — they ended up using UE's default Environment Light Mixer
- Write Alpha must be off for sky to render in PNG sequences

**Why we're going beyond this approach:** Their pipeline is scouting/cinematics-only. For Time Machine we need editable terrain (period materials, ground wetness), dynamic lighting (weather engine controls everything), offline capability, and no Google ToS restrictions. The two-track strategy uses this exact workflow for quick previews, then USGS heightmaps for production scenes.

---

## Decision Log

**March 4, 2026 — Geo pipeline is foundational priority.**

Agreed that terrain must come before any building art pass, period lighting, gas lamps, etc. The pipeline is era-independent — same terrain for 1884 and 2024. Proceeding with the two-track approach:

1. **Track A (Scouting):** Cesium + Google 3D Tiles per the Bad Decisions Studio workflow — instant location preview
2. **Track B (Production):** USGS 3DEP heightmaps → native Unreal Landscape — editable, offline, full weather engine integration

Next concrete step: prototype both tracks for Baton Rouge (existing test location) and validate that the weather engine drives atmosphere correctly over real terrain.

---

## Sources

### Official Documentation
- [Cesium for Unreal Quickstart](https://cesium.com/learn/unreal/unreal-quickstart/)
- [Cesium for Unreal — Google 3D Tiles Tutorial](https://cesium.com/learn/unreal/unreal-photorealistic-3d-tiles/)
- [Cesium for Unreal Plugin (Fab)](https://www.fab.com/listings/76c295fe-0dc6-4fd6-8319-e9833be427cd)
- [Cesium for Unreal GitHub](https://github.com/CesiumGS/cesium-unreal)
- [Cesium ion Pricing](https://cesium.com/platform/cesium-ion/pricing/)
- [Google Map Tiles API Policies](https://developers.google.com/maps/documentation/tile/policies)
- [Google Map Tiles API Billing](https://developers.google.com/maps/documentation/tile/usage-and-billing)
- [Google Photorealistic 3D Tiles Overview](https://developers.google.com/maps/documentation/tile/3d-tiles-overview)
- [Google Maps Platform Terms of Service](https://cloud.google.com/maps-platform/terms)
- [Cesium — Google Maps Content Third Party Terms](https://cesium.com/legal/terms-for-google/)
- [USGS — Where can I get global elevation data?](https://www.usgs.gov/faqs/where-can-i-get-global-elevation-data)

### Community & Tutorials
- [Epic Dev Community — Cesium For Architects and World Builders (Free Course)](https://dev.epicgames.com/community/learning/tutorials/DPzX/unreal-engine-fab-cesium-for-architects-and-world-builders-module-2-free-course)
- [Epic Dev Community — Unreal VR + Cesium + Google 3D Tiles](https://dev.epicgames.com/community/learning/tutorials/v2ZB/unreal-engine-unreal-vr-cesium-google-photorealistic-3d-tiles)
- [Medium — Step-by-Step Guide: Creating a 3D World with Cesium in UE5](https://medium.com/@theengineersmindset/step-by-step-guide-creating-a-3d-world-with-cesium-in-unreal-engine-5-b13dd9662698)
- [Geoawesome — Using Real World Terrain in Games](https://geoawesome.com/using-real-world-terrain-in-games-cesium-for-unreal-engine-5/)
- [The Gab Meister — 3D Geospatial Landscapes with Cesium for UE](https://thegabmeister.com/p/landscapes-cesium-unreal/)
- [Unreal Engine Forums — The best way to have the entire world in UE5?](https://forums.unrealengine.com/t/the-best-way-to-have-the-entire-world-in-ue5/684737)
- [Unreal Engine Forums — Importing Real World Geo Data Into UE5](https://forums.unrealengine.com/t/importing-real-world-geo-data-into-ue5/519151)
- [Unreal Engine Forums — Using GIS Data to Create Real World Landscapes](https://forums.unrealengine.com/t/tutorial-using-maps-gis-data-to-create-real-world-landscapes-in-ue4-in-less-than-a-day/107586)
- [Cesium Community — Using topography from Cesium as landscape](https://community.cesium.com/t/using-topography-from-cesium-as-landscape/16234)
- [Cesium Community — Google photorealistic 3D Tiles editing](https://community.cesium.com/t/google-photorealistic-3d-tiles-editing/34521)
- [Cesium Community — Export Google 3D Tiles for Unreal](https://community.cesium.com/t/export-google-3d-tiles-for-unreal/38007)
- [Epic Dev Community — Using Geometry Script to Replace Cesium Tiles](https://dev.epicgames.com/community/learning/tutorials/1GYl/unreal-engine-using-geometry-script-and-blueprints-to-quickly-replace-cesium-tiles)
- [Hacker News — Cesium for Unreal Discussion](https://news.ycombinator.com/item?id=42563845)
- [GeotiffLandscape Plugin (GitHub)](https://github.com/iwer/GeotiffLandscape)
- [Unreal Engine GIS Useful Links (GitHub Gist)](https://gist.github.com/FONQRI/92dfb565ab7c60f473541f7c9d7eeb13)
- [Heightmap Sources List (GitHub Gist)](https://gist.github.com/unitycoder/bb0d64da971c6e74972ed5d8c41eab0a)

### Pricing & Licensing
- [Cesium ion Pricing Plans](https://cesium.com/platform/cesium-ion/pricing/)
- [Cesium Content Usage and Attribution Guide](https://cesium.com/learn/ion/content-usage-and-attribution-guide/)
- [Google Maps Platform Pricing](https://developers.google.com/maps/documentation/tile/usage-and-billing)
- [Cesium ion Terms of Service](https://cesium.com/legal/terms-of-service/)
