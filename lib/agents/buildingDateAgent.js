/**
 * Building Date Research Agent (Phase 7.8)
 *
 * Given buildings (from GeoJSON on disk or OSM) and a target year,
 * estimates yearBuilt/yearDemolished for undated buildings using
 * multiple evidence sources ranked by reliability.
 *
 * Evidence chain (highest to lowest confidence):
 * 1. Explicit dates in GeoJSON properties
 * 2. OSM start_date tags
 * 3. Sanborn map bracketing (building on map X but not map Y → built between)
 * 4. Major fire lower bounds (city destroyed → rebuilt after)
 * 5. Material + stories era ranges (cast iron = 1848-1900, steel 10+ stories = 1885+)
 * 6. Construction boom decades (city-specific building waves)
 * 7. Neighborhood heuristic (nearby dated buildings cluster within ~20 years)
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { createLayer, createSource } from '../environmentProfile.js';
import { resolveEra } from '../architectureStyles.js';
import { assessSanbornCoverage } from './urbanFormAgent.js';

// ---------------------------------------------------------------------------
// Embedded Knowledge Bases
// ---------------------------------------------------------------------------

/**
 * Major construction booms by US city — decades of intense building activity.
 * intensity: 0-1 relative scale. driver: short explanation.
 */
export const CONSTRUCTION_BOOMS = {
  'New York': [
    { decade: 1830, intensity: 0.5, driver: 'Grid plan development above Houston St' },
    { decade: 1850, intensity: 0.6, driver: 'Immigration wave, tenement construction' },
    { decade: 1870, intensity: 0.9, driver: 'Post-Civil War commercial expansion' },
    { decade: 1880, intensity: 0.95, driver: 'Tenement boom, elevated railway expansion' },
    { decade: 1900, intensity: 0.85, driver: 'Skyscraper era, subway construction' },
    { decade: 1920, intensity: 0.9, driver: 'Roaring Twenties office boom' },
    { decade: 1950, intensity: 0.6, driver: 'Post-war modernization, urban renewal' },
    { decade: 1960, intensity: 0.7, driver: 'Glass tower era, World Trade Center' },
  ],
  'Chicago': [
    { decade: 1870, intensity: 1.0, driver: 'Post-Great Fire rebuilding (1871)' },
    { decade: 1880, intensity: 0.9, driver: 'Chicago School commercial building' },
    { decade: 1890, intensity: 0.85, driver: 'Worlds Columbian Exposition growth' },
    { decade: 1920, intensity: 0.8, driver: 'Art Deco office towers' },
  ],
  'San Francisco': [
    { decade: 1850, intensity: 0.8, driver: 'Gold Rush settlement' },
    { decade: 1900, intensity: 0.5, driver: 'Pre-earthquake development' },
    { decade: 1910, intensity: 1.0, driver: 'Post-earthquake/fire rebuilding (1906)' },
    { decade: 1920, intensity: 0.7, driver: 'Continued post-quake expansion' },
  ],
  'Boston': [
    { decade: 1870, intensity: 0.8, driver: 'Post-Great Fire rebuilding (1872), Back Bay fill' },
    { decade: 1880, intensity: 0.7, driver: 'Back Bay residential development' },
    { decade: 1900, intensity: 0.6, driver: 'Streetcar suburb expansion' },
  ],
  'Philadelphia': [
    { decade: 1870, intensity: 0.7, driver: 'Centennial Exposition growth' },
    { decade: 1880, intensity: 0.6, driver: 'Industrial expansion' },
    { decade: 1920, intensity: 0.7, driver: 'Art Deco era' },
  ],
  'Baltimore': [
    { decade: 1900, intensity: 0.5, driver: 'Pre-fire development' },
    { decade: 1910, intensity: 1.0, driver: 'Post-Great Fire rebuilding (1904)' },
    { decade: 1920, intensity: 0.6, driver: 'Continued post-fire expansion' },
  ],
  'Washington': [
    { decade: 1870, intensity: 0.6, driver: 'Post-Civil War federal expansion' },
    { decade: 1900, intensity: 0.7, driver: 'City Beautiful movement, McMillan Plan' },
    { decade: 1930, intensity: 0.8, driver: 'New Deal federal construction' },
  ],
  'New Orleans': [
    { decade: 1830, intensity: 0.7, driver: 'Cotton boom, American sector growth' },
    { decade: 1850, intensity: 0.8, driver: 'Antebellum prosperity peak' },
    { decade: 1890, intensity: 0.5, driver: 'Post-Reconstruction recovery' },
  ],
  'St. Louis': [
    { decade: 1870, intensity: 0.8, driver: 'Railroad hub expansion' },
    { decade: 1900, intensity: 0.7, driver: 'Worlds Fair 1904' },
  ],
  'Pittsburgh': [
    { decade: 1870, intensity: 0.7, driver: 'Steel industry growth' },
    { decade: 1900, intensity: 0.8, driver: 'Industrial peak' },
  ],
  'Detroit': [
    { decade: 1910, intensity: 0.9, driver: 'Automobile industry boom' },
    { decade: 1920, intensity: 1.0, driver: 'Auto industry peak, Fisher Building era' },
  ],
  'Cleveland': [
    { decade: 1890, intensity: 0.7, driver: 'Oil and steel industry expansion' },
    { decade: 1920, intensity: 0.8, driver: 'Terminal Tower era' },
  ],
  'Atlanta': [
    { decade: 1880, intensity: 0.8, driver: 'Post-Reconstruction railroad hub' },
    { decade: 1900, intensity: 0.6, driver: 'New South commercial growth' },
    { decade: 1920, intensity: 0.7, driver: 'Peachtree Street development' },
  ],
  'Denver': [
    { decade: 1880, intensity: 0.9, driver: 'Silver boom, railroad arrival' },
    { decade: 1900, intensity: 0.5, driver: 'Post-silver-crash recovery' },
  ],
  'Seattle': [
    { decade: 1890, intensity: 1.0, driver: 'Post-Great Fire rebuilding (1889), Klondike Gold Rush' },
    { decade: 1900, intensity: 0.7, driver: 'Continued Gold Rush era growth' },
  ],
  'Portland': [
    { decade: 1890, intensity: 0.7, driver: 'Railroad-driven growth' },
    { decade: 1900, intensity: 0.6, driver: 'Lewis and Clark Exposition 1905' },
  ],
  'Baton Rouge': [
    { decade: 1920, intensity: 0.6, driver: 'Oil industry growth, Huey Long era' },
    { decade: 1940, intensity: 0.7, driver: 'Petrochemical industry, wartime expansion' },
    { decade: 1960, intensity: 0.6, driver: 'Suburban expansion' },
  ],
  'Louisville': [
    { decade: 1870, intensity: 0.7, driver: 'Post-war bourbon and tobacco industry' },
    { decade: 1890, intensity: 0.6, driver: 'Main Street commercial district' },
  ],
  'Memphis': [
    { decade: 1890, intensity: 0.7, driver: 'Post-yellow-fever rebuilding, cotton trade' },
    { decade: 1920, intensity: 0.6, driver: 'Beale Street era' },
  ],
  'Nashville': [
    { decade: 1890, intensity: 0.6, driver: 'Centennial Exposition 1897' },
    { decade: 1920, intensity: 0.5, driver: 'Commercial growth' },
  ],
  'Richmond': [
    { decade: 1870, intensity: 0.7, driver: 'Post-Civil War rebuilding' },
    { decade: 1890, intensity: 0.6, driver: 'Tobacco industry expansion' },
  ],
  'Savannah': [
    { decade: 1850, intensity: 0.6, driver: 'Antebellum cotton prosperity' },
    { decade: 1880, intensity: 0.5, driver: 'Post-Reconstruction recovery' },
  ],
  'Charleston': [
    { decade: 1850, intensity: 0.5, driver: 'Antebellum peak' },
    { decade: 1880, intensity: 0.7, driver: 'Post-earthquake rebuilding (1886)' },
  ],
  'Buffalo': [
    { decade: 1880, intensity: 0.8, driver: 'Erie Canal and grain trade' },
    { decade: 1900, intensity: 0.7, driver: 'Pan-American Exposition 1901' },
  ],
};

