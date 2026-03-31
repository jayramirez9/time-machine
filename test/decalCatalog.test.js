import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DECAL_TYPES, GROUND_GRIME_TYPES,
  getDecalsForYear, getDecalsForMaterial, getGroundGrimeForYear,
  computeDecalDensity, summarizeDecalsForYear,
} from '../lib/decalCatalog.js';

describe('Decal Catalog — Integrity', () => {
  it('all facade decals have required fields', () => {
    for (const d of DECAL_TYPES) {
      assert.ok(d.type, `missing type`);
      assert.ok(d.label, `${d.type}: missing label`);
      assert.ok(Array.isArray(d.heightRange), `${d.type}: missing heightRange`);
      assert.equal(d.heightRange.length, 2, `${d.type}: heightRange must be [min, max]`);
      assert.ok(d.facingPreference, `${d.type}: missing facingPreference`);
      assert.ok(typeof d.baseDensityWeight === 'number', `${d.type}: missing baseDensityWeight`);
      assert.ok(typeof d.ageFactor === 'number', `${d.type}: missing ageFactor`);
      assert.ok(Array.isArray(d.scaleRange), `${d.type}: missing scaleRange`);
      assert.ok(Array.isArray(d.aspectRatio), `${d.type}: missing aspectRatio`);
      assert.ok(d.decalMaterial, `${d.type}: missing decalMaterial`);
    }
  });

  it('all ground grime types have required fields', () => {
    for (const d of GROUND_GRIME_TYPES) {
      assert.ok(d.type, `missing type`);
      assert.ok(d.label, `${d.type}: missing label`);
      assert.ok(typeof d.baseDensityWeight === 'number', `${d.type}: missing baseDensityWeight`);
      assert.ok(Array.isArray(d.scaleRange), `${d.type}: missing scaleRange`);
      assert.ok(d.decalMaterial, `${d.type}: missing decalMaterial`);
    }
  });

  it('all decal types are unique', () => {
    const all = [...DECAL_TYPES, ...GROUND_GRIME_TYPES];
    const types = all.map(d => d.type);
    const unique = new Set(types);
    assert.equal(types.length, unique.size, `Duplicate types found: ${types.filter((t, i) => types.indexOf(t) !== i)}`);
  });

  it('has exactly 5 facade types', () => {
    assert.equal(DECAL_TYPES.length, 5);
  });

  it('has exactly 4 ground grime types', () => {
    assert.equal(GROUND_GRIME_TYPES.length, 4);
  });
});

describe('Decal Catalog — Era Filtering', () => {
  it('1884 includes soot_smoke', () => {
    const types = getDecalsForYear(1884).map(d => d.type);
    assert.ok(types.includes('soot_smoke'));
  });

  it('1884 includes water_stain (all eras)', () => {
    const types = getDecalsForYear(1884).map(d => d.type);
    assert.ok(types.includes('water_stain'));
  });

  it('2024 excludes soot_smoke (ends 1960)', () => {
    const types = getDecalsForYear(2024).map(d => d.type);
    assert.ok(!types.includes('soot_smoke'));
  });

  it('ground: 1884 includes horse_waste', () => {
    const types = getGroundGrimeForYear(1884).map(d => d.type);
    assert.ok(types.includes('horse_waste'));
  });

  it('ground: 1884 excludes oil_spot (starts 1900)', () => {
    const types = getGroundGrimeForYear(1884).map(d => d.type);
    assert.ok(!types.includes('oil_spot'));
  });

  it('ground: 1950 includes oil_spot', () => {
    const types = getGroundGrimeForYear(1950).map(d => d.type);
    assert.ok(types.includes('oil_spot'));
  });

  it('ground: 2024 excludes horse_waste (ends 1920)', () => {
    const types = getGroundGrimeForYear(2024).map(d => d.type);
    assert.ok(!types.includes('horse_waste'));
  });
});

describe('Decal Catalog — Material Affinity', () => {
  it('brownstone gets water_stain', () => {
    const types = getDecalsForMaterial('brownstone', 1884).map(d => d.type);
    assert.ok(types.includes('water_stain'));
  });

  it('brownstone gets moss_lichen', () => {
    const types = getDecalsForMaterial('brownstone', 1884).map(d => d.type);
    assert.ok(types.includes('moss_lichen'));
  });

  it('steel_frame does not get crack_spall', () => {
    const types = getDecalsForMaterial('steel_frame', 1884).map(d => d.type);
    assert.ok(!types.includes('crack_spall'));
  });

  it('dirt_accumulation applies to all materials (null affinity)', () => {
    const types = getDecalsForMaterial('steel_frame', 1884).map(d => d.type);
    assert.ok(types.includes('dirt_accumulation'));
  });
});

describe('Decal Catalog — Density', () => {
  it('density scales with multiplier', () => {
    const d = DECAL_TYPES[0]; // water_stain
    const low = computeDecalDensity(d, 50, 0.2);
    const high = computeDecalDensity(d, 50, 0.8);
    assert.ok(high > low, `high density ${high} should > low ${low}`);
  });

  it('density increases with age', () => {
    const d = DECAL_TYPES.find(t => t.type === 'crack_spall');
    const young = computeDecalDensity(d, 5, 0.5);
    const old = computeDecalDensity(d, 100, 0.5);
    assert.ok(old > young, `old density ${old} should > young ${young}`);
  });

  it('density caps at 1.0', () => {
    const d = DECAL_TYPES[0];
    const val = computeDecalDensity(d, 200, 1.0);
    assert.ok(val <= 1.0, `density ${val} should <= 1.0`);
  });

  it('null age uses base density only', () => {
    const d = DECAL_TYPES[0];
    const withAge = computeDecalDensity(d, 50, 0.5);
    const noAge = computeDecalDensity(d, null, 0.5);
    assert.ok(withAge >= noAge, 'age should not decrease density');
  });
});

describe('Decal Catalog — Summary', () => {
  it('summarizeDecalsForYear returns counts', () => {
    const s = summarizeDecalsForYear(1884);
    assert.ok(s.facade > 0);
    assert.ok(s.ground > 0);
    assert.ok(Array.isArray(s.facadeTypes));
    assert.ok(Array.isArray(s.groundTypes));
  });
});
