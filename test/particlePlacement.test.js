import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getParticlesForYear,
  getParticlesByCategory,
  computeSmokeDensity,
  summarizeParticlesForYear,
  PARTICLE_TYPES,
} from '../lib/particleCatalog.js';
import {
  placeChimneySmoke,
  placeStreetDust,
  placeLampGlow,
  placeRainSplash,
  placeWindowGlow,
  placeAllParticles,
  buildParticleSpawnScript,
  PARTICLE_PREFIX,
} from '../lib/particlePlacement.js';

// ─── Test Data ─────────────────────────────────────────────────

// Simple 100m primary road (east-west)
const primarySpline = { category: 'primary', points: [[0, 0, 10], [10000, 0, 10]] };
const secondarySpline = { category: 'secondary', points: [[0, 0, 10], [0, 10000, 10]] };
const testSplines = [primarySpline, secondarySpline];

// Simple buildings
const testBuildings = [
  {
    label: 'TM_Building_0001_brownstone_3s',
    location: [1000, 500, 525],
    scale: [3, 2, 10.5],
    rotation: [0, 0, 0],
    stories: 3,
    styleName: 'brownstone',
  },
  {
    label: 'TM_Building_0002_brick_4s',
    location: [2000, 500, 700],
    scale: [4, 2, 14],
    rotation: [0, 0, 0],
    stories: 4,
    styleName: 'brick_commercial',
  },
];

// Lamp positions
const testLamps = [
  { label: 'TM_Lamp_0001_primary', location: [500, 300, 420] },
  { label: 'TM_Lamp_0002_primary', location: [3500, 300, 420] },
  { label: 'TM_Lamp_0003_secondary', location: [300, 2000, 420] },
];

// ─── Particle Catalog Tests ────────────────────────────────────

describe('Particle Catalog', () => {
  describe('PARTICLE_TYPES data integrity', () => {
    it('all particle types have required fields', () => {
      for (const p of PARTICLE_TYPES) {
        assert.ok(p.type, 'Missing type');
        assert.ok(p.label, `${p.type}: missing label`);
        assert.ok(['building', 'street', 'lamp', 'surface', 'window'].includes(p.category),
          `${p.type}: invalid category "${p.category}"`);
        assert.equal(typeof p.densityWeight, 'number', `${p.type}: densityWeight must be number`);
        assert.ok(p.densityWeight > 0 && p.densityWeight <= 1, `${p.type}: densityWeight must be 0-1`);
        assert.ok(Array.isArray(p.spawnOffset) && p.spawnOffset.length === 3, `${p.type}: spawnOffset must be [x,y,z]`);
        assert.ok(p.triggerConditions != null, `${p.type}: missing triggerConditions`);
        assert.ok(p.worldStateBindings != null, `${p.type}: missing worldStateBindings`);
      }
    });

    it('all particle types are unique', () => {
      const types = PARTICLE_TYPES.map(p => p.type);
      const unique = new Set(types);
      assert.equal(types.length, unique.size, 'Duplicate particle types found');
    });

    it('has exactly 5 particle types', () => {
      assert.equal(PARTICLE_TYPES.length, 5);
    });
  });

  describe('getParticlesForYear', () => {
    it('chimney_smoke excluded after 1970', () => {
      const particles1884 = getParticlesForYear(1884);
      assert.ok(particles1884.some(p => p.type === 'chimney_smoke'), 'chimney_smoke in 1884');

      const particles1970 = getParticlesForYear(1970);
      assert.ok(particles1970.some(p => p.type === 'chimney_smoke'), 'chimney_smoke in 1970 (yearEnd inclusive)');

      const particles2024 = getParticlesForYear(2024);
      assert.ok(!particles2024.some(p => p.type === 'chimney_smoke'), 'No chimney_smoke in 2024');
    });

    it('street_dust available in all eras', () => {
      for (const year of [1800, 1884, 1978, 2024]) {
        const particles = getParticlesForYear(year);
        assert.ok(particles.some(p => p.type === 'street_dust'), `street_dust missing in ${year}`);
      }
    });

    it('window_glow available in all eras', () => {
      for (const year of [1800, 1884, 1978, 2024]) {
        const particles = getParticlesForYear(year);
        assert.ok(particles.some(p => p.type === 'window_glow'), `window_glow missing in ${year}`);
      }
    });
  });

  describe('getParticlesByCategory', () => {
    it('returns building category particles', () => {
      const building = getParticlesByCategory(1884, 'building');
      assert.ok(building.length > 0);
      for (const p of building) {
        assert.equal(p.category, 'building');
      }
    });

    it('returns lamp category particles', () => {
      const lamp = getParticlesByCategory(1884, 'lamp');
      assert.equal(lamp.length, 1);
      assert.equal(lamp[0].type, 'lamp_glow');
    });
  });

  describe('computeSmokeDensity', () => {
    it('returns higher values in cold weather', () => {
      const cold = computeSmokeDensity(-10, { fuel: 'coal', smokeDensity: 0.8 });
      const mild = computeSmokeDensity(10, { fuel: 'coal', smokeDensity: 0.8 });
      const warm = computeSmokeDensity(18, { fuel: 'coal', smokeDensity: 0.8 });
      assert.ok(cold > mild, `Cold ${cold} should be > mild ${mild}`);
      assert.ok(mild > warm, `Mild ${mild} should be > warm ${warm}`);
    });

    it('returns 0 for gas_electric fuel', () => {
      const density = computeSmokeDensity(-10, { fuel: 'gas_electric', smokeColor: null, smokeDensity: 0 });
      assert.equal(density, 0);
    });

    it('returns value between 0 and 1', () => {
      const density = computeSmokeDensity(0, { fuel: 'coal', smokeDensity: 0.8 });
      assert.ok(density >= 0 && density <= 1, `Density ${density} out of range`);
    });

    it('handles null fuel gracefully', () => {
      const density = computeSmokeDensity(0, null);
      assert.equal(density, 0);
    });
  });

  describe('summarizeParticlesForYear', () => {
    it('returns total and byCategory breakdown', () => {
      const summary = summarizeParticlesForYear(1884);
      assert.ok(summary.total > 0);
      assert.ok(summary.byCategory.building > 0);
      assert.ok(Array.isArray(summary.types));
      assert.equal(summary.types.length, summary.total);
    });
  });
});

