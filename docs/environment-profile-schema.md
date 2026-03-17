# Environment Profile Schema (v1)

An Environment Profile is the complete description of a place at a moment in history. It is the master document that the agent research pipeline (Phase 7) produces and that `startEngine()` consumes.

It replaces the simpler "locale preset" concept as the system matures. A locale preset becomes a lightweight pointer — `{ audioProfileId, hazeBias, ... }` — while the Environment Profile holds the full research output with sources and confidence ratings.

## Design Principles

1. **Every fact has a source.** Each layer carries `sources[]` and `knownCompromises[]`. No uncited claims.
2. **Confidence is explicit.** A 0–1 rating per layer, plus an overall profile confidence. Agents that can't find data say so — silence over wrongness.
3. **Audio profile stays separate.** The `soundscape` layer references an audio profile by ID. Audio profiles are large (hundreds of lines) and have their own v2 schema (`docs/audio-profile-schema-v2.md`). The Environment Profile doesn't duplicate them.
4. **Terrain data stays on disk.** The `terrain` layer references paths to heightmaps, imagery, GeoJSON, and splines. The profile doesn't embed binary data.
5. **Layers are optional.** An incomplete profile is valid. Missing layers are `null`. The accuracy manifest documents what's missing and why.
6. **Machine-readable, human-reviewable.** A human approves every profile before it drives a simulation. The accuracy manifest is the review checklist.

## File Location

Environment Profiles live in `profiles/{id}.json`. Audio profiles remain in `audio-profiles/`. Terrain data remains in `terrain-data/{slug}/`.

## Top-Level Structure

```json
{
  "schemaVersion": 1,
  "id": "nyc_1884",
  "name": "New York City — June 1884",
  "description": "Lower Manhattan during the Gilded Age...",

  "location": {
    "name": "New York, NY",
    "lat": 40.7128,
    "lon": -74.006,
    "timezone": "America/New_York",
    "countryCode": "US"
  },

  "date": {
    "year": 1884,
    "month": 6,
    "day": 15
  },

  "layers": {
    "terrain":        { ... },
    "weather":        { ... },
    "soundscape":     { ... },
    "urbanForm":      { ... },
    "ecology":        { ... },
    "culture":        { ... },
    "music":          { ... },
    "materials":      { ... },
    "infrastructure": { ... }
  },

  "accuracyManifest": { ... },

  "generatedAt": "2026-03-17T00:00:00.000Z",
  "generatedBy": "agent_pipeline_v1"
}
```

### Required Fields

- `schemaVersion` — always `1`
- `id` — unique identifier, used as filename
- `name` — human-readable title
- `location` — at minimum `{ name, lat, lon }`
- `date` — at minimum `{ year }`
- `layers` — object with at least one non-null layer

### Optional Fields

- `description` — narrative context
- `location.timezone` — IANA timezone (inferred from lat/lon if absent)
- `location.countryCode` — ISO 3166-1 alpha-2
- `date.month`, `date.day` — null means "any" (seasonal/annual profile)
- `accuracyManifest` — auto-generated from layer metadata
- `generatedAt`, `generatedBy` — provenance metadata

## Layer Envelope

Every layer follows the same envelope:

```json
{
  "data": { ... },
  "confidence": 0.8,
  "sources": [
    {
      "id": "noaa_ghcn_usc00305801",
      "type": "weather_station",
      "name": "NOAA GHCN-Daily Central Park",
      "url": "https://www.ncdc.noaa.gov/cdo-web/datasets/GHCND/stations/GHCND:USW00094728",
      "citation": "NOAA Climate Data Online, GHCN-Daily, station USW00094728",
      "accessedAt": "2026-03-17"
    }
  ],
  "knownCompromises": [
    "Sub-daily interpolation is synthetic — based on solar position, not observed hourly data"
  ]
}
```

### Confidence Scale

| Value | Meaning | Example |
|-------|---------|---------|
| 0.9–1.0 | **Verified** — primary source, exact match | NOAA station data for this exact date |
| 0.7–0.89 | **Likely** — strong secondary source, small gap | Sanborn map from 1890 applied to 1884 (6yr gap) |
| 0.5–0.69 | **Interpolated** — inferred from related data | Ecology species pool from regional surveys |
| 0.3–0.49 | **Assumed** — reasonable guess, no direct evidence | Cultural customs inferred from newspaper archives |
| 0.0–0.29 | **Speculative** — placeholder, needs research | Generic era sounds, no location-specific data |