/**
 * Major fires and disasters that destroyed large portions of a city.
 * Provides hard lower bounds on construction dates for non-fireproof materials.
 */
export const MAJOR_FIRES = [
  { city: 'Chicago', state: 'IL', year: 1871, name: 'Great Chicago Fire',
    materialsDestroyed: ['wood', 'frame'], rebuildMaterials: ['brick', 'stone', 'iron'] },
  { city: 'San Francisco', state: 'CA', year: 1906, name: '1906 Earthquake and Fire',
    materialsDestroyed: ['wood', 'frame', 'brick'], rebuildMaterials: ['concrete', 'steel_frame'] },
  { city: 'Baltimore', state: 'MD', year: 1904, name: 'Great Baltimore Fire',
    materialsDestroyed: ['wood', 'frame'], rebuildMaterials: ['brick', 'stone', 'concrete'] },
  { city: 'Boston', state: 'MA', year: 1872, name: 'Great Boston Fire',
    materialsDestroyed: ['wood', 'frame'], rebuildMaterials: ['brick', 'stone'] },
  { city: 'Seattle', state: 'WA', year: 1889, name: 'Great Seattle Fire',
    materialsDestroyed: ['wood', 'frame'], rebuildMaterials: ['brick', 'stone'] },
  { city: 'Jacksonville', state: 'FL', year: 1901, name: 'Great Fire of Jacksonville',
    materialsDestroyed: ['wood', 'frame'], rebuildMaterials: ['brick', 'concrete'] },
  { city: 'Portland', state: 'OR', year: 1873, name: 'Great Portland Fire',
    materialsDestroyed: ['wood', 'frame'], rebuildMaterials: ['brick', 'stone'] },
  { city: 'Charleston', state: 'SC', year: 1861, name: 'Charleston Fire of 1861',
    materialsDestroyed: ['wood', 'frame'], rebuildMaterials: ['brick'] },
  { city: 'New York', state: 'NY', year: 1835, name: 'Great Fire of New York',
    materialsDestroyed: ['wood', 'frame'], rebuildMaterials: ['brick', 'stone', 'iron'] },
  { city: 'Pittsburgh', state: 'PA', year: 1845, name: 'Great Fire of Pittsburgh',
    materialsDestroyed: ['wood', 'frame'], rebuildMaterials: ['brick', 'stone'] },
  { city: 'St. Louis', state: 'MO', year: 1849, name: 'Great St. Louis Fire',
    materialsDestroyed: ['wood', 'frame'], rebuildMaterials: ['brick', 'stone', 'iron'] },
  { city: 'Richmond', state: 'VA', year: 1865, name: 'Evacuation Fire of Richmond',
    materialsDestroyed: ['wood', 'frame', 'brick'], rebuildMaterials: ['brick', 'stone'] },
];

