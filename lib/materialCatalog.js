/**
 * Material Catalog — Recipe-based material system for procedural scene texturing
 *
 * Maps building styles and street surfaces to material recipes. Each recipe defines
 * a base texture key + PBR parameters. At spawn time, the pipeline uses these recipes
 * to auto-create Unreal Material Instances from a single master material (M_TM_Surface).
 *
 * Era-agnostic: a brownstone in 1884 NYC and 1920 Brooklyn use the same base texture.
 * Per-style variation comes from tint, roughness, metallic, and tiling parameters.
 *
 * Base textures live in material-assets/{key}/ with base_color.png, normal.png,
 * and optionally roughness.png. Served by the daemon over HTTP.
 */

import { STYLES } from './architectureStyles.js';

// ─── Constants ──────────────────────────────────────────────────

export const MASTER_MATERIAL_PATH = '/Game/TimeMachine/Materials/M_TM_Surface';
export const MI_BASE_PATH = '/Game/TimeMachine/Materials';
export const TEX_BASE_PATH = '/Game/TimeMachine/Materials/Textures';

// ─── Base Texture Definitions ───────────────────────────────────

/**
 * Era-agnostic base texture sets. Each key corresponds to a directory
 * in material-assets/ containing base_color.png, normal.png, roughness.png.
 *
 * Parameters define the default PBR recipe for this texture.
 */
export const BASE_TEXTURES = {
  brownstone: {
    dir: 'brownstone',
    tint: [0.72, 0.58, 0.42],
    roughness: 0.85,
    metallic: 0.0,
    tilingScale: 2.0
  },
  brick_red: {
    dir: 'brick_red',
    tint: [1.0, 1.0, 1.0],
    roughness: 0.80,
    metallic: 0.0,
    tilingScale: 2.5
  },
  stone_grey: {
    dir: 'stone_grey',
    tint: [0.75, 0.75, 0.75],
    roughness: 0.75,
    metallic: 0.0,
    tilingScale: 1.5
  },
  limestone: {
    dir: 'limestone',
    tint: [0.92, 0.88, 0.78],
    roughness: 0.70,
    metallic: 0.0,
    tilingScale: 1.5
  },
  granite: {
    dir: 'granite',
    tint: [0.65, 0.65, 0.68],
    roughness: 0.65,
    metallic: 0.05,
    tilingScale: 1.5
  },
  cast_iron: {
    dir: 'cast_iron',
    tint: [0.35, 0.38, 0.40],
    roughness: 0.45,
    metallic: 0.75,
    tilingScale: 3.0
  },
  wood_clapboard: {
    dir: 'wood_clapboard',
    tint: [1.0, 1.0, 1.0],
    roughness: 0.80,
    metallic: 0.0,
    tilingScale: 2.0
  },
  concrete: {
    dir: 'concrete',
    tint: [0.80, 0.80, 0.80],
    roughness: 0.90,
    metallic: 0.0,
    tilingScale: 2.0
  },
  stucco: {
    dir: 'stucco',
    tint: [0.95, 0.92, 0.85],
    roughness: 0.85,
    metallic: 0.0,
    tilingScale: 2.0
  },
  terra_cotta: {
    dir: 'terra_cotta',
    tint: [0.85, 0.55, 0.35],
    roughness: 0.70,
    metallic: 0.0,
    tilingScale: 2.0
  },
  steel_frame: {
    dir: 'steel_frame',
    tint: [0.60, 0.60, 0.62],
    roughness: 0.50,
    metallic: 0.60,
    tilingScale: 3.0
  },

  // ── Street / surface textures ──

  belgian_block: {
    dir: 'belgian_block',
    tint: [0.70, 0.68, 0.65],
    roughness: 0.85,
    metallic: 0.0,
    tilingScale: 4.0
  },
  cobblestone: {
    dir: 'cobblestone',
    tint: [0.65, 0.62, 0.58],
    roughness: 0.90,
    metallic: 0.0,
    tilingScale: 4.0
  },
  granite_flag: {
    dir: 'granite_flag',
    tint: [0.72, 0.72, 0.74],
    roughness: 0.70,
    metallic: 0.05,
    tilingScale: 3.0
  },
  dirt_packed: {
    dir: 'dirt_packed',
    tint: [0.55, 0.45, 0.35],
    roughness: 0.95,
    metallic: 0.0,
    tilingScale: 3.0
  },
  macadam: {
    dir: 'macadam',
    tint: [0.60, 0.58, 0.55],
    roughness: 0.90,
    metallic: 0.0,
    tilingScale: 4.0
  },
  brick_paving: {
    dir: 'brick_paving',
    tint: [0.75, 0.50, 0.40],
    roughness: 0.80,
    metallic: 0.0,
    tilingScale: 4.0
  }
};

