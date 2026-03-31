/**
 * Materials & Infrastructure Research Agent (Phase 7 — covers materials + infrastructure layers)
 *
 * Given a location + year, determines:
 * - Road surfaces, building facade materials, roofing, acoustic properties (materials layer)
 * - Lighting type, transport modes, utilities, public services (infrastructure layer)
 *
 * Uses existing streetLayout.js surface rules and architectureStyles.js data,
 * plus embedded infrastructure timeline data.
 */

import { SURFACE_TYPES } from '../streetLayout.js';
import { resolveEra, getEraInfo, listEras } from '../architectureStyles.js';
import { getPropsForYear, summarizePropsForYear } from '../propCatalog.js';
import { createLayer, createSource } from '../environmentProfile.js';

// ---------------------------------------------------------------------------
// Road surface rules by era (derived from streetLayout.js patterns)
// ---------------------------------------------------------------------------

const ROAD_SURFACES_BY_ERA = {
  pre_1800: {
    primary: 'cobblestone', secondary: 'cobblestone', residential: 'dirt',
    service: 'dirt', footway: 'dirt'
  },
  early_1800s: {
    primary: 'cobblestone', secondary: 'cobblestone', residential: 'dirt',
    service: 'dirt', footway: 'granite_flag'
  },
  mid_1800s: {
    primary: 'belgian_block', secondary: 'cobblestone', residential: 'cobblestone',
    service: 'dirt', footway: 'granite_flag'
  },
  gilded_age: {
    primary: 'belgian_block', secondary: 'belgian_block', residential: 'cobblestone',
    service: 'dirt', footway: 'granite_flag'
  },
  progressive: {
    primary: 'asphalt', secondary: 'belgian_block', residential: 'macadam',
    service: 'dirt', footway: 'concrete'
  },
  interwar: {
    primary: 'asphalt', secondary: 'asphalt', residential: 'asphalt',
    service: 'gravel', footway: 'concrete'
  },
  postwar: {
    primary: 'asphalt', secondary: 'asphalt', residential: 'asphalt',
    service: 'asphalt', footway: 'concrete'
  },
  modern: {
    primary: 'asphalt', secondary: 'asphalt', residential: 'asphalt',
    service: 'asphalt', footway: 'concrete'
  }
};

// ---------------------------------------------------------------------------
// Acoustic properties for surfaces
// ---------------------------------------------------------------------------

const ACOUSTIC_PROPERTIES = {
  belgian_block: { reverbSend: 3, impactHardness: 0.8 },
  cobblestone: { reverbSend: 2, impactHardness: 0.7 },
  granite_flag: { reverbSend: 1, impactHardness: 0.6 },
  macadam: { reverbSend: -1, impactHardness: 0.4 },
  brick: { reverbSend: 1, impactHardness: 0.6 },
  dirt: { reverbSend: -4, impactHardness: 0.2 },
  gravel: { reverbSend: -2, impactHardness: 0.3 },
  asphalt: { reverbSend: 0, impactHardness: 0.5 },
  concrete: { reverbSend: 0, impactHardness: 0.55 },
  brownstone: { reverbSend: 1, impactHardness: 0.5 },
  cast_iron: { reverbSend: 2, impactHardness: 0.9 },
  wood: { reverbSend: -2, impactHardness: 0.3 },
  limestone: { reverbSend: 1, impactHardness: 0.6 },
  granite: { reverbSend: 2, impactHardness: 0.7 }
};

// ---------------------------------------------------------------------------
// Infrastructure timeline
// ---------------------------------------------------------------------------