/**
 * Material-based era ranges — when specific materials were in common use.
 * null means unbounded (material used across all eras).
 */
export const MATERIAL_ERA_RANGES = {
  cast_iron:    { earliest: 1848, latest: 1900, note: 'Cast iron facades, NYC SoHo peak 1860s-1880s' },
  iron:         { earliest: 1840, latest: 1910, note: 'Wrought/cast iron structural' },
  steel_frame:  { earliest: 1885, latest: null, note: 'Home Insurance Building Chicago 1885' },
  concrete:     { earliest: 1900, latest: null, note: 'Reinforced concrete commercial after 1900' },
  terra_cotta:  { earliest: 1870, latest: 1940, note: 'Decorative terra cotta cladding' },
  adobe:        { earliest: null, latest: null, note: 'All eras in SW US' },
  brick:        { earliest: null, latest: null, note: 'All eras, too broad to date alone' },
  wood:         { earliest: null, latest: null, note: 'All eras, too broad to date alone' },
  frame:        { earliest: null, latest: null, note: 'All eras, too broad to date alone' },
  stone:        { earliest: null, latest: null, note: 'All eras, too broad to date alone' },
  stucco:       { earliest: null, latest: null, note: 'All eras' },
  limestone:    { earliest: null, latest: null, note: 'All eras' },
  granite:      { earliest: null, latest: null, note: 'All eras' },
  brownstone:   { earliest: 1840, latest: 1900, note: 'NYC/NE brownstone era' },
};

/**
 * Story count hints — tall buildings require technology that didn't exist before certain dates.
 */
