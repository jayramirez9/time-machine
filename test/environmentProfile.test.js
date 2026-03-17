import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  SCHEMA_VERSION,
  LAYER_NAMES,
  SOURCE_TYPES,
  CONFIDENCE_LABELS,
  validateProfile,
  validateLayerEnvelope,
  validateAccuracyManifest,
  loadProfile,
  confidenceLabel,
  getLayer,
  getLayerData,
  populatedLayerCount,
  missingLayers,
  generateAccuracyManifest,
  createLayer,
  createSource,
  createProfileScaffold
} from '../lib/environmentProfile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILES_DIR = resolve(__dirname, '..', 'profiles');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minimalProfile(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'test_profile',
    name: 'Test Profile',
    location: { name: 'Test', lat: 40.0, lon: -74.0 },
    date: { year: 2024 },
    layers: {
      terrain: createLayer({ demSource: 'test' }, 0.9, [
        { id: 'src1', type: 'online_database', name: 'Test Source' }
      ], [])
    },
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('Constants', () => {
  it('exports SCHEMA_VERSION 1', () => {
    assert.equal(SCHEMA_VERSION, 1);
  });

  it('has 9 layer names matching PRD', () => {
    assert.equal(LAYER_NAMES.length, 9);
    assert.ok(LAYER_NAMES.includes('terrain'));
    assert.ok(LAYER_NAMES.includes('weather'));
    assert.ok(LAYER_NAMES.includes('soundscape'));
    assert.ok(LAYER_NAMES.includes('urbanForm'));
    assert.ok(LAYER_NAMES.includes('ecology'));
    assert.ok(LAYER_NAMES.includes('culture'));
    assert.ok(LAYER_NAMES.includes('music'));
    assert.ok(LAYER_NAMES.includes('materials'));
    assert.ok(LAYER_NAMES.includes('infrastructure'));
  });

  it('has source types', () => {
    assert.ok(SOURCE_TYPES.length > 0);
    assert.ok(SOURCE_TYPES.includes('weather_station'));
    assert.ok(SOURCE_TYPES.includes('historical_map'));
    assert.ok(SOURCE_TYPES.includes('ai_generation'));
  });

  it('confidence labels cover 0-1 range', () => {
    assert.equal(CONFIDENCE_LABELS[0].min, 0.9);
    assert.equal(CONFIDENCE_LABELS[CONFIDENCE_LABELS.length - 1].min, 0.0);
  });
});

// ---------------------------------------------------------------------------
// validateProfile
// ---------------------------------------------------------------------------

describe('validateProfile', () => {
  it('accepts a minimal valid profile', () => {
    const { valid, errors } = validateProfile(minimalProfile());
    assert.ok(valid, `Expected valid but got errors: ${errors.join(', ')}`);
  });

  it('rejects missing schemaVersion', () => {
    const p = minimalProfile({ schemaVersion: 2 });
    const { valid, errors } = validateProfile(p);
    assert.ok(!valid);
    assert.ok(errors.some(e => e.includes('schemaVersion')));
  });

  it('rejects missing id', () => {
    const p = minimalProfile({ id: '' });
    const { valid, errors } = validateProfile(p);
    assert.ok(!valid);
    assert.ok(errors.some(e => e.includes('id')));
  });

  it('rejects missing name', () => {
    const p = minimalProfile({ name: '' });
    const { valid, errors } = validateProfile(p);
    assert.ok(!valid);
    assert.ok(errors.some(e => e.includes('name')));
  });

  it('rejects missing location', () => {
    const p = minimalProfile({ location: null });
    const { valid, errors } = validateProfile(p);
    assert.ok(!valid);
    assert.ok(errors.some(e => e.includes('location')));
  });

  it('rejects invalid lat/lon', () => {
    const p = minimalProfile({ location: { name: 'X', lat: 100, lon: -74 } });
    const { valid, errors } = validateProfile(p);
    assert.ok(!valid);
    assert.ok(errors.some(e => e.includes('lat')));
  });

  it('rejects missing date', () => {
    const p = minimalProfile({ date: null });
    const { valid, errors } = validateProfile(p);
    assert.ok(!valid);
    assert.ok(errors.some(e => e.includes('date')));
  });

  it('rejects invalid month', () => {
    const p = minimalProfile({ date: { year: 2024, month: 13 } });
    const { valid, errors } = validateProfile(p);
    assert.ok(!valid);
    assert.ok(errors.some(e => e.includes('month')));
  });

  it('rejects empty layers (all null)', () => {
    const p = minimalProfile({ layers: {} });
    const { valid, errors } = validateProfile(p);
    assert.ok(!valid);
    assert.ok(errors.some(e => e.includes('non-null')));
  });

  it('rejects unknown layer names', () => {
    const p = minimalProfile();
    p.layers.bogus = createLayer({}, 0.5, [{ id: 'x', type: 'y' }], []);
    const { valid, errors } = validateProfile(p);
    assert.ok(!valid);
    assert.ok(errors.some(e => e.includes('bogus')));
  });

  it('skips null layers without error', () => {
    const p = minimalProfile();
    p.layers.weather = null;
    p.layers.ecology = null;
    const { valid } = validateProfile(p);
    assert.ok(valid);
  });
});