// ─── Primary Material → Base Texture Mapping ────────────────────

/**
 * Maps a style's materials.primary value to a BASE_TEXTURES key.
 * This is the bridge between architectureStyles.js and the texture library.
 */
const PRIMARY_TO_TEXTURE = {
  brownstone:   'brownstone',
  brick:        'brick_red',
  cast_iron:    'cast_iron',
  stone:        'stone_grey',
  wood:         'wood_clapboard',
  concrete:     'concrete',
  stucco:       'stucco',
  steel_frame:  'steel_frame',
  terra_cotta:  'terra_cotta',
  mixed:        'concrete',     // fallback for mixed-material styles
  marble:       'limestone',    // marble approximated with limestone base
  glass:        'concrete'      // glass-heavy facades use concrete base + low roughness
};

/**
 * Maps SURFACE_TYPES keys to BASE_TEXTURES keys.
 */
const SURFACE_TO_TEXTURE = {
  belgian_block: 'belgian_block',
  cobblestone:   'cobblestone',
  dirt:          'dirt_packed',
  granite_flag:  'granite_flag',
  macadam:       'macadam',
  brick:         'brick_paving'
};

// ─── Recipe API ─────────────────────────────────────────────────

/**
 * Build a recipe object from a base texture key.
 * @param {string} textureKey - Key into BASE_TEXTURES
 * @returns {object|null} Recipe or null if key not found
 */
function buildRecipe(textureKey) {
  if (!textureKey) return null;
  const base = BASE_TEXTURES[textureKey];
  if (!base) return null;
  const miName = `MI_${textureKey}`;
  return {
    textureKey,
    dir: base.dir,
    tint: base.tint,
    roughness: base.roughness,
    metallic: base.metallic,
    tilingScale: base.tilingScale,
    miName,
    miPath: `${MI_BASE_PATH}/${miName}`
  };
}

/**
 * Get the material recipe for a building style.
 * Reads STYLES[styleName].materials.primary to derive the base texture and parameters.
 *
 * @param {string} styleName - Key from architectureStyles.js STYLES
 * @returns {{ textureKey: string, dir: string, tint: number[], roughness: number, metallic: number, tilingScale: number, miName: string, miPath: string }|null}
 */
export function getMaterialRecipe(styleName) {
  if (!styleName) return null;
  const style = STYLES[styleName];
  if (!style || !style.materials) return null;
  return buildRecipe(PRIMARY_TO_TEXTURE[style.materials.primary]);
}

/**
 * Get the material recipe for a street/sidewalk surface type.
 *
 * @param {string} surface - Key from SURFACE_TYPES (e.g. 'belgian_block')
 * @returns {{ textureKey: string, dir: string, tint: number[], roughness: number, metallic: number, tilingScale: number, miName: string, miPath: string }|null}
 */
export function getSurfaceRecipe(surface) {
  if (!surface) return null;
  return buildRecipe(SURFACE_TO_TEXTURE[surface]);
}

/**
 * Collect unique recipes from an array, deduplicated by miName.
 * @param {object[]} recipes - Array of recipe objects (nulls are filtered out)
 * @returns {object[]} Deduplicated recipes
 */
export function collectUniqueRecipes(recipes) {
  const seen = new Set();
  const unique = [];
  for (const r of recipes) {
    if (!r) continue;
    if (seen.has(r.miName)) continue;
    seen.add(r.miName);
    unique.push(r);
  }
  return unique;
}

// ─── Compatibility API (used by buildSpawnScript / buildStreetSpawnScript) ──

