/**
 * Profile Assembler — Orchestrator Agent (Phase 7.7)
 *
 * Invokes specialist research agents and assembles a complete Environment Profile
 * with confidence ratings, source citations, and an accuracy manifest.
 *
 * This is the top-level entry point for the Phase 7 agent pipeline.
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { geocode } from '../openmeteo.js';
import {
  createProfileScaffold,
  generateAccuracyManifest,
  validateProfile,
  SCHEMA_VERSION
} from '../environmentProfile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

import { researchWeather } from './weatherAgent.js';
import { researchEcology } from './ecologyAgent.js';
import { researchUrbanForm } from './urbanFormAgent.js';
import { researchCulture } from './culturalAgent.js';
import { researchPhotoArchives } from './photoArchiveAgent.js';
import { researchMaterials, researchInfrastructure } from './materialsInfraAgent.js';

// ---------------------------------------------------------------------------
// Terrain auto-detection
// ---------------------------------------------------------------------------

const MAX_TERRAIN_DISTANCE_KM = 2;

/**
 * Haversine distance in km between two lat/lon points.
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Scan terrain-data/ for a directory whose metadata.json lat/lon is within
 * MAX_TERRAIN_DISTANCE_KM of the target coordinates.
 *
 * @param {number} lat - Target latitude
 * @param {number} lon - Target longitude
 * @param {string} [terrainRoot] - Path to terrain-data/ (default: PROJECT_ROOT/terrain-data)
 * @returns {{ path: string, slug: string, distanceKm: number } | null}
 */
