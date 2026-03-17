/**
 * Ecology Research Agent (Phase 7.3)
 *
 * Given a location + year, determines what species (birds, mammals, insects,
 * amphibians) and vegetation would be present at that place and time.
 *
 * Uses embedded regional knowledge bases — no external API calls. Species are
 * filtered by region, year (introduction dates), habitat (population density),
 * and seasonal/diurnal activity patterns.
 *
 * Returns an Environment Profile ecology layer with the standard envelope:
 * { data, confidence, sources, knownCompromises }
 */

import { createLayer, createSource } from '../environmentProfile.js';

// ---------------------------------------------------------------------------
// Species Database
// ---------------------------------------------------------------------------

/**
 * Each entry:
 *   commonName       — English common name
 *   scientificName   — Binomial nomenclature
 *   type             — bird | mammal | mammal_domestic | insect | amphibian
 *   native           — true if native to North America
 *   introduced       — year introduced to region, or null if native/prehistoric
 *   regions          — array of region keys where present
 *   habitat          — array of habitat types: urban | suburban | rural | wetland | forest | park
 *   seasonal         — { spring, summer, fall, winter } activity weights 0-1
 *   diurnal          — { dawn, day, dusk, night } activity weights 0-1
 *   density          — base encounter density 0-1 (modulated by habitat match)
 */