/**
 * Look up the Unreal Material Instance path for a building style.
 * Derives path from recipe — no era parameter needed.
 * @param {string} styleName - Key from architectureStyles.js STYLES
 * @param {string} [_era] - Accepted for backward compatibility, ignored
 * @returns {string|null} Content path or null if no mapping
 */
export function getBuildingMaterialPath(styleName, _era) {
  const recipe = getMaterialRecipe(styleName);
  return recipe ? recipe.miPath : null;
}

/**
 * Look up the Unreal Material Instance path for a surface type.
 * Derives path from recipe — no era parameter needed.
 * @param {string} surface - Key from SURFACE_TYPES
 * @param {string} [_era] - Accepted for backward compatibility, ignored
 * @returns {string|null} Content path or null if no mapping
 */
export function getSurfaceMaterialPath(surface, _era) {
  const recipe = getSurfaceRecipe(surface);
  return recipe ? recipe.miPath : null;
}

/**
 * Convert a material content path to a safe Python variable name.
 * @param {string} contentPath - Unreal content path
 * @returns {string} Python-safe variable name (e.g. 'mat_MI_brownstone')
 */
export function materialVarName(contentPath) {
  const assetName = contentPath.split('/').pop();
  return `mat_${assetName}`;
}

/**
 * Collect unique material preloads from an array of content paths.
 * Returns a deduped { varName: assetPath } map suitable for scriptHeader().
 * @param {string[]} materialPaths - Array of content paths (nulls should be pre-filtered)
 * @returns {Object<string, string>} Map of Python var names to asset paths
 */
export function collectMaterialPreloads(materialPaths) {
  const preloads = {};
  for (const p of materialPaths) {
    const varName = materialVarName(p);
    if (!preloads[varName]) {
      preloads[varName] = p;
    }
  }
  return preloads;
}

// ─── Weathering ─────────────────────────────────────────────────

/**
 * Weathering rates per base texture type.
 * Higher rate = faster visual aging (0-1 reached sooner).
 * Value is the number of years to reach full weathering (1.0).
 */
const WEATHERING_YEARS = {
  wood_clapboard: 25,    // fastest — splits, warps, greys
  stucco:         40,
  brownstone:     40,    // darkens, spalls
  limestone:      50,
  concrete:       60,
  brick_red:      80,    // slow, steady
  terra_cotta:    60,
  cast_iron:      50,    // corrosion, paint peeling
  stone_grey:     80,
  granite:        100,   // slowest — extremely durable
  steel_frame:    60,
  // Streets
  belgian_block:  100,
  cobblestone:    100,
  granite_flag:   100,
  dirt_packed:    10,    // erodes fast but looks "weathered" from the start
  macadam:        40,
  brick_paving:   80,
};

/**
 * Compute weathering strength (0-1) for a material at a given age.
 * @param {string} textureKey - Key into BASE_TEXTURES
 * @param {number} ageInYears - Building age in years
 * @returns {number} Weathering strength 0-1
 */
export function weatheringCurve(textureKey, ageInYears) {
  if (ageInYears == null || ageInYears <= 0) return 0;
  const maxYears = WEATHERING_YEARS[textureKey] || 60;
  return Math.min(1, ageInYears / maxYears);
}

/**
 * Get complete weathering parameters for a material at a given age.
 * @param {string} textureKey - Key into BASE_TEXTURES
 * @param {number} ageInYears - Building age in years
 * @returns {{ ageInYears: number, weatheringStrength: number }|null}
 */
export function getWeatheringParams(textureKey, ageInYears) {
  if (ageInYears == null) return null;
  return {
    ageInYears,
    weatheringStrength: weatheringCurve(textureKey, ageInYears),
  };
}

/**
 * Resolve the base texture key for a building style name.
 * @param {string} styleName - Architecture style key
 * @returns {string|null} Base texture key or null
 */
export function resolveTextureKey(styleName) {
  if (!styleName) return null;
  const style = STYLES[styleName];
  if (!style || !style.materials) return null;
  return PRIMARY_TO_TEXTURE[style.materials.primary] || null;
}