const INFRASTRUCTURE_TIMELINE = [
  // Lighting
  { type: 'lighting', item: 'candle_oil_lamp', introduced: null, superseded: 1820, label: 'Candle/oil lamps' },
  { type: 'lighting', item: 'gas_lamp', introduced: 1820, superseded: 1900, label: 'Gas street lamps' },
  { type: 'lighting', item: 'arc_lamp', introduced: 1878, superseded: 1910, label: 'Arc lamps (limited)' },
  { type: 'lighting', item: 'incandescent', introduced: 1882, superseded: null, label: 'Incandescent electric' },

  // Transport
  { type: 'transport', item: 'pedestrian', introduced: null, superseded: null, label: 'Pedestrian' },
  { type: 'transport', item: 'horse_drawn', introduced: null, superseded: 1920, label: 'Horse-drawn vehicles' },
  { type: 'transport', item: 'horse_car', introduced: 1832, superseded: 1900, label: 'Horse car (streetcar)' },
  { type: 'transport', item: 'elevated_railway', introduced: 1868, superseded: 1955, label: 'Elevated railway' },
  { type: 'transport', item: 'cable_car', introduced: 1873, superseded: 1910, label: 'Cable car' },
  { type: 'transport', item: 'electric_trolley', introduced: 1888, superseded: 1960, label: 'Electric trolley' },
  { type: 'transport', item: 'bicycle', introduced: 1870, superseded: null, label: 'Bicycle' },
  { type: 'transport', item: 'automobile', introduced: 1900, superseded: null, label: 'Automobile' },
  { type: 'transport', item: 'subway', introduced: 1904, superseded: null, label: 'Subway' },
  { type: 'transport', item: 'bus', introduced: 1905, superseded: null, label: 'Motor bus' },
  { type: 'transport', item: 'ferry', introduced: null, superseded: null, label: 'Ferry (coastal cities)' },

  // Communication
  { type: 'communication', item: 'telegraph', introduced: 1844, superseded: 1920, label: 'Telegraph' },
  { type: 'communication', item: 'telephone', introduced: 1878, superseded: null, label: 'Telephone' },
  { type: 'communication', item: 'radio', introduced: 1920, superseded: null, label: 'Radio' },
  { type: 'communication', item: 'television', introduced: 1948, superseded: null, label: 'Television' },

  // Utilities
  { type: 'utility', item: 'gas_piped', introduced: 1825, superseded: null, label: 'Piped gas' },
  { type: 'utility', item: 'municipal_water', introduced: 1842, superseded: null, label: 'Municipal water' },
  { type: 'utility', item: 'sewer_combined', introduced: 1850, superseded: null, label: 'Combined sewer' },
  { type: 'utility', item: 'electricity', introduced: 1882, superseded: null, label: 'Electricity' },
  { type: 'utility', item: 'central_heating', introduced: 1900, superseded: null, label: 'Central heating' },
  { type: 'utility', item: 'air_conditioning', introduced: 1950, superseded: null, label: 'Air conditioning' }
];

// ---------------------------------------------------------------------------
// Era resolution for road surfaces
// ---------------------------------------------------------------------------

/**
 * Map a year to a road surface era key.
 */
export function resolveRoadEra(year) {
  if (year < 1800) return 'pre_1800';
  if (year < 1840) return 'early_1800s';
  if (year < 1870) return 'mid_1800s';
  if (year < 1900) return 'gilded_age';
  if (year < 1920) return 'progressive';
  if (year < 1945) return 'interwar';
  if (year < 1980) return 'postwar';
  return 'modern';
}

// ---------------------------------------------------------------------------
// Infrastructure filtering
// ---------------------------------------------------------------------------

/**
 * Get infrastructure items present at a given year.
 */
export function getInfrastructureForYear(year) {
  const result = { lighting: [], transport: [], communication: [], utility: [] };

  for (const item of INFRASTRUCTURE_TIMELINE) {
    const introduced = item.introduced ?? -Infinity;
    const superseded = item.superseded ?? Infinity;

    if (year >= introduced && year <= superseded + 20) {
      // Allow 20-year overlap after "superseded" — tech doesn't vanish instantly
      result[item.type].push({
        item: item.item,
        label: item.label,
        status: year > superseded ? 'declining' : year >= superseded - 10 ? 'mature' : 'active'
      });
    }
  }

  return result;
}

/**
 * Determine the primary lighting type for a year.
 */
export function getPrimaryLighting(year) {
  if (year < 1820) return { primary: 'candle_oil', electric: false };
  if (year < 1882) return { primary: 'gas', electric: false };
  if (year < 1900) return { primary: 'gas', electric: 'limited' };
  if (year <= 1920) return { primary: 'electric', electric: true, gasRemaining: true };
  return { primary: 'electric', electric: true, gasRemaining: false };
}

