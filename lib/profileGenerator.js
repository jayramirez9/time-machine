/**
 * Procedural Audio Profile Generator
 *
 * Generates v2 audio profiles for any Place×Time combination.
 * All sources get `url: null` — compatible with elevenlabs-fetch.js
 * for later asset generation. Until then, the audio engine's
 * procedural synthesis fallback provides functional sound.
 */

// ── Classification helpers ──────────────────────────────────────

/**
 * Classify climate zone from latitude
 * @param {number} lat - Latitude in degrees
 * @returns {{ zone: string, hemisphere: string }}
 */
export function classifyClimate(lat) {
  const absLat = Math.abs(lat);
  const hemisphere = lat >= 0 ? 'north' : 'south';
  let zone;
  if (absLat > 66.5) zone = 'arctic';
  else if (absLat > 55) zone = 'subarctic';
  else if (absLat > 35) zone = 'temperate';
  else if (absLat > 23.5) zone = 'subtropical';
  else zone = 'tropical';
  return { zone, hemisphere };
}

/**
 * Classify population density
 * @param {number} population
 * @returns {string} dense_urban | urban | suburban | rural
 */
export function classifyDensity(population) {
  if (population >= 500000) return 'dense_urban';
  if (population >= 100000) return 'urban';
  if (population >= 10000) return 'suburban';
  return 'rural';
}

/**
 * Get historical era bracket from year
 * @param {number} year
 * @returns {string}
 */
export function getEraBracket(year) {
  if (year < 1830) return 'pre_1830';
  if (year < 1890) return 'steam_age';
  if (year < 1920) return 'early_auto';
  if (year < 1945) return 'auto_age';
  if (year < 1975) return 'postwar';
  return 'modern';
}

// ── Era metadata ────────────────────────────────────────────────

const ERA_META = {
  pre_1830:  { period: 'Pre-Industrial',   surface: 'dirt',        sidewalk: 'dirt',         shoeType: 'leather boots',   streetDesc: 'unpaved roads' },
  steam_age: { period: 'Steam Age',        surface: 'cobblestone', sidewalk: 'granite_flag',  shoeType: 'leather shoes',   streetDesc: 'cobblestone streets' },
  early_auto:{ period: 'Early Automobile', surface: 'cobblestone', sidewalk: 'granite_flag',  shoeType: 'leather shoes',   streetDesc: 'cobblestone and early macadam streets' },
  auto_age:  { period: 'Automobile Age',   surface: 'asphalt',     sidewalk: 'concrete',      shoeType: 'leather shoes',   streetDesc: 'paved streets' },
  postwar:   { period: 'Postwar',          surface: 'asphalt',     sidewalk: 'concrete',      shoeType: 'hard-soled shoes', streetDesc: 'paved streets and highways' },
  modern:    { period: 'Modern',           surface: 'asphalt',     sidewalk: 'concrete',      shoeType: 'rubber-soled shoes', streetDesc: 'paved streets and highways' },
};

// ── Density multipliers ─────────────────────────────────────────

const DENSITY_COOLDOWN_SCALE = {
  dense_urban: 0.7,
  urban: 0.85,
  suburban: 1.2,
  rural: 2.0,
};

const DENSITY_GAIN_OFFSET = {
  dense_urban: 0,
  urban: -2,
  suburban: -4,
  rural: -6,
};

// ── Micro-event templates ───────────────────────────────────────