// ---------------------------------------------------------------------------
// validateLayerEnvelope
// ---------------------------------------------------------------------------

describe('validateLayerEnvelope', () => {
  it('accepts valid envelope', () => {
    const layer = createLayer({ foo: 1 }, 0.8, [{ id: 'a', type: 'b' }], ['compromise']);
    const errors = validateLayerEnvelope(layer, 'terrain');
    assert.equal(errors.length, 0);
  });

  it('rejects missing data', () => {
    const layer = { confidence: 0.5, sources: [], knownCompromises: [] };
    const errors = validateLayerEnvelope(layer, 'terrain');
    assert.ok(errors.some(e => e.includes('data')));
  });

  it('rejects confidence out of range', () => {
    const layer = createLayer({}, 1.5, [], []);
    const errors = validateLayerEnvelope(layer, 'terrain');
    assert.ok(errors.some(e => e.includes('confidence')));
  });

  it('rejects negative confidence', () => {
    const layer = createLayer({}, -0.1, [], []);
    const errors = validateLayerEnvelope(layer, 'terrain');
    assert.ok(errors.some(e => e.includes('confidence')));
  });

  it('rejects non-array sources', () => {
    const layer = { data: {}, confidence: 0.5, sources: 'not array', knownCompromises: [] };
    const errors = validateLayerEnvelope(layer, 'terrain');
    assert.ok(errors.some(e => e.includes('sources')));
  });

  it('rejects source missing id', () => {
    const layer = createLayer({}, 0.5, [{ type: 'x' }], []);
    const errors = validateLayerEnvelope(layer, 'terrain');
    assert.ok(errors.some(e => e.includes('sources[0].id')));
  });

  it('rejects non-array knownCompromises', () => {
    const layer = { data: {}, confidence: 0.5, sources: [], knownCompromises: 'string' };
    const errors = validateLayerEnvelope(layer, 'terrain');
    assert.ok(errors.some(e => e.includes('knownCompromises')));
  });
});

// ---------------------------------------------------------------------------
// validateAccuracyManifest
// ---------------------------------------------------------------------------

describe('validateAccuracyManifest', () => {
  it('accepts valid manifest', () => {
    const manifest = {
      profileId: 'test',
      overallConfidence: 0.6,
      layerSummary: { terrain: { confidence: 0.9, status: 'verified' } },
      gaps: ['One gap']
    };
    const errors = validateAccuracyManifest(manifest);
    assert.equal(errors.length, 0);
  });

  it('rejects missing profileId', () => {
    const manifest = { overallConfidence: 0.5, layerSummary: {}, gaps: [] };
    const errors = validateAccuracyManifest(manifest);
    assert.ok(errors.some(e => e.includes('profileId')));
  });

  it('rejects overallConfidence out of range', () => {
    const manifest = { profileId: 'x', overallConfidence: 2.0, layerSummary: {}, gaps: [] };
    const errors = validateAccuracyManifest(manifest);
    assert.ok(errors.some(e => e.includes('overallConfidence')));
  });
});

// ---------------------------------------------------------------------------
// confidenceLabel
// ---------------------------------------------------------------------------

describe('confidenceLabel', () => {
  it('returns verified for 0.95', () => assert.equal(confidenceLabel(0.95), 'verified'));
  it('returns verified for 0.9', () => assert.equal(confidenceLabel(0.9), 'verified'));
  it('returns complete for 0.7', () => assert.equal(confidenceLabel(0.7), 'complete'));
  it('returns likely for 0.65', () => assert.equal(confidenceLabel(0.65), 'likely'));
  it('returns partial for 0.5', () => assert.equal(confidenceLabel(0.5), 'partial'));
  it('returns interpolated for 0.4', () => assert.equal(confidenceLabel(0.4), 'interpolated'));
  it('returns assumed for 0.2', () => assert.equal(confidenceLabel(0.2), 'assumed'));
  it('returns assumed for 0', () => assert.equal(confidenceLabel(0), 'assumed'));
});

// ---------------------------------------------------------------------------
// Layer helpers
// ---------------------------------------------------------------------------

