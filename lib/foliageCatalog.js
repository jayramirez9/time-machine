/**
 * Foliage Catalog — era-appropriate vegetation definitions
 *
 * Defines what foliage exists, when it was present, where it goes,
 * and how dense. Used by foliagePlacement.js to populate streets and lots.
 *
 * Each entry has:
 * - type: unique identifier
 * - label: human-readable name
 * - category: street_tree | park_tree | ground_cover | building_base
 * - regions: which US regions this species appears in
 * - yearIntroduced / yearRemoved: era filtering (inclusive, null = always)
 * - placement: where the foliage goes (sidewalk, park, grid, perimeter)
 * - spacingM: distance between instances (meters)
 * - sides: 'both', 'one', 'none' — which side of the street
 * - roadCategories: which OSM road types this appears along (null = all)
 * - heightCm: foliage height above ground
 * - canopyRadiusCm: canopy spread radius (trees only)
 * - offsetFromEdgeM: distance from road edge into sidewalk
 * - mesh: Unreal asset path (null = use default placeholder)
 * - scaleCm: [x, y, z] default scale in cm
 * - densityWeight: relative density (1 = normal, 0.5 = half as frequent)
 * - seasonal: { spring, summer, fall, winter } foliage density 0-1
 */

// ─── Foliage Definitions ───────────────────────────────────────