export function findTerrainData(lat, lon, terrainRoot) {
  const root = terrainRoot || path.join(PROJECT_ROOT, 'terrain-data');
  if (!existsSync(root)) return null;

  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }

  let best = null;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(root, entry.name, 'metadata.json');
    if (!existsSync(metaPath)) continue;

    let meta;
    try {
      meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    } catch {
      continue;
    }

    if (typeof meta.lat !== 'number' || typeof meta.lon !== 'number') continue;

    const dist = haversineKm(lat, lon, meta.lat, meta.lon);
    if (dist <= MAX_TERRAIN_DISTANCE_KM && (!best || dist < best.distanceKm)) {
      best = {
        path: path.join(root, entry.name),
        slug: entry.name,
        distanceKm: Math.round(dist * 1000) / 1000
      };
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// Assembler
// ---------------------------------------------------------------------------

/**
 * Assemble a complete Environment Profile for a Place×Time.
 *
 * @param {Object} params
 * @param {string} params.location - Location string (e.g., "New York, NY")
 * @param {number} params.year - Target year
 * @param {number} [params.month] - Target month (1-12, optional)
 * @param {number} [params.day] - Target day (1-31, optional)
 * @param {string} [params.terrainDataPath] - Path to terrain-data directory (optional)
 * @param {Object} [params.geo] - Pre-resolved geocode result (optional)
 * @param {boolean} [params.probeStation=true] - Whether to probe NOAA stations (requires network)
 * @param {string[]} [params.skipLayers] - Layer names to skip (e.g., ['ecology', 'culture'])
 * @param {Function} [params.onProgress] - Progress callback: (layerName, status) => void
 * @returns {Promise<Object>} Complete Environment Profile
 */
export async function assembleProfile({
  location,
  year,
  month = null,
  day = null,
  terrainDataPath = null,
  geo: preGeo = null,
  probeStation = true,
  skipLayers = [],
  onProgress = null
}) {
  const progress = onProgress || (() => {});

  // Step 1: Geocode
  progress('geocode', 'started');
  const geo = preGeo || await geocode(location);
  progress('geocode', 'done');

  // Step 2: Build profile scaffold
  const id = buildProfileId(geo, year);
  const name = `${geo.name} — ${month ? `${monthName(month)} ` : ''}${year}`;
  const profile = createProfileScaffold(
    id,
    name,
    {
      name: geo.name,
      lat: geo.lat,
      lon: geo.lon,
      timezone: geo.timezone || null,
      countryCode: geo.countryCode || null
    },
    { year, month, day }
  );

  profile.description = `Environment Profile for ${geo.name} in ${year}. ` +
    `Auto-assembled by the Phase 7 agent pipeline.`;

  // Step 2b: Auto-detect terrain data if not explicitly provided
  let resolvedTerrainPath = terrainDataPath;
  if (!resolvedTerrainPath) {
    const match = findTerrainData(geo.lat, geo.lon);
    if (match) {
      resolvedTerrainPath = match.path;
      console.log(`[ProfileAssembler] Auto-detected terrain: ${match.slug} (${match.distanceKm}km away)`);
    }
  }

  // Step 3: Run research agents (parallel where possible)
  const skip = new Set(skipLayers);
  const agentParams = {
    location: geo.name,
    year,
    month,
    lat: geo.lat,
    lon: geo.lon,
    countryCode: geo.countryCode,
    population: geo.population,
    terrainDataPath: resolvedTerrainPath
  };

  // Group 1: Independent agents (can run in parallel)
  const parallelTasks = [];

  if (!skip.has('weather')) {
    parallelTasks.push(
      runAgent('weather', () => researchWeather({
        location: geo.name, year, geo, probeStation
      }), progress)
    );
  }

  if (!skip.has('ecology')) {
    parallelTasks.push(
      runAgent('ecology', () => researchEcology(agentParams), progress)
    );
  }

  if (!skip.has('urbanForm')) {
    parallelTasks.push(
      runAgent('urbanForm', () => researchUrbanForm(agentParams), progress)
    );
  }

  if (!skip.has('materials')) {
    parallelTasks.push(
      runAgent('materials', () => researchMaterials(agentParams), progress)
    );
  }

  if (!skip.has('infrastructure')) {
    parallelTasks.push(
      runAgent('infrastructure', () => researchInfrastructure(agentParams), progress)
    );
  }

  // Cultural agent returns both culture + music layers
  // Pass enrichWithNewspapers=true to search Chronicling America for primary sources
  if (!skip.has('culture') || !skip.has('music')) {
    parallelTasks.push(
      runAgent('culture+music', async () => {
        const result = await researchCulture({
          ...agentParams,
          enrichWithNewspapers: true
        });
        return result; // { culture, music }
      }, progress)
    );
  }

  if (!skip.has('photoArchives')) {
    parallelTasks.push(
      runAgent('photoArchives', () => researchPhotoArchives(agentParams), progress)
    );
  }

  // Wait for all agents
  const results = await Promise.allSettled(parallelTasks);

  // Step 4: Merge results into profile
  for (const result of results) {
    if (result.status === 'rejected') continue; // errors logged in runAgent
    const { layer, data } = result.value;

    if (layer === 'culture+music') {
      if (!skip.has('culture')) profile.layers.culture = data.culture;
      if (!skip.has('music')) profile.layers.music = data.music;
    } else if (layer === 'photoArchives') {
      // Photo archives don't map to a standard layer — store as metadata
      // The photo data becomes part of the urbanForm or a future layer
      // For now, attach as _photoArchives on the profile
      profile._photoArchives = data;
    } else {
      profile.layers[layer] = data;
    }
  }

  // Step 5: Generate accuracy manifest
  progress('manifest', 'started');
  profile.accuracyManifest = generateAccuracyManifest(profile);

  // Add review checklist based on layer confidence
  profile.accuracyManifest.reviewChecklist = buildReviewChecklist(profile);
  progress('manifest', 'done');

  // Step 6: Finalize
  profile.generatedAt = new Date().toISOString();
  profile.generatedBy = 'agent_pipeline_v1';

  // Validate
  const { valid, errors } = validateProfile(profile);
  if (!valid) {
    profile._validationErrors = errors;
  }

  progress('complete', 'done');
  return profile;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function runAgent(layer, fn, progress) {
  progress(layer, 'started');
  try {
    const data = await fn();
    progress(layer, 'done');
    return { layer, data };
  } catch (err) {
    progress(layer, 'error');
    console.error(`[ProfileAssembler] ${layer} agent failed:`, err.message);
    return { layer, data: null };
  }
}

function buildProfileId(geo, year) {
  // Build short ID: city_region_year (e.g. new_york_ny_1884, london_gb_1888)
  const parts = (geo.name || 'unknown').split(',').map(s => s.trim());
  const city = parts[0] || 'unknown';
  // For US locations use state abbreviation (admin1), otherwise use countryCode
  const region = geo.countryCode === 'US' && parts.length >= 2
    ? toStateAbbr(parts[1])
    : (geo.countryCode || parts[1] || '').toLowerCase();
  const slug = [city, region].filter(Boolean).join('_')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return `${slug}_${year}`;
}

/** Map full US state name to two-letter abbreviation. */
function toStateAbbr(state) {
  const abbrs = {
    'alabama': 'al', 'alaska': 'ak', 'arizona': 'az', 'arkansas': 'ar',
    'california': 'ca', 'colorado': 'co', 'connecticut': 'ct', 'delaware': 'de',
    'florida': 'fl', 'georgia': 'ga', 'hawaii': 'hi', 'idaho': 'id',
    'illinois': 'il', 'indiana': 'in', 'iowa': 'ia', 'kansas': 'ks',
    'kentucky': 'ky', 'louisiana': 'la', 'maine': 'me', 'maryland': 'md',
    'massachusetts': 'ma', 'michigan': 'mi', 'minnesota': 'mn', 'mississippi': 'ms',
    'missouri': 'mo', 'montana': 'mt', 'nebraska': 'ne', 'nevada': 'nv',
    'new hampshire': 'nh', 'new jersey': 'nj', 'new mexico': 'nm', 'new york': 'ny',
    'north carolina': 'nc', 'north dakota': 'nd', 'ohio': 'oh', 'oklahoma': 'ok',
    'oregon': 'or', 'pennsylvania': 'pa', 'rhode island': 'ri', 'south carolina': 'sc',
    'south dakota': 'sd', 'tennessee': 'tn', 'texas': 'tx', 'utah': 'ut',
    'vermont': 'vt', 'virginia': 'va', 'washington': 'wa', 'west virginia': 'wv',
    'wisconsin': 'wi', 'wyoming': 'wy', 'district of columbia': 'dc'
  };
  const key = state.trim().toLowerCase();
  return abbrs[key] || key;  // Pass through if already abbreviated or unrecognized
}

function monthName(m) {
  const names = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return names[m] || '';
}

function buildReviewChecklist(profile) {
  const checklist = [];
  const layers = profile.layers;

  if (layers.weather) {
    if (layers.weather.data?.dataType === 'daily') {
      checklist.push('Verify sub-daily weather interpolation is plausible');
    }
  }

  if (layers.urbanForm) {
    if (layers.urbanForm.confidence < 0.6) {
      checklist.push('Urban form data is low confidence — verify building footprints if available');
    }
  }

  if (layers.ecology) {
    checklist.push('Review species pool for plausibility — check introduction dates');
  }

  if (layers.culture) {
    if (layers.culture.confidence < 0.5) {
      checklist.push('Cultural data is assumed — verify against period sources');
    }
  }

  if (layers.infrastructure) {
    checklist.push('Verify infrastructure dates against local history (national averages may not apply)');
  }

  if (!layers.soundscape) {
    checklist.push('No soundscape layer — audio profile needs to be generated or referenced');
  }

  if (!layers.terrain) {
    checklist.push('No terrain layer — terrain data needs to be fetched');
  }

  return checklist;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { buildProfileId, buildReviewChecklist };