const EVENT_TEMPLATES = [
  // ─── Universal ────────────────────────────────────────────────
  {
    id: 'bird_song', group: 'universal',
    description: 'Songbirds calling — local species, natural birdsong',
    avgCooldownSec: 20, gainDb: -22,
    spatial: { azimuth: -30, elevation: 15, distance: 0.5, spread: 30 },
    motion: { type: 'static' },
    timeOfDay: { min: 0.2, max: 0.85 },
    activityRange: [0, 1], sourceCount: 2,
    climate: ['temperate', 'subtropical', 'tropical', 'subarctic'],
  },
  {
    id: 'dog_bark', group: 'universal',
    description: 'Dog barking — stray or domestic',
    avgCooldownSec: 45, gainDb: -22,
    spatial: { azimuth: 30, elevation: -5, distance: 0.5, spread: 10 },
    motion: { type: 'static' },
    timeOfDay: { min: 0.2, max: 0.9 },
    activityRange: [0.1, 1], sourceCount: 1,
  },
  {
    id: 'church_bell', group: 'universal',
    description: 'Church bell tolling — quarter-hour or hourly',
    avgCooldownSec: 180, gainDb: -16,
    spatial: { azimuth: -45, elevation: 30, distance: 0.8, spread: 60 },
    motion: { type: 'static' },
    timeOfDay: { min: 0, max: 1 },
    activityRange: [0, 1], sourceCount: 2,
    minDensity: 'suburban',
  },
  {
    id: 'wind_gust', group: 'universal',
    description: 'Wind gust — natural breeze through surroundings',
    avgCooldownSec: 30, gainDb: -18,
    spatial: { azimuth: 0, elevation: 5, distance: 0.3, spread: 90 },
    motion: { type: 'static' },
    timeOfDay: { min: 0, max: 1 },
    activityRange: [0, 1], sourceCount: 1,
  },
  {
    id: 'insect_chorus', group: 'universal',
    description: 'Insects chirping — crickets, cicadas, or similar',
    avgCooldownSec: 40, gainDb: -24,
    spatial: { azimuth: 60, elevation: -3, distance: 0.4, spread: 40 },
    motion: { type: 'static' },
    timeOfDay: { min: 0.7, max: 1 },
    secondaryWindow: { min: 0, max: 0.2 },
    activityRange: [0, 0.5], sourceCount: 1,
    climate: ['temperate', 'subtropical', 'tropical'],
  },
  {
    id: 'rooster_crow', group: 'universal',
    description: 'Rooster crowing at dawn',
    avgCooldownSec: 60, gainDb: -20,
    spatial: { azimuth: -60, elevation: 0, distance: 0.7, spread: 15 },
    motion: { type: 'static' },
    timeOfDay: { min: 0.2, max: 0.3 },
    activityRange: [0, 1], sourceCount: 1,
    maxDensity: 'suburban',
  },

  // ─── Pre-1830 ─────────────────────────────────────────────────
  {
    id: 'horse_walk', group: 'pre_1830',
    description: 'Horse walking on unpaved road — hooves on packed earth',
    avgCooldownSec: 25, gainDb: -16,
    spatial: { azimuth: 90, elevation: -5, distance: 0.5, spread: 20 },
    motion: { type: 'passby', azimuthStart: -60, azimuthEnd: 60, durationSec: 10, dopplerFactor: 0.1 },
    surface: 'dirt',
    timeOfDay: { min: 0.22, max: 0.88 },
    activityRange: [0.2, 1], sourceCount: 2,
  },
  {
    id: 'hand_tools', group: 'pre_1830',
    description: 'Hand tools working — hammering, sawing, chopping wood',
    avgCooldownSec: 40, gainDb: -20,
    spatial: { azimuth: -50, elevation: -3, distance: 0.5, spread: 15 },
    motion: { type: 'static' },
    timeOfDay: { min: 0.28, max: 0.72 },
    activityRange: [0.4, 1], sourceCount: 1,
  },
  {
    id: 'market_voices', group: 'pre_1830',
    description: 'Market crowd — voices bargaining, calling out wares',
    avgCooldownSec: 50, gainDb: -18,
    spatial: { azimuth: 70, elevation: -5, distance: 0.5, spread: 30 },
    motion: { type: 'static' },
    timeOfDay: { min: 0.3, max: 0.7 },
    activityRange: [0.3, 1], sourceCount: 1,
    minDensity: 'suburban',
  },
  {
    id: 'farm_animals', group: 'pre_1830',
    description: 'Farm animals — chickens clucking, goats bleating, cattle lowing',
    avgCooldownSec: 35, gainDb: -20,
    spatial: { azimuth: -70, elevation: -3, distance: 0.6, spread: 25 },
    motion: { type: 'static' },
    timeOfDay: { min: 0.22, max: 0.82 },
    activityRange: [0, 1], sourceCount: 1,
    maxDensity: 'suburban',
  },

  // ─── Steam Age ────────────────────────────────────────────────
  {
    id: 'horse_cart', group: 'steam_age',
    description: 'Horse and cart — iron-rimmed wheels on cobblestone, hooves clattering',
    avgCooldownSec: 15, gainDb: -14,
    spatial: { azimuth: 90, elevation: -5, distance: 0.5, spread: 20 },
    motion: { type: 'passby', azimuthStart: -60, azimuthEnd: 60, durationSec: 8, dopplerFactor: 0.2 },
    surface: 'cobblestone',
    timeOfDay: { min: 0.22, max: 0.88 },
    activityRange: [0.3, 1], sourceCount: 2,
  },
  {
    id: 'carriage', group: 'steam_age',
    description: 'Horse-drawn carriage — springs creaking, lighter and faster',
    avgCooldownSec: 30, gainDb: -16,
    spatial: { azimuth: 90, elevation: -5, distance: 0.4, spread: 15 },
    motion: { type: 'passby', azimuthStart: -45, azimuthEnd: 45, durationSec: 6, dopplerFactor: 0.2 },
    surface: 'cobblestone',
    timeOfDay: { min: 0.25, max: 0.9 },
    activityRange: [0.3, 1], sourceCount: 1,
    minDensity: 'suburban',
  },
  {
    id: 'steam_whistle', group: 'steam_age',
    description: 'Steam whistle — factory or locomotive, distant piercing tone',
    avgCooldownSec: 120, gainDb: -22,
    spatial: { azimuth: -40, elevation: 10, distance: 0.8, spread: 30 },
    motion: { type: 'static' },
    timeOfDay: { min: 0.25, max: 0.75 },
    activityRange: [0.2, 1], sourceCount: 1,
    minDensity: 'suburban',
  },
  {
    id: 'footsteps_street', group: 'universal',
    description: 'Footsteps on street surface — passerby walking',
    avgCooldownSec: 18, gainDb: -20,
    spatial: { azimuth: 50, elevation: -5, distance: 0.3, spread: 20 },
    motion: { type: 'passby', azimuthStart: -30, azimuthEnd: 30, durationSec: 6, dopplerFactor: 0.05 },
    surfaceFromEra: true, // surface + description set from ERA_META at selection time
    timeOfDay: { min: 0.25, max: 0.9 },
    activityRange: [0.3, 1], sourceCount: 2,
    minDensity: 'suburban',
  },
  {
    id: 'footsteps_sidewalk', group: 'universal',
    description: 'Footsteps on sidewalk — single person, close',
    avgCooldownSec: 25, gainDb: -22,
    spatial: { azimuth: -20, elevation: -5, distance: 0.2, spread: 10 },
    motion: { type: 'passby', azimuthStart: -20, azimuthEnd: 20, durationSec: 5, dopplerFactor: 0.03 },
    surfaceFromEra: true,
    timeOfDay: { min: 0.22, max: 0.92 },
    activityRange: [0.2, 1], sourceCount: 1,
    minDensity: 'suburban',
  },
  {
    id: 'gas_lamp_hiss', group: 'steam_age',
    description: 'Gas street lamp hissing — steady low flame sound nearby',
    avgCooldownSec: 60, gainDb: -26,
    spatial: { azimuth: 40, elevation: 2, distance: 0.2, spread: 10 },
    motion: { type: 'static' },
    timeOfDay: { min: 0.78, max: 1 },
    secondaryWindow: { min: 0, max: 0.2 },
    activityRange: [0, 1], sourceCount: 1,
    minDensity: 'suburban',
  },

  // ─── Early Auto ───────────────────────────────────────────────
  {
    id: 'early_automobile', group: 'early_auto',
    description: 'Early automobile — sputtering engine, hand-crank start, slow speed',
    avgCooldownSec: 40, gainDb: -14,
    spatial: { azimuth: 90, elevation: -5, distance: 0.5, spread: 20 },
    motion: { type: 'passby', azimuthStart: -60, azimuthEnd: 60, durationSec: 8, dopplerFactor: 0.15 },
    surface: 'cobblestone',
    timeOfDay: { min: 0.25, max: 0.88 },
    activityRange: [0.3, 1], sourceCount: 2,
    minDensity: 'suburban',
  },
  {
    id: 'trolley', group: 'early_auto',
    description: 'Electric streetcar or trolley — bell clanging, wheels on rails',
    avgCooldownSec: 60, gainDb: -12,
    spatial: { azimuth: 90, elevation: -5, distance: 0.5, spread: 25 },
    motion: { type: 'passby', azimuthStart: -90, azimuthEnd: 90, durationSec: 10, dopplerFactor: 0.3 },
    surface: 'iron_rail',
    timeOfDay: { min: 0.22, max: 0.95 },
    activityRange: [0.2, 1], sourceCount: 1,
    minDensity: 'urban',
  },
  {
    id: 'factory_whistle', group: 'early_auto',
    description: 'Factory whistle — shift change signal, loud and sustained',
    avgCooldownSec: 180, gainDb: -18,
    spatial: { azimuth: -60, elevation: 15, distance: 0.9, spread: 40 },
    motion: { type: 'static' },
    timeOfDay: { min: 0.25, max: 0.7 },
    activityRange: [0.3, 1], sourceCount: 1,
    minDensity: 'suburban',
  },

  // ─── Auto Age ─────────────────────────────────────────────────
  {
    id: 'car_passby', group: 'auto_age',
    description: 'Automobile passing by — engine rumble, tires on pavement',
    avgCooldownSec: 15, gainDb: -14,
    spatial: { azimuth: 90, elevation: -5, distance: 0.5, spread: 20 },
    motion: { type: 'passby', azimuthStart: -60, azimuthEnd: 60, durationSec: 5, dopplerFactor: 0.3 },
    surface: 'asphalt',
    timeOfDay: { min: 0.2, max: 0.95 },
    activityRange: [0.2, 1], sourceCount: 2,
    minDensity: 'suburban',
  },
  {
    id: 'car_horn', group: 'auto_age',
    description: 'Car horn honking — short impatient blast',
    avgCooldownSec: 30, gainDb: -18,
    spatial: { azimuth: 60, elevation: -5, distance: 0.5, spread: 15 },
    motion: { type: 'static' },
    timeOfDay: { min: 0.25, max: 0.9 },
    activityRange: [0.4, 1], sourceCount: 1,
    minDensity: 'urban',
  },
  {
    id: 'radio_music', group: 'auto_age',
    description: 'Distant radio music — era-appropriate popular song from open window',
    avgCooldownSec: 90, gainDb: -26,
    spatial: { azimuth: -40, elevation: 5, distance: 0.4, spread: 15 },
    motion: { type: 'static' },
    timeOfDay: { min: 0.3, max: 0.9 },
    activityRange: [0.2, 1], sourceCount: 1,
  },
  {
    id: 'siren', group: 'auto_age',
    description: 'Emergency siren — fire truck or ambulance, distant and approaching',
    avgCooldownSec: 180, gainDb: -20,
    spatial: { azimuth: -30, elevation: 0, distance: 0.8, spread: 30 },
    motion: { type: 'approach', azimuthStart: -90, azimuthEnd: -30, durationSec: 8, dopplerFactor: 0.4 },
    timeOfDay: { min: 0, max: 1 },
    activityRange: [0.2, 1], sourceCount: 1,
    minDensity: 'urban',
  },

  // ─── Postwar ──────────────────────────────────────────────────
  {
    id: 'car_traffic', group: 'postwar',
    description: 'Passing traffic — multiple cars, varied speeds',
    avgCooldownSec: 12, gainDb: -12,
    spatial: { azimuth: 90, elevation: -5, distance: 0.5, spread: 25 },
    motion: { type: 'passby', azimuthStart: -60, azimuthEnd: 60, durationSec: 5, dopplerFactor: 0.3 },
    surface: 'asphalt',
    timeOfDay: { min: 0.2, max: 0.95 },
    activityRange: [0.2, 1], sourceCount: 2,
  },
  {
    id: 'jet_overhead', group: 'postwar',
    description: 'Jet aircraft passing high overhead — distant rumble',
    avgCooldownSec: 300, gainDb: -24,
    spatial: { azimuth: 0, elevation: 70, distance: 1, spread: 60 },
    motion: { type: 'passby', azimuthStart: -90, azimuthEnd: 90, durationSec: 15, dopplerFactor: 0.1 },
    timeOfDay: { min: 0.25, max: 0.92 },
    activityRange: [0, 1], sourceCount: 1,
  },
  {
    id: 'lawn_mower', group: 'postwar',
    description: 'Lawn mower running — distant two-stroke engine drone',
    avgCooldownSec: 120, gainDb: -22,
    spatial: { azimuth: -70, elevation: -3, distance: 0.6, spread: 20 },
    motion: { type: 'static' },
    timeOfDay: { min: 0.3, max: 0.7 },
    activityRange: [0.3, 1], sourceCount: 1,
    maxDensity: 'suburban',
  },
  {
    id: 'screen_door', group: 'postwar',
    description: 'Screen door slamming — spring-loaded slam and rattle',
    avgCooldownSec: 60, gainDb: -20,
    spatial: { azimuth: -30, elevation: 0, distance: 0.3, spread: 10 },
    motion: { type: 'static' },
    timeOfDay: { min: 0.25, max: 0.85 },
    activityRange: [0.3, 1], sourceCount: 1,
    maxDensity: 'suburban',
  },

  // ─── Modern ───────────────────────────────────────────────────
  {
    id: 'hvac_hum', group: 'modern',
    description: 'HVAC unit humming — rooftop air conditioning compressor',
    avgCooldownSec: 90, gainDb: -26,
    spatial: { azimuth: 20, elevation: 20, distance: 0.4, spread: 30 },
    motion: { type: 'static' },
    timeOfDay: { min: 0, max: 1 },
    activityRange: [0, 1], sourceCount: 1,
    minDensity: 'suburban',
  },
  {
    id: 'construction', group: 'modern',
    description: 'Construction site — hammering, power tools, backup alarm',
    avgCooldownSec: 60, gainDb: -16,
    spatial: { azimuth: -50, elevation: 10, distance: 0.7, spread: 30 },
    motion: { type: 'static' },
    timeOfDay: { min: 0.3, max: 0.7 },
    activityRange: [0.4, 1], sourceCount: 1,
    minDensity: 'urban',
  },
];

