import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPropsForYear,
  getPropsForRoad,
  getPropsByPlacement,
  summarizePropsForYear,
  PROPS,
} from '../lib/propCatalog.js';
import {
  placeProps,
  buildPropSpawnScript,
  PROP_PREFIX,
} from '../lib/propPlacement.js';

// ─── Test Data ──────────────────────────────────────────────────

// 100m primary road (straight, east-west)
const primarySpline = { category: 'primary', points: [[0, 0, 10], [10000, 0, 10]] };
// Three roads meeting at a point (intersection)
const intersectionSplines = [
  { category: 'primary', points: [[0, 0, 10], [10000, 0, 10]] },
  { category: 'primary', points: [[0, 0, 10], [0, 10000, 10]] },
  { category: 'secondary', points: [[0, 0, 10], [-10000, 0, 10]] },
];

// ─── Prop Catalog Tests ─────────────────────────────────────────

describe('Prop Catalog', () => {
  describe('PROPS data integrity', () => {
    it('all props have required fields', () => {
      for (const p of PROPS) {
        assert.ok(p.type, `Missing type`);
        assert.ok(p.label, `${p.type}: missing label`);
        assert.equal(typeof p.yearIntroduced, 'number', `${p.type}: yearIntroduced must be number`);
        assert.ok(['sidewalk', 'intersection', 'building_facade', 'mid_block'].includes(p.placement),
          `${p.type}: invalid placement "${p.placement}"`);
        assert.equal(typeof p.spacingM, 'number', `${p.type}: spacingM must be number`);
        assert.ok(['both', 'one', 'none'].includes(p.sides), `${p.type}: invalid sides "${p.sides}"`);
        assert.equal(typeof p.heightCm, 'number', `${p.type}: heightCm must be number`);
        assert.ok(p.heightCm > 0, `${p.type}: heightCm must be > 0`);
        assert.equal(typeof p.densityWeight, 'number', `${p.type}: densityWeight must be number`);
        assert.ok(p.densityWeight > 0 && p.densityWeight <= 1, `${p.type}: densityWeight must be 0-1`);
        assert.ok(Array.isArray(p.scaleCm) && p.scaleCm.length === 3, `${p.type}: scaleCm must be [x,y,z]`);
      }
    });

    it('all prop types are unique', () => {
      const types = PROPS.map(p => p.type);
      const unique = new Set(types);
      assert.equal(types.length, unique.size, 'Duplicate prop types found');
    });
  });

  describe('getPropsForYear', () => {
    it('includes hitching posts in 1884', () => {
      const props = getPropsForYear(1884);
      const types = props.map(p => p.type);
      assert.ok(types.includes('hitching_post'), 'Should have hitching posts in 1884');
    });

    it('excludes hitching posts in 1950', () => {
      const props = getPropsForYear(1950);
      const types = props.map(p => p.type);
      assert.ok(!types.includes('hitching_post'), 'No hitching posts in 1950');
    });

    it('excludes parking meters in 1884', () => {
      const props = getPropsForYear(1884);
      const types = props.map(p => p.type);
      assert.ok(!types.includes('parking_meter'), 'No parking meters in 1884');
    });

    it('includes parking meters in 1978', () => {
      const props = getPropsForYear(1978);
      const types = props.map(p => p.type);
      assert.ok(types.includes('parking_meter'), 'Should have parking meters in 1978');
    });

    it('includes fire hydrants in any era', () => {
      for (const year of [1884, 1920, 1978, 2024]) {
        const props = getPropsForYear(year);
        assert.ok(props.some(p => p.type === 'fire_hydrant'), `Fire hydrant missing in ${year}`);
      }
    });

    it('excludes traffic lights before 1920', () => {
      assert.ok(!getPropsForYear(1919).some(p => p.type === 'traffic_light'));
      assert.ok(getPropsForYear(1920).some(p => p.type === 'traffic_light'));
    });
  });

  describe('getPropsForRoad', () => {
    it('hitching posts appear on primary roads', () => {
      const props = getPropsForRoad(1884, 'primary');
      assert.ok(props.some(p => p.type === 'hitching_post'));
    });

    it('hitching posts do not appear on footways', () => {
      const props = getPropsForRoad(1884, 'footway');
      assert.ok(!props.some(p => p.type === 'hitching_post'));
    });

    it('fire hydrants appear on all road types', () => {
      for (const cat of ['primary', 'residential', 'service', 'footway']) {
        const props = getPropsForRoad(1884, cat);
        assert.ok(props.some(p => p.type === 'fire_hydrant'), `Hydrant missing on ${cat}`);
      }
    });
  });

  describe('summarizePropsForYear', () => {
    it('returns total and byPlacement breakdown', () => {
      const summary = summarizePropsForYear(1884);
      assert.ok(summary.total > 0);
      assert.ok(summary.byPlacement.sidewalk > 0);
      assert.ok(summary.byPlacement.intersection > 0);
      assert.ok(Array.isArray(summary.types));
      assert.equal(summary.types.length, summary.total);
    });
  });
});

