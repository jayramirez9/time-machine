/**
 * Prop Catalog — era-appropriate street furniture definitions
 *
 * Defines what props exist, when they were introduced, where they go,
 * and how often. Used by propPlacement.js to populate streets.
 *
 * Each prop has:
 * - type: unique identifier
 * - label: human-readable name
 * - yearIntroduced / yearRemoved: era filtering (inclusive)
 * - placement: where the prop goes (sidewalk, intersection, building_facade, mid_block)
 * - spacingM: distance between instances (meters). 0 = placed by special logic
 * - sides: 'both', 'one', 'none' — which side of the street
 * - roadCategories: which OSM road types this prop appears on (null = all)
 * - heightCm: prop height above ground
 * - offsetFromEdgeM: distance from road edge into sidewalk
 * - mesh: Unreal asset path (null = use default cube placeholder)
 * - scaleCm: [x, y, z] default scale in cm
 * - densityWeight: relative density (1 = normal, 0.5 = half as frequent)
 */

// ─── Prop Definitions ───────────────────────────────────────────

export const PROPS = [
  // ── Pre-electric era (1800s) ────────────────────────────────

  {
    type: 'hitching_post',
    label: 'Hitching Post',
    yearIntroduced: 1700,
    yearRemoved: 1920, // phased out as horses disappeared
    placement: 'sidewalk',
    spacingM: 25,
    sides: 'both',
    roadCategories: ['primary', 'secondary', 'tertiary'],
    heightCm: 120,
    offsetFromEdgeM: 0.5, // close to curb
    mesh: null,
    scaleCm: [15, 15, 120],
    densityWeight: 1,
  },

  {
    type: 'horse_trough',
    label: 'Horse Trough',
    yearIntroduced: 1700,
    yearRemoved: 1920,
    placement: 'intersection',
    spacingM: 0, // one per qualifying intersection
    sides: 'one',
    roadCategories: ['primary', 'secondary'],
    heightCm: 60,
    offsetFromEdgeM: 1.0,
    mesh: null,
    scaleCm: [150, 60, 60],
    densityWeight: 0.3, // not at every intersection
  },

  {
    type: 'fire_hydrant',
    label: 'Fire Hydrant',
    yearIntroduced: 1801,
    yearRemoved: null, // still in use
    placement: 'sidewalk',
    spacingM: 100,
    sides: 'one', // alternating
    roadCategories: null, // all streets
    heightCm: 75,
    offsetFromEdgeM: 0.3,
    mesh: null,
    scaleCm: [30, 30, 75],
    densityWeight: 1,
  },

  {
    type: 'bollard',
    label: 'Iron Bollard',
    yearIntroduced: 1700,
    yearRemoved: null,
    placement: 'intersection',
    spacingM: 0,
    sides: 'both',
    roadCategories: ['primary', 'secondary'],
    heightCm: 90,
    offsetFromEdgeM: 0.2,
    mesh: null,
    scaleCm: [20, 20, 90],
    densityWeight: 0.5,
  },

  {
    type: 'awning',
    label: 'Shop Awning',
    yearIntroduced: 1700,
    yearRemoved: null,
    placement: 'building_facade',
    spacingM: 0, // placed per commercial building
    sides: 'both',
    roadCategories: ['primary', 'secondary', 'tertiary'],
    heightCm: 350, // first floor height
    offsetFromEdgeM: -0.5, // negative = toward building
    mesh: null,
    scaleCm: [300, 150, 30],
    densityWeight: 0.6, // not every storefront
  },

  {
    type: 'hanging_sign',
    label: 'Period Hanging Sign',
    yearIntroduced: 1700,
    yearRemoved: null,
    placement: 'building_facade',
    spacingM: 0,
    sides: 'both',
    roadCategories: ['primary', 'secondary', 'tertiary'],
    heightCm: 400,
    offsetFromEdgeM: -0.3,
    mesh: null,
    scaleCm: [80, 10, 60],
    densityWeight: 0.4,
  },

  {
    type: 'fire_alarm_box',
    label: 'Fire Alarm Box',
    yearIntroduced: 1852,
    yearRemoved: null,
    placement: 'intersection',
    spacingM: 0,
    sides: 'one',
    roadCategories: ['primary', 'secondary'],
    heightCm: 150,
    offsetFromEdgeM: 0.5,
    mesh: null,
    scaleCm: [30, 30, 150],
    densityWeight: 0.6,
  },

  {
    type: 'mailbox',
    label: 'Mailbox / Letter Box',
    yearIntroduced: 1858,
    yearRemoved: null,
    placement: 'sidewalk',
    spacingM: 200,
    sides: 'one',
    roadCategories: ['primary', 'secondary', 'tertiary'],
    heightCm: 120,
    offsetFromEdgeM: 0.4,
    mesh: null,
    scaleCm: [40, 40, 120],
    densityWeight: 1,
  },

  {
    type: 'telegraph_pole',
    label: 'Telegraph Pole',
    yearIntroduced: 1844,
    yearRemoved: 1940, // buried or replaced by telephone poles
    placement: 'sidewalk',
    spacingM: 50,
    sides: 'one',
    roadCategories: ['primary', 'secondary'],
    heightCm: 800,
    offsetFromEdgeM: 0.3,
    mesh: null,
    scaleCm: [25, 25, 800],
    densityWeight: 0.7,
  },

  // ── Early electric / early auto era (1880s–1930s) ───────────

  {
    type: 'telephone_pole',
    label: 'Telephone Pole',
    yearIntroduced: 1877,
    yearRemoved: null, // still exists (though underground in cities)
    placement: 'sidewalk',
    spacingM: 40,
    sides: 'one',
    roadCategories: ['primary', 'secondary', 'residential'],
    heightCm: 900,
    offsetFromEdgeM: 0.3,
    mesh: null,
    scaleCm: [25, 25, 900],
    densityWeight: 0.8,
  },

  {
    type: 'newsstand',
    label: 'Newsstand',
    yearIntroduced: 1830,
    yearRemoved: null,
    placement: 'sidewalk',
    spacingM: 300,
    sides: 'one',
    roadCategories: ['primary', 'secondary'],
    heightCm: 250,
    offsetFromEdgeM: 1.5,
    mesh: null,
    scaleCm: [200, 150, 250],
    densityWeight: 0.3,
  },

  // ── Mid-20th century additions ──────────────────────────────

  {
    type: 'parking_meter',
    label: 'Parking Meter',
    yearIntroduced: 1935,
    yearRemoved: null,
    placement: 'sidewalk',
    spacingM: 6, // one per parking space
    sides: 'one',
    roadCategories: ['primary', 'secondary', 'tertiary'],
    heightCm: 130,
    offsetFromEdgeM: 0.2,
    mesh: null,
    scaleCm: [15, 15, 130],
    densityWeight: 1,
  },

  {
    type: 'traffic_light',
    label: 'Traffic Signal',
    yearIntroduced: 1920,
    yearRemoved: null,
    placement: 'intersection',
    spacingM: 0,
    sides: 'both',
    roadCategories: ['primary', 'secondary'],
    heightCm: 500,
    offsetFromEdgeM: 0.3,
    mesh: null,
    scaleCm: [30, 30, 500],
    densityWeight: 0.9,
  },

  {
    type: 'bench',
    label: 'Street Bench',
    yearIntroduced: 1850,
    yearRemoved: null,
    placement: 'sidewalk',
    spacingM: 80,
    sides: 'one',
    roadCategories: ['primary', 'secondary'],
    heightCm: 80,
    offsetFromEdgeM: 1.2,
    mesh: null,
    scaleCm: [150, 60, 80],
    densityWeight: 0.4,
  },

  {
    type: 'trash_can',
    label: 'Trash Can',
    yearIntroduced: 1930,
    yearRemoved: null,
    placement: 'sidewalk',
    spacingM: 50,
    sides: 'one',
    roadCategories: ['primary', 'secondary'],
    heightCm: 90,
    offsetFromEdgeM: 0.4,
    mesh: null,
    scaleCm: [50, 50, 90],
    densityWeight: 0.7,
  },
];