// ── Density ordering for min/max checks ─────────────────────────

const DENSITY_ORDER = ['rural', 'suburban', 'urban', 'dense_urban'];

function densityIdx(d) {
  return DENSITY_ORDER.indexOf(d);
}

// ── Template selection ──────────────────────────────────────────

/**
 * Select event templates for a given era, density, and climate.
 * Era groups are cumulative with inheritance:
 * - steam_age inherits pre_1830
 * - early_auto inherits steam_age (at 1.5x cooldown)
 * - auto_age inherits early_auto (new only; old era events excluded)
 * - postwar / modern get their own + auto_age siren
 */
function selectTemplates(eraBracket, density, climate) {
  const dIdx = densityIdx(density);

  // Determine which era groups contribute events
  let groups = ['universal'];
  let inheritMultiplier = {};

  switch (eraBracket) {
    case 'pre_1830':
      groups.push('pre_1830');
      break;
    case 'steam_age':
      groups.push('pre_1830', 'steam_age');
      inheritMultiplier.pre_1830 = 1.5;
      break;
    case 'early_auto':
      groups.push('steam_age', 'early_auto');
      inheritMultiplier.steam_age = 1.5;
      break;
    case 'auto_age':
      groups.push('auto_age');
      break;
    case 'postwar':
      groups.push('postwar', 'auto_age');
      inheritMultiplier.auto_age = 1.3;
      break;
    case 'modern':
      groups.push('modern', 'postwar');
      inheritMultiplier.postwar = 1.2;
      break;
  }

  const groupSet = new Set(groups);

  return EVENT_TEMPLATES
    .filter(t => {
      // Era group filter
      if (!groupSet.has(t.group)) return false;

      // Climate filter
      if (t.climate && !t.climate.includes(climate.zone)) return false;

      // Density min filter
      if (t.minDensity && dIdx < densityIdx(t.minDensity)) return false;

      // Density max filter
      if (t.maxDensity && dIdx > densityIdx(t.maxDensity)) return false;

      return true;
    })
    .map(t => {
      // Apply cooldown scaling for density and era inheritance
      const densityScale = DENSITY_COOLDOWN_SCALE[density] || 1;
      const eraScale = inheritMultiplier[t.group] || 1;
      const mapped = {
        ...t,
        avgCooldownSec: Math.round(t.avgCooldownSec * densityScale * eraScale),
        gainDb: t.gainDb + (DENSITY_GAIN_OFFSET[density] || 0),
      };
      // Resolve surface from era metadata for footstep templates
      if (t.surfaceFromEra) {
        const meta = ERA_META[eraBracket];
        const isStreet = t.id.includes('street');
        mapped.surface = isStreet ? meta.surface : meta.sidewalk;
        const surfaceLabel = (mapped.surface || 'ground').replace(/_/g, ' ');
        mapped.description = isStreet
          ? `${meta.shoeType} on ${surfaceLabel} — passerby crossing street`
          : `${meta.shoeType} on ${surfaceLabel} — single person on sidewalk`;
        delete mapped.surfaceFromEra;
      }
      return mapped;
    });
}

