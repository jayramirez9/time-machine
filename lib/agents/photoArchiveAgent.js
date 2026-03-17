/**
 * Photo Archive Research Agent (Phase 7.6)
 *
 * Given a location + year, catalogs what digitized photo archives exist and
 * assesses photo availability for the target Place×Time.
 *
 * Does NOT make any network calls or download photos — it researches what
 * collections are available and produces a layer for an Environment Profile.
 */

import { createLayer, createSource } from '../environmentProfile.js';

// ---------------------------------------------------------------------------
// Photo archive database
// ---------------------------------------------------------------------------

const PHOTO_ARCHIVES = [
  {
    id: 'nypl_digital',
    name: 'NYPL Digital Collections',
    url: 'https://digitalcollections.nypl.org/',
    apiAvailable: true,
    apiUrl: 'https://api.repo.nypl.org/',
    coverage: {
      geographic: ['nyc'],
      temporal: { minYear: 1850, maxYear: null },
      types: ['photographs', 'stereographs', 'postcards', 'prints', 'maps']
    },
    strengths: 'Enormous NYC-focused collection; strong 19th century holdings; public API with IIIF support',
    limitations: 'NYC-centric — limited coverage outside the five boroughs'
  },
  {
    id: 'loc_prints',
    name: 'Library of Congress Prints & Photographs',
    url: 'https://www.loc.gov/pictures/',
    apiAvailable: true,
    apiUrl: 'https://www.loc.gov/pictures/api/',
    coverage: {
      geographic: ['national'],
      temporal: { minYear: 1840, maxYear: null },
      types: ['photographs', 'prints', 'drawings', 'posters', 'stereographs']
    },
    strengths: 'Largest US photo archive; national coverage; includes FSA/OWI (1935-1945), Civil War, and Detroit Publishing collections',
    limitations: 'Search can be imprecise for location-specific queries; metadata quality varies'
  },
  {
    id: 'mcny',
    name: 'Museum of the City of New York',
    url: 'https://collections.mcny.org/',
    apiAvailable: false,
    apiUrl: null,
    coverage: {
      geographic: ['nyc'],
      temporal: { minYear: 1850, maxYear: null },
      types: ['photographs', 'prints', 'paintings', 'costumes']
    },
    strengths: 'Deep NYC street photography; Byron Company and Berenice Abbott collections; strong 1880-1940 holdings',
    limitations: 'No public API — manual search only; limited digital access for some collections'
  },
  {
    id: 'detroit_publishing',
    name: 'Detroit Publishing Company',
    url: 'https://www.loc.gov/pictures/collection/det/',
    apiAvailable: true,
    apiUrl: 'https://www.loc.gov/pictures/api/',
    coverage: {
      geographic: ['national'],
      temporal: { minYear: 1880, maxYear: 1920 },
      types: ['photographs', 'photochrom_prints']
    },
    strengths: 'High-quality large-format photographs of American cities 1880-1920; many hand-colored photochrom prints; excellent street-level detail',
    limitations: 'Collection ends ~1920; strongest for tourist/commercial subjects, may miss everyday neighborhoods'
  },
  {
    id: 'shorpy',
    name: 'Shorpy Historical Photos',
    url: 'https://www.shorpy.com/',
    apiAvailable: false,
    apiUrl: null,
    coverage: {
      geographic: ['national'],
      temporal: { minYear: 1850, maxYear: null },
      types: ['photographs']
    },
    strengths: 'Curated high-resolution scans; excellent for everyday life and street scenes; strong editorial context',
    limitations: 'No API — editorial website only; not a primary source (aggregates from LOC and other archives)'
  },
  {
    id: 'nara',
    name: 'National Archives (NARA)',
    url: 'https://catalog.archives.gov/',
    apiAvailable: true,
    apiUrl: 'https://catalog.archives.gov/api/v1/',
    coverage: {
      geographic: ['national'],
      temporal: { minYear: 1860, maxYear: null },
      types: ['photographs', 'film', 'maps', 'documents']
    },
    strengths: 'Official US government records; military, infrastructure, and public works photography; unique federal project documentation',
    limitations: 'API returns metadata but images may require manual download; search is document-oriented, not image-oriented'
  },
  {
    id: 'stereograph_collections',
    name: 'Stereograph Collections (various)',
    url: 'https://www.loc.gov/pictures/collection/stereo/',
    apiAvailable: true,
    apiUrl: 'https://www.loc.gov/pictures/api/',
    coverage: {
      geographic: ['national'],
      temporal: { minYear: 1850, maxYear: 1930 },
      types: ['stereographs']
    },
    strengths: '3D street-level views from the golden age of stereography; strong 1870-1910 urban coverage; often capture everyday scenes',
    limitations: 'Format is small and sometimes soft; collection tapers off after 1910; geographic metadata can be vague'
  },
  {
    id: 'local_historical_societies',
    name: 'Local Historical Societies',
    url: null,
    apiAvailable: false,
    apiUrl: null,
    coverage: {
      geographic: ['local'],
      temporal: { minYear: null, maxYear: null },
      types: ['photographs', 'documents', 'oral_histories', 'maps']
    },
    strengths: 'Hyper-local collections often unavailable elsewhere; personal and community photographs; local business records',
    limitations: 'No standardized API; digitization varies widely; discovery requires manual research per location'
  }
];