export const SPECIES_DB = [
  // ── Birds ──────────────────────────────────────────────────────────────
  {
    commonName: 'House Sparrow',
    scientificName: 'Passer domesticus',
    type: 'bird',
    native: false,
    introduced: 1851,
    regions: ['northeast_us', 'southeast_us', 'midwest_us', 'west_us', 'pacific_us', 'general_us'],
    habitat: ['urban', 'suburban'],
    seasonal: { spring: 0.8, summer: 0.9, fall: 0.7, winter: 0.5 },
    diurnal: { dawn: 0.9, day: 0.7, dusk: 0.8, night: 0.1 },
    density: 0.9
  },
  {
    commonName: 'Rock Pigeon',
    scientificName: 'Columba livia',
    type: 'bird',
    native: false,
    introduced: 1606,
    regions: ['northeast_us', 'southeast_us', 'midwest_us', 'west_us', 'pacific_us', 'general_us'],
    habitat: ['urban'],
    seasonal: { spring: 0.9, summer: 0.9, fall: 0.9, winter: 0.8 },
    diurnal: { dawn: 0.8, day: 0.9, dusk: 0.7, night: 0.1 },
    density: 0.95
  },
  {
    commonName: 'European Starling',
    scientificName: 'Sturnus vulgaris',
    type: 'bird',
    native: false,
    introduced: 1890,
    regions: ['northeast_us', 'southeast_us', 'midwest_us', 'west_us', 'pacific_us', 'general_us'],
    habitat: ['urban', 'suburban', 'rural'],
    seasonal: { spring: 0.8, summer: 0.8, fall: 0.9, winter: 0.7 },
    diurnal: { dawn: 0.9, day: 0.8, dusk: 0.9, night: 0.1 },
    density: 0.85
  },
  {
    commonName: 'American Robin',
    scientificName: 'Turdus migratorius',
    type: 'bird',
    native: true,
    introduced: null,
    regions: ['northeast_us', 'southeast_us', 'midwest_us', 'west_us', 'pacific_us', 'general_us'],
    habitat: ['urban', 'suburban', 'park', 'rural'],
    seasonal: { spring: 0.7, summer: 0.6, fall: 0.3, winter: 0.1 },
    diurnal: { dawn: 0.9, day: 0.5, dusk: 0.7, night: 0.0 },
    density: 0.6
  },
  {
    commonName: 'Blue Jay',
    scientificName: 'Cyanocitta cristata',
    type: 'bird',
    native: true,
    introduced: null,
    regions: ['northeast_us', 'southeast_us', 'midwest_us'],
    habitat: ['suburban', 'park', 'forest'],
    seasonal: { spring: 0.7, summer: 0.8, fall: 0.9, winter: 0.6 },
    diurnal: { dawn: 0.8, day: 0.7, dusk: 0.6, night: 0.0 },
    density: 0.5
  },
  {
    commonName: 'Northern Cardinal',
    scientificName: 'Cardinalis cardinalis',
    type: 'bird',
    native: true,
    introduced: null,
    regions: ['northeast_us', 'southeast_us', 'midwest_us'],
    habitat: ['suburban', 'park', 'forest'],
    seasonal: { spring: 0.9, summer: 0.8, fall: 0.6, winter: 0.5 },
    diurnal: { dawn: 0.9, day: 0.6, dusk: 0.8, night: 0.0 },
    density: 0.55
  },
  {
    commonName: 'Mourning Dove',
    scientificName: 'Zenaida macroura',
    type: 'bird',
    native: true,
    introduced: null,
    regions: ['northeast_us', 'southeast_us', 'midwest_us', 'west_us', 'pacific_us', 'general_us'],
    habitat: ['urban', 'suburban', 'rural', 'park'],
    seasonal: { spring: 0.8, summer: 0.9, fall: 0.7, winter: 0.4 },
    diurnal: { dawn: 0.9, day: 0.6, dusk: 0.8, night: 0.0 },
    density: 0.65
  },
  {
    commonName: 'House Finch',
    scientificName: 'Haemorhous mexicanus',
    type: 'bird',
    native: true,
    introduced: null,
    // Native to western US; introduced to eastern US in 1940 (pet trade release)
    regions: ['west_us', 'pacific_us'],
    habitat: ['urban', 'suburban'],
    seasonal: { spring: 0.8, summer: 0.7, fall: 0.6, winter: 0.5 },
    diurnal: { dawn: 0.8, day: 0.6, dusk: 0.7, night: 0.0 },
    density: 0.6,
    _eastIntroduced: 1940   // special: available in east after 1940
  },
  {
    commonName: 'Common Grackle',
    scientificName: 'Quiscalus quiscula',
    type: 'bird',
    native: true,
    introduced: null,
    regions: ['northeast_us', 'southeast_us', 'midwest_us'],
    habitat: ['urban', 'suburban', 'park', 'rural'],
    seasonal: { spring: 0.8, summer: 0.8, fall: 0.9, winter: 0.3 },
    diurnal: { dawn: 0.7, day: 0.7, dusk: 0.8, night: 0.0 },
    density: 0.6
  },
  {
    commonName: 'American Crow',
    scientificName: 'Corvus brachyrhynchos',
    type: 'bird',
    native: true,
    introduced: null,
    regions: ['northeast_us', 'southeast_us', 'midwest_us', 'west_us', 'pacific_us', 'general_us'],
    habitat: ['urban', 'suburban', 'rural', 'park'],
    seasonal: { spring: 0.7, summer: 0.7, fall: 0.8, winter: 0.6 },
    diurnal: { dawn: 0.8, day: 0.8, dusk: 0.7, night: 0.0 },
    density: 0.5
  },
  {
    commonName: 'Red-tailed Hawk',
    scientificName: 'Buteo jamaicensis',
    type: 'bird',
    native: true,
    introduced: null,
    regions: ['northeast_us', 'southeast_us', 'midwest_us', 'west_us', 'pacific_us', 'general_us'],
    habitat: ['suburban', 'rural', 'park', 'forest'],
    seasonal: { spring: 0.7, summer: 0.7, fall: 0.7, winter: 0.6 },
    diurnal: { dawn: 0.5, day: 0.9, dusk: 0.5, night: 0.0 },
    density: 0.15
  },
  {
    commonName: 'Northern Mockingbird',
    scientificName: 'Mimus polyglottos',
    type: 'bird',
    native: true,
    introduced: null,
    regions: ['southeast_us', 'midwest_us', 'west_us'],
    habitat: ['suburban', 'park', 'rural'],
    seasonal: { spring: 0.9, summer: 0.9, fall: 0.5, winter: 0.3 },
    diurnal: { dawn: 1.0, day: 0.6, dusk: 0.8, night: 0.4 },
    density: 0.5
  },

  // ── Mammals ────────────────────────────────────────────────────────────
  {
    commonName: 'Norway Rat',
    scientificName: 'Rattus norvegicus',
    type: 'mammal',
    native: false,
    introduced: 1776,
    regions: ['northeast_us', 'southeast_us', 'midwest_us', 'west_us', 'pacific_us', 'general_us'],
    habitat: ['urban'],
    seasonal: { spring: 0.8, summer: 0.8, fall: 0.8, winter: 0.7 },
    diurnal: { dawn: 0.3, day: 0.1, dusk: 0.5, night: 0.9 },
    density: 0.8
  },
  {
    commonName: 'Eastern Gray Squirrel',
    scientificName: 'Sciurus carolinensis',
    type: 'mammal',
    native: true,
    introduced: null,
    regions: ['northeast_us', 'southeast_us', 'midwest_us'],
    habitat: ['urban', 'suburban', 'park', 'forest'],
    seasonal: { spring: 0.8, summer: 0.7, fall: 0.9, winter: 0.5 },
    diurnal: { dawn: 0.7, day: 0.9, dusk: 0.6, night: 0.0 },
    density: 0.7
  },
  {
    commonName: 'Raccoon',
    scientificName: 'Procyon lotor',
    type: 'mammal',
    native: true,
    introduced: null,
    regions: ['northeast_us', 'southeast_us', 'midwest_us', 'west_us', 'pacific_us', 'general_us'],
    habitat: ['suburban', 'park', 'forest', 'wetland'],
    seasonal: { spring: 0.7, summer: 0.8, fall: 0.8, winter: 0.3 },
    diurnal: { dawn: 0.2, day: 0.0, dusk: 0.6, night: 0.9 },
    density: 0.35
  },
  {
    commonName: 'White-tailed Deer',
    scientificName: 'Odocoileus virginianus',
    type: 'mammal',
    native: true,
    introduced: null,
    regions: ['northeast_us', 'southeast_us', 'midwest_us'],
    habitat: ['suburban', 'rural', 'forest'],
    seasonal: { spring: 0.6, summer: 0.6, fall: 0.7, winter: 0.5 },
    diurnal: { dawn: 0.8, day: 0.3, dusk: 0.9, night: 0.4 },
    density: 0.2
  },
  {
    commonName: 'Horse',
    scientificName: 'Equus caballus',
    type: 'mammal_domestic',
    native: false,
    introduced: null,  // prehistoric re-introduction, ubiquitous
    regions: ['northeast_us', 'southeast_us', 'midwest_us', 'west_us', 'pacific_us', 'general_us'],
    habitat: ['urban', 'suburban', 'rural'],
    seasonal: { spring: 1.0, summer: 1.0, fall: 1.0, winter: 0.8 },
    diurnal: { dawn: 0.3, day: 0.9, dusk: 0.7, night: 0.1 },
    density: 0.95,
    _declineYear: 1920  // density drops substantially after auto adoption
  },
  {
    commonName: 'Virginia Opossum',
    scientificName: 'Didelphis virginiana',
    type: 'mammal',
    native: true,
    introduced: null,
    regions: ['northeast_us', 'southeast_us', 'midwest_us'],
    habitat: ['suburban', 'rural', 'forest'],
    seasonal: { spring: 0.6, summer: 0.6, fall: 0.6, winter: 0.4 },
    diurnal: { dawn: 0.1, day: 0.0, dusk: 0.4, night: 0.8 },
    density: 0.2
  },

  // ── Insects ────────────────────────────────────────────────────────────
  {
    commonName: 'Field Cricket',
    scientificName: 'Gryllus pennsylvanicus',
    type: 'insect',
    native: true,
    introduced: null,
    regions: ['northeast_us', 'southeast_us', 'midwest_us', 'west_us', 'pacific_us', 'general_us'],
    habitat: ['suburban', 'rural', 'park'],
    seasonal: { spring: 0.3, summer: 0.8, fall: 0.9, winter: 0.0 },
    diurnal: { dawn: 0.3, day: 0.1, dusk: 0.7, night: 1.0 },
    density: 0.7
  },
  {
    commonName: 'Annual Cicada',
    scientificName: 'Neotibicen linnei',
    type: 'insect',
    native: true,
    introduced: null,
    regions: ['northeast_us', 'southeast_us', 'midwest_us'],
    habitat: ['urban', 'suburban', 'park', 'forest'],
    seasonal: { spring: 0.0, summer: 0.9, fall: 0.3, winter: 0.0 },
    diurnal: { dawn: 0.3, day: 0.9, dusk: 0.5, night: 0.0 },
    density: 0.6
  },
  {
    commonName: 'Western Honeybee',
    scientificName: 'Apis mellifera',
    type: 'insect',
    native: false,
    introduced: 1622,
    regions: ['northeast_us', 'southeast_us', 'midwest_us', 'west_us', 'pacific_us', 'general_us'],
    habitat: ['urban', 'suburban', 'rural', 'park'],
    seasonal: { spring: 0.7, summer: 0.9, fall: 0.5, winter: 0.0 },
    diurnal: { dawn: 0.4, day: 0.9, dusk: 0.3, night: 0.0 },
    density: 0.5
  },
  {
    commonName: 'Common Mosquito',
    scientificName: 'Culex pipiens',
    type: 'insect',
    native: true,
    introduced: null,
    regions: ['northeast_us', 'southeast_us', 'midwest_us', 'west_us', 'pacific_us', 'general_us'],
    habitat: ['urban', 'suburban', 'rural', 'wetland', 'park'],
    seasonal: { spring: 0.4, summer: 0.9, fall: 0.5, winter: 0.0 },
    diurnal: { dawn: 0.7, day: 0.3, dusk: 0.9, night: 0.8 },
    density: 0.7
  },
  {
    commonName: 'Common Eastern Firefly',
    scientificName: 'Photinus pyralis',
    type: 'insect',
    native: true,
    introduced: null,
    regions: ['northeast_us', 'southeast_us', 'midwest_us'],
    habitat: ['suburban', 'rural', 'park', 'wetland'],
    seasonal: { spring: 0.3, summer: 0.9, fall: 0.1, winter: 0.0 },
    diurnal: { dawn: 0.0, day: 0.0, dusk: 0.9, night: 0.7 },
    density: 0.45
  },
  {
    commonName: 'Katydid',
    scientificName: 'Pterophylla camellifolia',
    type: 'insect',
    native: true,
    introduced: null,
    regions: ['northeast_us', 'southeast_us', 'midwest_us'],
    habitat: ['suburban', 'park', 'forest'],
    seasonal: { spring: 0.0, summer: 0.6, fall: 0.8, winter: 0.0 },
    diurnal: { dawn: 0.1, day: 0.0, dusk: 0.6, night: 1.0 },
    density: 0.5
  },

  // ── Amphibians ─────────────────────────────────────────────────────────
  {
    commonName: 'Spring Peeper',
    scientificName: 'Pseudacris crucifer',
    type: 'amphibian',
    native: true,
    introduced: null,
    regions: ['northeast_us', 'southeast_us', 'midwest_us'],
    habitat: ['wetland', 'forest', 'park'],
    seasonal: { spring: 1.0, summer: 0.3, fall: 0.0, winter: 0.0 },
    diurnal: { dawn: 0.3, day: 0.0, dusk: 0.7, night: 1.0 },
    density: 0.5
  },
  {
    commonName: 'American Bullfrog',
    scientificName: 'Lithobates catesbeianus',
    type: 'amphibian',
    native: true,
    introduced: null,
    regions: ['northeast_us', 'southeast_us', 'midwest_us'],
    habitat: ['wetland', 'park'],
    seasonal: { spring: 0.6, summer: 0.9, fall: 0.3, winter: 0.0 },
    diurnal: { dawn: 0.3, day: 0.1, dusk: 0.8, night: 1.0 },
    density: 0.35
  }
];

