import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLUTTER_TYPES,
  getClutterForYear,
  getClutterByCategory,
  getClutterForRoad,
  computeSeasonalDensity,
  summarizeClutterForYear,
} from '../lib/clutterCatalog.js';
import {
  placeStreetClutter,
  placeClothItems,
  placeAnimatedProps,
  placeAllClutter,
  buildClutterSpawnScript,
  CLUTTER_PREFIX,
} from '../lib/clutterPlacement.js';

// ─── Test Data ──────────────────────────────────────────────────

// 100m primary road (straight, east-west)
const primarySpline = { category: 'primary', points: [[0, 0, 10], [10000, 0, 10]] };
// 200m secondary road
const secondarySpline = { category: 'secondary', points: [[0, 0, 10], [20000, 0, 10]] };
// Residential road
const residentialSpline = { category: 'residential', points: [[0, 0, 10], [10000, 0, 10]] };

// Mock buildings for cloth/animated placement
const mockBuildings = [
  {
    geometry: {
      type: 'Polygon',
      coordinates: [[[100, 200], [600, 200], [600, 700], [100, 700], [100, 200]]],
    },
    properties: { stories: 4 },
  },
  {
    geometry: {
      type: 'Polygon',
      coordinates: [[[1000, 200], [1500, 200], [1500, 700], [1000, 700], [1000, 200]]],
    },
    properties: { stories: 3 },
  },
  {
    geometry: {
      type: 'Polygon',
      coordinates: [[[2000, 200], [2400, 200], [2400, 600], [2000, 600], [2000, 200]]],
    },
    properties: { stories: 5 },
  },
];

// ─── Clutter Catalog Tests ─────────────────────────────────────