export const FOLIAGE_TYPES = [
  // ── Street Trees ──────────────────────────────────────────────

  {
    type: 'street_tree_american_elm',
    label: 'American Elm',
    category: 'street_tree',
    regions: ['northeast_us', 'midwest_us'],
    yearIntroduced: null,
    yearRemoved: 1970, // Dutch elm disease decimated urban plantings
    placement: 'sidewalk',
    spacingM: 12,
    sides: 'both',
    roadCategories: ['primary', 'secondary', 'tertiary'],
    heightCm: 1500,
    canopyRadiusCm: 600,
    offsetFromEdgeM: 2.0,
    mesh: null,
    scaleCm: [600, 600, 1500],
    densityWeight: 0.8,
    seasonal: { spring: 0.6, summer: 1.0, fall: 0.5, winter: 0.0 },
  },

  {
    type: 'street_tree_london_plane',
    label: 'London Plane',
    category: 'street_tree',
    regions: ['northeast_us'],
    yearIntroduced: null,
    yearRemoved: null,
    placement: 'sidewalk',
    spacingM: 10,
    sides: 'both',
    roadCategories: ['primary', 'secondary', 'tertiary'],
    heightCm: 1400,
    canopyRadiusCm: 550,
    offsetFromEdgeM: 2.0,
    mesh: null,
    scaleCm: [550, 550, 1400],
    densityWeight: 0.9,
    seasonal: { spring: 0.5, summer: 1.0, fall: 0.4, winter: 0.0 },
  },

  {
    type: 'street_tree_norway_maple',
    label: 'Norway Maple',
    category: 'street_tree',
    regions: ['northeast_us'],
    yearIntroduced: null,
    yearRemoved: null,
    placement: 'sidewalk',
    spacingM: 10,
    sides: 'both',
    roadCategories: ['primary', 'secondary', 'tertiary'],
    heightCm: 1200,
    canopyRadiusCm: 500,
    offsetFromEdgeM: 2.0,
    mesh: null,
    scaleCm: [500, 500, 1200],
    densityWeight: 0.7,
    seasonal: { spring: 0.6, summer: 1.0, fall: 0.6, winter: 0.0 },
  },

  {
    type: 'street_tree_honey_locust',
    label: 'Honey Locust',
    category: 'street_tree',
    regions: ['northeast_us', 'midwest_us'],
    yearIntroduced: null,
    yearRemoved: null,
    placement: 'sidewalk',
    spacingM: 11,
    sides: 'both',
    roadCategories: ['primary', 'secondary', 'tertiary'],
    heightCm: 1200,
    canopyRadiusCm: 450,
    offsetFromEdgeM: 1.8,
    mesh: null,
    scaleCm: [450, 450, 1200],
    densityWeight: 0.7,
    seasonal: { spring: 0.5, summer: 1.0, fall: 0.5, winter: 0.0 },
  },

  {
    type: 'street_tree_red_oak',
    label: 'Red Oak',
    category: 'street_tree',
    regions: ['northeast_us'],
    yearIntroduced: null,
    yearRemoved: null,
    placement: 'sidewalk',
    spacingM: 14,
    sides: 'both',
    roadCategories: ['primary', 'secondary'],
    heightCm: 1600,
    canopyRadiusCm: 650,
    offsetFromEdgeM: 2.5,
    mesh: null,
    scaleCm: [650, 650, 1600],
    densityWeight: 0.5,
    seasonal: { spring: 0.5, summer: 1.0, fall: 0.7, winter: 0.0 },
  },

  {
    type: 'street_tree_live_oak',
    label: 'Live Oak',
    category: 'street_tree',
    regions: ['southeast_us'],
    yearIntroduced: null,
    yearRemoved: null, // evergreen, still prevalent
    placement: 'sidewalk',
    spacingM: 15,
    sides: 'both',
    roadCategories: ['primary', 'secondary', 'tertiary'],
    heightCm: 1200,
    canopyRadiusCm: 800,
    offsetFromEdgeM: 2.5,
    mesh: null,
    scaleCm: [800, 800, 1200],
    densityWeight: 0.9,
    seasonal: { spring: 0.9, summer: 1.0, fall: 0.9, winter: 0.8 }, // evergreen
  },

  {
    type: 'street_tree_crape_myrtle',
    label: 'Crape Myrtle',
    category: 'street_tree',
    regions: ['southeast_us'],
    yearIntroduced: null,
    yearRemoved: null,
    placement: 'sidewalk',
    spacingM: 8,
    sides: 'both',
    roadCategories: ['primary', 'secondary', 'tertiary', 'residential'],
    heightCm: 600,
    canopyRadiusCm: 300,
    offsetFromEdgeM: 1.5,
    mesh: null,
    scaleCm: [300, 300, 600],
    densityWeight: 0.8,
    seasonal: { spring: 0.5, summer: 1.0, fall: 0.4, winter: 0.0 },
  },

  {
    type: 'street_tree_western_red_cedar',
    label: 'Western Red Cedar',
    category: 'street_tree',
    regions: ['pacific_us'],
    yearIntroduced: null,
    yearRemoved: null,
    placement: 'sidewalk',
    spacingM: 14,
    sides: 'one',
    roadCategories: ['primary', 'secondary'],
    heightCm: 2000,
    canopyRadiusCm: 400,
    offsetFromEdgeM: 2.5,
    mesh: null,
    scaleCm: [400, 400, 2000],
    densityWeight: 0.5,
    seasonal: { spring: 0.9, summer: 1.0, fall: 0.9, winter: 0.8 }, // evergreen
  },

  // ── Park Trees ────────────────────────────────────────────────

  {
    type: 'park_tree_sugar_maple',
    label: 'Sugar Maple',
    category: 'park_tree',
    regions: ['northeast_us'],
    yearIntroduced: null,
    yearRemoved: null,
    placement: 'park',
    spacingM: 10,
    sides: 'none',
    roadCategories: null,
    heightCm: 1800,
    canopyRadiusCm: 700,
    offsetFromEdgeM: 0,
    mesh: null,
    scaleCm: [700, 700, 1800],
    densityWeight: 0.7,
    seasonal: { spring: 0.5, summer: 1.0, fall: 0.8, winter: 0.0 },
  },

  {
    type: 'park_tree_bald_cypress',
    label: 'Bald Cypress',
    category: 'park_tree',
    regions: ['southeast_us'],
    yearIntroduced: null,
    yearRemoved: null,
    placement: 'park',
    spacingM: 12,
    sides: 'none',
    roadCategories: null,
    heightCm: 2000,
    canopyRadiusCm: 500,
    offsetFromEdgeM: 0,
    mesh: null,
    scaleCm: [500, 500, 2000],
    densityWeight: 0.6,
    seasonal: { spring: 0.6, summer: 1.0, fall: 0.5, winter: 0.0 },
  },

  {
    type: 'park_tree_cottonwood',
    label: 'Cottonwood',
    category: 'park_tree',
    regions: ['midwest_us', 'west_us'],
    yearIntroduced: null,
    yearRemoved: null,
    placement: 'park',
    spacingM: 15,
    sides: 'none',
    roadCategories: null,
    heightCm: 2200,
    canopyRadiusCm: 700,
    offsetFromEdgeM: 0,
    mesh: null,
    scaleCm: [700, 700, 2200],
    densityWeight: 0.5,
    seasonal: { spring: 0.5, summer: 1.0, fall: 0.4, winter: 0.0 },
  },

  {
    type: 'park_tree_blue_spruce',
    label: 'Blue Spruce',
    category: 'park_tree',
    regions: ['west_us'],
    yearIntroduced: null,
    yearRemoved: null,
    placement: 'park',
    spacingM: 8,
    sides: 'none',
    roadCategories: null,
    heightCm: 1500,
    canopyRadiusCm: 400,
    offsetFromEdgeM: 0,
    mesh: null,
    scaleCm: [400, 400, 1500],
    densityWeight: 0.6,
    seasonal: { spring: 0.9, summer: 1.0, fall: 0.9, winter: 0.8 }, // evergreen
  },

  {
    type: 'park_tree_coast_redwood',
    label: 'Coast Redwood',
    category: 'park_tree',
    regions: ['pacific_us'],
    yearIntroduced: null,
    yearRemoved: null,
    placement: 'park',
    spacingM: 20,
    sides: 'none',
    roadCategories: null,
    heightCm: 5000,
    canopyRadiusCm: 500,
    offsetFromEdgeM: 0,
    mesh: null,
    scaleCm: [500, 500, 5000],
    densityWeight: 0.3,
    seasonal: { spring: 0.9, summer: 1.0, fall: 0.9, winter: 0.8 }, // evergreen
  },

  // ── Ground Cover ──────────────────────────────────────────────

  {
    type: 'ground_cover_lawn_grass',
    label: 'Lawn Grass',
    category: 'ground_cover',
    regions: ['northeast_us', 'southeast_us', 'midwest_us', 'west_us', 'pacific_us', 'general_us'],
    yearIntroduced: null,
    yearRemoved: null,
    placement: 'grid',
    spacingM: 3,
    sides: 'none',
    roadCategories: null,
    heightCm: 10,
    canopyRadiusCm: 0,
    offsetFromEdgeM: 0,
    mesh: null,
    scaleCm: [100, 100, 10],
    densityWeight: 1.0,
    seasonal: { spring: 0.7, summer: 1.0, fall: 0.5, winter: 0.1 },
  },

  {
    type: 'ground_cover_sidewalk_weeds',
    label: 'Sidewalk Weeds',
    category: 'ground_cover',
    regions: ['northeast_us', 'southeast_us', 'midwest_us', 'west_us', 'pacific_us', 'general_us'],
    yearIntroduced: null,
    yearRemoved: null,
    placement: 'grid',
    spacingM: 5,
    sides: 'none',
    roadCategories: null,
    heightCm: 15,
    canopyRadiusCm: 0,
    offsetFromEdgeM: 0,
    mesh: null,
    scaleCm: [30, 30, 15],
    densityWeight: 0.4,
    seasonal: { spring: 0.6, summer: 1.0, fall: 0.3, winter: 0.0 },
  },

  {
    type: 'ground_cover_clover',
    label: 'Clover',
    category: 'ground_cover',
    regions: ['northeast_us', 'southeast_us', 'midwest_us', 'west_us', 'pacific_us', 'general_us'],
    yearIntroduced: null,
    yearRemoved: null,
    placement: 'grid',
    spacingM: 4,
    sides: 'none',
    roadCategories: null,
    heightCm: 8,
    canopyRadiusCm: 0,
    offsetFromEdgeM: 0,
    mesh: null,
    scaleCm: [50, 50, 8],
    densityWeight: 0.5,
    seasonal: { spring: 0.5, summer: 1.0, fall: 0.3, winter: 0.0 },
  },

  {
    type: 'ground_cover_dandelion',
    label: 'Dandelion',
    category: 'ground_cover',
    regions: ['northeast_us', 'southeast_us', 'midwest_us', 'west_us', 'pacific_us', 'general_us'],
    yearIntroduced: null,
    yearRemoved: null,
    placement: 'grid',
    spacingM: 6,
    sides: 'none',
    roadCategories: null,
    heightCm: 20,
    canopyRadiusCm: 0,
    offsetFromEdgeM: 0,
    mesh: null,
    scaleCm: [20, 20, 20],
    densityWeight: 0.6,
    seasonal: { spring: 0.9, summer: 0.7, fall: 0.2, winter: 0.0 },
  },

  // ── Building Base ─────────────────────────────────────────────

  {
    type: 'building_base_wall_weeds',
    label: 'Wall Weeds',
    category: 'building_base',
    regions: ['northeast_us', 'southeast_us', 'midwest_us', 'west_us', 'pacific_us', 'general_us'],
    yearIntroduced: null,
    yearRemoved: null,
    placement: 'perimeter',
    spacingM: 4,
    sides: 'none',
    roadCategories: null,
    heightCm: 25,
    canopyRadiusCm: 0,
    offsetFromEdgeM: 0.2,
    mesh: null,
    scaleCm: [40, 40, 25],
    densityWeight: 0.3,
    seasonal: { spring: 0.6, summer: 1.0, fall: 0.3, winter: 0.0 },
  },

  {
    type: 'building_base_foundation_moss',
    label: 'Foundation Moss',
    category: 'building_base',
    regions: ['northeast_us', 'southeast_us', 'midwest_us', 'west_us', 'pacific_us', 'general_us'],
    yearIntroduced: null,
    yearRemoved: null,
    placement: 'perimeter',
    spacingM: 3,
    sides: 'none', // north-facing preferred (handled by placement logic)
    roadCategories: null,
    heightCm: 5,
    canopyRadiusCm: 0,
    offsetFromEdgeM: 0.1,
    mesh: null,
    scaleCm: [60, 60, 5],
    densityWeight: 0.2,
    seasonal: { spring: 0.7, summer: 0.8, fall: 0.6, winter: 0.3 },
  },

  {
    type: 'building_base_gutter_grass',
    label: 'Gutter Grass',
    category: 'building_base',
    regions: ['northeast_us', 'southeast_us', 'midwest_us', 'west_us', 'pacific_us', 'general_us'],
    yearIntroduced: null,
    yearRemoved: null,
    placement: 'perimeter',
    spacingM: 5,
    sides: 'none',
    roadCategories: null,
    heightCm: 12,
    canopyRadiusCm: 0,
    offsetFromEdgeM: 0.0,
    mesh: null,
    scaleCm: [30, 30, 12],
    densityWeight: 0.3,
    seasonal: { spring: 0.5, summer: 1.0, fall: 0.3, winter: 0.0 },
  },
];