### Source Types

`weather_station`, `historical_map`, `census_record`, `photo_archive`, `newspaper_archive`, `ornithological_survey`, `botanical_survey`, `museum_collection`, `published_book`, `online_database`, `oral_history`, `procedural_generation`, `ai_generation`

## Layer Specifications

### Terrain

Physical ground truth — elevation, landform, water bodies. Usually stable across eras.

```json
{
  "data": {
    "demSource": "usgs_3dep",
    "demResolution": "1m",
    "landscapeSize": 1009,
    "elevationRange": [15.64, 43.08],
    "scalePreset": "neighborhood",
    "terrainDataPath": "terrain-data/manhattan-ny/",
    "heightmapPath": "terrain-data/manhattan-ny/heightmap.r16",
    "imageryPath": "terrain-data/manhattan-ny/imagery.png",
    "vectorsPath": "terrain-data/manhattan-ny/vectors.geojson",
    "historicalOverlay": null
  },
  "confidence": 0.95,
  "sources": [...],
  "knownCompromises": ["Satellite imagery is present-day, not period"]
}
```

### Weather

Atmospheric conditions. Provider selection and data quality metadata.

```json
{
  "data": {
    "provider": "noaa",
    "stationId": "USW00094728",
    "stationName": "NY CITY CENTRAL PARK",
    "stationDistance": "3.2km",
    "dataType": "daily",
    "dateRange": ["1884-01-01", "1884-12-31"],
    "interpolation": "solar_position",
    "fallbackProvider": "openmeteo",
    "providerConfig": {
      "provider": "noaa",
      "token": "env:NOAA_API_TOKEN"
    }
  },
  "confidence": 0.8,
  "sources": [...],
  "knownCompromises": [
    "Sub-daily interpolation is synthetic — NOAA provides only daily high/low/precip for this era",
    "Wind data sparse — estimated from regional patterns"
  ]
}
```

### Soundscape

References an audio profile. Does not duplicate audio profile content.

```json
{
  "data": {
    "audioProfileId": "nyc_city_1884",
    "audioProfilePath": "audio-profiles/nyc_city_1884.json",
    "generationMethod": "hand_authored",
    "assetStatus": "complete",
    "eventCount": 40,
    "voiceCount": 12,
    "layerCoverage": {
      "baseBed": true,
      "directionalBeds": true,
      "microEvents": true,
      "weather": true,
      "occlusion": true
    }
  },
  "confidence": 0.7,
  "sources": [
    {
      "id": "elevenlabs_generation",
      "type": "ai_generation",
      "name": "ElevenLabs Sound Effects API",
      "citation": "AI-generated from era-aware text prompts"
    }
  ],
  "knownCompromises": [
    "AI-generated sounds, not field recordings",
    "Generic era sounds — not location-specific (e.g., no specific church bell recordings)"
  ]
}
```

`generationMethod`: `hand_authored` | `procedural` | `agent_researched`
`assetStatus`: `pending` | `partial` | `complete`

### Urban Form

Building footprints, streets, landmarks, props — the physical built environment.

```json
{
  "data": {
    "buildingSource": "sanborn_1890",
    "footprintsPath": "terrain-data/manhattan-ny/buildings.geojson",
    "footprintCount": 29,
    "architectureEra": "nyc_1884",
    "streetsPath": "terrain-data/manhattan-ny/roads-splines.json",
    "streetCount": 253,
    "streetSurfaceRules": "nyc_1884",
    "landmarksPath": "terrain-data/manhattan-ny/landmarks.json",
    "landmarkCount": 6,
    "propYear": 1884,
    "propTypes": ["hitching_post", "horse_trough", "fire_hydrant", "bollard", "awning", "hanging_sign", "fire_alarm_box", "mailbox", "telegraph_pole", "newsstand"]
  },
  "confidence": 0.7,
  "sources": [
    {
      "id": "sanborn_1890_vol1",
      "type": "historical_map",
      "name": "Sanborn Fire Insurance Map, NYC Vol. 1, 1890",
      "url": "https://www.loc.gov/collections/sanborn-maps/",
      "citation": "Library of Congress, Sanborn Maps Collection"
    }
  ],
  "knownCompromises": [
    "Sanborn maps from 1890, not 1884 — 6-year gap. Building stock largely stable but some structures may differ",
    "Only 29 footprints traced (Bowling Green / Financial District) — not full coverage",
    "Street splines from modern OSM — road alignment stable but widths may differ"
  ]
}
```

