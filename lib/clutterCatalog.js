/**
 * Clutter Catalog — detail props and environmental clutter definitions
 *
 * Defines ground-level scatter (newspapers, leaves, manure), cloth sim
 * items (awnings, laundry, flags), and animated props (signs, weathervanes).
 * Used by clutterPlacement.js to populate streets with period-appropriate detail.
 *
 * Each entry has:
 * - type: unique identifier
 * - label: human-readable name
 * - category: clutter | cloth | animated
 * - yearIntroduced / yearRemoved: era filtering (inclusive)
 * - placement: gutter | sidewalk | building_facade | rooftop
 * - scatterDensityPer100m: items per 100m of road
 * - roadCategories: which OSM road types this appears on (null = all)
 * - heightCm: height above ground
 * - offsetFromEdgeM: distance from road edge
 * - mesh: Unreal asset path (null = use default placeholder)
 * - scaleCm: [x, y, z] default scale in cm
 * - densityWeight: relative density (1 = normal, 0.5 = half as frequent)
 * - animationType: null | 'cloth' | 'skeletal_loop' | 'material_anim'
 * - windResponsive: whether wind affects this item
 * - seasonalWeight: null or { spring, summer, fall, winter }
 */

// ─── Clutter Definitions ───────────────────────────────────────

export const CLUTTER_TYPES = [
  // ── Ground-level clutter ────────────────────────────────────

  {
    type: 'newspaper',
    label: 'Discarded Newspaper',
    category: 'clutter',
    yearIntroduced: 1830,
    yearRemoved: null,
    placement: 'gutter',
    scatterDensityPer100m: 3,
    roadCategories: ['primary', 'secondary', 'tertiary'],
    heightCm: 1,
    offsetFromEdgeM: 0.1,
    mesh: null,
    scaleCm: [30, 40, 1],
    densityWeight: 0.5,
    animationType: null,
    windResponsive: true,
    seasonalWeight: null,
  },

  {
    type: 'leaves',
    label: 'Fallen Leaves',
    category: 'clutter',
    yearIntroduced: 0,
    yearRemoved: null,
    placement: 'gutter',
    scatterDensityPer100m: 8,
    roadCategories: null,
    heightCm: 1,
    offsetFromEdgeM: 0.2,
    mesh: null,
    scaleCm: [20, 20, 2],
    densityWeight: 0.6,
    animationType: null,
    windResponsive: true,
    seasonalWeight: { spring: 0.3, summer: 0.1, fall: 1.0, winter: 0.3 },
  },

  {
    type: 'horse_manure',
    label: 'Horse Manure',
    category: 'clutter',
    yearIntroduced: 0,
    yearRemoved: 1920,
    placement: 'gutter',
    scatterDensityPer100m: 5,
    roadCategories: ['primary', 'secondary', 'tertiary'],
    heightCm: 3,
    offsetFromEdgeM: 0.3,
    mesh: null,
    scaleCm: [25, 25, 8],
    densityWeight: 0.8,
    animationType: null,
    windResponsive: false,
    seasonalWeight: null,
  },

  {
    type: 'cigarette_butts',
    label: 'Cigarette Butts',
    category: 'clutter',
    yearIntroduced: 1880,
    yearRemoved: null,
    placement: 'sidewalk',
    scatterDensityPer100m: 6,
    roadCategories: ['primary', 'secondary', 'tertiary'],
    heightCm: 1,
    offsetFromEdgeM: 0.5,
    mesh: null,
    scaleCm: [3, 3, 1],
    densityWeight: 0.4,
    animationType: null,
    windResponsive: false,
    seasonalWeight: null,
  },

  {
    type: 'bottle_caps',
    label: 'Bottle Caps',
    category: 'clutter',
    yearIntroduced: 1892,
    yearRemoved: null,
    placement: 'gutter',
    scatterDensityPer100m: 4,
    roadCategories: ['primary', 'secondary', 'tertiary'],
    heightCm: 1,
    offsetFromEdgeM: 0.15,
    mesh: null,
    scaleCm: [3, 3, 1],
    densityWeight: 0.3,
    animationType: null,
    windResponsive: false,
    seasonalWeight: null,
  },

  {
    type: 'apple_core',
    label: 'Discarded Apple Core',
    category: 'clutter',
    yearIntroduced: 0,
    yearRemoved: null,
    placement: 'gutter',
    scatterDensityPer100m: 1,
    roadCategories: ['primary', 'secondary', 'tertiary'],
    heightCm: 2,
    offsetFromEdgeM: 0.2,
    mesh: null,
    scaleCm: [5, 5, 6],
    densityWeight: 0.2,
    animationType: null,
    windResponsive: false,
    seasonalWeight: null,
  },

  {
    type: 'coal_ash',
    label: 'Coal Ash Pile',
    category: 'clutter',
    yearIntroduced: 1800,
    yearRemoved: 1960,
    placement: 'gutter',
    scatterDensityPer100m: 3,
    roadCategories: ['primary', 'secondary', 'tertiary', 'residential'],
    heightCm: 2,
    offsetFromEdgeM: 0.1,
    mesh: null,
    scaleCm: [40, 30, 4],
    densityWeight: 0.5,
    animationType: null,
    windResponsive: false,
    seasonalWeight: null,
  },

  {
    type: 'straw',
    label: 'Loose Straw',
    category: 'clutter',
    yearIntroduced: 0,
    yearRemoved: 1920,
    placement: 'gutter',
    scatterDensityPer100m: 4,
    roadCategories: ['primary', 'secondary', 'tertiary'],
    heightCm: 1,
    offsetFromEdgeM: 0.2,
    mesh: null,
    scaleCm: [35, 25, 2],
    densityWeight: 0.6,
    animationType: null,
    windResponsive: true,
    seasonalWeight: null,
  },

  // ── Cloth simulation items ──────────────────────────────────

  {
    type: 'awning_cloth',
    label: 'Shop Awning Cloth',
    category: 'cloth',
    yearIntroduced: 0,
    yearRemoved: null,
    placement: 'building_facade',
    scatterDensityPer100m: 2,
    roadCategories: ['primary', 'secondary', 'tertiary'],
    heightCm: 350,
    offsetFromEdgeM: -0.3,
    mesh: null,
    scaleCm: [300, 150, 30],
    densityWeight: 0.5,
    animationType: 'cloth',
    windResponsive: true,
    seasonalWeight: null,
  },

  {
    type: 'hanging_laundry',
    label: 'Hanging Laundry',
    category: 'cloth',
    yearIntroduced: 0,
    yearRemoved: null,
    placement: 'building_facade',
    scatterDensityPer100m: 1,
    roadCategories: ['residential', 'tertiary', 'secondary'],
    heightCm: 700,
    offsetFromEdgeM: -0.2,
    mesh: null,
    scaleCm: [400, 50, 150],
    densityWeight: 0.3,
    animationType: 'cloth',
    windResponsive: true,
    seasonalWeight: null,
  },

  {
    type: 'flag_banner',
    label: 'Flag or Banner',
    category: 'cloth',
    yearIntroduced: 0,
    yearRemoved: null,
    placement: 'building_facade',
    scatterDensityPer100m: 1,
    roadCategories: ['primary', 'secondary'],
    heightCm: 400,
    offsetFromEdgeM: -0.4,
    mesh: null,
    scaleCm: [100, 10, 150],
    densityWeight: 0.3,
    animationType: 'cloth',
    windResponsive: true,
    seasonalWeight: null,
  },

  {
    type: 'window_curtain',
    label: 'Window Curtain',
    category: 'cloth',
    yearIntroduced: 0,
    yearRemoved: null,
    placement: 'building_facade',
    scatterDensityPer100m: 2,
    roadCategories: null,
    heightCm: 500,
    offsetFromEdgeM: -0.1,
    mesh: null,
    scaleCm: [100, 5, 120],
    densityWeight: 0.4,
    animationType: 'cloth',
    windResponsive: true,
    seasonalWeight: null,
  },

  // ── Animated props ──────────────────────────────────────────

  {
    type: 'swinging_sign',
    label: 'Swinging Shop Sign',
    category: 'animated',
    yearIntroduced: 0,
    yearRemoved: null,
    placement: 'building_facade',
    scatterDensityPer100m: 1,
    roadCategories: ['primary', 'secondary', 'tertiary'],
    heightCm: 380,
    offsetFromEdgeM: -0.3,
    mesh: null,
    scaleCm: [80, 10, 60],
    densityWeight: 0.4,
    animationType: 'skeletal_loop',
    windResponsive: true,
    seasonalWeight: null,
  },

  {
    type: 'weathervane',
    label: 'Weathervane',
    category: 'animated',
    yearIntroduced: 0,
    yearRemoved: null,
    placement: 'rooftop',
    scatterDensityPer100m: 0.5,
    roadCategories: null,
    heightCm: 50,
    offsetFromEdgeM: 0,
    mesh: null,
    scaleCm: [60, 10, 40],
    densityWeight: 0.2,
    animationType: 'material_anim',
    windResponsive: true,
    seasonalWeight: null,
  },

  {
    type: 'rocking_chair',
    label: 'Porch Rocking Chair',
    category: 'animated',
    yearIntroduced: 1800,
    yearRemoved: null,
    placement: 'building_facade',
    scatterDensityPer100m: 0.5,
    roadCategories: ['residential', 'tertiary'],
    heightCm: 100,
    offsetFromEdgeM: -0.5,
    mesh: null,
    scaleCm: [60, 80, 100],
    densityWeight: 0.2,
    animationType: 'skeletal_loop',
    windResponsive: false,
    seasonalWeight: null,
  },
];