// ─── Particle Placement Tests ──────────────────────────────────

describe('Particle Placement', () => {
  describe('placeChimneySmoke', () => {
    it('places smoke above buildings for 1884', () => {
      const smoke = placeChimneySmoke(testBuildings, { year: 1884 });
      // With density 0.5 default, some buildings get smoke
      for (const p of smoke) {
        assert.equal(p.type, 'chimney_smoke');
        assert.equal(p.spawnType, 'niagara');
        assert.ok(p.location[2] > 500, 'Smoke should be above rooftop');
      }
    });

    it('returns empty for post-1970', () => {
      const smoke = placeChimneySmoke(testBuildings, { year: 2024 });
      assert.equal(smoke.length, 0);
    });
  });

  describe('placeLampGlow', () => {
    it('places one particle per lamp position', () => {
      const glow = placeLampGlow(testLamps, { year: 1884 });
      assert.equal(glow.length, testLamps.length);
    });

    it('all entries are niagara type', () => {
      const glow = placeLampGlow(testLamps, { year: 1884 });
      for (const p of glow) {
        assert.equal(p.spawnType, 'niagara');
        assert.equal(p.type, 'lamp_glow');
      }
    });

    it('positions match lamp positions', () => {
      const glow = placeLampGlow(testLamps, { year: 1884 });
      for (let i = 0; i < glow.length; i++) {
        assert.deepEqual(glow[i].location, testLamps[i].location);
      }
    });
  });

  describe('placeWindowGlow', () => {
    it('entries have color and intensity fields', () => {
      const windows = placeWindowGlow(testBuildings, { year: 1884, density: 1.0 });
      assert.ok(windows.length > 0, 'Should place at least some windows');
      for (const w of windows) {
        assert.ok(w.color, `${w.label}: missing color`);
        assert.ok(w.color.R != null, `${w.label}: missing color.R`);
        assert.ok(w.color.G != null, `${w.label}: missing color.G`);
        assert.ok(w.color.B != null, `${w.label}: missing color.B`);
        assert.ok(w.intensity > 0, `${w.label}: missing or zero intensity`);
        assert.ok(w.attenuationRadius > 0, `${w.label}: missing attenuationRadius`);
      }
    });

    it('uses gas-era warm color for 1884', () => {
      const windows = placeWindowGlow(testBuildings, { year: 1884, density: 1.0 });
      assert.ok(windows.length > 0);
      // Gas era: R:255 G:170 B:80
      assert.equal(windows[0].color.R, 255);
      assert.equal(windows[0].color.G, 170);
      assert.equal(windows[0].color.B, 80);
    });

    it('uses cooler electric color for 2024', () => {
      const windows = placeWindowGlow(testBuildings, { year: 2024, density: 1.0 });
      assert.ok(windows.length > 0);
      // Electric era: R:255 G:220 B:170
      assert.equal(windows[0].color.R, 255);
      assert.equal(windows[0].color.G, 220);
      assert.equal(windows[0].color.B, 170);
    });

    it('all entries are pointlight type', () => {
      const windows = placeWindowGlow(testBuildings, { year: 1884, density: 1.0 });
      for (const w of windows) {
        assert.equal(w.spawnType, 'pointlight');
      }
    });

    it('window occupancy is deterministic (seeded)', () => {
      const windows1 = placeWindowGlow(testBuildings, { year: 1884, density: 0.5 });
      const windows2 = placeWindowGlow(testBuildings, { year: 1884, density: 0.5 });
      assert.equal(windows1.length, windows2.length, 'Same input should produce same count');
      for (let i = 0; i < windows1.length; i++) {
        assert.deepEqual(windows1[i].location, windows2[i].location, `Location mismatch at ${i}`);
      }
    });
  });

  describe('placeRainSplash', () => {
    it('places entries at ground level', () => {
      const intersections = [{ x: 0, y: 0, roadCount: 2, categories: ['primary', 'secondary'] }];
      const splashes = placeRainSplash(testSplines, intersections, { year: 1884, density: 1.0 });
      assert.ok(splashes.length > 0, 'Should place rain splashes');
      for (const s of splashes) {
        assert.ok(s.location[2] <= 5, `Rain splash z=${s.location[2]} should be near ground`);
        assert.equal(s.spawnType, 'niagara');
      }
    });
  });

  describe('placeStreetDust', () => {
    it('placement is deterministic', () => {
      const dust1 = placeStreetDust(testSplines, { year: 1884, density: 1.0 });
      const dust2 = placeStreetDust(testSplines, { year: 1884, density: 1.0 });
      assert.equal(dust1.length, dust2.length, 'Same input should produce same count');
      for (let i = 0; i < dust1.length; i++) {
        assert.deepEqual(dust1[i].location, dust2[i].location, `Location mismatch at ${i}`);
      }
    });

    it('all entries are niagara type at ground level', () => {
      const dust = placeStreetDust(testSplines, { year: 1884, density: 1.0 });
      for (const d of dust) {
        assert.equal(d.spawnType, 'niagara');
        assert.equal(d.location[2], 5);
      }
    });
  });

  describe('placeAllParticles', () => {
    it('requires year parameter', () => {
      assert.throws(
        () => placeAllParticles({}),
        /year is required/,
      );
    });

    it('returns combined array with spawnType field', () => {
      const all = placeAllParticles({
        buildings: testBuildings,
        splines: testSplines,
        lampPositions: testLamps,
        year: 1884,
        density: 1.0,
      });
      assert.ok(all.length > 0, 'Should place at least some particles');

      for (const p of all) {
        assert.ok(p.spawnType === 'niagara' || p.spawnType === 'pointlight',
          `${p.label}: invalid spawnType "${p.spawnType}"`);
      }
    });

    it('all labels start with TM_Particle_', () => {
      const all = placeAllParticles({
        buildings: testBuildings,
        splines: testSplines,
        lampPositions: testLamps,
        year: 1884,
        density: 1.0,
      });
      for (const p of all) {
        assert.ok(p.label.startsWith(PARTICLE_PREFIX),
          `Label should start with ${PARTICLE_PREFIX}, got ${p.label}`);
      }
    });

    it('--only filtering works', () => {
      const all = placeAllParticles({
        buildings: testBuildings,
        splines: testSplines,
        lampPositions: testLamps,
        year: 1884,
        density: 1.0,
        only: ['lamp_glow'],
      });
      for (const p of all) {
        assert.equal(p.type, 'lamp_glow', `Only lamp_glow should appear, got ${p.type}`);
      }
      assert.equal(all.length, testLamps.length, 'Should have one per lamp');
    });

    it('--exclude filtering works', () => {
      const all = placeAllParticles({
        buildings: testBuildings,
        splines: testSplines,
        lampPositions: testLamps,
        year: 1884,
        density: 1.0,
        exclude: ['window_glow', 'chimney_smoke'],
      });
      for (const p of all) {
        assert.ok(p.type !== 'window_glow' && p.type !== 'chimney_smoke',
          `Excluded type should not appear: ${p.type}`);
      }
    });

    it('excludes chimney_smoke after 1970 even without explicit exclude', () => {
      const all = placeAllParticles({
        buildings: testBuildings,
        splines: testSplines,
        lampPositions: testLamps,
        year: 2024,
        density: 1.0,
      });
      assert.ok(!all.some(p => p.type === 'chimney_smoke'), 'No chimney smoke in 2024');
    });
  });

  describe('buildParticleSpawnScript', () => {
    it('generates script with both NiagaraActor and PointLight', () => {
      const all = placeAllParticles({
        buildings: testBuildings,
        splines: testSplines,
        lampPositions: testLamps,
        year: 1884,
        density: 1.0,
      });
      const script = buildParticleSpawnScript(all);

      assert.ok(script.includes('import unreal'), 'Should have unreal import');
      assert.ok(script.includes('NiagaraActor'), 'Should include NiagaraActor spawn');
      assert.ok(script.includes('PointLight'), 'Should include PointLight spawn');
      assert.ok(script.includes('spawn_actor_from_class'), 'Should have spawn calls');
    });

    it('includes clear block when clearExisting is true', () => {
      const script = buildParticleSpawnScript([], { clearExisting: true });
      assert.ok(script.includes(PARTICLE_PREFIX));
      assert.ok(script.includes('destroy()'));
    });

    it('does not include clear block by default', () => {
      const script = buildParticleSpawnScript([]);
      assert.ok(!script.includes('destroy()'));
    });
  });
});