### Ecology

Flora and fauna present at the location, season, and era.

```json
{
  "data": {
    "species": [
      {
        "commonName": "House Sparrow",
        "scientificName": "Passer domesticus",
        "type": "bird",
        "introduced": 1851,
        "native": false,
        "seasonal": { "spring": 0.8, "summer": 0.9, "fall": 0.7, "winter": 0.5 },
        "diurnal": { "dawn": 0.9, "day": 0.7, "dusk": 0.8, "night": 0.1 },
        "habitat": ["urban", "residential"],
        "density": 0.9
      }
    ],
    "vegetation": [
      {
        "type": "street_trees",
        "species": ["American Elm", "London Plane"],
        "coverage": "major_avenues",
        "seasonalCanopy": { "spring": 0.6, "summer": 1.0, "fall": 0.5, "winter": 0.0 }
      }
    ]
  },
  "confidence": 0.5,
  "sources": [...],
  "knownCompromises": [
    "Species pool inferred from regional Audubon data, not site-specific surveys",
    "Seasonal weights estimated, not observed"
  ]
}
```

### Culture

Language, commerce, social customs, daily life patterns.

```json
{
  "data": {
    "languages": {
      "primary": "English",
      "secondary": ["German", "Italian", "Yiddish", "Irish English"],
      "signage": "English"
    },
    "commerce": {
      "currency": "USD",
      "streetVendors": ["oyster seller", "hot corn girl", "ice man", "rag picker", "organ grinder"],
      "markets": ["Fulton Fish Market", "Washington Market"]
    },
    "dailyLife": {
      "workday": { "start": "07:00", "end": "18:00" },
      "peakActivity": ["08:00-09:00", "12:00-13:00", "17:00-18:00"],
      "sabbath": "Sunday"
    },
    "newspapers": ["New York Times", "New York Tribune", "New York World", "New York Herald"],
    "notableEvents": []
  },
  "confidence": 0.4,
  "sources": [...],
  "knownCompromises": [
    "Street vendor types from general Gilded Age NYC sources, not date-specific",
    "Daily life patterns are typical, not verified for this specific date"
  ]
}
```

### Music

Date-locked music catalog and performance formats.

```json
{
  "data": {
    "era": "pre_recording",
    "formats": ["barrel_organ", "brass_band", "parlor_piano", "street_musician", "church_organ"],
    "catalog": [],
    "genreWeights": { "popular": 0.5, "classical": 0.2, "folk": 0.2, "sacred": 0.1 },
    "performanceVenues": ["street_corner", "church", "beer_garden", "theater"],
    "notableSongs": ["Swanee River", "Camptown Races", "Beautiful Dreamer"]
  },
  "confidence": 0.3,
  "sources": [...],
  "knownCompromises": [
    "Pre-recording era — no audio recordings exist from 1884",
    "Song catalog based on published sheet music, not verified performance data"
  ]
}
```

`era`: `pre_recording` | `early_recording` | `broadcast_radio` | `broadcast_tv` | `streaming`

### Materials

Surface types that affect both sound and visual character.

```json
{
  "data": {
    "roads": {
      "primary": "belgian_block",
      "secondary": "cobblestone",
      "residential": "cobblestone",
      "alley": "dirt",
      "footway": "granite_flag"
    },
    "sidewalks": "granite_flag",
    "buildingFacades": ["brownstone", "cast_iron", "brick", "limestone", "granite"],
    "roofing": ["slate", "tin", "copper", "wood_shingle"],
    "acousticProperties": {
      "belgian_block": { "reverbSend": 3, "impactHardness": 0.8 },
      "cobblestone": { "reverbSend": 2, "impactHardness": 0.7 },
      "granite_flag": { "reverbSend": 1, "impactHardness": 0.6 },
      "dirt": { "reverbSend": -4, "impactHardness": 0.2 }
    }
  },
  "confidence": 0.7,
  "sources": [...],
  "knownCompromises": [
    "Road surface assignments from streetLayout.js era rules, not per-street historical records"
  ]
}
```

### Infrastructure

Technology present: lighting, transport, utilities.