// ── Profile assembly ────────────────────────────────────────────

/**
 * Build a null-url source entry for asset generation
 */
function nullSource(label, spatial) {
  return { url: null, label, ...(spatial ? { spatial } : {}) };
}

/**
 * Build directional bed descriptions based on density
 */
function directionalDescs(density, eraMeta) {
  const base = {
    dense_urban: {
      N: `Side street — muted activity, ${eraMeta.streetDesc}`,
      E: `Main avenue — primary traffic and pedestrians`,
      S: `Cross street — moderate traffic, voices`,
      W: `Alley or service lane — deliveries, echoes`,
    },
    urban: {
      N: `Residential street — occasional passersby`,
      E: `Commercial street — shops and traffic`,
      S: `Cross street — moderate activity`,
      W: `Quiet side — courtyards, distant sounds`,
    },
    suburban: {
      N: `Neighborhood — houses, trees, occasional traffic`,
      E: `Main road — passing vehicles`,
      S: `Residential — children, dogs, lawn activity`,
      W: `Backyard direction — nature, wind in trees`,
    },
    rural: {
      N: `Open field — wind, distant farm sounds`,
      E: `Road — occasional vehicle or cart passing`,
      S: `Farmstead — animals, activity`,
      W: `Woods or open land — nature sounds`,
    },
  };
  return base[density] || base.suburban;
}