// ---------------------------------------------------------------------------
// Photo availability eras
// ---------------------------------------------------------------------------

const AVAILABILITY_ERAS = [
  { minYear: null,  maxYear: 1838, label: 'pre_photography',   availability: 0,    description: 'Photography not yet invented — no photographic sources exist' },
  { minYear: 1839,  maxYear: 1860, label: 'daguerreotype',     availability: 0.05, description: 'Daguerreotype era — photographs exist but are extremely rare, mostly portraits' },
  { minYear: 1861,  maxYear: 1879, label: 'early_photography', availability: 0.2,  description: 'Wet plate/carte de visite era — Civil War drove documentation; outdoor city views uncommon' },
  { minYear: 1880,  maxYear: 1920, label: 'golden_age',        availability: 0.8,  description: 'Golden age of urban photography — dry plates, Detroit Publishing, stereographs; excellent street-level coverage' },
  { minYear: 1921,  maxYear: 1945, label: 'documentary',       availability: 0.7,  description: 'Documentary era — FSA/OWI project, news photography; strong but less systematic than golden age' },
  { minYear: 1946,  maxYear: 1969, label: 'postwar',           availability: 0.6,  description: 'Postwar era — color photography emerging; suburban growth less documented than urban cores' },
  { minYear: 1970,  maxYear: null, label: 'modern',            availability: 0.9,  description: 'Modern era — abundant photographic documentation; digital archives increasingly comprehensive' }
];

// ---------------------------------------------------------------------------
// Archive matching
// ---------------------------------------------------------------------------

/**
 * Determine if a location string or country code corresponds to NYC.
 */
function isNYC(location, lat, lon) {
  if (!location && (lat == null || lon == null)) return false;
  if (location) {
    const loc = location.toLowerCase();
    if (loc.includes('new york') || loc.includes('nyc') || loc.includes('manhattan') ||
        loc.includes('brooklyn') || loc.includes('queens') || loc.includes('bronx') ||
        loc.includes('staten island')) {
      return true;
    }
  }
  // Bounding box check for NYC metro area
  if (lat != null && lon != null) {
    return lat >= 40.4 && lat <= 41.0 && lon >= -74.3 && lon <= -73.7;
  }
  return false;
}

/**
 * Match archives to a location + year.
 *
 * @param {Object} params
 * @param {string} [params.location] - Location string
 * @param {number} params.year - Target year
 * @param {number} [params.lat] - Latitude
 * @param {number} [params.lon] - Longitude
 * @param {string} [params.countryCode] - ISO country code (e.g., 'US')
 * @returns {Object[]} Matched archives with relevance scores
 */
