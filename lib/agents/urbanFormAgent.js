/**
 * Urban Form Research Agent (Phase 7.4)
 *
 * Given a location + year, assesses what urban form data is available
 * (terrain data, Sanborn maps, architecture rules, street classification,
 * era-appropriate props) and produces an urbanForm layer for an Environment Profile.
 *
 * Does NOT generate geometry or spawn actors — it researches what's available
 * and produces a data inventory with confidence ratings and source citations.
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { createLayer, createSource } from '../environmentProfile.js';
import { resolveEra, getEraInfo, ERA_RULES, STYLES } from '../architectureStyles.js';
import { classifyStreet, SURFACE_TYPES } from '../streetLayout.js';
import { getPropsForYear, summarizePropsForYear } from '../propCatalog.js';

// ---------------------------------------------------------------------------
// Sanborn map coverage — approximate availability for major US cities
// ---------------------------------------------------------------------------

/**
 * Known Sanborn fire insurance map coverage for major US cities.
 * Values are arrays of approximate years that maps exist in the LOC collection.
 * Not exhaustive — the LOC has ~25,000 Sanborn map editions covering ~12,000 towns.
 */
export const SANBORN_COVERAGE = {
  'New York, NY':       { years: [1867, 1879, 1885, 1890, 1894, 1899, 1904, 1911, 1920, 1930, 1951], city: 'New York' },
  'Manhattan, NY':      { years: [1867, 1879, 1885, 1890, 1894, 1899, 1904, 1911, 1920, 1930, 1951], city: 'New York' },
  'Brooklyn, NY':       { years: [1886, 1888, 1895, 1904, 1915, 1930, 1951], city: 'Brooklyn' },
  'Chicago, IL':        { years: [1868, 1871, 1886, 1894, 1905, 1917, 1923, 1950], city: 'Chicago' },
  'San Francisco, CA':  { years: [1886, 1893, 1899, 1905, 1913, 1915, 1950], city: 'San Francisco' },
  'Boston, MA':         { years: [1867, 1874, 1885, 1895, 1901, 1910, 1928, 1951], city: 'Boston' },
  'Philadelphia, PA':   { years: [1875, 1888, 1895, 1916, 1929, 1951], city: 'Philadelphia' },
  'Baltimore, MD':      { years: [1879, 1890, 1901, 1914, 1929, 1951], city: 'Baltimore' },
  'Washington, DC':     { years: [1888, 1903, 1916, 1927, 1951], city: 'Washington' },
  'New Orleans, LA':    { years: [1876, 1885, 1893, 1895, 1908, 1929, 1951], city: 'New Orleans' },
  'St. Louis, MO':      { years: [1876, 1883, 1897, 1909, 1920, 1951], city: 'St. Louis' },
  'Pittsburgh, PA':     { years: [1884, 1893, 1906, 1924, 1951], city: 'Pittsburgh' },
  'Detroit, MI':        { years: [1884, 1897, 1910, 1921, 1951], city: 'Detroit' },
  'Cincinnati, OH':     { years: [1878, 1887, 1904, 1917, 1951], city: 'Cincinnati' },
  'Cleveland, OH':      { years: [1881, 1886, 1896, 1912, 1928, 1951], city: 'Cleveland' },
  'Atlanta, GA':        { years: [1886, 1899, 1911, 1924, 1932, 1951], city: 'Atlanta' },
  'Denver, CO':         { years: [1886, 1890, 1903, 1929, 1951], city: 'Denver' },
  'Minneapolis, MN':    { years: [1885, 1912, 1928, 1951], city: 'Minneapolis' },
  'Milwaukee, WI':      { years: [1876, 1888, 1894, 1910, 1930, 1951], city: 'Milwaukee' },
  'Baton Rouge, LA':    { years: [1885, 1891, 1903, 1908, 1916, 1923, 1951], city: 'Baton Rouge' },
  'Louisville, KY':     { years: [1876, 1892, 1905, 1929, 1951], city: 'Louisville' },
  'Memphis, TN':        { years: [1886, 1897, 1907, 1928, 1951], city: 'Memphis' },
  'Nashville, TN':      { years: [1889, 1897, 1914, 1929, 1951], city: 'Nashville' },
  'Portland, OR':       { years: [1889, 1901, 1908, 1924, 1950], city: 'Portland' },
  'Seattle, WA':        { years: [1884, 1893, 1905, 1917, 1950], city: 'Seattle' },
  'Richmond, VA':       { years: [1886, 1895, 1905, 1924, 1951], city: 'Richmond' },
  'Savannah, GA':       { years: [1884, 1898, 1916, 1932, 1951], city: 'Savannah' },
  'Charleston, SC':     { years: [1884, 1902, 1919, 1944, 1951], city: 'Charleston' },
  'Buffalo, NY':        { years: [1886, 1889, 1899, 1916, 1930, 1951], city: 'Buffalo' },
  'Providence, RI':     { years: [1875, 1884, 1899, 1920, 1951], city: 'Providence' },
};