/**
 * Generate a complete v2 audio profile
 *
 * @param {Object} opts
 * @param {string} opts.location - Location name
 * @param {number} opts.year - Target year
 * @param {number} opts.population - City population
 * @param {string} opts.countryCode - ISO country code
 * @param {number} opts.lat - Latitude
 * @param {number} opts.lon - Longitude
 * @param {Object} [opts.environmentProfile] - Environment Profile for location-specific enrichment
 * @returns {Object} v2 audio profile JSON
 */
/**
 * Build a deterministic audio profile ID from location and year.
 * @param {string} location - Location name
 * @param {number} year - Target year
 * @returns {string} Profile ID (e.g. "gen_manhattan_ny_1884")
 */
export function buildAudioProfileId(location, year) {
  const slug = location
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return `gen_${slug}_${year}`;
}

export function generateProfile({ location, year, month = null, population = 0, countryCode, lat, lon, environmentProfile }) {
  const climate = classifyClimate(lat);
  const density = classifyDensity(population);
  const eraBracket = getEraBracket(year);
  const eraMeta = ERA_META[eraBracket];

  const id = buildAudioProfileId(location, year);

  // Select micro-event templates
  const templates = selectTemplates(eraBracket, density, climate);

  // Enrich with location-specific data from Environment Profile
  const locationData = environmentProfile
    ? extractLocationData(environmentProfile, density)
    : null;
  if (locationData) {
    enrichTemplates(templates, locationData, { month, hemisphere: climate.hemisphere });
  }

  // Build prompt context for elevenlabs-fetch
  const promptContext = buildPromptContext(location, year, eraMeta, density, climate, locationData);

  // Listener position based on density
  const listenerConfig = {
    dense_urban: { position: 'street level', elevation: 1.7, facing: 'E', enclosure: 'street' },
    urban: { position: 'ground floor window', elevation: 2.5, facing: 'E', enclosure: 'open_window' },
    suburban: { position: 'front porch', elevation: 1.5, facing: 'S', enclosure: 'porch' },
    rural: { position: 'outdoors', elevation: 1.7, facing: 'S', enclosure: 'street' },
  };

  // Build micro-events from templates — ensure result is always a plain Array
  // (avoids object-with-numeric-keys if templates is ever array-like but not a true Array)
  const microEvents = Array.from(templates, t => {
    const sources = [];
    for (let i = 0; i < (t.sourceCount || 1); i++) {
      sources.push(nullSource(`${t.id}-${i + 1}`));
    }
    const event = {
      id: t.id,
      description: t.description,
      sources,
      avgCooldownSec: t.avgCooldownSec,
      gainDb: t.gainDb,
      spatial: { ...t.spatial },
      motion: { ...t.motion },
      timeOfDay: { ...t.timeOfDay },
      activityRange: [...t.activityRange],
    };
    if (t.surface) event.surface = t.surface;
    if (t.secondaryWindow) event.secondaryWindow = { ...t.secondaryWindow };
    if (t.diurnalWeights) event.diurnalWeights = { ...t.diurnalWeights };
    return event;
  });

  // Directional bed descriptions
  const dirDescs = directionalDescs(density, eraMeta);

  // Mix levels scaled to density
  const mixGains = {
    dense_urban: { master: -4, base: 0, directional: -2, micro: -2, weather: -1, reverb: 0.12 },
    urban: { master: -5, base: -1, directional: -3, micro: -2, weather: -1, reverb: 0.10 },
    suburban: { master: -6, base: -2, directional: -4, micro: -3, weather: 0, reverb: 0.06 },
    rural: { master: -8, base: -3, directional: -6, micro: -4, weather: 0, reverb: 0.03 },
  };
  const mix = mixGains[density] || mixGains.suburban;

  const profile = {
    schemaVersion: 2,
    id,
    name: `${location} — ${year}`,
    description: promptContext,
    generated: true,
    era: {
      year,
      period: eraMeta.period,
      confidence: 0.5,
    },
    listener: listenerConfig[density] || listenerConfig.suburban,
    spatialConfig: {
      order: 'HOA3',
      irProfile: {
        id: `${id}_ir`,
        file: `ir-${id}.wav`,
        fallback: 'synthetic',
      },
    },
    assetGeneration: {
      status: 'pending',
      generator: 'elevenlabs',
      promptContext,
    },
    beds: {
      base: {
        sources: [
          nullSource('ambient-1'),
          nullSource('ambient-2'),
          nullSource('ambient-3'),
        ],
        crossfadeSec: 14,
        gainDb: -8 + (DENSITY_GAIN_OFFSET[density] || 0),
      },
      directional: {
        N: {
          sources: [nullSource('dir-north', { azimuth: 0, elevation: -5, distance: 0.6, spread: 40 })],
          gainDb: -16 + (DENSITY_GAIN_OFFSET[density] || 0),
          description: dirDescs.N,
        },
        E: {
          sources: [nullSource('dir-east', { azimuth: 90, elevation: -5, distance: 0.4, spread: 60 })],
          gainDb: -10 + (DENSITY_GAIN_OFFSET[density] || 0),
          description: dirDescs.E,
        },
        S: {
          sources: [nullSource('dir-south', { azimuth: 180, elevation: -5, distance: 0.5, spread: 50 })],
          gainDb: -14 + (DENSITY_GAIN_OFFSET[density] || 0),
          description: dirDescs.S,
        },
        W: {
          sources: [nullSource('dir-west', { azimuth: -90, elevation: -5, distance: 0.5, spread: 30 })],
          gainDb: -18 + (DENSITY_GAIN_OFFSET[density] || 0),
          description: dirDescs.W,
        },
      },
    },
    weather: {
      wind: {
        sources: [
          nullSource('wind-1', { azimuth: 90, elevation: 0, distance: 0.3, spread: 90 }),
          nullSource('wind-2', { azimuth: -45, elevation: 5, distance: 0.2, spread: 60 }),
        ],
        gustFilterRange: [250, 2200],
        gustSweepPeriod: [7, 18],
      },
      rain: {
        sources: [
          nullSource('rain-1', { azimuth: 90, elevation: -10, distance: 0.4, spread: 120 }),
          nullSource('rain-2', { azimuth: -30, elevation: 5, distance: 0.3, spread: 60 }),
        ],
      },
      thunder: {
        sources: [
          nullSource('thunder-1', { azimuth: 0, elevation: 60, distance: 0.8, spread: 180 }),
          nullSource('thunder-2', { azimuth: 30, elevation: 70, distance: 0.7, spread: 120 }),
        ],
        cooldownRange: [50, 150],
      },
    },
    microEvents,
    mix: {
      masterGainDb: mix.master,
      layerGains: {
        baseBed: mix.base,
        directionalBeds: mix.directional,
        microEvents: mix.micro,
        weather: mix.weather,
        occlusion: 0,
      },
      reverbSend: mix.reverb,
    },
    scheduling: {
      maxConcurrentEvents: density === 'dense_urban' ? 4 : density === 'urban' ? 3 : 2,
      globalCooldownSec: 1.5,
      densityMultipliers: {
        subtle: 0.5,
        present: 1,
        demo: 2.5,
      },
    },
  };

  // Add snow sources for climates that get snow
  if (['arctic', 'subarctic', 'temperate'].includes(climate.zone)) {
    profile.weather.snow = {
      sources: [
        nullSource('snow-1', { azimuth: 0, elevation: 10, distance: 0.3, spread: 120 }),
      ],
    };
  }

  return profile;
}