// ---------------------------------------------------------------------------
// Vegetation Database
// ---------------------------------------------------------------------------

export const VEGETATION_DB = [
  {
    region: 'northeast_us',
    streetTrees: ['American Elm', 'London Plane', 'Norway Maple', 'Honey Locust', 'Red Oak'],
    parkTrees: ['Oak', 'Maple', 'Tulip Tree', 'American Beech', 'White Pine'],
    groundCover: ['Kentucky Bluegrass', 'Clover', 'Dandelion'],
    seasonalCanopy: { spring: 0.6, summer: 1.0, fall: 0.5, winter: 0.0 }
  },
  {
    region: 'southeast_us',
    streetTrees: ['Live Oak', 'Crape Myrtle', 'Southern Magnolia', 'Bald Cypress', 'Pecan'],
    parkTrees: ['Loblolly Pine', 'Water Oak', 'Sweetgum', 'Dogwood', 'Red Maple'],
    groundCover: ['Bermuda Grass', 'Spanish Moss', 'Clover'],
    seasonalCanopy: { spring: 0.7, summer: 1.0, fall: 0.6, winter: 0.2 }
  },
  {
    region: 'midwest_us',
    streetTrees: ['American Elm', 'Ash', 'Silver Maple', 'Cottonwood', 'Hackberry'],
    parkTrees: ['Bur Oak', 'Black Walnut', 'Eastern Redbud', 'Hickory', 'Basswood'],
    groundCover: ['Bluegrass', 'Tall Fescue', 'Clover'],
    seasonalCanopy: { spring: 0.5, summer: 1.0, fall: 0.5, winter: 0.0 }
  },
  {
    region: 'west_us',
    streetTrees: ['Ponderosa Pine', 'Blue Spruce', 'Aspen', 'Box Elder', 'Cottonwood'],
    parkTrees: ['Douglas Fir', 'Lodgepole Pine', 'Pinyon Pine', 'Gambel Oak', 'Juniper'],
    groundCover: ['Buffalo Grass', 'Blue Grama', 'Sagebrush'],
    seasonalCanopy: { spring: 0.5, summer: 0.8, fall: 0.4, winter: 0.1 }
  },
  {
    region: 'pacific_us',
    streetTrees: ['Coast Live Oak', 'California Sycamore', 'Monterey Cypress', 'Jacaranda', 'Fan Palm'],
    parkTrees: ['Coast Redwood', 'Monterey Pine', 'California Bay Laurel', 'Madrone', 'Douglas Fir'],
    groundCover: ['Ryegrass', 'Ice Plant', 'California Poppy'],
    seasonalCanopy: { spring: 0.8, summer: 0.9, fall: 0.7, winter: 0.4 }
  },
  {
    region: 'general_us',
    streetTrees: ['Elm', 'Maple', 'Oak', 'Ash', 'Locust'],
    parkTrees: ['Oak', 'Maple', 'Pine', 'Hickory', 'Birch'],
    groundCover: ['Grass', 'Clover', 'Dandelion'],
    seasonalCanopy: { spring: 0.6, summer: 1.0, fall: 0.5, winter: 0.0 }
  }
];