export const STORIES_ERA_HINTS = [
  { minStories: 6,  earliest: 1870, note: 'Passenger elevator (Otis 1857) enables 6+ stories by 1870' },
  { minStories: 10, earliest: 1885, note: 'Steel frame required for 10+ stories' },
  { minStories: 20, earliest: 1900, note: 'Modern skyscraper era' },
  { minStories: 40, earliest: 1930, note: 'Supertall era (Empire State 1931)' },
];

// ---------------------------------------------------------------------------
// Evidence Methods
// ---------------------------------------------------------------------------

/**
 * Method 1: Read explicit dates from GeoJSON properties.
 * @param {object} feature - GeoJSON feature
 * @returns {object|null} Estimate or null
 */
export function dateFromExplicit(feature) {
  const props = feature.properties || {};
  if (props.yearBuilt == null && props.yearDemolished == null) return null;

  return {
    yearBuiltMin: props.yearBuilt || null,
    yearBuiltMax: props.yearBuilt || null,
    yearDemolished: props.yearDemolished || null,
    confidence: 'verified',
    method: 'explicit',
    source: 'GeoJSON properties',
  };
}

/**
 * Method 2: Read OSM start_date tag.
 * @param {object} feature - GeoJSON feature (may have osmTags)
 * @returns {object|null} Estimate or null
 */
export function dateFromOSMTags(feature) {
  const props = feature.properties || {};
  const startDate = props.start_date || props.osmStartDate;
  if (!startDate) return null;

  // Parse year from start_date (handles "1884", "1884-06", "1884-06-15", "~1880", "1880s")
  const parsed = parseStartDate(startDate);
  if (!parsed) return null;

  return {
    yearBuiltMin: parsed.min,
    yearBuiltMax: parsed.max,
    yearDemolished: null,
    confidence: parsed.exact ? 'verified' : 'estimated',
    method: 'osm_start_date',
    source: `OSM start_date="${startDate}"`,
  };
}

/**
 * Parse OSM start_date into a year range.
 * Handles: "1884", "1884-06-15", "~1880", "1880s", "early 19th century", etc.
 */
export function parseStartDate(str) {
  if (!str) return null;
  str = String(str).trim();

  // Exact year: "1884" or "1884-06" or "1884-06-15"
  const exactMatch = str.match(/^(\d{4})(?:-\d{1,2})?(?:-\d{1,2})?$/);
  if (exactMatch) {
    const y = parseInt(exactMatch[1], 10);
    return { min: y, max: y, exact: true };
  }

  // Approximate: "~1880" or "ca. 1880" or "c.1880"
  const approxMatch = str.match(/^[~≈]?\s*(?:ca?\.?\s*)?(\d{4})$/i);
  if (approxMatch) {
    const y = parseInt(approxMatch[1], 10);
    return { min: y - 5, max: y + 5, exact: false };
  }

  // Decade: "1880s"
  const decadeMatch = str.match(/^(\d{3})0s$/);
  if (decadeMatch) {
    const base = parseInt(decadeMatch[1], 10) * 10;
    return { min: base, max: base + 9, exact: false };
  }

  return null;
}

/**
 * Method 3: Sanborn map bracketing.
 * If the building's source is a Sanborn map from year X, and the prior available
 * map is from year Y, the building was built between Y and X.
 *
 * @param {object} sanbornCoverage - From assessSanbornCoverage()
 * @param {string|null} buildingSource - e.g., "sanborn_1894"
 * @returns {object|null} Estimate or null
 */
export function dateFromSanbornBracket(sanbornCoverage, buildingSource) {
  if (!sanbornCoverage || !sanbornCoverage.available) return null;

  // Determine the map year the building was traced from
  let mapYear = null;
  if (buildingSource) {
    const match = buildingSource.match(/sanborn_(\d{4})/);
    if (match) mapYear = parseInt(match[1], 10);
  }

  if (!mapYear) {
    // If no specific source, use the closest Sanborn year as upper bound
    mapYear = sanbornCoverage.closestYear;
  }

  if (!mapYear) return null;

  // Find the prior map year for the lower bound
  const priorYears = sanbornCoverage.years.filter(y => y < mapYear);
  const priorYear = priorYears.length > 0 ? priorYears[priorYears.length - 1] : null;

  return {
    yearBuiltMin: priorYear, // null means unbounded below
    yearBuiltMax: mapYear,
    yearDemolished: null,
    confidence: priorYear ? 'estimated' : 'estimated',
    method: 'sanborn_bracket',
    source: priorYear
      ? `Building on Sanborn ${mapYear} map, prior map ${priorYear}`
      : `Building on Sanborn ${mapYear} map (no earlier map for lower bound)`,
  };
}