```json
{
  "data": {
    "lighting": {
      "primary": "gas",
      "electric": ["Broadway below 14th St"],
      "lampSpacing": "30-40m",
      "lamplighterSchedule": "dusk"
    },
    "transport": {
      "modes": ["pedestrian", "horse_drawn_carriage", "horse_car", "elevated_railway", "ferry"],
      "elevatedRailway": {
        "routes": ["2nd Ave", "3rd Ave", "6th Ave", "9th Ave"],
        "fuel": "steam",
        "schedule": "5am-midnight"
      },
      "horseCar": {
        "routes": ["Broadway", "Bowery", "Bleecker St"]
      },
      "ferry": {
        "terminals": ["South Ferry", "Fulton Ferry"],
        "destinations": ["Brooklyn", "Staten Island", "Jersey City"]
      }
    },
    "utilities": {
      "water": "Croton Aqueduct",
      "sewage": "combined_sewer",
      "telegraph": true,
      "telephone": "limited",
      "electricity": "limited"
    }
  },
  "confidence": 0.6,
  "sources": [...],
  "knownCompromises": [
    "Elevated railway routes verified; exact schedules are approximate",
    "Horse car routes from general references, not 1884-specific timetables"
  ]
}
```

## Accuracy Manifest

Auto-generated summary for human review. Lives at `accuracyManifest` in the profile or standalone at `profiles/{id}-accuracy-manifest.json`.

```json
{
  "profileId": "nyc_1884",
  "overallConfidence": 0.6,
  "generatedAt": "2026-03-17T00:00:00.000Z",
  "layerSummary": {
    "terrain":        { "confidence": 0.95, "status": "verified" },
    "weather":        { "confidence": 0.8,  "status": "verified" },
    "soundscape":     { "confidence": 0.7,  "status": "complete" },
    "urbanForm":      { "confidence": 0.7,  "status": "partial" },
    "ecology":        { "confidence": 0.5,  "status": "interpolated" },
    "culture":        { "confidence": 0.4,  "status": "assumed" },
    "music":          { "confidence": 0.3,  "status": "assumed" },
    "materials":      { "confidence": 0.7,  "status": "likely" },
    "infrastructure": { "confidence": 0.6,  "status": "likely" }
  },
  "gaps": [
    "Ecology: No site-specific bird surveys found for 1884 Manhattan",
    "Culture: Street vendor types not verified for this specific date",
    "Music: Pre-recording era — no audio source material exists",
    "Urban Form: Only 29 of ~200+ buildings traced from Sanborn maps"
  ],
  "reviewChecklist": [
    "Verify building footprint accuracy against Sanborn sheets",
    "Confirm elevated railway routes for June 1884",
    "Review ecology species pool for plausibility",
    "Check cultural customs against period newspapers"
  ]
}
```

### Status Values

| Status | Confidence Range | Meaning |
|--------|-----------------|---------|
| `verified` | 0.8–1.0 | Primary source confirms |
| `complete` | 0.7–0.79 | Good data, fully populated |
| `likely` | 0.6–0.69 | Strong inference |
| `partial` | 0.5–0.59 | Incomplete data |
| `interpolated` | 0.4–0.49 | Inferred from related sources |
| `assumed` | 0.0–0.39 | Best guess, needs research |
| `missing` | — | Layer is null |

## Integration with Existing Systems

### Locale Presets

A locale preset can reference an Environment Profile:

```js
nyc_city_1884: {
  audioBaseDb: 28,
  activity: 0.40,
  hazeBias: 0.04,
  audioProfileId: 'nyc_city_1884',
  environmentProfileId: 'nyc_1884'  // ← new
}
```

When `environmentProfileId` is set, `startEngine()` loads the profile and uses its layer data to configure terrain, weather provider, and other subsystems.

### startEngine()

The engine accepts an optional `environmentProfilePath`:

```js
const engine = await startEngine({
  location: 'New York, NY',
  startLocalISO: '06-15-1884',
  environmentProfilePath: 'profiles/nyc_1884.json'
});
```

When provided, the profile's weather provider config, terrain paths, and audio profile ID take precedence over CLI flags.

### Agent Pipeline Output

The Phase 7 agent pipeline produces an Environment Profile:

```
generate-environment-profile "New York, NY" --year 1884
  → Weather agent queries NOAA
  → Ecology agent queries Audubon/eBird
  → Urban form agent fetches Sanborn maps
  → Cultural agent searches newspaper archives
  → Photo agent searches NYPL/LOC
  → Assembler merges all outputs
  → Accuracy manifest generated
  → profiles/nyc_1884.json written
```

## Versioning

- `schemaVersion: 1` — this document
- Future versions add fields; never remove. Old profiles remain valid.
- Audio profile schema version (v2) is independent of Environment Profile schema version.