/**
 * Build the promptContext string used by elevenlabs-fetch for bed generation
 */
function buildPromptContext(location, year, eraMeta, density, climate, locationData) {
  const densityDesc = {
    dense_urban: 'Dense urban',
    urban: 'Urban',
    suburban: 'Suburban',
    rural: 'Rural',
  };

  const climateSounds = {
    arctic: 'wind across tundra, distant ice cracking',
    subarctic: 'boreal forest wind, crunching snow, distant wildlife',
    temperate: 'seasonal birds, wind through trees',
    subtropical: 'warm breeze, cicadas, diverse birdlife',
    tropical: 'tropical birds, warm rain, insects, lush vegetation rustling',
  };

  const parts = [
    `${densityDesc[density] || 'Suburban'} soundscape of ${location} in ${year}.`,
    `${eraMeta.period} era with ${eraMeta.streetDesc}.`,
  ];

  // Location-specific species info
  if (locationData?.birdNames?.length) {
    parts.push(`Birds: ${locationData.birdNames.slice(0, 4).join(', ')}.`);
  } else {
    parts.push(`Climate sounds: ${climateSounds[climate.zone] || 'seasonal ambience'}.`);
  }

  // Location-specific vendors
  if (locationData?.vendors?.length && (density === 'dense_urban' || density === 'urban')) {
    parts.push(`Street vendors: ${locationData.vendors.slice(0, 3).join(', ')}.`);
  } else if (density === 'dense_urban' || density === 'urban') {
    parts.push('Pedestrians, activity, and nearby commerce.');
  }

  return parts.join(' ');
}