describe('Layer helpers', () => {
  const profile = minimalProfile();

  it('getLayer returns layer object', () => {
    const layer = getLayer(profile, 'terrain');
    assert.ok(layer);
    assert.ok(layer.data);
  });

  it('getLayer returns null for missing layer', () => {
    assert.equal(getLayer(profile, 'ecology'), null);
  });

  it('getLayerData returns data object', () => {
    const data = getLayerData(profile, 'terrain');
    assert.equal(data.demSource, 'test');
  });

  it('getLayerData returns null for missing layer', () => {
    assert.equal(getLayerData(profile, 'music'), null);
  });

  it('populatedLayerCount counts non-null layers', () => {
    assert.equal(populatedLayerCount(profile), 1);
  });

  it('missingLayers returns null/absent layer names', () => {
    const missing = missingLayers(profile);
    assert.equal(missing.length, 8);
    assert.ok(!missing.includes('terrain'));
    assert.ok(missing.includes('ecology'));
  });
});

// ---------------------------------------------------------------------------
// generateAccuracyManifest
// ---------------------------------------------------------------------------

describe('generateAccuracyManifest', () => {
  it('generates manifest from profile layers', () => {
    const profile = minimalProfile();
    profile.layers.weather = createLayer({ provider: 'noaa' }, 0.8,
      [{ id: 'noaa', type: 'weather_station' }],
      ['Sub-daily is synthetic']
    );

    const manifest = generateAccuracyManifest(profile);
    assert.equal(manifest.profileId, 'test_profile');
    assert.ok(manifest.overallConfidence > 0);
    assert.equal(manifest.layerSummary.terrain.status, 'verified');
    assert.equal(manifest.layerSummary.weather.status, 'complete');
    assert.equal(manifest.layerSummary.ecology.status, 'missing');
    assert.ok(manifest.gaps.length > 0);
    assert.ok(manifest.gaps.some(g => g.includes('ecology')));
    assert.ok(manifest.gaps.some(g => g.includes('Sub-daily')));
  });

  it('computes average confidence across populated layers', () => {
    const profile = minimalProfile();
    // terrain is 0.9, add weather at 0.7
    profile.layers.weather = createLayer({}, 0.7, [{ id: 'a', type: 'b' }], []);
    const manifest = generateAccuracyManifest(profile);
    assert.equal(manifest.overallConfidence, 0.8); // (0.9 + 0.7) / 2
  });

  it('handles all-null layers', () => {
    const profile = minimalProfile({ layers: {} });
    const manifest = generateAccuracyManifest(profile);
    assert.equal(manifest.overallConfidence, 0);
    assert.equal(manifest.gaps.length, 9); // all layers missing
  });
});

// ---------------------------------------------------------------------------
// createProfileScaffold
// ---------------------------------------------------------------------------

describe('createProfileScaffold', () => {
  it('creates a valid scaffold', () => {
    const scaffold = createProfileScaffold(
      'test_id', 'Test Name',
      { name: 'Test', lat: 40, lon: -74 },
      { year: 2024 }
    );
    assert.equal(scaffold.schemaVersion, 1);
    assert.equal(scaffold.id, 'test_id');
    assert.equal(Object.keys(scaffold.layers).length, 9);
    // All layers should be null
    for (const name of LAYER_NAMES) {
      assert.equal(scaffold.layers[name], null);
    }
  });
});

// ---------------------------------------------------------------------------
// createLayer / createSource
// ---------------------------------------------------------------------------

describe('createLayer / createSource', () => {
  it('createLayer builds correct envelope', () => {
    const layer = createLayer({ x: 1 }, 0.75, [{ id: 'a', type: 'b' }], ['gap']);
    assert.deepEqual(layer.data, { x: 1 });
    assert.equal(layer.confidence, 0.75);
    assert.equal(layer.sources.length, 1);
    assert.equal(layer.knownCompromises.length, 1);
  });

  it('createSource builds citation', () => {
    const src = createSource('noaa_123', 'weather_station', 'NOAA Station', {
      url: 'https://example.com',
      citation: 'Test citation'
    });
    assert.equal(src.id, 'noaa_123');
    assert.equal(src.type, 'weather_station');
    assert.equal(src.url, 'https://example.com');
  });
});

// ---------------------------------------------------------------------------
// loadProfile — integration with real NYC 1884 profile
// ---------------------------------------------------------------------------

