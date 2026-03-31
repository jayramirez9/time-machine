import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  placeDecals, placeGroundGrime, buildDecalSpawnScript,
  DECAL_PREFIX, GRIME_PREFIX,
} from '../lib/decalPlacement.js';

// ─── Test Fixtures ──────────────────────────────────────────────

const testBuilding = {
  label: 'TM_Building_001_brownstone_4s',
  location: [0, 0, 700],
  scale: [10, 8, 14],  // 1000cm x 800cm x 1400cm
  rotation: [0, 0, 0],
  material: 'brownstone',
  stories: 4,
  use: 'residential',
  address: '123 Test St',
  styleName: 'brownstone_rowhouse',
  yearBuilt: 1840,
  yearDemolished: null,
};

const testBuildingNoYear = {
  ...testBuilding,
  label: 'TM_Building_002_brick_3s',
  location: [2000, 0, 525],
  styleName: 'italianate_tenement',
  yearBuilt: null,
};

const testSplines = [
  {
    category: 'primary',
    points: [
      [0, -500], [5000, -500], [10000, -500],
    ],
  },
  {
    category: 'secondary',
    points: [
      [2500, -2000], [2500, 2000],
    ],
  },
];

// ─── Facade Decal Tests ─────────────────────────────────────────

describe('Decal Placement — Facade', () => {
  it('requires year', () => {
    assert.throws(() => placeDecals([testBuilding], {}), /year is required/);
  });

  it('produces decals for a building', () => {
    const decals = placeDecals([testBuilding], { year: 1884, density: 0.5 });
    assert.ok(decals.length > 0, 'should produce at least one decal');
  });

  it('produces no decals at density 0', () => {
    const decals = placeDecals([testBuilding], { year: 1884, density: 0 });
    assert.equal(decals.length, 0);
  });

  it('more decals at higher density', () => {
    const low = placeDecals([testBuilding], { year: 1884, density: 0.2 });
    const high = placeDecals([testBuilding], { year: 1884, density: 0.9 });
    assert.ok(high.length >= low.length, `high ${high.length} should >= low ${low.length}`);
  });

  it('is deterministic', () => {
    const a = placeDecals([testBuilding], { year: 1884, density: 0.5 });
    const b = placeDecals([testBuilding], { year: 1884, density: 0.5 });
    assert.deepEqual(a, b);
  });

  it('decal labels start with DECAL_PREFIX', () => {
    const decals = placeDecals([testBuilding], { year: 1884, density: 0.5 });
    for (const d of decals) {
      assert.ok(d.label.startsWith(DECAL_PREFIX), `label ${d.label} should start with ${DECAL_PREFIX}`);
    }
  });

  it('each decal has required spawn fields', () => {
    const decals = placeDecals([testBuilding], { year: 1884, density: 0.5 });
    for (const d of decals) {
      assert.ok(Array.isArray(d.location), 'location');
      assert.equal(d.location.length, 3, 'location [x,y,z]');
      assert.ok(Array.isArray(d.rotation), 'rotation');
      assert.ok(Array.isArray(d.size), 'size');
      assert.ok(d.type, 'type');
      assert.ok(d.decalMaterial, 'decalMaterial');
    }
  });

  it('--only filters to specific types', () => {
    const decals = placeDecals([testBuilding], { year: 1884, density: 0.8, only: ['water_stain'] });
    for (const d of decals) {
      assert.equal(d.type, 'water_stain');
    }
  });

  it('--exclude removes specific types', () => {
    const decals = placeDecals([testBuilding], { year: 1884, density: 0.8, exclude: ['water_stain'] });
    for (const d of decals) {
      assert.notEqual(d.type, 'water_stain');
    }
  });

  it('buildings without yearBuilt still get decals', () => {
    const decals = placeDecals([testBuildingNoYear], { year: 1884, density: 0.8 });
    assert.ok(decals.length > 0, 'should still place base decals');
  });
});

// ─── Ground Grime Tests ─────────────────────────────────────────

describe('Decal Placement — Ground Grime', () => {
  it('requires year', () => {
    assert.throws(() => placeGroundGrime(testSplines, {}), /year is required/);
  });

  it('produces grime along splines', () => {
    const grime = placeGroundGrime(testSplines, { year: 1884, density: 0.5 });
    assert.ok(grime.length > 0, 'should produce grime');
  });

  it('grime labels start with GRIME_PREFIX', () => {
    const grime = placeGroundGrime(testSplines, { year: 1884, density: 0.5 });
    for (const g of grime) {
      assert.ok(g.label.startsWith(GRIME_PREFIX), `label ${g.label} should start with ${GRIME_PREFIX}`);
    }
  });

  it('is deterministic', () => {
    const a = placeGroundGrime(testSplines, { year: 1884, density: 0.5 });
    const b = placeGroundGrime(testSplines, { year: 1884, density: 0.5 });
    assert.deepEqual(a, b);
  });

  it('1884 includes horse_waste', () => {
    const grime = placeGroundGrime(testSplines, { year: 1884, density: 0.8 });
    const types = [...new Set(grime.map(g => g.type))];
    assert.ok(types.includes('horse_waste'), `expected horse_waste in ${types}`);
  });

  it('2024 excludes horse_waste', () => {
    const grime = placeGroundGrime(testSplines, { year: 2024, density: 0.8 });
    const types = [...new Set(grime.map(g => g.type))];
    assert.ok(!types.includes('horse_waste'), `should not have horse_waste in ${types}`);
  });

  it('ground grime has pitch 90 (downward projection)', () => {
    const grime = placeGroundGrime(testSplines, { year: 1884, density: 0.5 });
    for (const g of grime) {
      assert.equal(g.rotation[0], 90, 'pitch should be 90 for ground projection');
    }
  });
});

// ─── Script Generation ──────────────────────────────────────────

describe('Decal Placement — Script Generation', () => {
  it('produces valid Python with DecalActor', () => {
    const decals = placeDecals([testBuilding], { year: 1884, density: 0.5 });
    const script = buildDecalSpawnScript(decals, { clearExisting: true });
    assert.ok(script.includes('DecalActor'));
    assert.ok(script.includes('spawned'));
  });

  it('clears both prefixes', () => {
    const script = buildDecalSpawnScript([], { clearExisting: true });
    assert.ok(script.includes(DECAL_PREFIX));
    assert.ok(script.includes(GRIME_PREFIX));
  });

  it('produces empty spawn section for empty list', () => {
    const script = buildDecalSpawnScript([], { clearExisting: false });
    assert.ok(script.includes('# Spawn 0 decals'));
  });
});