function matchArchives({ location, year, lat, lon, countryCode } = {}) {
  const nyc = isNYC(location, lat, lon);
  const isUS = !countryCode || countryCode === 'US';

  return PHOTO_ARCHIVES
    .filter(archive => {
      // Geographic filter
      const geo = archive.coverage.geographic;
      if (geo.includes('nyc') && !nyc) return false;
      if (geo.includes('national') && !isUS) return false;
      // 'local' always passes — it's a generic placeholder

      // Temporal filter
      const { minYear, maxYear } = archive.coverage.temporal;
      if (minYear != null && year < minYear) return false;
      if (maxYear != null && year > maxYear) return false;

      return true;
    })
    .map(archive => {
      // Calculate relevance score
      let relevance = 0.5; // base

      const geo = archive.coverage.geographic;
      if (geo.includes('nyc') && nyc) relevance += 0.3;         // NYC-specific archive for NYC query
      if (geo.includes('national')) relevance += 0.1;            // national coverage
      if (archive.apiAvailable) relevance += 0.1;                // API makes it actionable

      // Temporal sweet spot bonus
      const { minYear, maxYear } = archive.coverage.temporal;
      if (minYear != null && maxYear != null) {
        // Archive has a defined era — bonus if year is in the middle
        const span = maxYear - minYear;
        const midpoint = minYear + span / 2;
        const distFromMid = Math.abs(year - midpoint) / (span / 2);
        if (distFromMid < 0.5) relevance += 0.1; // near the sweet spot
      }

      return { ...archive, relevance: Math.round(Math.min(relevance, 1.0) * 100) / 100 };
    })
    .sort((a, b) => b.relevance - a.relevance);
}

// ---------------------------------------------------------------------------
// Photo availability assessment
// ---------------------------------------------------------------------------

/**
 * Assess photo availability for a given year.
 *
 * @param {number} year
 * @returns {{ era: string, availability: number, description: string }}
 */
function assessPhotoAvailability(year) {
  for (const era of AVAILABILITY_ERAS) {
    const afterMin = era.minYear == null || year >= era.minYear;
    const beforeMax = era.maxYear == null || year <= era.maxYear;
    if (afterMin && beforeMax) {
      return {
        era: era.label,
        availability: era.availability,
        description: era.description
      };
    }
  }
  // Should not reach here, but fallback
  return { era: 'unknown', availability: 0, description: 'No assessment available' };
}

// ---------------------------------------------------------------------------
// Confidence calculation
// ---------------------------------------------------------------------------

/**
 * Calculate confidence for the photo archive layer.
 * Based on photo availability for the era + number of matched archives.
 */