// ── Location-specific enrichment ──────────────────────────────────

/**
 * Compute density-weighted average of diurnal or seasonal weights across species.
 * @param {object[]} species - Array of species with .density and .[field] weights
 * @param {'diurnal'|'seasonal'} field - Which weight object to aggregate
 * @returns {object} Averaged weights (e.g. { dawn: 0.85, day: 0.65, dusk: 0.75, night: 0.05 })
 */
function aggregateWeights(species, field) {
  const keys = field === 'diurnal'
    ? ['dawn', 'day', 'dusk', 'night']
    : ['spring', 'summer', 'fall', 'winter'];

  let totalDensity = 0;
  const sums = {};
  for (const k of keys) sums[k] = 0;

  for (const s of species) {
    const w = s[field];
    if (!w) continue;
    const d = s.density || 0.5;
    totalDensity += d;
    for (const k of keys) sums[k] += (w[k] || 0) * d;
  }

  if (totalDensity === 0) return null;

  const result = {};
  for (const k of keys) result[k] = Math.round((sums[k] / totalDensity) * 100) / 100;
  return result;
}

/**
 * Get the current season from month and hemisphere.
 * @param {number} month - 1-12
 * @param {'north'|'south'} hemisphere
 * @returns {'spring'|'summer'|'fall'|'winter'}
 */
export function getSeason(month, hemisphere = 'north') {
  // Northern hemisphere seasons
  const seasons = {
    12: 'winter', 1: 'winter', 2: 'winter',
    3: 'spring', 4: 'spring', 5: 'spring',
    6: 'summer', 7: 'summer', 8: 'summer',
    9: 'fall', 10: 'fall', 11: 'fall'
  };
  const season = seasons[month] || 'summer';
  // Flip for southern hemisphere
  if (hemisphere === 'south') {
    const flip = { spring: 'fall', summer: 'winter', fall: 'spring', winter: 'summer' };
    return flip[season];
  }
  return season;
}

/**
 * Extract location-specific data from an Environment Profile for audio enrichment.
 */