/**
 * Method 4: Major fire lower bound.
 * If a city had a major fire, non-fireproof buildings in the affected area
 * were likely rebuilt after the fire.
 *
 * @param {string} location - City name
 * @param {string} material - Building material
 * @returns {object|null} Estimate or null
 */
export function dateFromMajorFire(location, material) {
  const locLower = location.toLowerCase();
  const mat = (material || '').toLowerCase();

  for (const fire of MAJOR_FIRES) {
    const cityMatch = locLower.includes(fire.city.toLowerCase());
    if (!cityMatch) continue;

    // Check if this material would have been destroyed
    const destroyed = fire.materialsDestroyed.some(m => mat.includes(m));
    // Check if this material is a rebuild material
    const isRebuild = fire.rebuildMaterials.some(m => mat.includes(m));

    if (destroyed || isRebuild) {
      return {
        yearBuiltMin: fire.year,
        yearBuiltMax: null,
        yearDemolished: null,
        confidence: 'estimated',
        method: 'post_fire_rebuild',
        source: `${fire.name} (${fire.year}) — ${destroyed ? 'material destroyed' : 'rebuild material'}`,
      };
    }
  }

  return null;
}

/**
 * Method 5: Material + stories era range.
 * @param {string} material - Building material
 * @param {number} stories - Story count
 * @returns {object|null} Estimate or null
 */
export function dateFromMaterialEra(material, stories) {
  const mat = (material || '').toLowerCase();
  const range = MATERIAL_ERA_RANGES[mat];

  let earliest = range?.earliest || null;
  let latest = range?.latest || null;

  // Apply story count hints (tighter lower bound)
  for (const hint of STORIES_ERA_HINTS) {
    if (stories >= hint.minStories && (earliest == null || hint.earliest > earliest)) {
      earliest = hint.earliest;
    }
  }

  // If no bounds at all, this method can't help
  if (earliest == null && latest == null) return null;

  return {
    yearBuiltMin: earliest,
    yearBuiltMax: latest,
    yearDemolished: null,
    confidence: 'inferred',
    method: 'material_era',
    source: `${mat} ${stories}-story → ${earliest || '?'}–${latest || 'present'}`,
  };
}

/**
 * Method 6: Construction boom decade.
 * @param {string} location - City name
 * @returns {object|null} Estimate with peak decade range, or null
 */
export function dateFromConstructionBoom(location) {
  const booms = findBooms(location);
  if (!booms || booms.length === 0) return null;

  // Find the highest-intensity boom decade
  let peak = booms[0];
  for (const b of booms) {
    if (b.intensity > peak.intensity) peak = b;
  }

  return {
    yearBuiltMin: peak.decade,
    yearBuiltMax: peak.decade + 9,
    yearDemolished: null,
    confidence: 'inferred',
    method: 'construction_boom',
    source: `${location} peak building decade ${peak.decade}s — ${peak.driver}`,
  };
}

/**
 * Method 7: Neighborhood heuristic.
 * If 3+ nearby buildings have date estimates within a 20-year window,
 * undated buildings in the same cluster likely date to the same period.
 *
 * @param {Array<{yearBuiltMin: number|null, yearBuiltMax: number|null}|null>} allEstimates
 * @param {number} featureIndex - Index of the feature to estimate
 * @returns {object|null} Estimate or null
 */
