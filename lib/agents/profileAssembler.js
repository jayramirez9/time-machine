/**
 * Profile Assembler — Orchestrator Agent (Phase 7.7)
 *
 * Invokes specialist research agents and assembles a complete Environment Profile
 * with confidence ratings, source citations, and an accuracy manifest.
 *
 * This is the top-level entry point for the Phase 7 agent pipeline.
 */

import { geocode } from '../openmeteo.js';
import {
  createProfileScaffold,
  generateAccuracyManifest,
  validateProfile,
  SCHEMA_VERSION
} from '../environmentProfile.js';

import { researchWeather } from './weatherAgent.js';
import { researchEcology } from './ecologyAgent.js';
import { researchUrbanForm } from './urbanFormAgent.js';
import { researchCulture } from './culturalAgent.js';
import { researchPhotoArchives } from './photoArchiveAgent.js';
import { researchMaterials, researchInfrastructure } from './materialsInfraAgent.js';

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
    terrainDataPath
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
  if (!skip.has('culture') || !skip.has('music')) {
    parallelTasks.push(
      runAgent('culture+music', async () => {
        const result = researchCulture(agentParams);
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
  const slug = (geo.name || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return `${slug}_${year}`;
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
