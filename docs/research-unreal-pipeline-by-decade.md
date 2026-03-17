# Research Spike: Unreal Visual Pipeline Strategy by Decade

**Date:** 2026-03-16
**Status:** In progress
**Relates to:** Phase 6 (Historical Urban Form), Phase 5 (Geographic Data Pipeline)

---

## The Problem

The visual pipeline for Time Machine must reconstruct any Place×Time in Unreal Engine. But the available data sources and their accuracy vary dramatically by era. A 2020 scene can use streaming geodata as-is; a 1884 scene needs everything built from scratch. The pipeline strategy must adapt.

This document maps out, by decade, what data sources are available, how accurate they are, and what the pipeline strategy should be for each.

---

## Data Source Availability by Decade

### Cesium Streaming (OSM Buildings + World Terrain)

| Data | Coverage | Notes |
|------|----------|-------|
| **Terrain** | ~Any era | Terrain changes slowly. Usable for all but major earthworks (landfill, quarry, reservoir). |
| **OSM Buildings** | 2010s–present | 1.4B buildings. Some have `start_date` tags but coverage is <5%. |
| **Street grid** | 2000s–present | Modern road network. Highways added post-1960 are wrong for earlier eras. |
| **Google 3D Tiles** | 2020s only | Photorealistic but strictly present-day. Scouting/preview only (ToS). |

### Historical Data Sources

| Source | Era Coverage | Availability | Fidelity |
|--------|-------------|-------------|----------|
| **Sanborn Fire Insurance Maps** | 1867–1950s | LOC digitized ~50K maps across ~12K US cities | Building footprints, heights, materials, use |
| **LOC/NYPL Photo Archives** | 1860s–present | Millions of photos, searchable by location | Varies — some buildings, some street scenes |
| **USGS Historical Topo Maps** | 1880s–present | Complete US coverage | Street grid, building footprints (rough) |
| **Historical aerial photography** | 1930s–present | USGS, state archives, university collections | Building footprints from above |
| **City directories / property records** | 1800s–present | Often digitized by local libraries | What existed at an address, but no geometry |
| **Google Street View time slider** | 2007–present | Major roads only | Facade photos for reference |

### AI Generation Sources

| Source | Input | Output | Best For |
|--------|-------|--------|----------|
| **Meshy Text-to-3D** | Architecture style prompt | Textured 3D mesh | Buildings with metadata but no photo |
| **Meshy Image-to-3D** | Reference photo | Textured 3D mesh | Known buildings with photos |
| **Meshy Retexture** | Existing geometry + style prompt | Re-skinned mesh | Adding period textures to massing volumes |
| **Nano Banana (Gemini)** | Location + date + weather state | Period reference image | Generating reference images when no photo exists |

---

## Pipeline Strategy by Decade

### 2010s–Present: "Cesium Is Ground Truth"

**Data accuracy:** Cesium OSM Buildings + Google 3D Tiles are near-perfect.
**Pipeline:**
1. Cesium World Terrain (streaming)
2. Cesium OSM Buildings (streaming) — as-is, no filtering needed
3. Google 3D Tiles for photorealistic preview (scouting only)
4. Weather engine drives lighting/atmosphere

**What's missing:** Only street life (people, cars, signage). Geometry is solved.
**Effort:** Minimal — just connect weather engine to Cesium.

---

### 2000s: "Cesium Minus a Few Buildings"

**Data accuracy:** 90%+ of buildings correct. Some new towers (post-2010) need removal.
**Pipeline:**
1. Cesium terrain (streaming)
2. Cesium OSM Buildings with **removal overlay** — identify post-era buildings, hide them
3. Historical overlay: small remove-list of known anachronisms
4. Google Street View time slider (2007+) provides facade reference for most buildings

**What's missing:** A few demolished-then-rebuilt buildings. Street furniture, signage, vehicles.
**Effort:** Low — mostly curation, minimal generation.

---

### 1990s: "Cesium With Moderate Editing"

**Data accuracy:** ~80%. Strip malls rebuilt, some urban redevelopment, early big-box stores appeared.
**Pipeline:**
1. Cesium terrain (streaming)
2. Cesium OSM Buildings with **heavier removal overlay**
3. Meshy Text-to-3D for missing buildings (with `general_late20c` styles)
4. Reference photos from local newspaper archives, early web archives

**What's missing:** Growing number of replaced buildings. Period signage and vehicles become important.
**Effort:** Moderate — curation + some AI generation.

---

### 1980s: "The Transition Decade"

**Data accuracy:** ~60%. Significant urban change since then in most US cities. Suburbs expanded, downtowns transformed, many commercial buildings replaced.
**Pipeline:**
1. Cesium terrain (streaming) — still valid, terrain doesn't change much
2. Cesium OSM Buildings as **starting point only** — filter aggressively
3. Historical overlay with curated add/remove lists
4. Meshy Text-to-3D for missing buildings (`general_late20c` styles work here)
5. Nano Banana reference images for buildings with no photo
6. Local knowledge becomes important (user curation of what was where)
7. Historical aerial photography (USGS, state archives) for validation

**What's missing:** Specific businesses, signage, vehicles, street furniture. The "feel" of the era.
**Key challenge:** This is the first decade where personal memory is a data source but formal archives are thin. Too old for Google Street View, too modern for dedicated historical preservation.
**Effort:** High — significant curation + AI generation.

---

### 1970s: "Cesium Is Mostly Wrong for Buildings"

**Data accuracy:** ~40%. Most commercial areas have been rebuilt at least once since.
**Pipeline:**
1. Cesium terrain (streaming) — still mostly valid
2. Cesium street grid as **reference** — but highways may be different (pre-interstate in some areas)
3. Historical overlay with extensive curation
4. Sanborn maps (if city is covered, maps extend to ~1950s in some areas)
5. USGS historical topo maps for street grid validation
6. LOC/NYPL photos for major buildings
7. Meshy generation for all missing buildings
8. Nano Banana for reference images