describe('loadProfile — NYC 1884', () => {
  const profilePath = resolve(PROFILES_DIR, 'nyc_1884.json');
  let profile;

  it('loads and validates without errors', () => {
    profile = loadProfile(profilePath);
    assert.ok(profile);
    assert.equal(profile.id, 'nyc_1884');
  });

  it('has all 9 layers populated', () => {
    assert.equal(populatedLayerCount(profile), 9);
    assert.equal(missingLayers(profile).length, 0);
  });

  it('every layer has valid envelope', () => {
    for (const name of LAYER_NAMES) {
      const layer = getLayer(profile, name);
      assert.ok(layer, `${name} should be non-null`);
      assert.ok(typeof layer.confidence === 'number', `${name}.confidence`);
      assert.ok(Array.isArray(layer.sources), `${name}.sources`);
      assert.ok(layer.sources.length > 0, `${name} should have at least one source`);
      assert.ok(Array.isArray(layer.knownCompromises), `${name}.knownCompromises`);
    }
  });

  it('terrain references existing paths', () => {
    const data = getLayerData(profile, 'terrain');
    assert.ok(data.heightmapPath.includes('manhattan-ny'));
    assert.equal(data.landscapeSize, 1009);
  });

  it('weather uses NOAA for 1884', () => {
    const data = getLayerData(profile, 'weather');
    assert.equal(data.provider, 'noaa');
    assert.ok(data.stationId);
  });

  it('soundscape references nyc_city_1884 audio profile', () => {
    const data = getLayerData(profile, 'soundscape');
    assert.equal(data.audioProfileId, 'nyc_city_1884');
    assert.equal(data.generationMethod, 'hand_authored');
    assert.equal(data.assetStatus, 'complete');
  });

  it('urbanForm has Sanborn source', () => {
    const data = getLayerData(profile, 'urbanForm');
    assert.equal(data.buildingSource, 'sanborn_1890');
    assert.equal(data.footprintCount, 29);
    assert.equal(data.landmarkCount, 6);
  });

  it('ecology excludes European Starling (introduced 1890)', () => {
    const data = getLayerData(profile, 'ecology');
    const starling = data.species.find(s => s.commonName === 'European Starling');
    assert.ok(starling, 'Starling should be documented');
    assert.equal(starling.density, 0, 'Starling density should be 0 (not yet introduced)');
    assert.equal(starling.introduced, 1890);
  });

  it('ecology includes Horse with high density', () => {
    const data = getLayerData(profile, 'ecology');
    const horse = data.species.find(s => s.commonName === 'Horse');
    assert.ok(horse);
    assert.ok(horse.density >= 0.9);
  });

  it('music is pre_recording era', () => {
    const data = getLayerData(profile, 'music');
    assert.equal(data.era, 'pre_recording');
    assert.ok(data.formats.includes('barrel_organ'));
  });

  it('infrastructure has gas lighting', () => {
    const data = getLayerData(profile, 'infrastructure');
    assert.equal(data.lighting.primary, 'gas');
    assert.ok(data.transport.modes.includes('elevated_railway'));
    assert.ok(!data.transport.modes.includes('automobile'));
    assert.ok(!data.transport.modes.includes('subway'));
  });

  it('materials has belgian_block primary roads', () => {
    const data = getLayerData(profile, 'materials');
    assert.equal(data.roads.primary, 'belgian_block');
    assert.ok(data.acousticProperties.belgian_block);
  });

  it('has accuracy manifest with overall confidence', () => {
    const manifest = profile.accuracyManifest;
    assert.ok(manifest);
    assert.equal(manifest.profileId, 'nyc_1884');
    assert.ok(manifest.overallConfidence > 0 && manifest.overallConfidence < 1);
    assert.ok(manifest.gaps.length > 0);
    assert.ok(manifest.reviewChecklist.length > 0);
  });

  it('accuracy manifest layer statuses are consistent with confidence', () => {
    const manifest = profile.accuracyManifest;
    for (const [name, summary] of Object.entries(manifest.layerSummary)) {
      const expected = confidenceLabel(summary.confidence);
      assert.equal(summary.status, expected,
        `${name}: status "${summary.status}" doesn't match confidence ${summary.confidence} (expected "${expected}")`);
    }
  });

  it('generateAccuracyManifest produces consistent output', () => {
    const generated = generateAccuracyManifest(profile);
    assert.equal(generated.profileId, 'nyc_1884');
    // Overall confidence should be close to hand-authored manifest
    assert.ok(Math.abs(generated.overallConfidence - profile.accuracyManifest.overallConfidence) < 0.05,
      `Generated confidence ${generated.overallConfidence} should be close to hand-authored ${profile.accuracyManifest.overallConfidence}`);
  });
});

// ---------------------------------------------------------------------------
// loadProfile — error cases
// ---------------------------------------------------------------------------

describe('loadProfile — error cases', () => {
  it('throws on non-existent file', () => {
    assert.throws(() => loadProfile('/no/such/file.json'), { code: 'ENOENT' });
  });
});