describe('Clutter Catalog', () => {
  describe('CLUTTER_TYPES data integrity', () => {
    it('all entries have required fields', () => {
      for (const c of CLUTTER_TYPES) {
        assert.ok(c.type, 'Missing type');
        assert.ok(c.label, `${c.type}: missing label`);
        assert.ok(['clutter', 'cloth', 'animated'].includes(c.category),
          `${c.type}: invalid category "${c.category}"`);
        assert.equal(typeof c.yearIntroduced, 'number', `${c.type}: yearIntroduced must be number`);
        assert.ok(['gutter', 'sidewalk', 'building_facade', 'rooftop'].includes(c.placement),
          `${c.type}: invalid placement "${c.placement}"`);
        assert.equal(typeof c.scatterDensityPer100m, 'number', `${c.type}: scatterDensityPer100m must be number`);
        assert.ok(c.scatterDensityPer100m > 0, `${c.type}: scatterDensityPer100m must be > 0`);
        assert.equal(typeof c.heightCm, 'number', `${c.type}: heightCm must be number`);
        assert.equal(typeof c.densityWeight, 'number', `${c.type}: densityWeight must be number`);
        assert.ok(c.densityWeight > 0 && c.densityWeight <= 1, `${c.type}: densityWeight must be 0-1`);
        assert.ok(Array.isArray(c.scaleCm) && c.scaleCm.length === 3, `${c.type}: scaleCm must be [x,y,z]`);
        assert.equal(typeof c.windResponsive, 'boolean', `${c.type}: windResponsive must be boolean`);
      }
    });

    it('all types are unique', () => {
      const types = CLUTTER_TYPES.map(c => c.type);
      const unique = new Set(types);
      assert.equal(types.length, unique.size, 'Duplicate clutter types found');
    });

    it('has 8 clutter + 4 cloth + 3 animated = 15 total', () => {
      assert.equal(CLUTTER_TYPES.length, 15, 'Expected 15 total entries');
      const clutter = CLUTTER_TYPES.filter(c => c.category === 'clutter');
      const cloth = CLUTTER_TYPES.filter(c => c.category === 'cloth');
      const animated = CLUTTER_TYPES.filter(c => c.category === 'animated');
      assert.equal(clutter.length, 8, 'Expected 8 clutter entries');
      assert.equal(cloth.length, 4, 'Expected 4 cloth entries');
      assert.equal(animated.length, 3, 'Expected 3 animated entries');
    });
  });

  describe('getClutterForYear', () => {
    it('excludes horse_manure after 1920', () => {
      const items = getClutterForYear(1921);
      assert.ok(!items.some(c => c.type === 'horse_manure'), 'No horse manure after 1920');
    });

    it('includes horse_manure in 1884', () => {
      const items = getClutterForYear(1884);
      assert.ok(items.some(c => c.type === 'horse_manure'), 'Should have horse manure in 1884');
    });

    it('excludes cigarette_butts before 1880', () => {
      const items = getClutterForYear(1879);
      assert.ok(!items.some(c => c.type === 'cigarette_butts'), 'No cigarette butts before 1880');
    });

    it('includes cigarette_butts in 1880', () => {
      const items = getClutterForYear(1880);
      assert.ok(items.some(c => c.type === 'cigarette_butts'), 'Should have cigarette butts in 1880');
    });

    it('excludes bottle_caps before 1892', () => {
      const items = getClutterForYear(1891);
      assert.ok(!items.some(c => c.type === 'bottle_caps'), 'No bottle caps before 1892');
    });

    it('includes bottle_caps in 1892', () => {
      const items = getClutterForYear(1892);
      assert.ok(items.some(c => c.type === 'bottle_caps'), 'Should have bottle caps in 1892');
    });

    it('excludes coal_ash after 1960', () => {
      const items = getClutterForYear(1961);
      assert.ok(!items.some(c => c.type === 'coal_ash'), 'No coal ash after 1960');
    });

    it('includes leaves in any era', () => {
      for (const year of [1700, 1884, 1978, 2024]) {
        const items = getClutterForYear(year);
        assert.ok(items.some(c => c.type === 'leaves'), `Leaves missing in ${year}`);
      }
    });
  });

  describe('getClutterByCategory', () => {
    it('returns only clutter category items', () => {
      const items = getClutterByCategory(1884, 'clutter');
      for (const c of items) {
        assert.equal(c.category, 'clutter', `Expected clutter category, got ${c.category}`);
      }
      assert.ok(items.length > 0, 'Should have clutter items');
    });

    it('returns only cloth category items', () => {
      const items = getClutterByCategory(1884, 'cloth');
      for (const c of items) {
        assert.equal(c.category, 'cloth', `Expected cloth category, got ${c.category}`);
      }
      assert.equal(items.length, 4, 'Should have 4 cloth items');
    });

    it('returns only animated category items', () => {
      const items = getClutterByCategory(1884, 'animated');
      for (const c of items) {
        assert.equal(c.category, 'animated', `Expected animated category, got ${c.category}`);
      }
      assert.equal(items.length, 3, 'Should have 3 animated items');
    });
  });

  describe('getClutterForRoad', () => {
    it('returns items for primary roads', () => {
      const items = getClutterForRoad(1884, 'primary');
      assert.ok(items.length > 0, 'Should have items for primary roads');
    });

    it('flag_banner only on primary/secondary', () => {
      const onPrimary = getClutterForRoad(1884, 'primary');
      const onResidential = getClutterForRoad(1884, 'residential');
      assert.ok(onPrimary.some(c => c.type === 'flag_banner'), 'Flag on primary');
      assert.ok(!onResidential.some(c => c.type === 'flag_banner'), 'No flag on residential');
    });

    it('rocking_chair only on residential/tertiary', () => {
      const onResidential = getClutterForRoad(1884, 'residential');
      const onPrimary = getClutterForRoad(1884, 'primary');
      assert.ok(onResidential.some(c => c.type === 'rocking_chair'), 'Chair on residential');
      assert.ok(!onPrimary.some(c => c.type === 'rocking_chair'), 'No chair on primary');
    });

    it('leaves appear on all road types (roadCategories null)', () => {
      for (const cat of ['primary', 'residential', 'service', 'footway']) {
        const items = getClutterForRoad(1884, cat);
        assert.ok(items.some(c => c.type === 'leaves'), `Leaves missing on ${cat}`);
      }
    });
  });

  describe('computeSeasonalDensity', () => {
    const leavesDef = CLUTTER_TYPES.find(c => c.type === 'leaves');

    it('returns 1.0 for items without seasonalWeight', () => {
      const newspaper = CLUTTER_TYPES.find(c => c.type === 'newspaper');
      assert.equal(computeSeasonalDensity(newspaper, 6), 1.0);
      assert.equal(computeSeasonalDensity(newspaper, 10), 1.0);
    });

    it('fall leaves density > summer leaves density', () => {
      const fall = computeSeasonalDensity(leavesDef, 10);   // October
      const summer = computeSeasonalDensity(leavesDef, 7);  // July
      assert.ok(fall > summer, `Fall (${fall}) should be > summer (${summer})`);
    });

    it('returns correct values per season', () => {
      assert.equal(computeSeasonalDensity(leavesDef, 4), 0.3, 'Spring (April)');
      assert.equal(computeSeasonalDensity(leavesDef, 7), 0.1, 'Summer (July)');
      assert.equal(computeSeasonalDensity(leavesDef, 10), 1.0, 'Fall (October)');
      assert.equal(computeSeasonalDensity(leavesDef, 1), 0.3, 'Winter (January)');
      assert.equal(computeSeasonalDensity(leavesDef, 12), 0.3, 'Winter (December)');
    });

    it('maps month 3 to spring', () => {
      assert.equal(computeSeasonalDensity(leavesDef, 3), 0.3, 'March = spring');
    });

    it('maps month 5 to spring', () => {
      assert.equal(computeSeasonalDensity(leavesDef, 5), 0.3, 'May = spring');
    });

    it('maps month 11 to fall', () => {
      assert.equal(computeSeasonalDensity(leavesDef, 11), 1.0, 'November = fall');
    });
  });

  describe('summarizeClutterForYear', () => {
    it('returns total and byCategory breakdown', () => {
      const summary = summarizeClutterForYear(1884);
      assert.ok(summary.total > 0);
      assert.ok(summary.byCategory.clutter > 0);
      assert.ok(summary.byCategory.cloth > 0);
      assert.ok(summary.byCategory.animated > 0);
      assert.ok(Array.isArray(summary.types));
      assert.equal(summary.types.length, summary.total);
    });
  });
});