/**
 * Get the primary heating fuel for a year.
 * Determines chimney smoke visibility and color.
 * @param {number} year
 * @returns {{ fuel: string, smokeColor: number[]|null, smokeDensity: number }}
 */
export function getHeatingFuel(year) {
  if (year < 1850) return { fuel: 'wood', smokeColor: [0.6, 0.55, 0.45], smokeDensity: 0.6 };
  if (year < 1900) return { fuel: 'coal', smokeColor: [0.2, 0.2, 0.2], smokeDensity: 0.8 };
  if (year < 1940) return { fuel: 'coal', smokeColor: [0.25, 0.25, 0.25], smokeDensity: 0.5 };
  if (year < 1970) return { fuel: 'oil', smokeColor: [0.35, 0.3, 0.3], smokeDensity: 0.2 };
  return { fuel: 'gas_electric', smokeColor: null, smokeDensity: 0 };
}

// ---------------------------------------------------------------------------
// Building facade materials by era
// ---------------------------------------------------------------------------

const FACADE_MATERIALS_BY_ERA = {
  pre_1800: ['wood', 'brick', 'stone'],
  early_1800s: ['brick', 'stone', 'wood'],
  mid_1800s: ['brick', 'brownstone', 'limestone', 'wood'],
  gilded_age: ['brownstone', 'cast_iron', 'brick', 'limestone', 'granite', 'marble'],
  progressive: ['brick', 'limestone', 'terra_cotta', 'steel_frame', 'granite'],
  interwar: ['brick', 'limestone', 'concrete', 'steel_frame', 'glass'],
  postwar: ['brick', 'concrete', 'glass', 'steel', 'aluminum'],
  modern: ['glass', 'steel', 'concrete', 'composite', 'brick']
};

const ROOFING_BY_ERA = {
  pre_1800: ['wood_shingle', 'thatch', 'slate'],
  early_1800s: ['wood_shingle', 'slate', 'tin'],
  mid_1800s: ['slate', 'tin', 'wood_shingle'],
  gilded_age: ['slate', 'tin', 'copper', 'wood_shingle'],
  progressive: ['slate', 'tin', 'copper', 'tar'],
  interwar: ['tar', 'slate', 'copper', 'tile'],
  postwar: ['asphalt_shingle', 'tar', 'built_up'],
  modern: ['asphalt_shingle', 'membrane', 'metal', 'green_roof']
};

// ---------------------------------------------------------------------------
// Main research functions
// ---------------------------------------------------------------------------

/**
 * Research materials for a Place×Time.
 */
export function researchMaterials({ year }) {
  const roadEra = resolveRoadEra(year);
  const roads = ROAD_SURFACES_BY_ERA[roadEra];
  const facades = FACADE_MATERIALS_BY_ERA[roadEra] || FACADE_MATERIALS_BY_ERA.modern;
  const roofing = ROOFING_BY_ERA[roadEra] || ROOFING_BY_ERA.modern;

  // Build acoustic properties for all surfaces present
  const surfacesUsed = new Set([...Object.values(roads), 'concrete', ...facades]);
  const acousticProperties = {};
  for (const surface of surfacesUsed) {
    if (ACOUSTIC_PROPERTIES[surface]) {
      acousticProperties[surface] = ACOUSTIC_PROPERTIES[surface];
    }
  }

  const data = {
    roads,
    sidewalks: roads.footway,
    buildingFacades: facades,
    roofing,
    acousticProperties
  };

  // Confidence: higher for well-documented eras
  let confidence;
  if (year >= 1850 && year <= 1950) confidence = 0.7;  // good historical records
  else if (year >= 1950) confidence = 0.8;               // modern, well documented
  else if (year >= 1800) confidence = 0.5;               // some records
  else confidence = 0.3;                                  // sparse records

  const sources = [
    createSource(
      'street_layout_rules',
      'procedural_generation',
      `streetLayout.js era rules (${roadEra})`,
      { citation: 'Era-specific road surface classification from lib/streetLayout.js' }
    ),
    createSource(
      'architecture_styles',
      'procedural_generation',
      'architectureStyles.js era data',
      { citation: 'Building material data from lib/architectureStyles.js' }
    )
  ];

  const knownCompromises = [
    'Road surface assignments from era rules, not per-street historical records',
    'Acoustic properties are modeled values, not measured'
  ];

  if (year < 1850) {
    knownCompromises.push('Pre-1850 material data is generalized — limited historical records');
  }

  return createLayer(data, confidence, sources, knownCompromises);
}

