/**
 * Cultural Research Agent (Phase 7.5)
 *
 * Given a location + year, researches cultural context and music landscape.
 * Produces BOTH the `culture` layer AND the `music` layer for an Environment Profile.
 *
 * Does NOT fetch live data — it synthesizes from built-in era databases,
 * population density heuristics, and regional patterns.
 */

import { createLayer, createSource } from '../environmentProfile.js';
import { searchPages } from '../chroniclingAmerica.js';

// ---------------------------------------------------------------------------
// Era bracket resolver
// ---------------------------------------------------------------------------

const ERA_BRACKETS = [
  { key: 'modern',        minYear: 1980 },
  { key: 'counterculture', minYear: 1965 },
  { key: 'postwar',       minYear: 1940 },
  { key: 'jazz_age',      minYear: 1920 },
  { key: 'progressive',   minYear: 1900 },
  { key: 'gilded_age',    minYear: 1865 },
  { key: 'antebellum',    minYear: 1800 },
  { key: 'colonial',      minYear: 0 }
];

/**
 * Resolve a year to an era key.
 * @param {number} year
 * @returns {string} Era key (e.g. 'gilded_age')
 */
export function resolveEraKey(year) {
  for (const bracket of ERA_BRACKETS) {
    if (year >= bracket.minYear) return bracket.key;
  }
  return 'colonial';
}

// ---------------------------------------------------------------------------
// Music era resolver
// ---------------------------------------------------------------------------

const MUSIC_ERA_BOUNDARIES = [
  { era: 'streaming',       minYear: 1990 },
  { era: 'broadcast_tv',    minYear: 1950 },
  { era: 'broadcast_radio', minYear: 1920 },
  { era: 'early_recording', minYear: 1877 },
  { era: 'pre_recording',   minYear: 0 }
];

/**
 * Determine the music era for a given year.
 * @param {number} year
 * @returns {string} One of: 'pre_recording', 'early_recording', 'broadcast_radio', 'broadcast_tv', 'streaming'
 */
export function getMusicEra(year) {
  for (const boundary of MUSIC_ERA_BOUNDARIES) {
    if (year >= boundary.minYear) return boundary.era;
  }
  return 'pre_recording';
}

// ---------------------------------------------------------------------------
// ERA_CULTURE_DB
// ---------------------------------------------------------------------------