// ---------------------------------------------------------------------------
// Region mapping from lat/lon
// ---------------------------------------------------------------------------

const REGION_BOUNDS = [
  { id: 'pacific_us',    latMin: 32,  latMax: 49,  lonMin: -125, lonMax: -115 },
  { id: 'west_us',       latMin: 30,  latMax: 49,  lonMin: -115, lonMax: -100 },
  { id: 'midwest_us',    latMin: 36,  latMax: 49,  lonMin: -100, lonMax: -80 },
  { id: 'northeast_us',  latMin: 38,  latMax: 49,  lonMin: -80,  lonMax: -66 },
  { id: 'southeast_us',  latMin: 24,  latMax: 38,  lonMin: -100, lonMax: -66 },
];

/**
 * Determine US region from lat/lon. Returns region key or 'general_us'.
 */
function resolveRegion(lat, lon) {
  for (const r of REGION_BOUNDS) {
    if (lat >= r.latMin && lat <= r.latMax && lon >= r.lonMin && lon <= r.lonMax) {
      return r.id;
    }
  }
  return 'general_us';
}

// ---------------------------------------------------------------------------
// Habitat classification from population density context
// ---------------------------------------------------------------------------

/**
 * Classify habitat type from location context.
 * Uses a simple heuristic: population string or density number.
 *
 * @param {Object} opts
 * @param {string} [opts.locationType] - 'city' | 'suburb' | 'town' | 'rural'
 * @param {number} [opts.population] - population estimate
 * @returns {string} 'urban' | 'suburban' | 'rural'
 */
