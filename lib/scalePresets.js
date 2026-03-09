/**
 * Scale Presets
 * Define terrain capture and rendering parameters for different geographic scales.
 * Follows the same pattern as localePresets.js — a simple config export.
 */

export const SCALE_PRESETS = {
  city_block: {
    label: 'City Block',
    radiusMeters: 150,
    demResolution: 1,       // meters per pixel
    landscapeSize: 253,     // nearest valid UE Landscape dimension
    cesium: {
      maxScreenSpaceError: 8,
      maxSimultaneousTileLoads: 12,
      loadingDescendantLimit: 20
    },
    osmSimplifyTolerance: 0.000005,  // ~0.5m
    notes: 'Single intersection or building cluster. Maximum detail.'
  },

  neighborhood: {
    label: 'Neighborhood',
    radiusMeters: 500,
    demResolution: 1,
    landscapeSize: 1009,
    cesium: {
      maxScreenSpaceError: 8,
      maxSimultaneousTileLoads: 16,
      loadingDescendantLimit: 30
    },
    osmSimplifyTolerance: 0.00002,   // ~2m
    notes: 'Default. ~10 city blocks. Current Manhattan test uses this.'
  },

  district: {
    label: 'District',
    radiusMeters: 1500,
    demResolution: 2,
    landscapeSize: 1009,
    cesium: {
      maxScreenSpaceError: 12,
      maxSimultaneousTileLoads: 20,
      loadingDescendantLimit: 40
    },
    osmSimplifyTolerance: 0.00005,   // ~5m
    notes: 'Lower Manhattan, a campus, small town center.'
  },

  valley: {
    label: 'Valley',
    radiusMeters: 5000,
    demResolution: 5,
    landscapeSize: 2017,
    cesium: {
      maxScreenSpaceError: 16,
      maxSimultaneousTileLoads: 24,
      loadingDescendantLimit: 50
    },
    osmSimplifyTolerance: 0.0001,    // ~10m
    notes: 'River valley, large park, small island.'
  },

  canyon: {
    label: 'Canyon',
    radiusMeters: 15000,
    demResolution: 10,
    landscapeSize: 4033,
    cesium: {
      maxScreenSpaceError: 24,
      maxSimultaneousTileLoads: 32,
      loadingDescendantLimit: 60
    },
    osmSimplifyTolerance: 0.0005,    // ~50m
    notes: 'Grand Canyon rim, large watershed.'
  },

  region: {
    label: 'Region',
    radiusMeters: 50000,
    demResolution: 30,
    landscapeSize: 4033,
    cesium: {
      maxScreenSpaceError: 48,
      maxSimultaneousTileLoads: 40,
      loadingDescendantLimit: 80
    },
    osmSimplifyTolerance: 0.002,     // ~200m
    notes: 'Entire county, large national park. Cesium does most of the work.'
  }
};

export const DEFAULT_SCALE = 'neighborhood';

/**
 * Resolve a scale preset by name, or return the default.
 * @param {string} [name]
 * @returns {{ key: string, preset: object }}
 */
export function resolveScale(name) {
  const key = (name && SCALE_PRESETS[name]) ? name : DEFAULT_SCALE;
  return { key, preset: SCALE_PRESETS[key] };
}

/**
 * Given a radius in meters, find the closest matching scale preset.
 * @param {number} radiusMeters
 * @returns {{ key: string, preset: object }}
 */
export function inferScale(radiusMeters) {
  let bestKey = DEFAULT_SCALE;
  let bestDiff = Infinity;
  for (const [key, preset] of Object.entries(SCALE_PRESETS)) {
    const diff = Math.abs(preset.radiusMeters - radiusMeters);
    if (diff < bestDiff) { bestDiff = diff; bestKey = key; }
  }
  return { key: bestKey, preset: SCALE_PRESETS[bestKey] };
}