export const ERA_CULTURE_DB = {
  colonial: {
    label: 'Colonial Era',
    yearRange: [null, 1799],
    languages: {
      US: { primary: 'English', secondary: ['Dutch', 'French', 'Spanish', 'German'], signage: 'English' },
      GB: { primary: 'English', secondary: ['Welsh', 'Gaelic'], signage: 'English' },
      FR: { primary: 'French', secondary: ['Occitan', 'Breton'], signage: 'French' },
      _default: { primary: 'English', secondary: [], signage: 'English' }
    },
    commerce: {
      currency: { US: 'GBP/colonial_scrip', GB: 'GBP', FR: 'livre_tournois', _default: 'local_currency' },
      streetVendors: ['water carrier', 'milk maid', 'peddler', 'chimney sweep'],
      markets: ['town_market', 'trading_post'],
      vendorDensityBase: 2
    },
    dailyLife: {
      workday: { start: '06:00', end: '18:00' },
      peakActivity: ['06:00-08:00', '12:00-13:00', '17:00-18:00'],
      sabbath: 'Sunday'
    },
    newspapers: [],
    technology: ['hand_tools', 'sail_power', 'horse_transport', 'candle_light', 'oil_lamp']
  },

  antebellum: {
    label: 'Antebellum Era',
    yearRange: [1800, 1860],
    languages: {
      US: { primary: 'English', secondary: ['German', 'French', 'Irish English', 'Spanish'], signage: 'English' },
      GB: { primary: 'English', secondary: ['Welsh', 'Gaelic', 'Irish English'], signage: 'English' },
      FR: { primary: 'French', secondary: ['Occitan', 'Breton', 'German'], signage: 'French' },
      _default: { primary: 'English', secondary: [], signage: 'English' }
    },
    commerce: {
      currency: { US: 'USD', GB: 'GBP', FR: 'franc', _default: 'local_currency' },
      streetVendors: ['water carrier', 'milk man', 'peddler', 'chimney sweep', 'rag picker', 'hot corn girl', 'oyster seller'],
      markets: ['public_market', 'general_store'],
      vendorDensityBase: 4
    },
    dailyLife: {
      workday: { start: '06:00', end: '18:00' },
      peakActivity: ['06:00-08:00', '12:00-13:00', '17:00-18:00'],
      sabbath: 'Sunday'
    },
    newspapers: ['penny_press'],
    technology: ['steam_power', 'telegraph', 'gas_lighting', 'horse_transport', 'railroad']
  },

  gilded_age: {
    label: 'Gilded Age',
    yearRange: [1865, 1899],
    languages: {
      US: { primary: 'English', secondary: ['German', 'Italian', 'Yiddish', 'Irish English', 'Polish', 'Chinese'], signage: 'English' },
      GB: { primary: 'English', secondary: ['Welsh', 'Gaelic', 'Yiddish'], signage: 'English' },
      FR: { primary: 'French', secondary: ['Italian', 'Yiddish', 'German'], signage: 'French' },
      _default: { primary: 'English', secondary: ['German', 'Italian'], signage: 'English' }
    },
    commerce: {
      currency: { US: 'USD', GB: 'GBP', FR: 'franc', _default: 'local_currency' },
      streetVendors: [
        'oyster seller', 'hot corn girl', 'ice man', 'rag picker',
        'organ grinder', 'newsboy', 'boot black', 'flower girl',
        'milk man', 'knife grinder', 'pushcart vendor', 'pretzel seller'
      ],
      markets: ['fish_market', 'produce_market', 'meat_market', 'department_store'],
      vendorDensityBase: 8
    },
    dailyLife: {
      workday: { start: '07:00', end: '18:00' },
      peakActivity: ['07:00-09:00', '12:00-13:00', '17:00-18:00'],
      sabbath: 'Sunday'
    },
    newspapers: ['major_daily', 'evening_edition', 'penny_press', 'foreign_language_press'],
    technology: ['gas_lighting', 'horse_transport', 'elevated_railway', 'telegraph', 'early_telephone', 'early_electric_light']
  },

  progressive: {
    label: 'Progressive Era',
    yearRange: [1900, 1919],
    languages: {
      US: { primary: 'English', secondary: ['Italian', 'Yiddish', 'Polish', 'German', 'Chinese', 'Russian'], signage: 'English' },
      GB: { primary: 'English', secondary: ['Welsh', 'Gaelic', 'Yiddish'], signage: 'English' },
      FR: { primary: 'French', secondary: ['Italian', 'Arabic', 'Yiddish'], signage: 'French' },
      _default: { primary: 'English', secondary: ['Italian', 'German'], signage: 'English' }
    },
    commerce: {
      currency: { US: 'USD', GB: 'GBP', FR: 'franc', _default: 'local_currency' },
      streetVendors: [
        'newsboy', 'pushcart vendor', 'ice man', 'rag picker',
        'flower girl', 'boot black', 'hot dog vendor', 'pretzel seller',
        'knife grinder', 'organ grinder'
      ],
      markets: ['produce_market', 'department_store', 'five_and_dime'],
      vendorDensityBase: 10
    },
    dailyLife: {
      workday: { start: '07:00', end: '17:00' },
      peakActivity: ['07:00-09:00', '12:00-13:00', '17:00-18:00'],
      sabbath: 'Sunday'
    },
    newspapers: ['major_daily', 'evening_edition', 'foreign_language_press', 'tabloid'],
    technology: ['electric_light', 'telephone', 'early_automobile', 'streetcar', 'subway', 'cinema']
  },

  jazz_age: {
    label: 'Jazz Age',
    yearRange: [1920, 1939],
    languages: {
      US: { primary: 'English', secondary: ['Italian', 'Yiddish', 'Polish', 'Spanish', 'Chinese'], signage: 'English' },
      GB: { primary: 'English', secondary: ['Welsh', 'Gaelic'], signage: 'English' },
      FR: { primary: 'French', secondary: ['Italian', 'Arabic', 'Polish'], signage: 'French' },
      _default: { primary: 'English', secondary: ['Italian'], signage: 'English' }
    },
    commerce: {
      currency: { US: 'USD', GB: 'GBP', FR: 'franc', _default: 'local_currency' },
      streetVendors: [
        'newsboy', 'hot dog vendor', 'ice cream vendor', 'pushcart vendor',
        'flower seller', 'shoe shine', 'pretzel vendor'
      ],
      markets: ['department_store', 'five_and_dime', 'grocery_chain', 'automat'],
      vendorDensityBase: 7
    },
    dailyLife: {
      workday: { start: '08:00', end: '17:00' },
      peakActivity: ['07:30-09:00', '12:00-13:00', '17:00-18:30'],
      sabbath: 'Sunday'
    },
    newspapers: ['major_daily', 'evening_edition', 'tabloid', 'radio_listings'],
    technology: ['automobile', 'radio', 'electric_light', 'telephone', 'cinema', 'early_air_travel']
  },

  postwar: {
    label: 'Postwar Era',
    yearRange: [1940, 1964],
    languages: {
      US: { primary: 'English', secondary: ['Spanish', 'Italian', 'Yiddish', 'Chinese', 'Japanese'], signage: 'English' },
      GB: { primary: 'English', secondary: ['Welsh', 'Gaelic', 'Caribbean English'], signage: 'English' },
      FR: { primary: 'French', secondary: ['Arabic', 'Italian', 'Portuguese'], signage: 'French' },
      _default: { primary: 'English', secondary: ['Spanish'], signage: 'English' }
    },
    commerce: {
      currency: { US: 'USD', GB: 'GBP', FR: 'franc', _default: 'local_currency' },
      streetVendors: [
        'ice cream vendor', 'hot dog vendor', 'newspaper vendor',
        'shoe shine', 'flower seller'
      ],
      markets: ['department_store', 'supermarket', 'shopping_center', 'drive_in'],
      vendorDensityBase: 5
    },
    dailyLife: {
      workday: { start: '08:00', end: '17:00' },
      peakActivity: ['07:30-09:00', '12:00-13:00', '17:00-18:00'],
      sabbath: 'Sunday'
    },
    newspapers: ['major_daily', 'evening_edition', 'tabloid', 'tv_listings'],
    technology: ['automobile', 'television', 'telephone', 'air_conditioning', 'jet_aircraft', 'suburban_development']
  },

  counterculture: {
    label: 'Counterculture Era',
    yearRange: [1965, 1979],
    languages: {
      US: { primary: 'English', secondary: ['Spanish', 'Chinese', 'Vietnamese', 'Korean', 'Tagalog'], signage: 'English' },
      GB: { primary: 'English', secondary: ['Caribbean English', 'Urdu', 'Hindi', 'Cantonese'], signage: 'English' },
      FR: { primary: 'French', secondary: ['Arabic', 'Portuguese', 'Vietnamese'], signage: 'French' },
      _default: { primary: 'English', secondary: ['Spanish'], signage: 'English' }
    },
    commerce: {
      currency: { US: 'USD', GB: 'GBP', FR: 'franc', _default: 'local_currency' },
      streetVendors: [
        'hot dog vendor', 'pretzel vendor', 'ice cream truck',
        'newspaper vendor', 'flower seller'
      ],
      markets: ['supermarket', 'shopping_mall', 'convenience_store', 'head_shop'],
      vendorDensityBase: 4
    },
    dailyLife: {
      workday: { start: '08:00', end: '17:00' },
      peakActivity: ['07:30-09:00', '12:00-13:00', '17:00-18:30'],
      sabbath: 'Sunday'
    },
    newspapers: ['major_daily', 'evening_edition', 'alternative_weekly', 'underground_press'],
    technology: ['automobile', 'television', 'fm_radio', 'telephone', 'air_conditioning', 'early_computer']
  },

  modern: {
    label: 'Modern Era',
    yearRange: [1980, null],
    languages: {
      US: { primary: 'English', secondary: ['Spanish', 'Chinese', 'Vietnamese', 'Korean', 'Tagalog', 'Arabic'], signage: 'English' },
      GB: { primary: 'English', secondary: ['Urdu', 'Hindi', 'Polish', 'Arabic', 'Bengali'], signage: 'English' },
      FR: { primary: 'French', secondary: ['Arabic', 'Portuguese', 'Turkish', 'Chinese'], signage: 'French' },
      _default: { primary: 'English', secondary: ['Spanish'], signage: 'English' }
    },
    commerce: {
      currency: { US: 'USD', GB: 'GBP', FR: 'EUR', _default: 'local_currency' },
      streetVendors: [
        'hot dog vendor', 'food truck', 'ice cream truck',
        'street performer', 'flower seller'
      ],
      markets: ['supermarket', 'shopping_mall', 'big_box_store', 'convenience_store', 'online_marketplace'],
      vendorDensityBase: 3
    },
    dailyLife: {
      workday: { start: '08:00', end: '17:00' },
      peakActivity: ['07:30-09:00', '12:00-13:00', '17:00-18:30'],
      sabbath: 'Sunday'
    },
    newspapers: ['major_daily', 'tabloid', 'free_daily', 'online_news'],
    technology: ['personal_computer', 'internet', 'cell_phone', 'satellite_tv', 'gps', 'streaming']
  }
};

