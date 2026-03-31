/**
 * Decal Catalog — weathering and grime decal definitions
 *
 * Defines facade weathering decals (water stains, soot, dirt, cracks, moss)
 * and ground grime decals (puddle stains, horse waste, oil, mud). Each type
 * has era ranges, material affinity, placement rules, and density weights.
 *
 * Follows the propCatalog.js pattern — plain data + filtering functions.
 */

// ─── Facade Decal Types ────────────────────────────────────────

export const DECAL_TYPES = [
  {
    type: 'water_stain',
    label: 'Water Stain / Rain Streak',
    eraStart: null,
    eraEnd: null,
    materialAffinity: ['brownstone', 'limestone', 'brick_red', 'concrete', 'stone_grey', 'stucco'],
    heightRange: [0.3, 1.0],       // normalized: 30-100% of building height
    facingPreference: 'any',
    baseDensityWeight: 0.7,
    ageFactor: 0.8,                 // how much age multiplies density
    scaleRange: [80, 200],          // cm width of decal
    aspectRatio: [0.3, 0.5],       // height:width (tall vertical streaks)
    decalMaterial: '/Game/TimeMachine/Decals/DM_WaterStain',
  },
  {
    type: 'soot_smoke',
    label: 'Soot / Smoke Stain',
    eraStart: 1800,
    eraEnd: 1960,
    materialAffinity: ['brownstone', 'limestone', 'brick_red', 'stone_grey'],
    heightRange: [0.0, 0.6],
    facingPreference: 'any',
    baseDensityWeight: 0.5,
    ageFactor: 1.0,
    scaleRange: [100, 400],
    aspectRatio: [0.8, 1.2],
    decalMaterial: '/Game/TimeMachine/Decals/DM_Soot',
  },
  {
    type: 'dirt_accumulation',
    label: 'Dirt Accumulation',
    eraStart: null,
    eraEnd: null,
    materialAffinity: null,         // all materials
    heightRange: [0.0, 0.15],      // ground level band
    facingPreference: 'any',
    baseDensityWeight: 0.9,
    ageFactor: 0.5,
    scaleRange: [50, 150],
    aspectRatio: [1.5, 3.0],       // wide horizontal bands
    decalMaterial: '/Game/TimeMachine/Decals/DM_Dirt',
  },
  {
    type: 'crack_spall',
    label: 'Crack / Spalling',
    eraStart: null,
    eraEnd: null,
    materialAffinity: ['brownstone', 'limestone', 'concrete', 'stucco', 'terra_cotta'],
    heightRange: [0.0, 0.8],
    facingPreference: 'any',
    baseDensityWeight: 0.3,
    ageFactor: 1.0,                 // strongly age-dependent
    scaleRange: [30, 120],
    aspectRatio: [0.5, 2.0],
    decalMaterial: '/Game/TimeMachine/Decals/DM_CrackSpall',
  },
  {
    type: 'moss_lichen',
    label: 'Moss / Lichen Growth',
    eraStart: null,
    eraEnd: null,
    materialAffinity: ['brownstone', 'stone_grey', 'brick_red', 'granite', 'limestone'],
    heightRange: [0.0, 0.25],      // ground-level moisture zone
    facingPreference: 'north',      // shaded faces get more growth
    baseDensityWeight: 0.4,
    ageFactor: 0.9,
    scaleRange: [20, 80],
    aspectRatio: [0.8, 1.2],
    decalMaterial: '/Game/TimeMachine/Decals/DM_MossLichen',
  },
];

// ─── Ground Grime Types ────────────────────────────────────────

export const GROUND_GRIME_TYPES = [
  {
    type: 'puddle_stain',
    label: 'Puddle / Water Stain',
    eraStart: null,
    eraEnd: null,
    surfaceAffinity: ['belgian_block', 'cobblestone', 'granite_flag', 'macadam', 'brick_paving'],
    baseDensityWeight: 0.6,
    scaleRange: [50, 200],
    decalMaterial: '/Game/TimeMachine/Decals/DM_PuddleStain',
  },
  {
    type: 'horse_waste',
    label: 'Horse Waste',
    eraStart: null,
    eraEnd: 1920,
    surfaceAffinity: null,
    baseDensityWeight: 0.7,
    scaleRange: [30, 80],
    decalMaterial: '/Game/TimeMachine/Decals/DM_HorseWaste',
  },
  {
    type: 'oil_spot',
    label: 'Oil / Grease Spot',
    eraStart: 1900,
    eraEnd: null,
    surfaceAffinity: null,
    baseDensityWeight: 0.4,
    scaleRange: [20, 60],
    decalMaterial: '/Game/TimeMachine/Decals/DM_OilSpot',
  },
  {
    type: 'mud_tracking',
    label: 'Mud Tracking',
    eraStart: null,
    eraEnd: null,
    surfaceAffinity: ['cobblestone', 'belgian_block', 'dirt_packed', 'macadam'],
    baseDensityWeight: 0.5,
    scaleRange: [40, 120],
    decalMaterial: '/Game/TimeMachine/Decals/DM_MudTrack',
  },
];

// ─── Filtering ──────────────────────────────────────────────────

/**
 * Check if a year falls within an era range.
 * @param {number} year
 * @param {number|null} start
 * @param {number|null} end
 * @returns {boolean}
 */
function inEraRange(year, start, end) {
  if (start != null && year < start) return false;
  if (end != null && year > end) return false;
  return true;
}

/**
 * Get facade decal types available for a given year.
 * @param {number} year
 * @returns {object[]}
 */
export function getDecalsForYear(year) {
  return DECAL_TYPES.filter(d => inEraRange(year, d.eraStart, d.eraEnd));
}

/**
 * Get facade decals filtered by year and material affinity.
 * @param {string} textureKey - Base texture key from materialCatalog
 * @param {number} year
 * @returns {object[]}
 */
export function getDecalsForMaterial(textureKey, year) {
  return getDecalsForYear(year).filter(d =>
    d.materialAffinity === null || d.materialAffinity.includes(textureKey)
  );
}

/**
 * Get ground grime types available for a given year.
 * @param {number} year
 * @returns {object[]}
 */
export function getGroundGrimeForYear(year) {
  return GROUND_GRIME_TYPES.filter(d => inEraRange(year, d.eraStart, d.eraEnd));
}

/**
 * Compute effective decal density factoring in building age and density multiplier.
 * @param {object} decalDef - Decal definition from DECAL_TYPES
 * @param {number|null} buildingAge - Age in years (null = use base density only)
 * @param {number} densityMultiplier - Global density multiplier (0-1)
 * @returns {number} Effective density (0-1)
 */
export function computeDecalDensity(decalDef, buildingAge, densityMultiplier = 0.5) {
  let density = decalDef.baseDensityWeight * densityMultiplier;

  // Age amplifies density for age-dependent decals
  if (buildingAge != null && buildingAge > 0) {
    const ageMult = 1 + decalDef.ageFactor * Math.min(1, buildingAge / 60);
    density *= ageMult;
  }

  return Math.min(1, density);
}

/**
 * Summarize available decals for a year.
 * @param {number} year
 * @returns {{ facade: number, ground: number, facadeTypes: string[], groundTypes: string[] }}
 */
export function summarizeDecalsForYear(year) {
  const facade = getDecalsForYear(year);
  const ground = getGroundGrimeForYear(year);
  return {
    facade: facade.length,
    ground: ground.length,
    facadeTypes: facade.map(d => d.type),
    groundTypes: ground.map(d => d.type),
  };
}