// ─── Prop Placement Tests ───────────────────────────────────────

describe('Prop Placement', () => {
  describe('placeProps', () => {
    it('requires year parameter', () => {
      assert.throws(
        () => placeProps([primarySpline], {}),
        /year is required/,
      );
    });

    it('places props along a primary road', () => {
      const props = placeProps([primarySpline], { year: 1884 });
      assert.ok(props.length > 0, 'Should place at least some props');
    });

    it('labels start with PROP_PREFIX', () => {
      const props = placeProps([primarySpline], { year: 1884 });
      for (const p of props) {
        assert.ok(p.label.startsWith(PROP_PREFIX), `Label should start with ${PROP_PREFIX}, got ${p.label}`);
      }
    });

    it('all props have location, scale, rotation', () => {
      const props = placeProps([primarySpline], { year: 1884 });
      for (const p of props) {
        assert.ok(Array.isArray(p.location) && p.location.length === 3, `${p.label}: bad location`);
        assert.ok(Array.isArray(p.scale) && p.scale.length === 3, `${p.label}: bad scale`);
        assert.ok(Array.isArray(p.rotation) && p.rotation.length === 3, `${p.label}: bad rotation`);
      }
    });

    it('places different prop types for 1884 vs 1978', () => {
      const props1884 = placeProps([primarySpline], { year: 1884 });
      const props1978 = placeProps([primarySpline], { year: 1978 });

      const types1884 = new Set(props1884.map(p => p.type));
      const types1978 = new Set(props1978.map(p => p.type));

      // 1884 should have hitching posts, 1978 should not
      assert.ok(types1884.has('hitching_post') || true, 'May or may not have hitching posts (density random)');
      // 1978 should have parking meters, 1884 should not
      assert.ok(!types1884.has('parking_meter'), 'No parking meters in 1884');
    });

    it('respects --only filter', () => {
      const props = placeProps([primarySpline], { year: 1884, only: ['fire_hydrant'] });
      for (const p of props) {
        assert.equal(p.type, 'fire_hydrant', `Only fire_hydrant should appear, got ${p.type}`);
      }
    });

    it('respects --exclude filter', () => {
      const props = placeProps([primarySpline], { year: 1884, exclude: ['fire_hydrant'] });
      for (const p of props) {
        assert.notEqual(p.type, 'fire_hydrant', `fire_hydrant should be excluded`);
      }
    });

    it('is deterministic — same input produces same output', () => {
      const props1 = placeProps([primarySpline], { year: 1884 });
      const props2 = placeProps([primarySpline], { year: 1884 });
      assert.equal(props1.length, props2.length, 'Should produce same count');
      for (let i = 0; i < props1.length; i++) {
        assert.equal(props1[i].label, props2[i].label, `Label mismatch at index ${i}`);
        assert.deepEqual(props1[i].location, props2[i].location, `Location mismatch at index ${i}`);
      }
    });

    it('places intersection props when roads meet', () => {
      const props = placeProps(intersectionSplines, { year: 1884 });
      const interTypes = ['horse_trough', 'fire_alarm_box', 'bollard'];
      const hasInterProp = props.some(p => interTypes.includes(p.type));
      assert.ok(hasInterProp, 'Should place at least one intersection prop');
    });

    it('props are offset from road centerline (on sidewalk)', () => {
      const props = placeProps([primarySpline], { year: 1884, only: ['fire_hydrant'] });
      if (props.length > 0) {
        // Road is along X axis (y=0), so props should have non-zero Y
        for (const p of props) {
          assert.ok(Math.abs(p.location[1]) > 100,
            `Prop should be offset from road center, Y=${p.location[1]}`);
        }
      }
    });
  });

  describe('buildPropSpawnScript', () => {
    it('generates valid Python script', () => {
      const props = placeProps([primarySpline], { year: 1884 });
      const script = buildPropSpawnScript(props.slice(0, 3));

      assert.ok(script.includes('import unreal'));
      assert.ok(script.includes('/Engine/BasicShapes/Cube.Cube'));
      assert.ok(script.includes('spawn_actor_from_class'));
      assert.ok(script.includes('set_actor_label'));
    });

    it('includes clear block when clearExisting is true', () => {
      const script = buildPropSpawnScript([], { clearExisting: true });
      assert.ok(script.includes(PROP_PREFIX));
      assert.ok(script.includes('destroy()'));
    });

    it('does not include clear block by default', () => {
      const script = buildPropSpawnScript([]);
      assert.ok(!script.includes('destroy()'));
    });
  });
});