// ---------------------------------------------------------------------------
// MUSIC_ERA_DB
// ---------------------------------------------------------------------------

export const MUSIC_ERA_DB = {
  pre_recording: {
    label: 'Pre-Recording Era',
    yearRange: [null, 1876],
    formats: ['barrel_organ', 'brass_band', 'parlor_piano', 'street_musician', 'church_organ', 'music_box'],
    genres: {
      popular: 0.5,
      classical: 0.2,
      folk: 0.2,
      sacred: 0.1
    },
    notableSongs: [
      'Swanee River (Old Folks at Home)',
      'Camptown Races',
      'Beautiful Dreamer',
      'Silver Threads Among the Gold',
      'When the Robins Nest Again'
    ],
    performanceVenues: ['street_corner', 'church', 'beer_garden', 'theater', 'parlor', 'concert_hall']
  },

  early_recording: {
    label: 'Early Recording Era',
    yearRange: [1877, 1919],
    formats: ['phonograph', 'cylinder_record', 'player_piano', 'brass_band', 'parlor_piano', 'street_musician', 'music_box'],
    genres: {
      popular: 0.4,
      ragtime: 0.2,
      classical: 0.15,
      folk: 0.15,
      sacred: 0.1
    },
    notableSongs: [
      'After the Ball',
      'Maple Leaf Rag',
      'Take Me Out to the Ball Game',
      'Alexander\'s Ragtime Band',
      'Over There'
    ],
    performanceVenues: ['street_corner', 'church', 'beer_garden', 'theater', 'parlor', 'concert_hall', 'dance_hall', 'vaudeville']
  },

  broadcast_radio: {
    label: 'Broadcast Radio Era',
    yearRange: [1920, 1949],
    formats: ['radio', '78rpm_record', 'jukebox', 'big_band_live', 'player_piano'],
    genres: {
      jazz: 0.3,
      popular: 0.3,
      blues: 0.1,
      country: 0.1,
      classical: 0.1,
      swing: 0.1
    },
    notableSongs: [
      'Rhapsody in Blue',
      'Stardust',
      'In the Mood',
      'Chattanooga Choo Choo',
      'White Christmas'
    ],
    performanceVenues: ['radio_station', 'dance_hall', 'nightclub', 'theater', 'concert_hall', 'church', 'juke_joint', 'ballroom']
  },

  broadcast_tv: {
    label: 'Broadcast TV Era',
    yearRange: [1950, 1989],
    formats: ['television', 'radio', 'vinyl_record', 'cassette_tape', 'jukebox', '8_track'],
    genres: {
      rock: 0.3,
      popular: 0.2,
      soul: 0.15,
      country: 0.1,
      jazz: 0.1,
      disco: 0.1,
      folk: 0.05
    },
    notableSongs: [
      'Rock Around the Clock',
      'Hound Dog',
      'I Want to Hold Your Hand',
      'Respect',
      'Stayin\' Alive'
    ],
    performanceVenues: ['radio_station', 'tv_studio', 'concert_venue', 'nightclub', 'stadium', 'bar', 'church', 'record_store']
  },

  streaming: {
    label: 'Streaming Era',
    yearRange: [1990, null],
    formats: ['cd', 'mp3', 'streaming', 'radio', 'television', 'vinyl_revival'],
    genres: {
      pop: 0.25,
      hip_hop: 0.2,
      rock: 0.15,
      electronic: 0.1,
      country: 0.1,
      r_and_b: 0.1,
      indie: 0.1
    },
    notableSongs: [
      'Smells Like Teen Spirit',
      'No Diggity',
      'Crazy in Love',
      'Rolling in the Deep',
      'Blinding Lights'
    ],
    performanceVenues: ['concert_venue', 'stadium', 'nightclub', 'bar', 'festival_grounds', 'street_busking', 'online_stream']
  }
};