// ---------------------------------------------------------------------------
// Terrain data assessment
// ---------------------------------------------------------------------------

/**
 * Assess what urban form data exists in a terrain-data directory.
 * Reads metadata.json and checks for building footprints, streets, landmarks, Sanborn data.
 *
 * @param {string} terrainDataPath - Path to terrain-data/{slug}/ directory
 * @returns {Object|null} Assessment object, or null if path doesn't exist
 */
export function assessTerrainData(terrainDataPath) {
  if (!terrainDataPath || !existsSync(terrainDataPath)) return null;

  const metadataPath = path.join(terrainDataPath, 'metadata.json');
  if (!existsSync(metadataPath)) return null;

  let metadata;
  try {
    metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
  } catch {
    return null;
  }

  const result = {
    path: terrainDataPath,
    location: metadata.name || null,
    lat: metadata.lat || null,
    lon: metadata.lon || null,
    slug: metadata.slug || null,
  };

  // Building footprints
  const buildingsPath = path.join(terrainDataPath, 'buildings.geojson');
  if (existsSync(buildingsPath)) {
    try {
      const geojson = JSON.parse(readFileSync(buildingsPath, 'utf-8'));
      result.buildings = {
        path: buildingsPath,
        count: geojson.features ? geojson.features.length : 0,
      };
    } catch {
      result.buildings = { path: buildingsPath, count: 0, error: 'parse_failed' };
    }
  } else {
    result.buildings = null;
  }

  // Street splines
  const roadsPath = path.join(terrainDataPath, 'roads-splines.json');
  if (existsSync(roadsPath)) {
    try {
      const roads = JSON.parse(readFileSync(roadsPath, 'utf-8'));
      result.streets = {
        path: roadsPath,
        count: Array.isArray(roads) ? roads.length : 0,
      };
    } catch {
      result.streets = { path: roadsPath, count: 0, error: 'parse_failed' };
    }
  } else {
    result.streets = null;
  }

  // Landmarks
  const landmarksPath = path.join(terrainDataPath, 'landmarks.json');
  if (existsSync(landmarksPath)) {
    try {
      const landmarks = JSON.parse(readFileSync(landmarksPath, 'utf-8'));
      const items = Array.isArray(landmarks) ? landmarks : (landmarks.landmarks || []);
      result.landmarks = {
        path: landmarksPath,
        count: items.length,
        names: items.map(l => l.name || l.id).filter(Boolean),
      };
    } catch {
      result.landmarks = { path: landmarksPath, count: 0, error: 'parse_failed' };
    }
  } else {
    result.landmarks = null;
  }

  // Sanborn data
  if (metadata.sanborn) {
    result.sanborn = {
      sheetCount: metadata.sanborn.sheetCount || 0,
      targetYear: metadata.sanborn.targetYear || null,
      buildingCount: metadata.sanborn.buildingCount || 0,
      source: metadata.sanborn.source || null,
    };
  } else {
    result.sanborn = null;
  }

  // Vectors summary
  if (metadata.vectors) {
    result.vectors = {
      roads: metadata.vectors.featureCounts?.roads || 0,
      water: metadata.vectors.featureCounts?.water || 0,
      landuse: metadata.vectors.featureCounts?.landuse || 0,
      splineCount: metadata.vectors.splineCount || 0,
    };
  } else {
    result.vectors = null;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Sanborn coverage assessment
// ---------------------------------------------------------------------------

/**
 * Assess Sanborn map coverage for a location and year.
 * Returns the closest available map year, coverage gap, and availability info.
 *
 * @param {string} location - City name (e.g., "New York, NY")
 * @param {number} year - Target year
 * @returns {Object} Coverage assessment
 */
export function assessSanbornCoverage(location, year) {
  // Try exact match, then try partial city name matching
  let entry = SANBORN_COVERAGE[location];

  if (!entry) {
    const locLower = location.toLowerCase();
    for (const [key, val] of Object.entries(SANBORN_COVERAGE)) {
      if (locLower.includes(val.city.toLowerCase()) || key.toLowerCase().includes(locLower)) {
        entry = val;
        break;
      }
    }
  }

  if (!entry) {
    return {
      available: false,
      city: null,
      closestYear: null,
      yearGap: null,
      years: [],
      note: `No Sanborn map coverage found for "${location}" in known database. The LOC may still have maps — check https://www.loc.gov/collections/sanborn-maps/`,
    };
  }

  // Find closest year
  let closestYear = null;
  let minGap = Infinity;
  for (const y of entry.years) {
    const gap = Math.abs(y - year);
    if (gap < minGap) {
      minGap = gap;
      closestYear = y;
    }
  }

  // Find nearest year before and after target
  const yearsBefore = entry.years.filter(y => y <= year);
  const yearsAfter = entry.years.filter(y => y >= year);

  return {
    available: true,
    city: entry.city,
    closestYear,
    yearGap: minGap,
    years: entry.years,
    nearestBefore: yearsBefore.length > 0 ? yearsBefore[yearsBefore.length - 1] : null,
    nearestAfter: yearsAfter.length > 0 ? yearsAfter[0] : null,
    note: minGap === 0
      ? `Sanborn map exists for ${location} in ${year}`
      : minGap <= 5
        ? `Closest Sanborn map is from ${closestYear} (${minGap}-year gap — building stock largely stable)`
        : minGap <= 15
          ? `Closest Sanborn map is from ${closestYear} (${minGap}-year gap — moderate changes possible)`
          : `Closest Sanborn map is from ${closestYear} (${minGap}-year gap — significant changes likely)`,
  };
}

// ---------------------------------------------------------------------------
// Confidence calculation
// ---------------------------------------------------------------------------

/**
 * Calculate confidence score for urban form data.
 *
 * Factors:
 * - Terrain data availability (buildings, streets, landmarks)
 * - Architecture era rule coverage
 * - Sanborn map proximity to target year
 * - Prop catalog availability
 */
function calculateConfidence({ terrainData, eraInfo, sanbornCoverage, propSummary, year }) {
  let confidence = 0.3; // Base: we always have architecture rules and prop catalog

  // Terrain data contributions
  if (terrainData) {
    if (terrainData.buildings && terrainData.buildings.count > 0) {
      confidence += 0.15; // Have building footprints
      if (terrainData.buildings.count >= 20) confidence += 0.05;
    }
    if (terrainData.streets && terrainData.streets.count > 0) {
      confidence += 0.1; // Have street data
    }
    if (terrainData.landmarks && terrainData.landmarks.count > 0) {
      confidence += 0.05; // Have landmarks
    }
    if (terrainData.sanborn && terrainData.sanborn.sheetCount > 0) {
      confidence += 0.05; // Have Sanborn sheets
    }
  }

  // Sanborn coverage year gap penalty
  if (sanbornCoverage && sanbornCoverage.available) {
    if (sanbornCoverage.yearGap === 0) confidence += 0.1;
    else if (sanbornCoverage.yearGap <= 5) confidence += 0.07;
    else if (sanbornCoverage.yearGap <= 15) confidence += 0.03;
    // > 15 year gap: no bonus
  }

  // Era-specific rules boost (vs generic era)
  if (eraInfo) {
    const eraKey = resolveEra(year);
    // City-specific eras (nyc_1884, chicago_1920, sf_1908) are more confident
    if (!eraKey.startsWith('general_')) {
      confidence += 0.05;
    }
  }

  // Prop availability
  if (propSummary && propSummary.total > 0) {
    confidence += 0.05;
  }

  return Math.min(Math.round(confidence * 100) / 100, 0.95);
}

// ---------------------------------------------------------------------------
// Compromises
// ---------------------------------------------------------------------------

function buildCompromises({ terrainData, sanbornCoverage, eraInfo, year }) {
  const compromises = [];

  // Sanborn gap
  if (sanbornCoverage && sanbornCoverage.available && sanbornCoverage.yearGap > 0) {
    compromises.push(
      `Sanborn maps from ${sanbornCoverage.closestYear}, not ${year} — ${sanbornCoverage.yearGap}-year gap`
    );
  } else if (!sanbornCoverage || !sanbornCoverage.available) {
    compromises.push('No Sanborn fire insurance map coverage found for this location');
  }

  // Building count
  if (terrainData && terrainData.buildings && terrainData.buildings.count > 0) {
    if (terrainData.buildings.count < 50) {
      compromises.push(
        `Only ${terrainData.buildings.count} building footprints traced — partial block coverage`
      );
    }
  } else {
    compromises.push('No building footprints available — would need to trace from Sanborn or OSM');
  }

  // Street data
  if (!terrainData || !terrainData.streets || terrainData.streets.count === 0) {
    compromises.push('No street spline data — road network not yet extracted');
  } else {
    compromises.push('Street splines from modern OSM — road alignment stable but widths may differ from era');
  }

  // Architecture era
  const eraKey = resolveEra(year);
  if (eraKey.startsWith('general_')) {
    compromises.push(
      `Using general era rules (${eraInfo?.label || eraKey}) — no city-specific architecture classification`
    );
  }

  // Landmarks
  if (!terrainData || !terrainData.landmarks || terrainData.landmarks.count === 0) {
    compromises.push('No landmark compositions authored for this location');
  } else {
    compromises.push('Landmark silhouettes are multi-primitive approximations, not architectural models');
  }

  return compromises;
}

// ---------------------------------------------------------------------------
// Main agent function
// ---------------------------------------------------------------------------

/**
 * Research urban form data availability for a Place×Time.
 *
 * @param {Object} params
 * @param {string} params.location - Location string (e.g., "New York, NY")
 * @param {number} params.year - Target year
 * @param {number} [params.lat] - Latitude (optional, for future OSM queries)
 * @param {number} [params.lon] - Longitude (optional, for future OSM queries)
 * @param {string} [params.countryCode] - ISO country code (e.g., "US")
 * @param {string} [params.terrainDataPath] - Path to terrain-data/{slug}/ directory
 * @returns {Object} Environment Profile urbanForm layer { data, confidence, sources, knownCompromises }
 */
export function researchUrbanForm({ location, year, lat, lon, countryCode, terrainDataPath }) {
  // Step 1: Assess terrain data on disk
  const terrainData = terrainDataPath ? assessTerrainData(terrainDataPath) : null;

  // Step 2: Architecture era resolution
  const eraKey = resolveEra(year);
  const eraInfo = getEraInfo(eraKey);
  const eraStyleCount = eraInfo ? ERA_RULES[eraKey]?.rules?.length || 0 : 0;

  // Step 3: Prop catalog for the year
  const propSummary = summarizePropsForYear(year);

  // Step 4: Sample street classification to verify rules work
  const sampleStreet = classifyStreet('primary', { era: eraKey.startsWith('general_') ? undefined : eraKey });

  // Step 5: Sanborn coverage assessment (US cities only)
  const isUS = !countryCode || countryCode === 'US';
  const sanbornCoverage = isUS ? assessSanbornCoverage(location, year) : {
    available: false,
    city: null,
    closestYear: null,
    yearGap: null,
    years: [],
    note: 'Sanborn maps only cover US cities',
  };

  // Step 6: Calculate confidence
  const confidence = calculateConfidence({ terrainData, eraInfo, sanbornCoverage, propSummary, year });

  // Step 7: Build layer data
  const data = {
    architectureEra: eraKey,
    architectureEraLabel: eraInfo?.label || eraKey,
    architectureStyleCount: eraStyleCount,
    architectureDefaultStyle: eraInfo?.defaultStyle || null,
    streetSurfaceRules: eraKey.startsWith('general_') ? 'nyc_1884' : eraKey,
    sampleStreetSurface: sampleStreet.surface,
    propYear: year,
    propTypes: propSummary.types,
    propCount: propSummary.total,
    propsByPlacement: propSummary.byPlacement,
    sanbornCoverage: sanbornCoverage.available ? {
      closestYear: sanbornCoverage.closestYear,
      yearGap: sanbornCoverage.yearGap,
      availableYears: sanbornCoverage.years,
    } : null,
    osmAvailable: true, // OSM data is always available for road extraction
    countryCode: countryCode || null,
  };

  // Add terrain data references if available
  if (terrainData) {
    if (terrainData.buildings) {
      data.footprintsPath = terrainData.buildings.path;
      data.footprintCount = terrainData.buildings.count;
      data.buildingSource = terrainData.sanborn
        ? `sanborn_${terrainData.sanborn.targetYear}`
        : 'manual';
    }
    if (terrainData.streets) {
      data.streetsPath = terrainData.streets.path;
      data.streetCount = terrainData.streets.count;
    }
    if (terrainData.landmarks) {
      data.landmarksPath = terrainData.landmarks.path;
      data.landmarkCount = terrainData.landmarks.count;
      data.landmarks = terrainData.landmarks.names;
    }
  }

  // Availability report (metadata for the assembler)
  data._availabilityReport = {
    terrainDataExists: !!terrainData,
    buildingFootprintsExist: !!(terrainData?.buildings?.count > 0),
    streetSplinesExist: !!(terrainData?.streets?.count > 0),
    landmarksExist: !!(terrainData?.landmarks?.count > 0),
    sanbornSheetsFetched: !!(terrainData?.sanborn?.sheetCount > 0),
    sanbornCoverageKnown: sanbornCoverage.available,
    architectureEraResolved: eraKey,
    propCatalogAvailable: propSummary.total > 0,
    osmDataAvailable: true,
  };

  // Step 8: Build sources
  const sources = [];

  if (terrainData?.sanborn) {
    sources.push(createSource(
      `sanborn_${terrainData.sanborn.targetYear}`,
      'historical_map',
      `Sanborn Fire Insurance Map — ${location}, ${terrainData.sanborn.targetYear}`,
      {
        url: 'https://www.loc.gov/collections/sanborn-maps/',
        citation: `Library of Congress, Sanborn Maps Collection. ${terrainData.sanborn.sheetCount} sheets, ${terrainData.sanborn.buildingCount} building footprints.`,
      }
    ));
  } else if (sanbornCoverage.available) {
    sources.push(createSource(
      `sanborn_coverage_${sanbornCoverage.closestYear}`,
      'historical_map',
      `Sanborn Fire Insurance Map — ${sanbornCoverage.city}, ${sanbornCoverage.closestYear} (not yet fetched)`,
      {
        url: 'https://www.loc.gov/collections/sanborn-maps/',
        citation: `LOC Sanborn collection. Closest map: ${sanbornCoverage.closestYear} (${sanbornCoverage.yearGap}-year gap from ${year}).`,
      }
    ));
  }

  if (terrainData?.streets) {
    sources.push(createSource(
      'osm_roads',
      'online_database',
      'OpenStreetMap road network',
      { citation: `OSM road data via Overpass API, ${terrainData.streets.count} road splines extracted` }
    ));
  } else {
    sources.push(createSource(
      'osm_roads_potential',
      'online_database',
      'OpenStreetMap road network (available, not yet fetched)',
      { citation: 'OSM road data available via Overpass API for any location' }
    ));
  }

  sources.push(createSource(
    `architecture_rules_${eraKey}`,
    'procedural_generation',
    `architectureStyles.js ${eraKey} rules`,
    { citation: `Era-specific building classification: ${eraStyleCount} rules, ${Object.keys(STYLES).length} total styles` }
  ));

  sources.push(createSource(
    `prop_catalog_${year}`,
    'procedural_generation',
    `propCatalog.js for year ${year}`,
    { citation: `${propSummary.total} prop types available for ${year}` }
  ));

  // Step 9: Known compromises
  const knownCompromises = buildCompromises({ terrainData, sanbornCoverage, eraInfo, year });

  return createLayer(data, confidence, sources, knownCompromises);
}