// ─── Filtering ──────────────────────────────────────────────────

/**
 * Get clutter items available for a given year.
 * @param {number} year
 * @returns {object[]}
 */
export function getClutterForYear(year) {
  return CLUTTER_TYPES.filter(c =>
    year >= c.yearIntroduced &&
    (c.yearRemoved === null || year <= c.yearRemoved)
  );
}

/**
 * Get clutter items filtered by year and category.
 * @param {number} year
 * @param {'clutter'|'cloth'|'animated'} category
 * @returns {object[]}
 */
export function getClutterByCategory(year, category) {
  return getClutterForYear(year).filter(c => c.category === category);
}

/**
 * Get clutter items filtered by year and road category.
 * @param {number} year
 * @param {string} roadCategory - OSM road category
 * @returns {object[]}
 */
export function getClutterForRoad(year, roadCategory) {
  return getClutterForYear(year).filter(c =>
    c.roadCategories === null || c.roadCategories.includes(roadCategory)
  );
}

/**
 * Compute seasonal density multiplier for a clutter item.
 * Returns 1.0 if no seasonal weight is defined.
 *
 * @param {object} clutterDef - clutter definition with optional seasonalWeight
 * @param {number} month - 1-12
 * @returns {number} density multiplier (0-1)
 */
export function computeSeasonalDensity(clutterDef, month) {
  if (!clutterDef.seasonalWeight) return 1.0;

  const w = clutterDef.seasonalWeight;

  // Map month to season
  // Spring: Mar-May (3-5), Summer: Jun-Aug (6-8), Fall: Sep-Nov (9-11), Winter: Dec-Feb (12,1,2)
  if (month >= 3 && month <= 5) return w.spring;
  if (month >= 6 && month <= 8) return w.summer;
  if (month >= 9 && month <= 11) return w.fall;
  return w.winter; // Dec, Jan, Feb
}

/**
 * List all clutter types available for a year with counts by category.
 * @param {number} year
 * @returns {{ total: number, byCategory: Object<string, number>, types: string[] }}
 */
export function summarizeClutterForYear(year) {
  const items = getClutterForYear(year);
  const byCategory = {};
  for (const c of items) {
    byCategory[c.category] = (byCategory[c.category] || 0) + 1;
  }
  return {
    total: items.length,
    byCategory,
    types: items.map(c => c.type),
  };
}