// ---------------------------------------------------------------------------
// Confidence calculation
// ---------------------------------------------------------------------------

/**
 * Calculate confidence for cultural data based on era and available data quality.
 * Older eras have less verifiable cultural data.
 */
function calculateCultureConfidence(year, eraKey) {
  // Base confidence by era — more recent eras have more documentation
  const eraConfidence = {
    colonial:       0.25,
    antebellum:     0.30,
    gilded_age:     0.40,
    progressive:    0.50,
    jazz_age:       0.55,
    postwar:        0.60,
    counterculture: 0.65,
    modern:         0.70
  };

  return eraConfidence[eraKey] ?? 0.30;
}

/**
 * Calculate confidence for music data.
 * Pre-recording has lowest confidence — no audio evidence exists.
 */
function calculateMusicConfidence(year, musicEra) {
  const musicConfidence = {
    pre_recording:   0.25,
    early_recording: 0.35,
    broadcast_radio: 0.50,
    broadcast_tv:    0.60,
    streaming:       0.70
  };

  return musicConfidence[musicEra] ?? 0.25;
}

// ---------------------------------------------------------------------------
// Known compromises
// ---------------------------------------------------------------------------

function buildCultureCompromises(year, eraKey) {
  const compromises = [];

  if (eraKey === 'colonial' || eraKey === 'antebellum') {
    compromises.push(`Limited primary sources for daily street life in the ${ERA_CULTURE_DB[eraKey].label}`);
  }

  compromises.push('Street vendor types from general era sources, not date-specific');
  compromises.push('Daily life patterns are typical for the era, not verified for the specific date');
  compromises.push('Secondary languages based on general immigration patterns, not block-level census');

  if (year < 1850) {
    compromises.push('Commerce patterns largely inferred from published accounts and traveler diaries');
  }

  return compromises;
}