export function classifyHabitat({ locationType, population } = {}) {
  if (locationType) {
    if (locationType === 'city') return 'urban';
    if (locationType === 'suburb' || locationType === 'town') return 'suburban';
    if (locationType === 'rural') return 'rural';
  }
  if (typeof population === 'number') {
    if (population >= 100000) return 'urban';
    if (population >= 10000) return 'suburban';
    return 'rural';
  }
  return 'suburban'; // safe default
}

// ---------------------------------------------------------------------------
// Species filtering
// ---------------------------------------------------------------------------

/**
 * Get species present in a given region.
 * Also includes species from 'general_us' when region is any US region.
 *
 * @param {string} region - Region key
 * @returns {Object[]} Matching species entries
 */
export function getSpeciesForRegion(region) {
  return SPECIES_DB.filter(s =>
    s.regions.includes(region) || s.regions.includes('general_us')
  );
}

/**
 * Filter species by year. Excludes species introduced after the target year.
 * Handles House Finch east-coast special case.
 *
 * @param {Object[]} species - Species array
 * @param {number} year - Target year
 * @param {string} [region] - Region for location-specific filtering
 * @returns {Object[]} Filtered species (cloned, with adjusted density)
 */
export function filterByYear(species, year, region) {
  return species
    .filter(s => {
      // Exclude if introduced after target year
      if (s.introduced !== null && s.introduced > year) return false;

      // House Finch: exclude from eastern regions before 1940
      if (s._eastIntroduced && !s.regions.includes(region)) {
        // This species has eastern expansion — check if the region is eastern
        const easternRegions = ['northeast_us', 'southeast_us', 'midwest_us'];
        if (easternRegions.includes(region) && year < s._eastIntroduced) {
          return false;
        }
      }

      return true;
    })
    .map(s => {
      const clone = { ...s, seasonal: { ...s.seasonal }, diurnal: { ...s.diurnal } };

      // Horse density declines after automobile adoption
      if (s._declineYear && year > s._declineYear) {
        const yearsAfter = year - s._declineYear;
        const decline = Math.min(0.85, yearsAfter * 0.02); // drops ~2% per year, max 85% reduction
        clone.density = Math.round(clone.density * (1 - decline) * 100) / 100;
      }

      return clone;
    });
}