function extractLocationData(profile, density) {
  const result = {};

  // Species from ecology layer
  const ecology = profile.layers?.ecology?.data;
  if (ecology?.species) {
    const birds = ecology.species
      .filter(s => s.type === 'bird')
      .sort((a, b) => (b.density || 0) - (a.density || 0));
    if (birds.length) {
      result.birdNames = birds.map(b => b.commonName);
      // Aggregate diurnal/seasonal weights across bird species (density-weighted average)
      result.birdDiurnal = aggregateWeights(birds, 'diurnal');
      result.birdSeasonal = aggregateWeights(birds, 'seasonal');
    }

    const insects = ecology.species.filter(s => s.type === 'insect');
    if (insects.length) {
      result.insectNames = insects.map(i => i.commonName);
      result.insectDiurnal = aggregateWeights(insects, 'diurnal');
      result.insectSeasonal = aggregateWeights(insects, 'seasonal');
    }
  }

  // Vendors from culture layer
  const culture = profile.layers?.culture?.data;
  if (culture?.commerce?.streetVendors) {
    result.vendors = culture.commerce.streetVendors;
  }

  // Infrastructure from infrastructure layer (for transport-specific sounds)
  const infra = profile.layers?.infrastructure?.data;
  if (infra?.transport) {
    result.transport = infra.transport;
  }

  // Road surfaces from materials layer (for surface-linked footstep audio)
  const materials = profile.layers?.materials?.data;
  if (materials?.roads) {
    result.roads = materials.roads;
    result.sidewalks = materials.sidewalks || null;
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Apply ecology-derived enrichment to a single event template.
 * Attaches diurnal weights, modulates cooldown by seasonal weight, and updates description.
 * @param {object} t - Event template (mutated in place)
 * @param {{ names?: string[], diurnal?: object, seasonal?: object, descPrefix: string, nameJoin: (names: string[]) => string }} eco
 * @param {string|null} season - Current season or null
 */
function applyEcologyWeights(t, eco, season) {
  if (eco.names?.length) {
    t.description = `${eco.descPrefix} — ${eco.nameJoin(eco.names)}`;
  }
  if (eco.diurnal) {
    t.diurnalWeights = eco.diurnal;
  }
  if (season && eco.seasonal) {
    const sw = eco.seasonal[season] ?? 0.5;
    if (sw > 0) {
      t.avgCooldownSec = Math.round(t.avgCooldownSec / sw);
    } else {
      t.avgCooldownSec = 9999; // effectively suppress
    }
  }
}

/**
 * Enrich generic event templates with location-specific descriptions,
 * diurnal weights, and seasonal cooldown modulation.
 * Mutates templates in place.
 *
 * @param {object[]} templates - Event templates to enrich
 * @param {object} locationData - From extractLocationData()
 * @param {{ month?: number, hemisphere?: string }} [opts]
 */
function enrichTemplates(templates, locationData, opts = {}) {
  const { month, hemisphere = 'north' } = opts;
  const season = month ? getSeason(month, hemisphere) : null;

  for (const t of templates) {
    switch (t.id) {
      case 'bird_song':
        applyEcologyWeights(t, {
          names: locationData.birdNames,
          diurnal: locationData.birdDiurnal,
          seasonal: locationData.birdSeasonal,
          descPrefix: 'Birdsong',
          nameJoin: names => names.slice(0, 3).join(', ')
        }, season);
        break;

      case 'insect_chorus':
        applyEcologyWeights(t, {
          names: locationData.insectNames,
          diurnal: locationData.insectDiurnal,
          seasonal: locationData.insectSeasonal,
          descPrefix: 'Insect chorus',
          nameJoin: names => names.join(' and ')
        }, season);
        break;

      case 'footsteps_street':
      case 'footsteps_sidewalk':
      case 'horse_cart':
      case 'carriage':
        // Override surface from materials layer when available
        if (locationData.roads) {
          const isStreet = t.id.includes('street') || t.id === 'horse_cart' || t.id === 'carriage';
          const surface = isStreet
            ? (locationData.roads.primary || locationData.roads.secondary || t.surface)
            : (locationData.sidewalks || t.surface);
          if (surface && surface !== t.surface) {
            t.surface = surface;
            const surfaceLabel = surface.replace(/_/g, ' ');
            // Update description with specific surface
            if (t.id.startsWith('footsteps_')) {
              const shoe = t.description.split(' on ')[0];
              const action = t.id === 'footsteps_street' ? 'passerby crossing street' : 'single person on sidewalk';
              t.description = `${shoe} on ${surfaceLabel} — ${action}`;
            } else if (t.id === 'horse_cart') {
              t.description = `Horse and cart — iron-rimmed wheels on ${surfaceLabel}, hooves clattering`;
            } else if (t.id === 'carriage') {
              t.description = `Horse-drawn carriage on ${surfaceLabel} — springs creaking, lighter and faster`;
            }
          }
        }
        break;
      case 'market_voices':
        if (locationData.vendors?.length) {
          const sample = locationData.vendors.slice(0, 2).join(', ');
          t.description = `Street vendor calls — ${sample}`;
        }
        break;
    }
  }
}