**What's missing:** Most buildings, period vehicles, street culture.
**Effort:** Very high — more generation than streaming.

---

### 1960s–1950s: "The Last Sanborn Decade"

**Data accuracy:** Cesium buildings are ~20% correct (only the oldest surviving structures).
**Pipeline:**
1. Cesium terrain (streaming)
2. Sanborn maps (last editions ~1950s) — primary footprint source
3. Procedural massing from Sanborn data
4. Architecture style classification (`general_midcentury` / `general_deco`)
5. Meshy texturing on procedural massing
6. LOC photos for landmarks and main streets
7. Historical aerial photography for validation

**What's missing:** Almost everything visual. But Sanborn + architecture styles + Meshy = plausible.
**Effort:** Very high — almost entirely generated.

---

### 1940s–1900s: "Sanborn + Historical Photos"

**Data accuracy:** Cesium buildings are wrong. Terrain is valid. Street grid partially valid.
**Pipeline:**
1. Cesium terrain (streaming) — valid for most locations
2. Sanborn maps — primary source (peak coverage for this era)
3. Procedural massing from Sanborn footprints
4. Architecture style classification (era-specific rules: `general_progressive`, `general_victorian`)
5. LOC/NYPL photo archives (rich for major cities in this era)
6. Meshy Image-to-3D from historical photos (hero buildings)
7. Meshy Text-to-3D for buildings without photos
8. Historical overlay for terrain changes (landfill, coastline, rivers)

**What's missing:** Street life. But geometry pipeline is strong with Sanborn + photos.
**Effort:** Very high but data-rich — Sanborn maps are excellent for this era.

---

### Pre-1900: "Everything Is Built From Scratch"

**Data accuracy:** Cesium terrain only. Everything else is wrong or nonexistent.
**Pipeline:**
1. Cesium terrain (streaming) — may need historical coastline/landfill overlay
2. Sanborn maps (coverage begins 1867 in some cities)
3. Historical maps and atlases (LOC, David Rumsey Collection)
4. Procedural massing from Sanborn footprints
5. Architecture style classification (era-specific: `nyc_1884`, `general_victorian`, `general_antebellum`)
6. LOC photo archives (earliest photographs ~1860s)
7. Meshy generation for all buildings
8. Hand-authored hero landmarks (`lib/landmarks.js`)
9. Full street layout classification (cobblestone, gas lamps)

**What's missing:** Everything. But this is the most data-rich era for specialized archives.
**Effort:** Maximum — but the pipeline is already built for this (1884 NYC was the first target).

---

## The Decade Gradient

```
2020s  ████████████████████░  Cesium is ground truth. Stream everything.
2010s  ██████████████████░░░  Minor filtering. Almost free.
2000s  ████████████████░░░░░  Some removal + curation.
1990s  ██████████████░░░░░░░  Moderate curation + some generation.
1980s  ██████████░░░░░░░░░░░  Heavy curation + AI generation. Personal memory helps.
1970s  ████████░░░░░░░░░░░░░  Mostly generated. Reference photos sparse.
1960s  ██████░░░░░░░░░░░░░░░  Sanborn + generation. Last decade of fire insurance maps.
1950s  █████░░░░░░░░░░░░░░░░  Sanborn + aerial photos + generation.
1940s  ████░░░░░░░░░░░░░░░░░  Sanborn + LOC photos + full generation.
1900s  ███░░░░░░░░░░░░░░░░░░  Rich archives but everything must be built.
1800s  ██░░░░░░░░░░░░░░░░░░░  Sanborn (after 1867) + maps + generation.
Pre-1800 █░░░░░░░░░░░░░░░░░░░░  Historical maps only. Maximum reconstruction.

█ = Cesium/streaming data accuracy
░ = Must be generated/curated
```

---

## Key Insight

**The pipeline doesn't change by decade — the data mix does.**

Every era uses the same pipeline:
1. Terrain (Cesium streaming, always valid)
2. Building footprints (Cesium OSM → Sanborn → maps, depending on era)
3. Building geometry (streaming → procedural massing → AI generation)
4. Building textures (streaming → Meshy retexture → Meshy text-to-3D)
5. Street layout (modern → historical classification)
6. Weather + lighting (always works, data quality varies)
7. Audio (procedural → location-specific)

The decade determines the **ratio** of streaming vs. generated content. The tools stay the same.

---

## Recommendations

1. **Build the historical overlay system for real** — it's the gating feature for every era before 2010. Start with 1980s Baton Rouge as the test case.
2. **Automate Cesium building date filtering** — even partial `start_date` tag coverage helps for 1990s–2000s.
3. **Build a "personal knowledge" curation tool** — for the 1980s decade where formal archives are thin but human memory is rich. Let users annotate: "this was a gas station", "this building wasn't here yet."
4. **Prioritize the Nano Banana → Meshy reference image pipeline** — it's the critical path for every decade before Google Street View (pre-2007).
5. **Don't overinvest in per-city era rulesets** — the general era system (`resolveEra()`) covers most cases. City-specific rulesets (`nyc_1884`, `chicago_1920`) are for showcase scenes, not the general pipeline.

---

## Next Steps

- [ ] Test 1980s Baton Rouge with existing pipeline (weather, audio, terrain)
- [ ] Populate first historical overlay for Baton Rouge 1980s (user-curated)
- [ ] Validate `general_late20c` architecture styles for a real suburban location
- [ ] Test Meshy generation with 1980s suburban building prompts
- [ ] Research Cesium OSM `start_date` tag coverage for Baton Rouge