/**
 * Filter species by habitat compatibility.
 * Species whose habitat array overlaps with the target habitat get full density.
 * Species in adjacent habitats get reduced density. Others excluded.
 *
 * @param {Object[]} species - Species array
 * @param {string} habitat - Target habitat: 'urban' | 'suburban' | 'rural'
 * @returns {Object[]} Filtered species with adjusted densities
 */
function filterByHabitat(species, habitat) {
  const adjacency = {
    urban: ['urban', 'suburban', 'park'],
    suburban: ['suburban', 'urban', 'rural', 'park', 'forest'],
    rural: ['rural', 'suburban', 'forest', 'wetland', 'park']
  };

  const primary = [habitat];
  const secondary = adjacency[habitat] || [habitat];

  return species
    .filter(s => s.habitat.some(h => secondary.includes(h)))
    .map(s => {
      const clone = { ...s, seasonal: { ...s.seasonal }, diurnal: { ...s.diurnal } };
      const hasPrimary = s.habitat.includes(habitat);
      if (!hasPrimary) {
        // Adjacent habitat — reduce density
        clone.density = Math.round(clone.density * 0.4 * 100) / 100;
      }
      return clone;
    });
}

// ---------------------------------------------------------------------------
// Confidence calculation
// ---------------------------------------------------------------------------

/**
 * Calculate ecology layer confidence based on data quality factors.
 *
 * @param {Object} params
 * @param {number} params.year
 * @param {string} params.region
 * @param {string} params.countryCode
 * @param {number} params.speciesCount - number of species in result
 * @returns {number} Confidence 0-1
 */
