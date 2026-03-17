import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  assembleProfile,
  buildProfileId,
  buildReviewChecklist
} from '../lib/agents/profileAssembler.js';

import {
  validateProfile,
  LAYER_NAMES,
  populatedLayerCount
} from '../lib/environmentProfile.js';

// ---------------------------------------------------------------------------
// Helpers — save/restore env vars
// ---------------------------------------------------------------------------

let savedEnv;

function setEnv(vars) {
  savedEnv = {};
  for (const [key, val] of Object.entries(vars)) {
    savedEnv[key] = process.env[key];
    if (val === null || val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }
}

function restoreEnv() {
  if (!savedEnv) return;
  for (const [key, val] of Object.entries(savedEnv)) {
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }
  savedEnv = null;
}

const TEST_GEO = {
  lat: 40.7128,
  lon: -74.006,
  name: 'New York, New York, United States',
  timezone: 'America/New_York',
  countryCode: 'US',
  population: 8000000
};

// ---------------------------------------------------------------------------
// buildProfileId
// ---------------------------------------------------------------------------

describe('Profile Assembler — buildProfileId', () => {
  it('generates slug from geo name + year', () => {
    const id = buildProfileId({ name: 'New York, NY' }, 1884);
    assert.equal(id, 'new_york_ny_1884');
  });

  it('handles special characters', () => {
    const id = buildProfileId({ name: "Baton Rouge, LA (USA)" }, 1978);
    assert.equal(id, 'baton_rouge_la_usa_1978');
  });

  it('handles missing name', () => {
    const id = buildProfileId({}, 2020);
    assert.equal(id, 'unknown_2020');
  });
});

// ---------------------------------------------------------------------------
// assembleProfile — offline (no geocoding, no NOAA station probe)
// ---------------------------------------------------------------------------

describe('Profile Assembler — assembleProfile', () => {
  afterEach(() => restoreEnv());

  it('produces a valid Environment Profile', async () => {
    setEnv({ NOAA_API_TOKEN: undefined, VISUALCROSSING_API_KEY: undefined });

    const profile = await assembleProfile({
      location: 'New York, NY',
      year: 1884,
      geo: TEST_GEO,
      probeStation: false
    });

    assert.ok(profile);
    assert.equal(profile.schemaVersion, 1);
    assert.ok(profile.id.includes('1884'));
    assert.equal(profile.date.year, 1884);
  });

  it('passes validation', async () => {
    setEnv({ NOAA_API_TOKEN: undefined, VISUALCROSSING_API_KEY: undefined });

    const profile = await assembleProfile({
      location: 'New York, NY',
      year: 1884,
      geo: TEST_GEO,
      probeStation: false
    });

    const { valid, errors } = validateProfile(profile);
    assert.ok(valid, `Validation errors: ${errors.join(', ')}`);
  });

  it('populates at least 7 layers', async () => {
    setEnv({ NOAA_API_TOKEN: undefined, VISUALCROSSING_API_KEY: undefined });

    const profile = await assembleProfile({
      location: 'New York, NY',
      year: 1884,
      geo: TEST_GEO,
      probeStation: false
    });

    // weather, ecology, urbanForm, materials, infrastructure, culture, music = 7
    // soundscape is NOT populated (no audio profile reference)
    // terrain is NOT populated (no terrainDataPath)
    const count = populatedLayerCount(profile);
    assert.ok(count >= 7, `Expected >= 7 layers, got ${count}`);
  });

  it('has accuracy manifest', async () => {
    setEnv({ NOAA_API_TOKEN: undefined, VISUALCROSSING_API_KEY: undefined });

    const profile = await assembleProfile({
      location: 'New York, NY',
      year: 1884,
      geo: TEST_GEO,
      probeStation: false
    });

    assert.ok(profile.accuracyManifest);
    assert.ok(profile.accuracyManifest.overallConfidence > 0);
    assert.ok(profile.accuracyManifest.layerSummary);
    assert.ok(Array.isArray(profile.accuracyManifest.gaps));
    assert.ok(Array.isArray(profile.accuracyManifest.reviewChecklist));
  });

  it('sets generatedBy to agent_pipeline_v1', async () => {
    setEnv({ NOAA_API_TOKEN: undefined, VISUALCROSSING_API_KEY: undefined });

    const profile = await assembleProfile({
      location: 'Test',
      year: 2020,
      geo: { ...TEST_GEO, name: 'Test' },
      probeStation: false
    });

    assert.equal(profile.generatedBy, 'agent_pipeline_v1');
  });

  it('sets location from geo', async () => {
    setEnv({ NOAA_API_TOKEN: undefined, VISUALCROSSING_API_KEY: undefined });

    const profile = await assembleProfile({
      location: 'New York, NY',
      year: 1884,
      geo: TEST_GEO,
      probeStation: false
    });

    assert.equal(profile.location.lat, 40.7128);
    assert.equal(profile.location.lon, -74.006);
    assert.equal(profile.location.timezone, 'America/New_York');
  });

  it('respects skipLayers', async () => {
    setEnv({ NOAA_API_TOKEN: undefined, VISUALCROSSING_API_KEY: undefined });

    const profile = await assembleProfile({
      location: 'Test',
      year: 2020,
      geo: { ...TEST_GEO, name: 'Test' },
      probeStation: false,
      skipLayers: ['ecology', 'culture', 'music']
    });

    assert.equal(profile.layers.ecology, null);
    assert.equal(profile.layers.culture, null);
    assert.equal(profile.layers.music, null);
    // But weather should still be populated
    assert.ok(profile.layers.weather);
  });

  it('calls onProgress callback', async () => {
    setEnv({ NOAA_API_TOKEN: undefined, VISUALCROSSING_API_KEY: undefined });

    const events = [];
    await assembleProfile({
      location: 'Test',
      year: 2020,
      geo: { ...TEST_GEO, name: 'Test' },
      probeStation: false,
      onProgress: (layer, status) => events.push(`${layer}:${status}`)
    });

    assert.ok(events.includes('geocode:done'));
    assert.ok(events.includes('weather:started'));
    assert.ok(events.includes('weather:done'));
    assert.ok(events.includes('complete:done'));
  });

  it('handles month in name', async () => {
    setEnv({ NOAA_API_TOKEN: undefined, VISUALCROSSING_API_KEY: undefined });

    const profile = await assembleProfile({
      location: 'Test',
      year: 1884,
      month: 6,
      geo: { ...TEST_GEO, name: 'Test' },
      probeStation: false
    });

    assert.ok(profile.name.includes('June'));
    assert.equal(profile.date.month, 6);
  });
});

// ---------------------------------------------------------------------------
// buildReviewChecklist
// ---------------------------------------------------------------------------

describe('Profile Assembler — buildReviewChecklist', () => {
  it('flags missing soundscape', () => {
    const profile = {
      layers: { weather: { data: {}, confidence: 0.8 }, soundscape: null, terrain: null }
    };
    const checklist = buildReviewChecklist(profile);
    assert.ok(checklist.some(c => c.includes('soundscape') || c.includes('audio')));
  });

  it('flags missing terrain', () => {
    const profile = {
      layers: { terrain: null }
    };
    const checklist = buildReviewChecklist(profile);
    assert.ok(checklist.some(c => c.includes('terrain') || c.includes('Terrain')));
  });

  it('flags daily weather interpolation', () => {
    const profile = {
      layers: { weather: { data: { dataType: 'daily' }, confidence: 0.6 } }
    };
    const checklist = buildReviewChecklist(profile);
    assert.ok(checklist.some(c => c.includes('interpolation')));
  });
});