function buildMusicCompromises(year, musicEra) {
  const compromises = [];

  if (musicEra === 'pre_recording') {
    compromises.push(`Pre-recording era — no audio recordings exist from ${year}`);
    compromises.push('Song catalog based on published sheet music popularity, not verified street performance data');
    compromises.push('No MusicBrainz data available for pre-recording era');
  } else if (musicEra === 'early_recording') {
    compromises.push('Very few recordings survive from this period — genre weights are estimates');
    compromises.push('Song popularity inferred from sheet music sales and early phonograph catalogs');
  } else if (musicEra === 'broadcast_radio') {
    compromises.push('Radio play data incomplete — genre weights estimated from available charts and surveys');
  }

  compromises.push('Performance venue types are typical for the era, not verified for the specific location');

  return compromises;
}

// ---------------------------------------------------------------------------
// Population-aware adjustments
// ---------------------------------------------------------------------------

/**
 * Scale vendor list and counts based on population density.
 * Dense urban: more vendors, more variety. Rural: fewer vendors, less variety.
 */
function adjustForPopulation(vendors, baseDensity, population) {
  if (!population || population <= 0) {
    return { vendors, count: baseDensity };
  }

  let multiplier;
  if (population >= 1_000_000) {
    multiplier = 2.0;       // major city
  } else if (population >= 200_000) {
    multiplier = 1.5;       // large city
  } else if (population >= 50_000) {
    multiplier = 1.0;       // medium city
  } else if (population >= 10_000) {
    multiplier = 0.6;       // small town
  } else {
    multiplier = 0.3;       // rural
  }

  const count = Math.max(1, Math.round(baseDensity * multiplier));

  // For small populations, trim vendor variety
  let adjustedVendors = vendors;
  if (population < 10_000 && vendors.length > 3) {
    adjustedVendors = vendors.slice(0, 3);
  } else if (population < 50_000 && vendors.length > 6) {
    adjustedVendors = vendors.slice(0, 6);
  }

  return { vendors: adjustedVendors, count };
}