export function dateFromNeighborhood(allEstimates, featureIndex) {
  // Collect dated neighbors (all other features with yearBuilt estimates)
  const dated = [];
  for (let i = 0; i < allEstimates.length; i++) {
    if (i === featureIndex) continue;
    const est = allEstimates[i];
    if (!est || (est.yearBuiltMin == null && est.yearBuiltMax == null)) continue;

    const mid = estimateMidpoint(est.yearBuiltMin, est.yearBuiltMax);
    if (mid != null) dated.push(mid);
  }

  if (dated.length < 3) return null;

  // Find the cluster: median ± 10 years
  dated.sort((a, b) => a - b);
  const median = dated[Math.floor(dated.length / 2)];

  // Count how many fall within ±10 years of median
  const inCluster = dated.filter(y => Math.abs(y - median) <= 10);
  if (inCluster.length < 3) return null;

  return {
    yearBuiltMin: median - 10,
    yearBuiltMax: median + 10,
    yearDemolished: null,
    confidence: 'inferred',
    method: 'neighborhood',
    source: `${inCluster.length} nearby buildings cluster around ${median} (±10yr)`,
  };
}

// ---------------------------------------------------------------------------
// Evidence Fusion
// ---------------------------------------------------------------------------

/**
 * Fuse multiple estimates into a single best estimate.
 * Intersects ranges, picks midpoint, takes highest-confidence method.
 *
 * @param {object[]} estimates - Array of estimate objects
 * @returns {object} Fused estimate { yearBuilt, yearDemolished, confidence, method, range }
 */
export function fuseEstimates(estimates) {
  if (!estimates || estimates.length === 0) {
    return { yearBuilt: null, yearDemolished: null, confidence: 'undated', method: 'none', range: [null, null] };
  }

  // Sort by confidence rank
  const CONFIDENCE_RANK = { verified: 3, estimated: 2, inferred: 1 };
  const sorted = [...estimates].sort((a, b) =>
    (CONFIDENCE_RANK[b.confidence] || 0) - (CONFIDENCE_RANK[a.confidence] || 0)
  );

  // Start with the highest-confidence range and intersect with others
  let rangeMin = null;
  let rangeMax = null;
  let bestConfidence = sorted[0].confidence;
  let bestMethod = sorted[0].method;
  let yearDemolished = null;

  for (const est of sorted) {
    if (est.yearDemolished != null) yearDemolished = est.yearDemolished;

    const eMin = est.yearBuiltMin;
    const eMax = est.yearBuiltMax;

    if (rangeMin == null && rangeMax == null) {
      // First estimate — adopt its range
      rangeMin = eMin;
      rangeMax = eMax;
      continue;
    }

    // Intersect ranges
    const newMin = intersectMin(rangeMin, eMin);
    const newMax = intersectMax(rangeMax, eMax);

    // Check for empty intersection (disjoint ranges)
    if (newMin != null && newMax != null && newMin > newMax) {
      // Ranges are disjoint — keep the higher-confidence range
      continue;
    }

    rangeMin = newMin;
    rangeMax = newMax;
  }

  // Compute midpoint as yearBuilt estimate
  const yearBuilt = estimateMidpoint(rangeMin, rangeMax);

  return {
    yearBuilt,
    yearDemolished,
    confidence: bestConfidence,
    method: bestMethod,
    range: [rangeMin, rangeMax],
  };
}

// ---------------------------------------------------------------------------
// Main Agent Function
// ---------------------------------------------------------------------------

/**
 * Research building dates for a Place×Time.
 *
 * @param {Object} params
 * @param {string} params.location - Location string
 * @param {number} params.year - Target year
 * @param {number} [params.lat] - Latitude
 * @param {number} [params.lon] - Longitude
 * @param {string} [params.countryCode] - ISO country code
 * @param {string} [params.terrainDataPath] - Path to terrain-data/{slug}/
 * @param {object} [params.urbanFormLayer] - Result from urbanFormAgent
 * @param {object[]} [params.osmBuildings] - Pre-fetched OSM building features
 * @returns {object} Environment Profile layer { data, confidence, sources, knownCompromises }
 */