function calculateConfidence({ year, region, countryCode, speciesCount }) {
  let confidence = 0.6; // base for embedded knowledge

  // US data is better cataloged
  if (countryCode === 'US') confidence += 0.1;

  // Specific region vs general
  if (region !== 'general_us') confidence += 0.05;

  // Year-based degradation
  if (year >= 1950) {
    confidence += 0.05; // modern ecology well-documented
  } else if (year >= 1900) {
    confidence += 0.0;
  } else if (year >= 1800) {
    confidence -= 0.05;
  } else {
    confidence -= 0.15; // pre-1800 ecology speculative
  }

  // Species count factor — more species = higher quality result
  if (speciesCount >= 15) confidence += 0.05;
  else if (speciesCount < 5) confidence -= 0.1;

  // Clamp
  return Math.round(Math.max(0.1, Math.min(0.85, confidence)) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Known compromises
// ---------------------------------------------------------------------------

function buildCompromises(year, region, habitat) {
  const compromises = [];

  compromises.push(
    'Species pool inferred from regional data, not site-specific field surveys'
  );

  compromises.push(
    'Seasonal/diurnal weights are estimated from general behavior patterns'
  );

  if (year < 1900) {
    compromises.push(
      `Pre-1900 ecology (${year}) is less well-documented — some species ranges are approximate`
    );
  }

  if (region === 'general_us') {
    compromises.push(
      'Location did not match a specific US region — using general species pool'
    );
  }

  if (habitat === 'urban') {
    compromises.push(
      'Urban habitat reduces species diversity — some species present in parks may be underrepresented'
    );
  }

  return compromises;
}

// ---------------------------------------------------------------------------
// Vegetation lookup
// ---------------------------------------------------------------------------

function getVegetation(region, habitat, month) {
  const vegData = VEGETATION_DB.find(v => v.region === region) ||
    VEGETATION_DB.find(v => v.region === 'general_us');

  if (!vegData) return [];

  const result = [];

  // Street trees — present in urban and suburban
  if (habitat === 'urban' || habitat === 'suburban') {
    result.push({
      type: 'street_trees',
      species: vegData.streetTrees,
      coverage: habitat === 'urban' ? 'major_avenues_and_parks' : 'residential_streets',
      seasonalCanopy: { ...vegData.seasonalCanopy }
    });
  }

  // Park trees — always included
  result.push({
    type: 'park',
    species: vegData.parkTrees,
    coverage: 'parks_and_green_spaces',
    seasonalCanopy: { ...vegData.seasonalCanopy }
  });

  return result;
}

// ---------------------------------------------------------------------------
// Season from month
// ---------------------------------------------------------------------------

function monthToSeason(month) {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'fall';
  return 'winter';
}

// ---------------------------------------------------------------------------
// Main agent function
// ---------------------------------------------------------------------------

/**
 * Research ecology for a Place×Time.
 *
 * @param {Object} params
 * @param {string} params.location - Location string (e.g., "New York, NY")
 * @param {number} params.year - Target year
 * @param {number} params.lat - Latitude
 * @param {number} params.lon - Longitude
 * @param {number} [params.month=6] - Month (1-12) for seasonal weighting
 * @param {string} [params.countryCode='US'] - ISO country code
 * @param {string} [params.locationType] - 'city' | 'suburb' | 'town' | 'rural'
 * @param {number} [params.population] - Population for habitat classification
 * @returns {Object} Environment Profile ecology layer { data, confidence, sources, knownCompromises }
 */
export function researchEcology({
  location,
  year,
  lat,
  lon,
  month = 6,
  countryCode = 'US',
  locationType,
  population
}) {
  // Step 1: Determine region
  const region = resolveRegion(lat, lon);

  // Step 2: Classify habitat
  const habitat = classifyHabitat({ locationType, population });

  // Step 3: Get species for region
  let species = getSpeciesForRegion(region);

  // Step 4: Filter by year
  species = filterByYear(species, year, region);

  // Step 5: Filter by habitat
  species = filterByHabitat(species, habitat);

  // Step 6: Build species output (match profile shape)
  const season = monthToSeason(month);
  const speciesOutput = species.map(s => {
    const entry = {
      commonName: s.commonName,
      scientificName: s.scientificName,
      type: s.type,
      introduced: s.introduced,
      native: s.native,
      seasonal: s.seasonal,
      diurnal: s.diurnal,
      habitat: s.habitat,
      density: s.density
    };

    // If density is effectively 0 for the current season, add a note
    if (s.seasonal[season] === 0) {
      entry.note = `Not active in ${season}`;
    }

    return entry;
  });

  // Step 7: Vegetation
  const vegetation = getVegetation(region, habitat, month);

  // Step 8: Confidence
  const confidence = calculateConfidence({
    year,
    region,
    countryCode,
    speciesCount: speciesOutput.length
  });

  // Step 9: Sources
  const sources = [
    createSource(
      'embedded_species_db',
      'ornithological_survey',
      'Embedded species database — common North American urban/suburban wildlife',
      { citation: 'Composite from Audubon, NWF, and USGS species range data' }
    ),
    createSource(
      'embedded_vegetation_db',
      'botanical_survey',
      `Regional vegetation data — ${region} street trees and park species`,
      { citation: 'Composite from USDA Forest Service and local arboretum records' }
    )
  ];

  // Step 10: Compromises
  const knownCompromises = buildCompromises(year, region, habitat);

  // Step 11: Build data
  const data = {
    species: speciesOutput,
    vegetation,
    _researchMeta: {
      region,
      habitat,
      season,
      totalSpeciesConsidered: SPECIES_DB.length,
      speciesAfterFiltering: speciesOutput.length,
      yearFiltered: SPECIES_DB.length - getSpeciesForRegion(region).length +
        (getSpeciesForRegion(region).length - filterByYear(getSpeciesForRegion(region), year, region).length)
    }
  };

  return createLayer(data, confidence, sources, knownCompromises);
}