/**
 * Scale venue list based on population.
 */
function adjustVenuesForPopulation(venues, population) {
  if (!population || population >= 50_000) return venues;
  if (population >= 10_000) return venues.slice(0, 4);
  return venues.slice(0, 2);
}

// ---------------------------------------------------------------------------
// US state abbreviation → full name (for Chronicling America API)
// ---------------------------------------------------------------------------

const STATE_FULL_NAMES = {
  al: 'Alabama', ak: 'Alaska', az: 'Arizona', ar: 'Arkansas',
  ca: 'California', co: 'Colorado', ct: 'Connecticut', de: 'Delaware',
  fl: 'Florida', ga: 'Georgia', hi: 'Hawaii', id: 'Idaho',
  il: 'Illinois', in: 'Indiana', ia: 'Iowa', ks: 'Kansas',
  ky: 'Kentucky', la: 'Louisiana', me: 'Maine', md: 'Maryland',
  ma: 'Massachusetts', mi: 'Michigan', mn: 'Minnesota', ms: 'Mississippi',
  mo: 'Missouri', mt: 'Montana', ne: 'Nebraska', nv: 'Nevada',
  nh: 'New Hampshire', nj: 'New Jersey', nm: 'New Mexico', ny: 'New York',
  nc: 'North Carolina', nd: 'North Dakota', oh: 'Ohio', ok: 'Oklahoma',
  or: 'Oregon', pa: 'Pennsylvania', ri: 'Rhode Island', sc: 'South Carolina',
  sd: 'South Dakota', tn: 'Tennessee', tx: 'Texas', ut: 'Utah',
  vt: 'Vermont', va: 'Virginia', wa: 'Washington', wv: 'West Virginia',
  wi: 'Wisconsin', wy: 'Wyoming', dc: 'District of Columbia'
};

/**
 * Extract US state full name from location string.
 * Tries to find a state abbreviation or full name in the location.
 * @param {string} location - e.g. "New York, NY" or "Baton Rouge, Louisiana"
 * @returns {string|null} Full state name or null
 */