export function researchBuildingDates({
  location, year, lat, lon, countryCode,
  terrainDataPath, urbanFormLayer, osmBuildings
}) {
  // Step 1: Load building features
  const { features, buildingSource } = loadBuildingFeatures(terrainDataPath, urbanFormLayer);

  // Merge OSM buildings if provided
  if (osmBuildings && Array.isArray(osmBuildings)) {
    const hasTerrainBuildings = features.length > 0;
    for (const f of osmBuildings) {
      if (hasTerrainBuildings) {
        // Only supplement with OSM buildings that have start_date (avoid duplicating footprints)
        const sd = f.properties?.start_date || f.properties?.osmStartDate;
        if (sd) features.push(f);
      } else {
        // No terrain buildings — use all OSM buildings as primary source
        features.push(f);
      }
    }
  }

  const isUS = !countryCode || countryCode === 'US';

  if (features.length === 0) {
    const compromises = ['No building footprints available — date estimation not possible'];
    if (!isUS) compromises.push('Non-US location — construction boom and fire databases are US-only');
    return createLayer(
      {
        buildingInventory: [],
        dateCompleteness: 0,
        datingMethods: {},
        totalBuildings: 0,
        buildingsExistingInYear: 0,
        targetYear: year,
      },
      0.2,
      [createSource('no_buildings', 'procedural_generation', 'No building footprints available')],
      compromises
    );
  }

  // Step 2: Assess Sanborn coverage
  const sanbornCoverage = isUS ? assessSanbornCoverage(location, year) : null;

  // Step 3: Run evidence methods 1-6 per building
  const perBuildingEstimates = features.map((feature) => {
    const props = feature.properties || {};
    const material = props.material || '';
    const stories = props.stories || 0;
    const estimates = [];

    // Method 1: Explicit dates
    const explicit = dateFromExplicit(feature);
    if (explicit) estimates.push(explicit);

    // Method 2: OSM tags
    const osm = dateFromOSMTags(feature);
    if (osm) estimates.push(osm);

    // Method 3: Sanborn bracket
    const sanborn = dateFromSanbornBracket(sanbornCoverage, buildingSource);
    if (sanborn) estimates.push(sanborn);

    // Method 4: Major fire
    const fire = dateFromMajorFire(location, material);
    if (fire) estimates.push(fire);

    // Method 5: Material era
    const matEra = dateFromMaterialEra(material, stories);
    if (matEra) estimates.push(matEra);

    // Method 6: Construction boom
    const boom = dateFromConstructionBoom(location);
    if (boom) estimates.push(boom);

    return estimates;
  });

  // Step 4: Fuse per-building estimates (first pass)
  const fusedFirst = perBuildingEstimates.map(estimates => fuseEstimates(estimates));

  // Step 5: Neighborhood heuristic pass (method 7)
  const finalEstimates = fusedFirst.map((fused, i) => {
    if (fused.confidence === 'verified') return fused; // Already confident, skip

    const neighborEst = dateFromNeighborhood(fusedFirst, i);
    if (neighborEst) {
      // Re-fuse with neighborhood estimate
      const allEst = [...perBuildingEstimates[i], neighborEst];
      return fuseEstimates(allEst);
    }
    return fused;
  });

  // Step 6: Build inventory
  const inventory = features.map((feature, i) => {
    const est = finalEstimates[i];
    return {
      featureIndex: i,
      address: feature.properties?.address || null,
      yearBuilt: est.yearBuilt,
      yearDemolished: est.yearDemolished,
      confidence: est.confidence,
      method: est.method,
      range: est.range,
    };
  });

  // Step 7: Filter by year and compute stats
  const existingInYear = inventory.filter(b => {
    if (b.yearBuilt != null && b.yearBuilt > year) return false;
    if (b.yearDemolished != null && b.yearDemolished <= year) return false;
    return true;
  });

  const methodCounts = {};
  for (const b of inventory) {
    const m = b.method || 'undated';
    if (!methodCounts[m]) methodCounts[m] = { count: 0 };
    methodCounts[m].count++;
  }

  const dated = inventory.filter(b => b.yearBuilt != null);
  const dateCompleteness = features.length > 0
    ? Math.round((dated.length / features.length) * 100) / 100
    : 0;

  // Step 8: Confidence for the overall layer
  let layerConfidence = 0.3;
  if (dateCompleteness > 0.5) layerConfidence += 0.15;
  if (dateCompleteness > 0.8) layerConfidence += 0.1;
  if (sanbornCoverage?.available) layerConfidence += 0.1;
  const hasVerified = inventory.some(b => b.confidence === 'verified');
  if (hasVerified) layerConfidence += 0.1;
  layerConfidence = Math.min(Math.round(layerConfidence * 100) / 100, 0.85);

  // Step 9: Build data
  const data = {
    buildingInventory: inventory,
    dateCompleteness,
    datingMethods: methodCounts,
    totalBuildings: features.length,
    buildingsExistingInYear: existingInYear.length,
    targetYear: year,
    sanbornBracket: sanbornCoverage?.available
      ? { nearestBefore: sanbornCoverage.nearestBefore, nearestAfter: sanbornCoverage.nearestAfter }
      : null,
  };

  // Step 10: Sources
  const sources = [];
  if (buildingSource) {
    sources.push(createSource('building_footprints', 'geospatial_data',
      `Building footprints from ${buildingSource}`,
      { citation: `${features.length} building features loaded` }));
  }
  if (sanbornCoverage?.available) {
    sources.push(createSource('sanborn_coverage', 'historical_map',
      `Sanborn map coverage for ${location}`,
      { citation: `Available years: ${sanbornCoverage.years.join(', ')}` }));
  }
  if (methodCounts.post_fire_rebuild) {
    const fires = MAJOR_FIRES.filter(f => location.toLowerCase().includes(f.city.toLowerCase()));
    for (const f of fires) {
      sources.push(createSource(`fire_${f.year}`, 'historical_event',
        f.name, { citation: `${f.city} ${f.year} — constrains building dates` }));
    }
  }
  sources.push(createSource('material_era_db', 'embedded_database',
    'Material and stories era ranges',
    { citation: `${Object.keys(MATERIAL_ERA_RANGES).length} material types, ${STORIES_ERA_HINTS.length} story-count hints` }));

  // Step 11: Compromises
  const compromises = [];
  const undatedCount = inventory.filter(b => b.yearBuilt == null).length;
  if (undatedCount > 0) {
    compromises.push(`${undatedCount} of ${features.length} buildings could not be dated by any method`);
  }
  const inferredCount = inventory.filter(b => b.confidence === 'inferred').length;
  if (inferredCount > 0) {
    compromises.push(`${inferredCount} buildings dated by inference only (material/era heuristics, ±10-20yr accuracy)`);
  }
  if (!sanbornCoverage?.available) {
    compromises.push('No Sanborn map coverage — bracketing method unavailable');
  }
  if (!isUS) {
    compromises.push('Non-US location — construction boom and fire databases are US-only');
  }

  return createLayer(data, layerConfidence, sources, compromises);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load building features from terrain data or urbanForm layer.
 */
function loadBuildingFeatures(terrainDataPath, urbanFormLayer) {
  let features = [];
  let buildingSource = null;

  // Try loading from terrain data path
  if (terrainDataPath) {
    const buildingsPath = path.join(terrainDataPath, 'buildings.geojson');
    if (existsSync(buildingsPath)) {
      try {
        const geojson = JSON.parse(readFileSync(buildingsPath, 'utf-8'));
        features = geojson.features || [];
        buildingSource = urbanFormLayer?.data?.buildingSource || 'geojson';
      } catch { /* ignore parse errors */ }
    }
  }

  // Fallback: check urbanForm layer for path
  if (features.length === 0 && urbanFormLayer?.data?.footprintsPath) {
    const fp = urbanFormLayer.data.footprintsPath;
    if (existsSync(fp)) {
      try {
        const geojson = JSON.parse(readFileSync(fp, 'utf-8'));
        features = geojson.features || [];
        buildingSource = urbanFormLayer.data.buildingSource || 'geojson';
      } catch { /* ignore parse errors */ }
    }
  }

  return { features, buildingSource };
}

/**
 * Find construction booms for a location by partial city name match.
 */
export function findBooms(location) {
  if (!location) return null;
  const locLower = location.toLowerCase();

  for (const [city, booms] of Object.entries(CONSTRUCTION_BOOMS)) {
    if (locLower.includes(city.toLowerCase())) return booms;
  }
  return null;
}

/**
 * Intersect minimum bounds — take the tighter (larger) minimum.
 */
function intersectMin(a, b) {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

/**
 * Intersect maximum bounds — take the tighter (smaller) maximum.
 */
function intersectMax(a, b) {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}

/**
 * Estimate midpoint of a range, handling null bounds.
 */
export function estimateMidpoint(min, max) {
  if (min != null && max != null) return Math.round((min + max) / 2);
  if (min != null) return min;
  if (max != null) return max;
  return null;
}