// ─── Clutter Placement Tests ───────────────────────────────────

describe('Clutter Placement', () => {
  describe('placeStreetClutter', () => {
    it('requires year parameter', () => {
      assert.throws(
        () => placeStreetClutter([primarySpline], {}),
        /year is required/,
      );
    });

    it('scatters clutter along a primary road', () => {
      const items = placeStreetClutter([primarySpline], { year: 1884, density: 1.0 });
      assert.ok(items.length > 0, 'Should place at least some clutter');
    });

    it('is deterministic — same input produces same output', () => {
      const items1 = placeStreetClutter([primarySpline], { year: 1884 });
      const items2 = placeStreetClutter([primarySpline], { year: 1884 });
      assert.equal(items1.length, items2.length, 'Should produce same count');
      for (let i = 0; i < items1.length; i++) {
        assert.equal(items1[i].type, items2[i].type, `Type mismatch at index ${i}`);
        assert.equal(items1[i].x, items2[i].x, `X mismatch at index ${i}`);
        assert.equal(items1[i].y, items2[i].y, `Y mismatch at index ${i}`);
      }
    });

    it('respects --only filter', () => {
      const items = placeStreetClutter([secondarySpline], { year: 1884, only: ['newspaper'], density: 1.0 });
      for (const item of items) {
        assert.equal(item.type, 'newspaper', `Only newspaper should appear, got ${item.type}`);
      }
    });

    it('respects --exclude filter', () => {
      const items = placeStreetClutter([primarySpline], { year: 1884, exclude: ['newspaper'] });
      for (const item of items) {
        assert.notEqual(item.type, 'newspaper', 'newspaper should be excluded');
      }
    });

    it('produces fewer leaves in summer than fall', () => {
      const summer = placeStreetClutter([secondarySpline], { year: 1884, month: 7, density: 1.0, only: ['leaves'] });
      const fall = placeStreetClutter([secondarySpline], { year: 1884, month: 10, density: 1.0, only: ['leaves'] });
      assert.ok(fall.length > summer.length,
        `Fall leaves (${fall.length}) should exceed summer (${summer.length})`);
    });
  });

  describe('placeClothItems', () => {
    it('requires year parameter', () => {
      assert.throws(
        () => placeClothItems(mockBuildings, {}),
        /year is required/,
      );
    });

    it('places cloth items on buildings', () => {
      const items = placeClothItems(mockBuildings, { year: 1884 });
      assert.ok(items.length > 0, 'Should place at least some cloth items');
      for (const item of items) {
        assert.equal(item.clutterDef.category, 'cloth');
      }
    });
  });

  describe('placeAnimatedProps', () => {
    it('requires year parameter', () => {
      assert.throws(
        () => placeAnimatedProps(mockBuildings, {}),
        /year is required/,
      );
    });

    it('places animated props on buildings', () => {
      const items = placeAnimatedProps(mockBuildings, { year: 1884 });
      assert.ok(items.length > 0, 'Should place at least some animated props');
      for (const item of items) {
        assert.equal(item.clutterDef.category, 'animated');
      }
    });
  });

  describe('placeAllClutter', () => {
    it('labels start with TM_Clutter_', () => {
      const items = placeAllClutter([primarySpline], mockBuildings, { year: 1884 });
      for (const item of items) {
        assert.ok(item.label.startsWith('TM_Clutter_'),
          `Label should start with TM_Clutter_, got ${item.label}`);
      }
    });

    it('all items have location, scale, rotation', () => {
      const items = placeAllClutter([primarySpline], mockBuildings, { year: 1884 });
      for (const item of items) {
        assert.ok(Array.isArray(item.location) && item.location.length === 3, `${item.label}: bad location`);
        assert.ok(Array.isArray(item.scale) && item.scale.length === 3, `${item.label}: bad scale`);
        assert.ok(Array.isArray(item.rotation) && item.rotation.length === 3, `${item.label}: bad rotation`);
      }
    });

    it('includes animationType field', () => {
      const items = placeAllClutter([primarySpline], mockBuildings, { year: 1884 });
      for (const item of items) {
        assert.ok('animationType' in item, `${item.label}: missing animationType`);
      }
    });

    it('respects noCloth flag', () => {
      const withCloth = placeAllClutter([primarySpline], mockBuildings, { year: 1884 });
      const noCloth = placeAllClutter([primarySpline], mockBuildings, { year: 1884, noCloth: true });
      const clothInWith = withCloth.filter(i => i.animationType === 'cloth');
      const clothInNo = noCloth.filter(i => i.animationType === 'cloth');
      assert.ok(clothInWith.length > 0, 'Should have cloth items when noCloth=false');
      assert.equal(clothInNo.length, 0, 'Should have no cloth items when noCloth=true');
    });

    it('respects noAnimated flag', () => {
      const withAnim = placeAllClutter([primarySpline], mockBuildings, { year: 1884 });
      const noAnim = placeAllClutter([primarySpline], mockBuildings, { year: 1884, noAnimated: true });
      const animTypes = ['skeletal_loop', 'material_anim'];
      const animInWith = withAnim.filter(i => animTypes.includes(i.animationType));
      const animInNo = noAnim.filter(i => animTypes.includes(i.animationType));
      assert.ok(animInWith.length > 0, 'Should have animated items when noAnimated=false');
      assert.equal(animInNo.length, 0, 'Should have no animated items when noAnimated=true');
    });
  });

  describe('buildClutterSpawnScript', () => {
    it('generates valid Python script', () => {
      const items = placeAllClutter([primarySpline], mockBuildings, { year: 1884 });
      const script = buildClutterSpawnScript(items.slice(0, 3));

      assert.ok(script.includes('import unreal'));
      assert.ok(script.includes('/Engine/BasicShapes/Cube.Cube'));
      assert.ok(script.includes('spawn_actor_from_class'));
      assert.ok(script.includes('set_actor_label'));
    });

    it('includes clear block when clearExisting is true', () => {
      const script = buildClutterSpawnScript([], { clearExisting: true });
      assert.ok(script.includes(CLUTTER_PREFIX));
      assert.ok(script.includes('destroy()'));
    });

    it('does not include clear block by default', () => {
      const script = buildClutterSpawnScript([]);
      assert.ok(!script.includes('destroy()'));
    });
  });
});
