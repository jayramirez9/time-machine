import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getFoliageForYear,
  getFoliageForRegion,
  getFoliageByCategory,
  getSeasonalCanopy,
  summarizeFoliageForYear,
  FOLIAGE_TYPES,
} from '../lib/foliageCatalog.js';
import {
  placeStreetTrees,
  placeGroundCover,
  buildFoliageSpawnScript,
  TREE_PREFIX,
  FOLIAGE_PREFIX,
} from '../lib/foliagePlacement.js';

// ─── Test Data ──────────────────────────────────────────────────

// 100m primary road (straight, east-west)
const primarySpline = { category: 'primary', points: [[0, 0, 10], [10000, 0, 10]] };
// Short secondary road
const secondarySpline = { category: 'secondary', points: [[0, 0, 10], [5000, 0, 10]] };

// Ground cover bounds (20m x 20m area)
const smallBounds = { minX: 0, minY: 0, maxX: 2000, maxY: 2000 };

// ─── Foliage Catalog Tests ──────────────────────────────────────

describe('Foliage Catalog', () => {
  describe('FOLIAGE_TYPES data integrity', () => {
    it('all entries have required fields', () => {
      for (const f of FOLIAGE_TYPES) {
        assert.ok(f.type, 'Missing type');
        assert.ok(f.label, `${f.type}: missing label`);
        assert.ok(['street_tree', 'park_tree', 'ground_cover', 'building_base'].includes(f.category),
          `${f.type}: invalid category "${f.category}"`);
        assert.ok(Array.isArray(f.regions) && f.regions.length > 0,
          `${f.type}: regions must be non-empty array`);
        assert.ok(['sidewalk', 'park', 'grid', 'perimeter'].includes(f.placement),
          `${f.type}: invalid placement "${f.placement}"`);
        assert.equal(typeof f.spacingM, 'number', `${f.type}: spacingM must be number`);
        assert.ok(f.spacingM > 0, `${f.type}: spacingM must be > 0`);
        assert.ok(['both', 'one', 'none'].includes(f.sides), `${f.type}: invalid sides "${f.sides}"`);
        assert.equal(typeof f.heightCm, 'number', `${f.type}: heightCm must be number`);
        assert.ok(f.heightCm > 0, `${f.type}: heightCm must be > 0`);
        assert.equal(typeof f.densityWeight, 'number', `${f.type}: densityWeight must be number`);
        assert.ok(f.densityWeight > 0 && f.densityWeight <= 1, `${f.type}: densityWeight must be 0-1`);
        assert.ok(Array.isArray(f.scaleCm) && f.scaleCm.length === 3, `${f.type}: scaleCm must be [x,y,z]`);
        assert.ok(f.seasonal && typeof f.seasonal === 'object', `${f.type}: missing seasonal`);
        for (const season of ['spring', 'summer', 'fall', 'winter']) {
          const val = f.seasonal[season];
          assert.equal(typeof val, 'number', `${f.type}: seasonal.${season} must be number`);
          assert.ok(val >= 0 && val <= 1, `${f.type}: seasonal.${season} must be 0-1, got ${val}`);
        }
      }
    });

    it('all foliage types are unique', () => {
      const types = FOLIAGE_TYPES.map(f => f.type);
      const unique = new Set(types);
      assert.equal(types.length, unique.size, 'Duplicate foliage types found');
    });

    it('has 8 street trees', () => {
      const streetTrees = FOLIAGE_TYPES.filter(f => f.category === 'street_tree');
      assert.equal(streetTrees.length, 8, `Expected 8 street trees, got ${streetTrees.length}`);
    });

    it('has 5 park trees', () => {
      const parkTrees = FOLIAGE_TYPES.filter(f => f.category === 'park_tree');
      assert.equal(parkTrees.length, 5, `Expected 5 park trees, got ${parkTrees.length}`);
    });

    it('has 4 ground cover types', () => {
      const groundCover = FOLIAGE_TYPES.filter(f => f.category === 'ground_cover');
      assert.equal(groundCover.length, 4, `Expected 4 ground cover, got ${groundCover.length}`);
    });

    it('has 3 building-base types', () => {
      const buildingBase = FOLIAGE_TYPES.filter(f => f.category === 'building_base');
      assert.equal(buildingBase.length, 3, `Expected 3 building-base, got ${buildingBase.length}`);
    });
  });

  describe('getFoliageForYear — era filtering', () => {
    it('includes American Elm before 1970', () => {
      const foliage = getFoliageForYear(1884);
      assert.ok(foliage.some(f => f.type === 'street_tree_american_elm'),
        'American Elm should be available in 1884');
    });

    it('excludes American Elm after 1970', () => {
      const foliage = getFoliageForYear(1980);
      assert.ok(!foliage.some(f => f.type === 'street_tree_american_elm'),
        'American Elm should not be available in 1980');
    });

    it('includes American Elm in 1970 (yearRemoved is inclusive)', () => {
      const foliage = getFoliageForYear(1970);
      assert.ok(foliage.some(f => f.type === 'street_tree_american_elm'),
        'American Elm should be available in 1970');
    });

    it('includes all types with null yearIntroduced/yearRemoved', () => {
      const foliage = getFoliageForYear(1800);
      const lawnGrass = foliage.find(f => f.type === 'ground_cover_lawn_grass');
      assert.ok(lawnGrass, 'Lawn grass (null year bounds) should be available in any year');
    });
  });

  describe('getFoliageForRegion — region filtering', () => {
    it('Live Oak only in southeast', () => {
      const ne = getFoliageForRegion(1884, 'northeast_us');
      const se = getFoliageForRegion(1884, 'southeast_us');
      assert.ok(!ne.some(f => f.type === 'street_tree_live_oak'),
        'Live Oak should not appear in northeast');
      assert.ok(se.some(f => f.type === 'street_tree_live_oak'),
        'Live Oak should appear in southeast');
    });

    it('Western Red Cedar only in pacific', () => {
      const ne = getFoliageForRegion(1884, 'northeast_us');
      const pac = getFoliageForRegion(1884, 'pacific_us');
      assert.ok(!ne.some(f => f.type === 'street_tree_western_red_cedar'),
        'Western Red Cedar should not appear in northeast');
      assert.ok(pac.some(f => f.type === 'street_tree_western_red_cedar'),
        'Western Red Cedar should appear in pacific');
    });

    it('ground cover appears in all regions', () => {
      for (const region of ['northeast_us', 'southeast_us', 'midwest_us', 'west_us', 'pacific_us']) {
        const foliage = getFoliageForRegion(2000, region);
        assert.ok(foliage.some(f => f.category === 'ground_cover'),
          `Ground cover should appear in ${region}`);
      }
    });
  });

  describe('getFoliageByCategory', () => {
    it('returns only the requested category', () => {
      const trees = getFoliageByCategory(1884, 'northeast_us', 'street_tree');
      for (const f of trees) {
        assert.equal(f.category, 'street_tree', `Expected street_tree, got ${f.category}`);
      }
    });

    it('returns empty for mismatched region/category', () => {
      const liveOaks = getFoliageByCategory(1884, 'northeast_us', 'street_tree')
        .filter(f => f.type === 'street_tree_live_oak');
      assert.equal(liveOaks.length, 0, 'No Live Oaks in northeast');
    });
  });

  describe('getSeasonalCanopy', () => {
    it('returns values between 0 and 1', () => {
      for (const season of ['spring', 'summer', 'fall', 'winter']) {
        const val = getSeasonalCanopy('northeast_us', season);
        assert.ok(val >= 0 && val <= 1, `Canopy ${season} should be 0-1, got ${val}`);
      }
    });

    it('summer canopy is highest', () => {
      const summer = getSeasonalCanopy('northeast_us', 'summer');
      const winter = getSeasonalCanopy('northeast_us', 'winter');
      assert.ok(summer > winter, 'Summer canopy should exceed winter');
    });

    it('returns 0 for unknown region', () => {
      const val = getSeasonalCanopy('antarctica', 'summer');
      assert.equal(val, 0, 'Unknown region should return 0');
    });
  });

  describe('summarizeFoliageForYear', () => {
    it('returns total and byCategory breakdown', () => {
      const summary = summarizeFoliageForYear(1884, 'northeast_us');
      assert.ok(summary.total > 0);
      assert.ok(summary.byCategory.street_tree > 0);
      assert.ok(summary.byCategory.ground_cover > 0);
      assert.ok(Array.isArray(summary.types));
      assert.equal(summary.types.length, summary.total);
    });

    it('fewer types after American Elm removal', () => {
      const before = summarizeFoliageForYear(1960, 'northeast_us');
      const after = summarizeFoliageForYear(1980, 'northeast_us');
      assert.ok(before.total > after.total,
        'Should have fewer types after 1970 (American Elm removed)');
    });
  });
});