// ─── Filtering ──────────────────────────────────────────────────

/**
 * Get foliage available for a given year.
 * @param {number} year
 * @returns {object[]}
 */
export function getFoliageForYear(year) {
  return FOLIAGE_TYPES.filter(f =>
    (f.yearIntroduced === null || year >= f.yearIntroduced) &&
    (f.yearRemoved === null || year <= f.yearRemoved)
  );
}

/**
 * Get foliage filtered by year and region.
 * @param {number} year
 * @param {string} region - e.g. 'northeast_us', 'southeast_us'
 * @returns {object[]}
 */
export function getFoliageForRegion(year, region) {
  return getFoliageForYear(year).filter(f =>
    f.regions.includes(region)
  );
}

/**
 * Get foliage filtered by year, region, and category.
 * @param {number} year
 * @param {string} region
 * @param {'street_tree'|'park_tree'|'ground_cover'|'building_base'} category
 * @returns {object[]}
 */
export function getFoliageByCategory(year, region, category) {
  return getFoliageForRegion(year, region).filter(f =>
    f.category === category
  );
}

/**
 * Get seasonal canopy data for a region. Averages seasonal weights across
 * all trees (street + park) in the region.
 * @param {string} region
 * @param {'spring'|'summer'|'fall'|'winter'} season
 * @returns {number} Canopy density 0-1
 */
export function getSeasonalCanopy(region, season) {
  const trees = FOLIAGE_TYPES.filter(f =>
    (f.category === 'street_tree' || f.category === 'park_tree') &&
    f.regions.includes(region)
  );
  if (trees.length === 0) return 0;
  const sum = trees.reduce((acc, t) => acc + (t.seasonal[season] || 0), 0);
  return sum / trees.length;
}

/**
 * List all foliage types available for a year + region with counts by category.
 * @param {number} year
 * @param {string} region
 * @returns {{ total: number, byCategory: Object<string, number>, types: string[] }}
 */
export function summarizeFoliageForYear(year, region) {
  const foliage = getFoliageForRegion(year, region);
  const byCategory = {};
  for (const f of foliage) {
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
  }
  return {
    total: foliage.length,
    byCategory,
    types: foliage.map(f => f.type),
  };
}