/**
 * Research infrastructure for a Place×Time.
 */
export function researchInfrastructure({ year, population }) {
  const infra = getInfrastructureForYear(year);
  const lighting = getPrimaryLighting(year);
  const props = getPropsForYear(year);
  const propNames = props.map(p => p.type);

  const transportModes = infra.transport.map(t => t.item);
  const commItems = infra.communication.map(c => c.item);
  const utilityItems = infra.utility.map(u => u.item);

  // Lamp spacing from prop catalog or defaults
  let lampSpacing = 'none';
  if (lighting.primary === 'gas') lampSpacing = '30-40m';
  else if (lighting.primary === 'electric') lampSpacing = '25-35m';
  else if (lighting.primary === 'candle_oil') lampSpacing = 'sparse (50m+)';

  const data = {
    lighting: {
      primary: lighting.primary,
      electric: lighting.electric,
      gasRemaining: lighting.gasRemaining || false,
      lampSpacing
    },
    transport: {
      modes: transportModes,
      details: {}
    },
    communication: commItems,
    utilities: utilityItems,
    streetFurniture: propNames,
    publicServices: buildPublicServices(year)
  };

  // Add transport details for notable modes
  if (transportModes.includes('elevated_railway') && year < 1955) {
    data.transport.details.elevatedRailway = {
      fuel: year < 1900 ? 'steam' : 'electric',
      note: year < 1900 ? 'Steam-powered elevated trains' : 'Electrified elevated lines'
    };
  }
  if (transportModes.includes('horse_drawn') && year < 1920) {
    data.transport.details.horseDrawn = {
      types: ['carriage', 'cart', 'omnibus', 'hansom_cab'],
      note: `Primary personal and freight transport in ${year}`
    };
  }
  if (transportModes.includes('automobile') && year >= 1900 && year < 1930) {
    data.transport.details.automobile = {
      prevalence: year < 1910 ? 'rare' : year < 1920 ? 'uncommon' : 'common',
      note: `Automobile adoption phase in ${year}`
    };
  }

  // Confidence
  let confidence;
  if (year >= 1870 && year <= 1950) confidence = 0.65;
  else if (year >= 1950) confidence = 0.75;
  else if (year >= 1800) confidence = 0.45;
  else confidence = 0.25;

  const sources = [
    createSource(
      'infrastructure_timeline',
      'online_database',
      'Infrastructure technology introduction dates',
      { citation: 'Compiled from general US infrastructure history references' }
    ),
    createSource(
      'prop_catalog',
      'procedural_generation',
      `propCatalog.js (${props.length} prop types for ${year})`,
      { citation: 'Era-appropriate street furniture from lib/propCatalog.js' }
    )
  ];

  const knownCompromises = [
    'Infrastructure dates are US national averages — specific cities adopted at different times',
    'Transport mode availability does not indicate density or route coverage'
  ];

  if (year < 1870) {
    knownCompromises.push('Pre-1870 infrastructure data is generalized');
  }
  if (population && population < 10000) {
    knownCompromises.push('Small-town infrastructure may lag national adoption dates by 10-20 years');
  }

  return createLayer(data, confidence, sources, knownCompromises);
}

function buildPublicServices(year) {
  const services = {};

  if (year >= 1865) services.fire = 'professional';
  else if (year >= 1800) services.fire = 'volunteer';
  else services.fire = 'bucket_brigade';

  if (year >= 1845) services.police = 'professional';
  else if (year >= 1800) services.police = 'constable_watch';

  if (year >= 1895) services.streetCleaning = 'mechanical';
  else if (year >= 1850) services.streetCleaning = 'manual';

  if (year >= 1920) services.ambulance = 'motorized';
  else if (year >= 1869) services.ambulance = 'horse_drawn';

  return services;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  ROAD_SURFACES_BY_ERA,
  ACOUSTIC_PROPERTIES,
  INFRASTRUCTURE_TIMELINE,
  FACADE_MATERIALS_BY_ERA,
  ROOFING_BY_ERA
};