function extractStateName(location) {
  if (!location) return null;

  const parts = location.split(',').map(s => s.trim());

  // Check each part for state abbreviation or full name
  for (const part of parts) {
    const lower = part.toLowerCase();

    // Check abbreviation (2-letter)
    if (lower.length === 2 && STATE_FULL_NAMES[lower]) {
      return STATE_FULL_NAMES[lower];
    }

    // Check full name match
    for (const [, fullName] of Object.entries(STATE_FULL_NAMES)) {
      if (lower === fullName.toLowerCase()) {
        return fullName;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Chronicling America newspaper research
// ---------------------------------------------------------------------------

/**
 * Search patterns for cultural enrichment from newspapers.
 * Each pattern maps to a culture layer field it can enrich.
 */
const NEWSPAPER_SEARCH_PATTERNS = [
  { query: 'street vendor', field: 'commerce', subfield: 'streetVendors' },
  { query: 'advertisement', field: 'commerce', subfield: 'businesses' },
  { query: 'amusement entertainment', field: 'entertainment', subfield: 'venues' },
  { query: 'local customs celebration', field: 'dailyLife', subfield: 'customs' },
  { query: 'market prices goods', field: 'commerce', subfield: 'marketGoods' }
];

/**
 * Extract short snippets from OCR text. Returns the first N characters
 * around the search terms, cleaning up OCR artifacts.
 * @param {string} text - Raw OCR text
 * @param {number} [maxLen=200] - Max snippet length
 * @returns {string} Cleaned snippet
 */
function extractSnippet(text, maxLen = 200) {
  if (!text) return '';
  // Clean common OCR artifacts
  const cleaned = text
    .replace(/\s+/g, ' ')      // collapse whitespace
    .replace(/[^\x20-\x7E]/g, '') // strip non-printable
    .trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) + '...' : cleaned;
}

/**
 * Research newspaper archives for location-specific cultural details.
 * Searches Chronicling America for patterns relevant to cultural enrichment.
 *
 * This is additive enrichment — if the API is unreachable, returns empty results.
 *
 * @param {string} location - Location string (e.g., "New York, NY")
 * @param {number} year - Target year
 * @param {Object} [opts]
 * @param {number} [opts.maxPatternsToSearch=3] - Max search patterns to run (rate-limit friendly)
 * @param {number} [opts.maxResultsPerPattern=5] - Max results per search pattern
 * @returns {Promise<{ snippets: Object[], sources: Object[], newspaperNames: string[] }>}
 */
export async function researchNewspapers(location, year, opts = {}) {
  const { maxPatternsToSearch = 3, maxResultsPerPattern = 5 } = opts;

  const stateName = extractStateName(location);
  const snippets = [];
  const sources = [];
  const newspaperNames = new Set();

  // Only search a subset of patterns to stay within reasonable rate limits
  const patterns = NEWSPAPER_SEARCH_PATTERNS.slice(0, maxPatternsToSearch);

  for (const pattern of patterns) {
    try {
      const results = await searchPages(pattern.query, {
        state: stateName,
        year,
        maxResults: maxResultsPerPattern
      });

      for (const result of results) {
        const snippet = extractSnippet(result.text);
        if (snippet) {
          snippets.push({
            field: pattern.field,
            subfield: pattern.subfield,
            text: snippet,
            newspaper: result.newspaper,
            date: result.date,
            url: result.url
          });
        }
        if (result.newspaper) {
          newspaperNames.add(result.newspaper);
        }
      }

      // Add source citation for this search if we got results
      if (results.length > 0) {
        sources.push(createSource(
          `chronicling_america_${pattern.field}`,
          'newspaper_archive',
          `Chronicling America — ${pattern.query} (${stateName || 'US'}, ~${year})`,
          {
            citation: `LOC Chronicling America full-text search: "${pattern.query}" in ${stateName || 'US'} newspapers, ${year - 1}–${year + 1}`,
            url: 'https://chroniclingamerica.loc.gov'
          }
        ));
      }
    } catch (err) {
      // Graceful fallback — API unreachable or error, just skip this pattern
      // Do not break the entire cultural research
      continue;
    }
  }

  return {
    snippets,
    sources,
    newspaperNames: [...newspaperNames]
  };
}

// ---------------------------------------------------------------------------
// Main agent function
// ---------------------------------------------------------------------------

/**
 * Research cultural context and music landscape for a Place×Time.
 *
 * @param {Object} params
 * @param {string} params.location - Location string (e.g., "New York, NY")
 * @param {number} params.year - Target year
 * @param {string} [params.countryCode='US'] - ISO 3166-1 alpha-2 country code
 * @param {number} [params.population] - Approximate population (affects vendor density)
 * @param {boolean} [params.enrichWithNewspapers=false] - Whether to search Chronicling America
 * @returns {Promise<{ culture: Object, music: Object }> | { culture: Object, music: Object }}
 */
export function researchCulture({ location, year, countryCode = 'US', population, enrichWithNewspapers = false }) {
  const eraKey = resolveEraKey(year);
  const era = ERA_CULTURE_DB[eraKey];
  const musicEra = getMusicEra(year);
  const musicData = MUSIC_ERA_DB[musicEra];

  // --- Language lookup by country ---
  const cc = countryCode.toUpperCase();
  const langBlock = era.languages[cc] || era.languages._default;

  // --- Commerce ---
  const currency = era.commerce.currency[cc] || era.commerce.currency._default;
  const { vendors, count: vendorCount } = adjustForPopulation(
    era.commerce.streetVendors,
    era.commerce.vendorDensityBase,
    population
  );

  // --- Build culture data ---
  const cultureData = {
    eraKey,
    eraLabel: era.label,
    languages: { ...langBlock },
    commerce: {
      currency,
      streetVendors: vendors,
      vendorDensity: vendorCount,
      markets: [...era.commerce.markets]
    },
    dailyLife: { ...era.dailyLife },
    newspapers: [...era.newspapers],
    technology: [...era.technology],
    notableEvents: []
  };

  let cultureConfidence = calculateCultureConfidence(year, eraKey);
  const cultureSources = [
    createSource(
      `era_culture_db_${eraKey}`,
      'published_book',
      `${era.label} cultural reference data`,
      { citation: `General published accounts of ${era.label} (${era.yearRange[0] || 'pre-1800'}–${era.yearRange[1] || 'present'}) daily life and commerce` }
    )
  ];
  const cultureCompromises = buildCultureCompromises(year, eraKey);

  // --- Newspaper enrichment (async, optional) ---
  if (enrichWithNewspapers && countryCode === 'US') {
    // Return a promise that enriches with newspaper data then builds both layers
    return (async () => {
      try {
        const newspaperData = await researchNewspapers(location, year);

        // Enrich culture data with newspaper findings
        if (newspaperData.snippets.length > 0) {
          cultureData.newspaperSnippets = newspaperData.snippets;
        }
        if (newspaperData.newspaperNames.length > 0) {
          cultureData.localNewspapers = newspaperData.newspaperNames;
        }

        // Add newspaper sources
        cultureSources.push(...newspaperData.sources);

        // Boost confidence slightly when we have primary sources
        if (newspaperData.snippets.length > 0) {
          cultureConfidence = Math.min(cultureConfidence + 0.10, 0.85);
        }
      } catch {
        // Graceful fallback — newspaper enrichment failed, continue with base data
        cultureCompromises.push('Chronicling America newspaper search unavailable — using generic era data only');
      }

      const cultureLayer = createLayer(cultureData, cultureConfidence, cultureSources, cultureCompromises);
      return { culture: cultureLayer, music: buildMusicLayer(year, musicEra, musicData, population) };
    })();
  }

  const cultureLayer = createLayer(cultureData, cultureConfidence, cultureSources, cultureCompromises);

  return { culture: cultureLayer, music: buildMusicLayer(year, musicEra, musicData, population) };
}

// ---------------------------------------------------------------------------
// Music layer builder (shared between sync and async paths)
// ---------------------------------------------------------------------------

function buildMusicLayer(year, musicEra, musicData, population) {
  const adjustedVenues = adjustVenuesForPopulation(
    [...musicData.performanceVenues],
    population
  );

  const musicLayerData = {
    era: musicEra,
    eraLabel: musicData.label,
    formats: [...musicData.formats],
    catalog: [],
    genreWeights: { ...musicData.genres },
    performanceVenues: adjustedVenues,
    notableSongs: [...musicData.notableSongs]
  };

  const musicConfidence = calculateMusicConfidence(year, musicEra);
  const musicSources = [
    createSource(
      `music_era_db_${musicEra}`,
      'online_database',
      `${musicData.label} music reference data`,
      { citation: `Published music catalogs and charts for the ${musicData.label} (${musicData.yearRange[0] || 'pre-1877'}–${musicData.yearRange[1] || 'present'})` }
    )
  ];
  const musicCompromises = buildMusicCompromises(year, musicEra);

  return createLayer(musicLayerData, musicConfidence, musicSources, musicCompromises);
}