// ─── Filtering ──────────────────────────────────────────────────

/**
 * Get props available for a given year.
 * @param {number} year
 * @returns {object[]}
 */
export function getPropsForYear(year) {
  return PROPS.filter(p =>
    year >= p.yearIntroduced &&
    (p.yearRemoved === null || year <= p.yearRemoved)
  );
}

/**
 * Get props filtered by year and road category.
 * @param {number} year
 * @param {string} roadCategory - OSM road category
 * @returns {object[]}
 */
export function getPropsForRoad(year, roadCategory) {
  return getPropsForYear(year).filter(p =>
    p.roadCategories === null || p.roadCategories.includes(roadCategory)
  );
}

/**
 * Get props by placement type.
 * @param {number} year
 * @param {'sidewalk'|'intersection'|'building_facade'|'mid_block'} placement
 * @returns {object[]}
 */
export function getPropsByPlacement(year, placement) {
  return getPropsForYear(year).filter(p => p.placement === placement);
}

/**
 * List all prop types available for a year with counts by placement.
 * @param {number} year
 * @returns {{ total: number, byPlacement: Object<string, number>, types: string[] }}
 */
export function summarizePropsForYear(year) {
  const props = getPropsForYear(year);
  const byPlacement = {};
  for (const p of props) {
    byPlacement[p.placement] = (byPlacement[p.placement] || 0) + 1;
  }
  return {
    total: props.length,
    byPlacement,
    types: props.map(p => p.type),
  };
}