function calculateConfidence(availability, matchedCount) {
  if (availability === 0) return 0;

  // Base from era availability
  let confidence = availability * 0.7;

  // Boost from number of matched archives
  if (matchedCount >= 4) confidence += 0.2;
  else if (matchedCount >= 2) confidence += 0.15;
  else if (matchedCount >= 1) confidence += 0.1;
  // 0 matched archives: no boost

  // Archives with APIs are more actionable — already factored into match relevance

  return Math.round(Math.min(confidence, 1.0) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Compromises
// ---------------------------------------------------------------------------

function buildCompromises(year, availability, matchedArchives) {
  const compromises = [];

  if (availability.availability === 0) {
    compromises.push('No photographic sources exist for this period — photography was not yet invented');
    return compromises;
  }

  if (availability.availability <= 0.05) {
    compromises.push('Photographs from this period are extremely rare — daguerreotypes were mostly portraits, not street scenes');
  }

  if (availability.availability <= 0.2) {
    compromises.push('Outdoor city photography was uncommon — most surviving images are formal or military in nature');
  }

  const withApi = matchedArchives.filter(a => a.apiAvailable);
  const withoutApi = matchedArchives.filter(a => !a.apiAvailable);

  if (withoutApi.length > 0 && withApi.length === 0) {
    compromises.push('No matched archives have public APIs — automated retrieval is not possible');
  } else if (withoutApi.length > 0) {
    compromises.push(`${withoutApi.length} of ${matchedArchives.length} matched archives lack public APIs — manual search required for full coverage`);
  }

  if (year < 1880 && year >= 1839) {
    compromises.push('Pre-1880 photographs rarely include street-level detail — most are elevated or panoramic views');
  }

  if (matchedArchives.every(a => a.coverage.geographic.includes('national') || a.coverage.geographic.includes('local'))) {
    compromises.push('No location-specific archives matched — relying on national collections which may have sparse local coverage');
  }

  return compromises;
}

// ---------------------------------------------------------------------------
// Main agent function
// ---------------------------------------------------------------------------

/**
 * Research photo archive availability for a Place×Time.
 *
 * @param {Object} params
 * @param {string} [params.location] - Location string (e.g., "New York, NY")
 * @param {number} params.year - Target year
 * @param {number} [params.lat] - Latitude
 * @param {number} [params.lon] - Longitude
 * @param {string} [params.countryCode] - ISO country code (default: 'US')
 * @returns {Object} Environment Profile layer { data, confidence, sources, knownCompromises }
 */
function researchPhotoArchives({ location, year, lat, lon, countryCode = 'US' } = {}) {
  // Step 1: Assess photo availability for the era
  const availability = assessPhotoAvailability(year);

  // Step 2: Match archives to location + year
  const matched = matchArchives({ location, year, lat, lon, countryCode });

  // Step 3: Calculate confidence
  const confidence = calculateConfidence(availability.availability, matched.length);

  // Step 4: Build data payload
  const data = {
    era: availability.era,
    availability: availability.availability,
    eraDescription: availability.description,
    matchedArchives: matched.map(a => ({
      id: a.id,
      name: a.name,
      url: a.url,
      apiAvailable: a.apiAvailable,
      apiUrl: a.apiUrl,
      relevance: a.relevance,
      types: a.coverage.types
    })),
    archiveCount: matched.length,
    apiArchiveCount: matched.filter(a => a.apiAvailable).length,
    year,
    location: location || null,
    _researchSummary: {
      totalArchivesEvaluated: PHOTO_ARCHIVES.length,
      matchedCount: matched.length,
      topArchive: matched.length > 0 ? matched[0].id : null,
      photoEra: availability.era,
      recommendation: buildRecommendation(availability, matched)
    }
  };

  // Step 5: Build sources from matched archives
  const sources = matched.map(a =>
    createSource(
      a.id,
      'photo_archive',
      a.name,
      {
        url: a.url,
        citation: `${a.name} — ${a.coverage.types.join(', ')}`,
        apiAvailable: a.apiAvailable
      }
    )
  );

  // Step 6: Build compromises
  const knownCompromises = buildCompromises(year, availability, matched);

  return createLayer(data, confidence, sources, knownCompromises);
}

/**
 * Build a human-readable recommendation.
 */
function buildRecommendation(availability, matched) {
  if (availability.availability === 0) {
    return 'No photographic sources available — consider engravings, paintings, or written descriptions for visual reference';
  }
  if (availability.availability <= 0.05) {
    return 'Photographic sources extremely rare — supplement with lithographs, engravings, and contemporary illustrations';
  }
  if (matched.length === 0) {
    return 'No matching archives found — broaden geographic scope or check local historical societies manually';
  }
  const withApi = matched.filter(a => a.apiAvailable);
  if (withApi.length > 0) {
    return `Query ${withApi[0].name} first (API available) — ${matched.length} total archives matched`;
  }
  return `${matched.length} archives matched — manual search recommended (no APIs available)`;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  researchPhotoArchives,
  PHOTO_ARCHIVES,
  matchArchives,
  assessPhotoAvailability,
  AVAILABILITY_ERAS
};