// ─── Foliage Placement Tests ────────────────────────────────────

describe('Foliage Placement', () => {
  describe('placeStreetTrees', () => {
    it('requires year parameter', () => {
      assert.throws(
        () => placeStreetTrees([primarySpline], {}),
        /year is required/,
      );
    });

    it('places trees along a primary road', () => {
      const trees = placeStreetTrees([primarySpline], { year: 1884, region: 'northeast_us' });
      assert.ok(trees.length > 0, 'Should place at least some trees');
    });

    it('labels start with TREE_PREFIX', () => {
      const trees = placeStreetTrees([primarySpline], { year: 1884, region: 'northeast_us' });
      for (const t of trees) {
        assert.ok(t.label.startsWith(TREE_PREFIX),
          `Label should start with ${TREE_PREFIX}, got ${t.label}`);
      }
    });

    it('all trees have location, scale, rotation', () => {
      const trees = placeStreetTrees([primarySpline], { year: 1884, region: 'northeast_us' });
      for (const t of trees) {
        assert.ok(Array.isArray(t.location) && t.location.length === 3, `${t.label}: bad location`);
        assert.ok(Array.isArray(t.scale) && t.scale.length === 3, `${t.label}: bad scale`);
        assert.ok(Array.isArray(t.rotation) && t.rotation.length === 3, `${t.label}: bad rotation`);
      }
    });

    it('is deterministic — same input produces same output', () => {
      const trees1 = placeStreetTrees([primarySpline], { year: 1884, region: 'northeast_us' });
      const trees2 = placeStreetTrees([primarySpline], { year: 1884, region: 'northeast_us' });
      assert.equal(trees1.length, trees2.length, 'Should produce same count');
      for (let i = 0; i < trees1.length; i++) {
        assert.equal(trees1[i].label, trees2[i].label, `Label mismatch at index ${i}`);
        assert.deepEqual(trees1[i].location, trees2[i].location, `Location mismatch at index ${i}`);
      }
    });

    it('respects --only filter', () => {
      const trees = placeStreetTrees([primarySpline], {
        year: 1884,
        region: 'northeast_us',
        only: ['street_tree_london_plane'],
      });
      for (const t of trees) {
        assert.equal(t.type, 'street_tree_london_plane',
          `Only london_plane should appear, got ${t.type}`);
      }
    });

    it('respects --exclude filter', () => {
      const trees = placeStreetTrees([primarySpline], {
        year: 1884,
        region: 'northeast_us',
        exclude: ['street_tree_london_plane'],
      });
      for (const t of trees) {
        assert.notEqual(t.type, 'street_tree_london_plane',
          'london_plane should be excluded');
      }
    });

    it('trees are offset from road centerline (on sidewalk)', () => {
      const trees = placeStreetTrees([primarySpline], {
        year: 1884,
        region: 'northeast_us',
        only: ['street_tree_london_plane'],
      });
      if (trees.length > 0) {
        // Road is along X axis (y=0), so trees should have non-zero Y
        for (const t of trees) {
          assert.ok(Math.abs(t.location[1]) > 100,
            `Tree should be offset from road center, Y=${t.location[1]}`);
        }
      }
    });

    it('no American Elm in 1980 northeast', () => {
      const trees = placeStreetTrees([primarySpline], { year: 1980, region: 'northeast_us' });
      for (const t of trees) {
        assert.notEqual(t.type, 'street_tree_american_elm',
          'American Elm should not appear after 1970');
      }
    });

    it('southeast region gets Live Oak, not Norway Maple', () => {
      const trees = placeStreetTrees([primarySpline], { year: 1884, region: 'southeast_us' });
      const types = new Set(trees.map(t => t.type));
      assert.ok(!types.has('street_tree_norway_maple'), 'Norway Maple is not a southeast tree');
    });
  });

  describe('placeGroundCover', () => {
    it('requires year parameter', () => {
      assert.throws(
        () => placeGroundCover(smallBounds, {}),
        /year is required/,
      );
    });

    it('produces results for valid bounds', () => {
      const cover = placeGroundCover(smallBounds, { year: 1884, region: 'northeast_us' });
      assert.ok(cover.length > 0, 'Should place at least some ground cover');
    });

    it('labels start with FOLIAGE_PREFIX', () => {
      const cover = placeGroundCover(smallBounds, { year: 1884, region: 'northeast_us' });
      for (const c of cover) {
        assert.ok(c.label.startsWith(FOLIAGE_PREFIX),
          `Label should start with ${FOLIAGE_PREFIX}, got ${c.label}`);
      }
    });

    it('is deterministic', () => {
      const cover1 = placeGroundCover(smallBounds, { year: 1884, region: 'northeast_us' });
      const cover2 = placeGroundCover(smallBounds, { year: 1884, region: 'northeast_us' });
      assert.equal(cover1.length, cover2.length, 'Should produce same count');
      for (let i = 0; i < cover1.length; i++) {
        assert.equal(cover1[i].label, cover2[i].label, `Label mismatch at index ${i}`);
      }
    });

    it('respects --only filter', () => {
      const cover = placeGroundCover(smallBounds, {
        year: 1884,
        region: 'northeast_us',
        only: ['ground_cover_lawn_grass'],
      });
      for (const c of cover) {
        assert.equal(c.type, 'ground_cover_lawn_grass',
          `Only lawn_grass should appear, got ${c.type}`);
      }
    });

    it('respects --exclude filter', () => {
      const cover = placeGroundCover(smallBounds, {
        year: 1884,
        region: 'northeast_us',
        exclude: ['ground_cover_lawn_grass'],
      });
      for (const c of cover) {
        assert.notEqual(c.type, 'ground_cover_lawn_grass',
          'lawn_grass should be excluded');
      }
    });
  });

  describe('buildFoliageSpawnScript', () => {
    it('generates valid Python script', () => {
      const trees = placeStreetTrees([primarySpline], { year: 1884, region: 'northeast_us' });
      const script = buildFoliageSpawnScript(trees.slice(0, 3));

      assert.ok(script.includes('import unreal'));
      assert.ok(script.includes('/Engine/BasicShapes/Cube.Cube'));
      assert.ok(script.includes('spawn_actor_from_class'));
      assert.ok(script.includes('set_actor_label'));
    });

    it('includes clear block when clearExisting is true', () => {
      const script = buildFoliageSpawnScript([], { clearExisting: true });
      assert.ok(script.includes(TREE_PREFIX), 'Should clear tree prefix');
      assert.ok(script.includes(FOLIAGE_PREFIX), 'Should clear foliage prefix');
      assert.ok(script.includes('destroy()'));
    });

    it('does not include clear block by default', () => {
      const script = buildFoliageSpawnScript([]);
      assert.ok(!script.includes('destroy()'));
    });
  });
});
