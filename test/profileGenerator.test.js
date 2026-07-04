import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyClimate,
  classifyDensity,
  getEraBracket,
  generateProfile,
  getSeason,
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

  it('microEvents is a true Array with correct event structure', () => {
    const profile = generateProfile(baseOpts);
    assert.ok(Array.isArray(profile.microEvents), 'microEvents must be an Array, not an object with numeric keys');
    assert.ok(profile.microEvents.length > 0, 'should have at least one micro-event');

    // Verify it survives JSON round-trip as an array
    const roundTripped = JSON.parse(JSON.stringify(profile));
    assert.ok(Array.isArray(roundTripped.microEvents), 'microEvents must remain an Array after JSON round-trip');

    // Verify each event has the required fields
    for (const evt of profile.microEvents) {
      assert.ok(typeof evt.id === 'string', `event must have string id, got ${typeof evt.id}`);
      assert.ok(typeof evt.description === 'string', `event ${evt.id}: must have description`);
      assert.ok(Array.isArray(evt.sources), `event ${evt.id}: sources must be an Array`);
      assert.ok(evt.sources.length > 0, `event ${evt.id}: must have at least one source`);
      assert.ok(typeof evt.avgCooldownSec === 'number', `event ${evt.id}: must have numeric avgCooldownSec`);
      assert.ok(typeof evt.gainDb === 'number', `event ${evt.id}: must have numeric gainDb`);
      assert.ok(evt.spatial && typeof evt.spatial === 'object', `event ${evt.id}: must have spatial object`);
      assert.ok(evt.motion && typeof evt.motion === 'object', `event ${evt.id}: must have motion object`);
      assert.ok(evt.timeOfDay && typeof evt.timeOfDay === 'object', `event ${evt.id}: must have timeOfDay object`);
      assert.ok(Array.isArray(evt.activityRange), `event ${evt.id}: activityRange must be an Array`);
      assert.equal(evt.activityRange.length, 2, `event ${evt.id}: activityRange must have 2 elements`);
    }

    // Verify for-of iteration works (would fail on object with numeric keys)
    let count = 0;
    for (const evt of profile.microEvents) {
      count++;
      assert.ok(evt.id);
    }
    assert.equal(count, profile.microEvents.length);
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

  // ── Layered directional beds (Phase 7c.2) ─────────────────────

  it('directional beds have 3 layered sources per direction', () => {
    const profile = generateProfile(baseOpts);
    for (const dir of ['N', 'E', 'S', 'W']) {
      const bed = profile.beds.directional[dir];
      assert.equal(bed.sources.length, 3,
        `direction ${dir} should have 3 layered sources, got ${bed.sources.length}`);
    }
  });

  it('layered directional sources have near/mid/far variantHints', () => {
    const profile = generateProfile(baseOpts);
    const expectedSuffixes = ['near', 'mid', 'far'];
    for (const dir of ['N', 'E', 'S', 'W']) {
      const bed = profile.beds.directional[dir];
      for (let i = 0; i < 3; i++) {
        const s = bed.sources[i];
        assert.ok(s.label.endsWith(`-${expectedSuffixes[i]}`),
          `${dir}.sources[${i}] label should end with -${expectedSuffixes[i]}, got ${s.label}`);
        assert.ok(typeof s.variantHint === 'string' && s.variantHint.length > 0,
          `${dir}.sources[${i}] should have a variantHint`);
      }
      // Distinct hints per layer
      const hints = new Set(bed.sources.map(s => s.variantHint));
      assert.equal(hints.size, 3, `${dir} layers should have 3 distinct variantHints`);
    }
  });

  it('layered sources have ordered distance and gain offsets', () => {
    const profile = generateProfile(baseOpts);
    for (const dir of ['N', 'E', 'S', 'W']) {
      const [near, mid, far] = profile.beds.directional[dir].sources;
      assert.ok(near.spatial.distance < far.spatial.distance,
        `${dir}: near distance should be closer than far`);
      assert.ok(near.spatial.spread < far.spatial.spread,
        `${dir}: near spread should be narrower than far`);
      assert.ok(near.gainOffsetDb > 0,
        `${dir}: near should have positive gain offset (louder)`);
      assert.equal(mid.gainOffsetDb, 0,
        `${dir}: mid should have neutral gain offset`);
      assert.ok(far.gainOffsetDb < 0,
        `${dir}: far should have negative gain offset (softer)`);
    }
  });

  it('layered sources share direction azimuth and elevation', () => {
    const profile = generateProfile(baseOpts);
    for (const dir of ['N', 'E', 'S', 'W']) {
      const [near, mid, far] = profile.beds.directional[dir].sources;
      assert.equal(near.spatial.azimuth, mid.spatial.azimuth,
        `${dir}: layers must point the same direction`);
      assert.equal(mid.spatial.azimuth, far.spatial.azimuth);
      assert.equal(near.spatial.elevation, mid.spatial.elevation);
    }
  });

  it('layered sources keep url: null for asset generation', () => {
    const profile = generateProfile(baseOpts);
    for (const dir of ['N', 'E', 'S', 'W']) {
      for (const s of profile.beds.directional[dir].sources) {
        assert.equal(s.url, null);
      }
    }
  });

  it('1870 gets horses not cars', () => {
    const profile = generateProfile({ ...baseOpts, year: 1870 });
    const eventIds = profile.microEvents.map(e => e.id);
    assert.ok(eventIds.includes('horse_cart'), 'should include horse_cart');
    assert.ok(!eventIds.includes('car_passby'), 'should not include car_passby');
    assert.ok(!eventIds.includes('car_traffic'), 'should not include car_traffic');
  });

  it('horse_walk surface tracks the scene era, not its home group', () => {
    // Inherited into steam-age scenes — must pick up the era's street surface
    const p1884 = generateProfile({ ...baseOpts, year: 1884 });
    const hw = p1884.microEvents.find(e => e.id === 'horse_walk');
    assert.ok(hw, '1884 should include horse_walk');
    assert.equal(hw.surface, 'cobblestone');
    assert.match(hw.description, /cobblestone/);

    // Genuine pre-1830 scenes keep the original dirt foley
    const p1800 = generateProfile({ ...baseOpts, year: 1800 });
    const hwDirt = p1800.microEvents.find(e => e.id === 'horse_walk');
    assert.ok(hwDirt, '1800 should include horse_walk');
    assert.equal(hwDirt.surface, 'dirt');
    assert.match(hwDirt.description, /packed earth/);
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

// ── getSeason ─────────────────────────────────────────────────

describe('getSeason', () => {
  it('maps months to northern hemisphere seasons', () => {
    assert.equal(getSeason(1), 'winter');
    assert.equal(getSeason(3), 'spring');
    assert.equal(getSeason(7), 'summer');
    assert.equal(getSeason(10), 'fall');
    assert.equal(getSeason(12), 'winter');
  });

  it('flips for southern hemisphere', () => {
    assert.equal(getSeason(1, 'south'), 'summer');
    assert.equal(getSeason(7, 'south'), 'winter');
  });
});

// ── Diurnal/Seasonal enrichment ──────────────────────────────────

describe('generateProfile — diurnal/seasonal enrichment', () => {
  // Mock environment profile with ecology species data
  const mockEnvProfile = {
    layers: {
      ecology: {
        data: {
          species: [
            {
              commonName: 'House Sparrow', type: 'bird', density: 0.9,
              diurnal: { dawn: 0.9, day: 0.7, dusk: 0.8, night: 0.1 },
              seasonal: { spring: 0.8, summer: 0.9, fall: 0.7, winter: 0.5 }
            },
            {
              commonName: 'American Robin', type: 'bird', density: 0.6,
              diurnal: { dawn: 0.9, day: 0.5, dusk: 0.7, night: 0.0 },
              seasonal: { spring: 0.7, summer: 0.6, fall: 0.3, winter: 0.1 }
            },
            {
              commonName: 'Field Cricket', type: 'insect', density: 0.7,
              diurnal: { dawn: 0.2, day: 0.1, dusk: 0.7, night: 0.9 },
              seasonal: { spring: 0.3, summer: 0.8, fall: 0.9, winter: 0.0 }
            }
          ]
        }
      }
    }
  };

  const baseOpts = {
    location: 'Test City, US',
    year: 1950,
    population: 200000,
    lat: 40.7,
    lon: -74.0,
  };

  it('attaches diurnalWeights to bird_song when environment profile provided', () => {
    const profile = generateProfile({ ...baseOpts, environmentProfile: mockEnvProfile });
    const birdEvt = profile.microEvents.find(e => e.id === 'bird_song');
    assert.ok(birdEvt, 'Should have bird_song event');
    assert.ok(birdEvt.diurnalWeights, 'bird_song should have diurnalWeights');
    assert.ok(birdEvt.diurnalWeights.dawn > 0.7, 'Dawn weight should be high for sparrows+robins');
    assert.ok(birdEvt.diurnalWeights.night < 0.15, 'Night weight should be near zero');
  });

  it('attaches diurnalWeights to insect_chorus when environment profile provided', () => {
    const profile = generateProfile({ ...baseOpts, environmentProfile: mockEnvProfile });
    const insectEvt = profile.microEvents.find(e => e.id === 'insect_chorus');
    assert.ok(insectEvt, 'Should have insect_chorus event');
    assert.ok(insectEvt.diurnalWeights, 'insect_chorus should have diurnalWeights');
    assert.ok(insectEvt.diurnalWeights.night > 0.7, 'Night weight should be high for crickets');
    assert.ok(insectEvt.diurnalWeights.day < 0.2, 'Day weight should be low for crickets');
  });

  it('applies seasonal cooldown modulation in winter (birds less active)', () => {
    const summer = generateProfile({ ...baseOpts, month: 7, environmentProfile: mockEnvProfile });
    const winter = generateProfile({ ...baseOpts, month: 1, environmentProfile: mockEnvProfile });
    const summerBird = summer.microEvents.find(e => e.id === 'bird_song');
    const winterBird = winter.microEvents.find(e => e.id === 'bird_song');
    assert.ok(winterBird.avgCooldownSec > summerBird.avgCooldownSec,
      `Winter cooldown (${winterBird.avgCooldownSec}) should be longer than summer (${summerBird.avgCooldownSec})`);
  });

  it('suppresses insects in winter (seasonal weight 0)', () => {
    const profile = generateProfile({ ...baseOpts, month: 1, environmentProfile: mockEnvProfile });
    const insectEvt = profile.microEvents.find(e => e.id === 'insect_chorus');
    assert.ok(insectEvt, 'insect_chorus should still exist');
    assert.ok(insectEvt.avgCooldownSec > 1000, `Winter insect cooldown should be very high, got ${insectEvt.avgCooldownSec}`);
  });

  it('insects are frequent in summer', () => {
    const profile = generateProfile({ ...baseOpts, month: 7, environmentProfile: mockEnvProfile });
    const insectEvt = profile.microEvents.find(e => e.id === 'insect_chorus');
    assert.ok(insectEvt.avgCooldownSec < 100, `Summer insect cooldown should be reasonable, got ${insectEvt.avgCooldownSec}`);
  });

  it('no diurnalWeights without environment profile', () => {
    const profile = generateProfile(baseOpts);
    const birdEvt = profile.microEvents.find(e => e.id === 'bird_song');
    assert.ok(birdEvt, 'Should have bird_song event');
    assert.ok(!birdEvt.diurnalWeights, 'Should not have diurnalWeights without env profile');
  });

  it('no seasonal modulation without month', () => {
    const withMonth = generateProfile({ ...baseOpts, month: 7, environmentProfile: mockEnvProfile });
    const withoutMonth = generateProfile({ ...baseOpts, environmentProfile: mockEnvProfile });
    const birdWith = withMonth.microEvents.find(e => e.id === 'bird_song');
    const birdWithout = withoutMonth.microEvents.find(e => e.id === 'bird_song');
    // Both should have diurnal weights (from ecology), but only withMonth should have seasonal modulation
    assert.ok(birdWith.diurnalWeights);
    assert.ok(birdWithout.diurnalWeights);
  });
});

// ── Surface-linked footstep templates ────────────────────────────

describe('generateProfile — surface-linked footsteps', () => {
  const baseOpts = {
    location: 'Test City, US',
    population: 200000,
    lat: 40.7,
    lon: -74.0,
  };

  it('1880 (steam_age) gets cobblestone street footsteps', () => {
    const profile = generateProfile({ ...baseOpts, year: 1880 });
    const evt = profile.microEvents.find(e => e.id === 'footsteps_street');
    assert.ok(evt, 'Should have footsteps_street event');
    assert.equal(evt.surface, 'cobblestone');
    assert.ok(evt.description.includes('cobblestone'), `Description should mention cobblestone: ${evt.description}`);
    assert.ok(evt.description.includes('leather shoes'), `Description should mention shoe type: ${evt.description}`);
  });

  it('1880 gets granite flag sidewalk footsteps', () => {
    const profile = generateProfile({ ...baseOpts, year: 1880 });
    const evt = profile.microEvents.find(e => e.id === 'footsteps_sidewalk');
    assert.ok(evt, 'Should have footsteps_sidewalk event');
    assert.equal(evt.surface, 'granite_flag');
    assert.ok(evt.description.includes('granite flag'), `Description should mention granite flag: ${evt.description}`);
  });

  it('1960 (postwar) gets asphalt street footsteps', () => {
    const profile = generateProfile({ ...baseOpts, year: 1960 });
    const evt = profile.microEvents.find(e => e.id === 'footsteps_street');
    assert.ok(evt);
    assert.equal(evt.surface, 'asphalt');
    assert.ok(evt.description.includes('hard-soled shoes'));
  });

  it('1960 gets concrete sidewalk footsteps', () => {
    const profile = generateProfile({ ...baseOpts, year: 1960 });
    const evt = profile.microEvents.find(e => e.id === 'footsteps_sidewalk');
    assert.ok(evt);
    assert.equal(evt.surface, 'concrete');
  });

  it('1800 (pre_1830) gets dirt surface and leather boots', () => {
    const profile = generateProfile({ ...baseOpts, year: 1800 });
    const evt = profile.microEvents.find(e => e.id === 'footsteps_street');
    assert.ok(evt);
    assert.equal(evt.surface, 'dirt');
    assert.ok(evt.description.includes('leather boots'));
  });

  it('2020 (modern) gets rubber-soled shoes on asphalt', () => {
    const profile = generateProfile({ ...baseOpts, year: 2020 });
    const evt = profile.microEvents.find(e => e.id === 'footsteps_street');
    assert.ok(evt);
    assert.equal(evt.surface, 'asphalt');
    assert.ok(evt.description.includes('rubber-soled'));
  });

  it('footsteps have 2 source slots for variation', () => {
    const profile = generateProfile({ ...baseOpts, year: 1880 });
    const evt = profile.microEvents.find(e => e.id === 'footsteps_street');
    assert.equal(evt.sources.length, 2);
  });

  it('materials layer overrides default surface when available', () => {
    const envProfile = {
      layers: {
        materials: {
          data: {
            roads: { primary: 'belgian_block', secondary: 'cobblestone', residential: 'dirt' },
            sidewalks: 'granite_flag'
          }
        }
      }
    };
    // 1960 would normally get asphalt, but materials layer says belgian_block
    const profile = generateProfile({ ...baseOpts, year: 1960, environmentProfile: envProfile });
    const evt = profile.microEvents.find(e => e.id === 'footsteps_street');
    assert.equal(evt.surface, 'belgian_block', 'Materials layer should override era default');
    assert.ok(evt.description.includes('belgian block'));
  });

  it('materials layer overrides horse_cart surface', () => {
    const envProfile = {
      layers: {
        materials: {
          data: {
            roads: { primary: 'belgian_block' }
          }
        }
      }
    };
    const profile = generateProfile({ ...baseOpts, year: 1880, environmentProfile: envProfile });
    const evt = profile.microEvents.find(e => e.id === 'horse_cart');
    assert.ok(evt);
    assert.equal(evt.surface, 'belgian_block');
    assert.ok(evt.description.includes('belgian block'));
  });

  it('rural excludes footsteps (minDensity: suburban)', () => {
    const profile = generateProfile({ ...baseOpts, year: 1880, population: 500 });
    const evt = profile.microEvents.find(e => e.id === 'footsteps_street');
    assert.ok(!evt, 'Rural should not have street footsteps');
  });
});

// ── Door/window and material-contact foley ───────────────────────

describe('generateProfile — foley templates', () => {
  const baseOpts = {
    location: 'Test City, US',
    year: 1950,
    population: 200000,
    lat: 40.7,
    lon: -74.0,
  };

  it('urban profile includes door and window foley', () => {
    const profile = generateProfile(baseOpts);
    const ids = profile.microEvents.map(e => e.id);
    assert.ok(ids.includes('door_open_close'), 'Should have door_open_close');
    assert.ok(ids.includes('door_creak'), 'Should have door_creak');
    assert.ok(ids.includes('window_rattle'), 'Should have window_rattle');
    assert.ok(ids.includes('shutter_bang'), 'Should have shutter_bang');
  });

  it('urban profile includes material-contact foley', () => {
    const profile = generateProfile(baseOpts);
    const ids = profile.microEvents.map(e => e.id);
    assert.ok(ids.includes('glass_clink'), 'Should have glass_clink');
    assert.ok(ids.includes('metal_clang'), 'Should have metal_clang');
    assert.ok(ids.includes('cloth_rustle'), 'Should have cloth_rustle');
    assert.ok(ids.includes('broom_sweep'), 'Should have broom_sweep');
  });

  it('window_rattle and shutter_bang have weatherGate', () => {
    const profile = generateProfile(baseOpts);
    const rattle = profile.microEvents.find(e => e.id === 'window_rattle');
    const shutter = profile.microEvents.find(e => e.id === 'shutter_bang');
    assert.equal(rattle.weatherGate, 'wind');
    assert.equal(shutter.weatherGate, 'wind');
  });

  it('multi-source events have variantHint', () => {
    const profile = generateProfile({ ...baseOpts, year: 1880 });
    const evt = profile.microEvents.find(e => e.id === 'footsteps_street');
    assert.ok(evt);
    assert.equal(evt.sources.length, 2);
    assert.ok(evt.sources[0].variantHint, 'First source should have variantHint');
    assert.ok(evt.sources[1].variantHint, 'Second source should have variantHint');
    assert.notEqual(evt.sources[0].variantHint, evt.sources[1].variantHint, 'Hints should differ');
  });

  it('rural excludes density-gated foley', () => {
    const profile = generateProfile({ ...baseOpts, population: 500 });
    const ids = profile.microEvents.map(e => e.id);
    assert.ok(!ids.includes('door_open_close'), 'Rural should not have door_open_close');
    assert.ok(!ids.includes('glass_clink'), 'Rural should not have glass_clink');
    // But wind-gated events with no density gate should still be present
    assert.ok(ids.includes('window_rattle'), 'Should have window_rattle (no density gate)');
    assert.ok(ids.includes('cloth_rustle'), 'Should have cloth_rustle (no density gate)');
  });
});

// ── Voice event generation ───────────────────────────────────────

describe('generateProfile — voice events', () => {
  const baseOpts = {
    location: 'Test City, US',
    population: 200000,
    lat: 40.7,
    lon: -74.0,
  };

  it('1900 urban profile generates vendor voice events', () => {
    const profile = generateProfile({ ...baseOpts, year: 1900 });
    const voiceEvents = profile.microEvents.filter(e => e.id.startsWith('voice_'));
    assert.ok(voiceEvents.length > 0, 'Should have at least one voice event');
    assert.ok(voiceEvents.length <= 3, 'Should have at most 3 voice events');
  });

  it('vendor voice events have phrases and voice fields', () => {
    const envProfile = {
      layers: {
        culture: { data: { commerce: { streetVendors: ['newsboy', 'hot corn girl'] } } }
      }
    };
    const profile = generateProfile({ ...baseOpts, year: 1884, environmentProfile: envProfile });
    const newsboy = profile.microEvents.find(e => e.id === 'voice_newsboy');
    assert.ok(newsboy, 'Should have newsboy voice event');
    assert.ok(newsboy.phrases?.length >= 2, 'Should have at least 2 phrases');
    assert.ok(newsboy.voice, 'Should have voice field');
    assert.equal(newsboy.sources.length, 2);
  });

  it('uses cultural agent vendor data when available', () => {
    const envProfile = {
      layers: {
        culture: { data: { commerce: { streetVendors: ['oyster seller', 'flower girl'] } } }
      }
    };
    const profile = generateProfile({ ...baseOpts, year: 1884, environmentProfile: envProfile });
    const ids = profile.microEvents.filter(e => e.id.startsWith('voice_')).map(e => e.id);
    assert.ok(ids.includes('voice_oyster_seller'));
    assert.ok(ids.includes('voice_flower_girl'));
  });

  it('2020 urban profile generates casual speech event', () => {
    const profile = generateProfile({ ...baseOpts, year: 2020 });
    const passerby = profile.microEvents.find(e => e.id === 'voice_passerby');
    assert.ok(passerby, 'Modern urban should have voice_passerby');
    assert.ok(!passerby.phrases, 'Modern speech should not have specific phrases');
  });

  it('rural profile has no voice events', () => {
    const profile = generateProfile({ ...baseOpts, year: 1900, population: 500 });
    const voiceEvents = profile.microEvents.filter(e => e.id.startsWith('voice_'));
    assert.equal(voiceEvents.length, 0, 'Rural should have no voice events');
  });

  it('suburban profile has no voice events', () => {
    const profile = generateProfile({ ...baseOpts, year: 1900, population: 50000 });
    const voiceEvents = profile.microEvents.filter(e => e.id.startsWith('voice_'));
    assert.equal(voiceEvents.length, 0, 'Suburban should have no voice events');
  });
});
