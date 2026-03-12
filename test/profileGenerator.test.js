import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyClimate,
  classifyDensity,
  getEraBracket,
  generateProfile,
} from '../lib/profileGenerator.js';

// ── classifyClimate ─────────────────────────────────────────────

describe('classifyClimate', () => {
  it('classifies arctic latitudes', () => {
    assert.equal(classifyClimate(70).zone, 'arctic');
    assert.equal(classifyClimate(-70).zone, 'arctic');
  });

  it('classifies subarctic latitudes', () => {
    assert.equal(classifyClimate(60).zone, 'subarctic');
  });

  it('classifies temperate latitudes', () => {
    assert.equal(classifyClimate(40).zone, 'temperate');
    assert.equal(classifyClimate(45).zone, 'temperate');
  });

  it('classifies subtropical latitudes', () => {
    assert.equal(classifyClimate(30).zone, 'subtropical');
  });

  it('classifies tropical latitudes', () => {
    assert.equal(classifyClimate(10).zone, 'tropical');
    assert.equal(classifyClimate(0).zone, 'tropical');
  });

  it('detects hemisphere', () => {
    assert.equal(classifyClimate(40).hemisphere, 'north');
    assert.equal(classifyClimate(-40).hemisphere, 'south');
    assert.equal(classifyClimate(0).hemisphere, 'north');
  });
});

// ── classifyDensity ─────────────────────────────────────────────

describe('classifyDensity', () => {
  it('classifies dense_urban', () => {
    assert.equal(classifyDensity(500000), 'dense_urban');
    assert.equal(classifyDensity(8000000), 'dense_urban');
  });

  it('classifies urban', () => {
    assert.equal(classifyDensity(100000), 'urban');
    assert.equal(classifyDensity(499999), 'urban');
  });

  it('classifies suburban', () => {
    assert.equal(classifyDensity(10000), 'suburban');
    assert.equal(classifyDensity(99999), 'suburban');
  });

  it('classifies rural', () => {
    assert.equal(classifyDensity(9999), 'rural');
    assert.equal(classifyDensity(0), 'rural');
  });
});

// ── getEraBracket ───────────────────────────────────────────────

describe('getEraBracket', () => {
  it('maps years to correct brackets', () => {
    assert.equal(getEraBracket(1776), 'pre_1830');
    assert.equal(getEraBracket(1829), 'pre_1830');
    assert.equal(getEraBracket(1830), 'steam_age');
    assert.equal(getEraBracket(1884), 'steam_age');
    assert.equal(getEraBracket(1890), 'early_auto');
    assert.equal(getEraBracket(1919), 'early_auto');
    assert.equal(getEraBracket(1920), 'auto_age');
    assert.equal(getEraBracket(1944), 'auto_age');
    assert.equal(getEraBracket(1945), 'postwar');
    assert.equal(getEraBracket(1974), 'postwar');
    assert.equal(getEraBracket(1975), 'modern');
    assert.equal(getEraBracket(2024), 'modern');
  });
});

// ── generateProfile ─────────────────────────────────────────────

describe('generateProfile', () => {
  const baseOpts = {
    location: 'Test City, US',
    year: 1950,
    population: 200000,
    countryCode: 'US',
    lat: 40.7,
    lon: -74.0,
  };

  it('produces valid v2 profile structure', () => {
    const profile = generateProfile(baseOpts);
    assert.equal(profile.schemaVersion, 2);
    assert.equal(profile.generated, true);
    assert.ok(profile.id.startsWith('gen_'));
    assert.equal(profile.era.year, 1950);
    assert.ok(profile.beds.base.sources.length >= 3);
    assert.ok(profile.beds.directional.N);
    assert.ok(profile.beds.directional.E);
    assert.ok(profile.beds.directional.S);
    assert.ok(profile.beds.directional.W);
    assert.ok(profile.weather.wind);
    assert.ok(profile.weather.rain);
    assert.ok(profile.weather.thunder);
    assert.ok(profile.microEvents.length > 0);
    assert.ok(profile.mix);
    assert.ok(profile.scheduling);
    assert.ok(profile.listener);
    assert.ok(profile.spatialConfig);
    assert.equal(profile.assetGeneration.status, 'pending');
  });

  it('all sources have url: null', () => {
    const profile = generateProfile(baseOpts);
    const allSources = [];

    // Beds
    allSources.push(...profile.beds.base.sources);
    for (const dir of Object.values(profile.beds.directional)) {
      allSources.push(...dir.sources);
    }
    // Weather
    for (const group of Object.values(profile.weather)) {
      if (group.sources) allSources.push(...group.sources);
    }
    // Micro-events
    for (const event of profile.microEvents) {
      allSources.push(...event.sources);
    }

    for (const s of allSources) {
      assert.equal(s.url, null, `Source ${s.label} should have url: null`);
    }
  });

  it('generates deterministic IDs', () => {
    const p1 = generateProfile(baseOpts);
    const p2 = generateProfile(baseOpts);
    assert.equal(p1.id, p2.id);
  });

  it('1870 gets horses not cars', () => {
    const profile = generateProfile({ ...baseOpts, year: 1870 });
    const eventIds = profile.microEvents.map(e => e.id);
    assert.ok(eventIds.includes('horse_cart'), 'should include horse_cart');
    assert.ok(!eventIds.includes('car_passby'), 'should not include car_passby');
    assert.ok(!eventIds.includes('car_traffic'), 'should not include car_traffic');
  });

  it('1953 gets cars not horses', () => {
    const profile = generateProfile({ ...baseOpts, year: 1953 });
    const eventIds = profile.microEvents.map(e => e.id);
    assert.ok(eventIds.includes('car_traffic'), 'should include car_traffic');
    assert.ok(!eventIds.includes('horse_cart'), 'should not include horse_cart');
    assert.ok(!eventIds.includes('horse_walk'), 'should not include horse_walk');
  });

  it('rural excludes urban-only events', () => {
    const profile = generateProfile({ ...baseOpts, population: 500 });
    const eventIds = profile.microEvents.map(e => e.id);
    assert.ok(!eventIds.includes('car_horn'), 'rural should not have car_horn');
    assert.ok(!eventIds.includes('trolley'), 'rural should not have trolley');
    assert.ok(!eventIds.includes('construction'), 'rural should not have construction');
  });

  it('arctic excludes insects', () => {
    const profile = generateProfile({ ...baseOpts, lat: 70 });
    const eventIds = profile.microEvents.map(e => e.id);
    assert.ok(!eventIds.includes('insect_chorus'), 'arctic should not have insects');
    assert.ok(!eventIds.includes('bird_song'), 'arctic should not have temperate bird_song');
  });

  it('temperate climate gets snow weather sources', () => {
    const profile = generateProfile({ ...baseOpts, lat: 45 });
    assert.ok(profile.weather.snow, 'temperate should have snow sources');
    assert.ok(profile.weather.snow.sources.length > 0);
  });

  it('tropical climate has no snow', () => {
    const profile = generateProfile({ ...baseOpts, lat: 5 });
    assert.ok(!profile.weather.snow, 'tropical should not have snow');
  });

  it('includes promptContext for elevenlabs-fetch', () => {
    const profile = generateProfile(baseOpts);
    assert.ok(profile.assetGeneration.promptContext.length > 20);
    assert.ok(profile.description.length > 20);
    assert.equal(profile.description, profile.assetGeneration.promptContext);
  });
});
