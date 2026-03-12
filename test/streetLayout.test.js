import { describe, it } from 'node:test';
import assert from 'node:assert';
import { classifyStreet, findIntersections, SURFACE_TYPES } from '../lib/streetLayout.js';
import { splineToStreetSegments, streetsToSpawnList, buildStreetSpawnScript, STREET_PREFIX, SIDEWALK_PREFIX } from '../lib/streetMeshing.js';
import { placeLamps, buildLampSpawnScript, LAMP_PREFIX, DEDUP_RADIUS_CM } from '../lib/lampPlacement.js';

// ─── Street Classification ──────────────────────────────────────

describe('Street Layout — classifyStreet()', () => {
  it('primary roads get belgian_block surface', () => {
    const r = classifyStreet('primary');
    assert.strictEqual(r.surface, SURFACE_TYPES.belgian_block);
    assert.strictEqual(r.widthM, 25);
    assert.strictEqual(r.lampSides, 'both');
  });

  it('secondary roads get belgian_block surface', () => {
    const r = classifyStreet('secondary');
    assert.strictEqual(r.surface, SURFACE_TYPES.belgian_block);
    assert.strictEqual(r.widthM, 18);
  });

  it('tertiary roads get cobblestone surface', () => {
    const r = classifyStreet('tertiary');
    assert.strictEqual(r.surface, SURFACE_TYPES.cobblestone);
    assert.strictEqual(r.lampSides, 'one');
  });

  it('residential roads get cobblestone, no lamps', () => {
    const r = classifyStreet('residential');
    assert.strictEqual(r.surface, SURFACE_TYPES.cobblestone);
    assert.strictEqual(r.lampSides, 'none');
    assert.strictEqual(r.lampSpacingM, 0);
  });

  it('service/alleys get dirt surface, no sidewalk', () => {
    const r = classifyStreet('service');
    assert.strictEqual(r.surface, SURFACE_TYPES.dirt);
    assert.strictEqual(r.sidewalkWidthM, 0);
  });

  it('footway gets granite_flag surface', () => {
    const r = classifyStreet('footway');
    assert.strictEqual(r.surface, SURFACE_TYPES.granite_flag);
  });

  it('aliases resolve correctly (trunk → primary)', () => {
    const r = classifyStreet('trunk');
    assert.strictEqual(r.category, 'primary');
    assert.strictEqual(r.surface, SURFACE_TYPES.belgian_block);
  });

  it('aliases resolve correctly (path → footway)', () => {
    const r = classifyStreet('path');
    assert.strictEqual(r.category, 'footway');
  });

  it('unknown subcategory falls back to residential', () => {
    const r = classifyStreet('motorway');
    assert.strictEqual(r.surface, SURFACE_TYPES.cobblestone);
    assert.strictEqual(r.widthM, 12);
  });

  it('no surface is asphalt for 1884 era', () => {
    const categories = ['primary', 'secondary', 'tertiary', 'residential', 'service', 'footway', 'steps', 'pedestrian'];
    for (const cat of categories) {
      const r = classifyStreet(cat);
      assert.notStrictEqual(r.surface, 'asphalt', `${cat} should not be asphalt in 1884`);
    }
  });

  it('all streets have granite sidewalks or no sidewalk', () => {
    const cats = ['primary', 'secondary', 'tertiary', 'residential'];
    for (const cat of cats) {
      const r = classifyStreet(cat);
      if (r.sidewalkWidthM > 0) {
        assert.strictEqual(r.sidewalkSurface, SURFACE_TYPES.granite_flag,
          `${cat} sidewalk should be granite_flag`);
      }
    }
  });
});

// ─── Intersection Detection ─────────────────────────────────────

describe('Street Layout — findIntersections()', () => {
  it('detects intersections where 3+ splines meet', () => {
    const splines = [
      { category: 'primary', points: [[0, 0, 10], [100, 0, 10]] },
      { category: 'secondary', points: [[0, 5, 10], [50, 50, 10]] },
      { category: 'tertiary', points: [[5, 0, 10], [50, -50, 10]] }
    ];
    const ix = findIntersections(splines, { thresholdCm: 500 });
    assert.ok(ix.length >= 1, 'Should find at least one intersection');
    assert.ok(ix[0].roadCount >= 3);
  });

  it('does not count 2-way endpoints as intersections', () => {
    const splines = [
      { category: 'primary', points: [[0, 0, 10], [1000, 0, 10]] },
      { category: 'secondary', points: [[5000, 5000, 10], [6000, 6000, 10]] }
    ];
    const ix = findIntersections(splines, { thresholdCm: 500 });
    // Only 2 endpoints per spline, no cluster of 3+
    assert.strictEqual(ix.length, 0);
  });
});

// ─── Street Meshing ─────────────────────────────────────────────

describe('Street Meshing — splineToStreetSegments()', () => {
  // A simple 2-point spline running east (positive X direction)
  const spline = {
    category: 'primary',
    points: [[0, 0, 10], [5000, 0, 10]]  // 50m east
  };

  it('produces one street segment for a 2-point spline', () => {
    const segs = splineToStreetSegments(spline, { includeSidewalks: false });
    const streets = segs.filter(s => s.type === 'street');
    assert.strictEqual(streets.length, 1);
  });

  it('street segment centered between control points', () => {
    const segs = splineToStreetSegments(spline, { includeSidewalks: false });
    const s = segs[0];
    assert.ok(Math.abs(s.location[0] - 2500) < 1, `X center should be ~2500, got ${s.location[0]}`);
    assert.ok(Math.abs(s.location[1] - 0) < 1, `Y center should be ~0, got ${s.location[1]}`);
  });

  it('street segment scale matches length and width', () => {
    const segs = splineToStreetSegments(spline, { includeSidewalks: false });
    const s = segs[0];
    // Length = 5000cm, cube is 100cm → scaleX = 50
    assert.ok(Math.abs(s.scale[0] - 50) < 0.1, `Length scale should be ~50, got ${s.scale[0]}`);
    // Width = 25m = 2500cm → scaleY = 25
    assert.ok(Math.abs(s.scale[1] - 25) < 0.1, `Width scale should be ~25, got ${s.scale[1]}`);
    // Height = 10cm → scaleZ = 0.1
    assert.ok(Math.abs(s.scale[2] - 0.1) < 0.01, `Height scale should be ~0.1, got ${s.scale[2]}`);
  });

  it('street segment yaw aligned to direction', () => {
    const segs = splineToStreetSegments(spline, { includeSidewalks: false });
    const s = segs[0];
    // Going east (positive X, 0 Y) → yaw should be ~0°
    assert.ok(Math.abs(s.rotation[1]) < 1, `Yaw should be ~0° for east, got ${s.rotation[1]}`);
  });

  it('produces sidewalks on both sides when included', () => {
    const segs = splineToStreetSegments(spline, { includeSidewalks: true });
    const sidewalks = segs.filter(s => s.type === 'sidewalk');
    assert.strictEqual(sidewalks.length, 2, 'Primary road should have 2 sidewalks');
  });

  it('sidewalks are offset from road center', () => {
    const segs = splineToStreetSegments(spline, { includeSidewalks: true });
    const sidewalks = segs.filter(s => s.type === 'sidewalk');
    // Should be on opposite sides (Y values differ)
    assert.ok(sidewalks[0].location[1] !== sidewalks[1].location[1],
      'Sidewalks should be on opposite sides');
  });

  it('skips very short segments (< 1m)', () => {
    const tinySpline = {
      category: 'primary',
      points: [[0, 0, 10], [50, 0, 10]]  // 50cm — too short
    };
    const segs = splineToStreetSegments(tinySpline, { includeSidewalks: false });
    assert.strictEqual(segs.length, 0);
  });

  it('service alleys have no sidewalks', () => {
    const alleySpline = {
      category: 'service',
      points: [[0, 0, 10], [3000, 0, 10]]
    };
    const segs = splineToStreetSegments(alleySpline, { includeSidewalks: true });
    const sidewalks = segs.filter(s => s.type === 'sidewalk');
    assert.strictEqual(sidewalks.length, 0);
  });
});

describe('Street Meshing — streetsToSpawnList()', () => {
  it('assigns sequential labels with correct prefix', () => {
    const splines = [
      { category: 'primary', points: [[0, 0, 10], [5000, 0, 10]] },
      { category: 'secondary', points: [[0, 1000, 10], [5000, 1000, 10]] }
    ];
    const list = streetsToSpawnList(splines, { includeSidewalks: false });
    assert.strictEqual(list.length, 2);
    assert.ok(list[0].label.startsWith(STREET_PREFIX));
    assert.ok(list[1].label.startsWith(STREET_PREFIX));
    assert.ok(list[0].label.includes('belgian_block'));
  });

  it('includes both streets and sidewalks when enabled', () => {
    const splines = [
      { category: 'primary', points: [[0, 0, 10], [5000, 0, 10]] }
    ];
    const list = streetsToSpawnList(splines, { includeSidewalks: true });
    const streets = list.filter(s => s.type === 'street');
    const sidewalks = list.filter(s => s.type === 'sidewalk');
    assert.ok(streets.length > 0);
    assert.ok(sidewalks.length > 0);
    assert.ok(sidewalks[0].label.startsWith(SIDEWALK_PREFIX));
  });
});

describe('Street Meshing — buildStreetSpawnScript()', () => {
  it('generates valid Python script', () => {
    const spawnList = [{
      type: 'street',
      label: 'TM_Street_0000_belgian_block',
      location: [2500, 0, 5],
      scale: [50, 25, 0.1],
      rotation: [0, 0, 0],
      surface: 'belgian_block',
      category: 'primary',
      widthM: 25
    }];
    const script = buildStreetSpawnScript(spawnList);
    assert.ok(script.includes('import unreal'));
    assert.ok(script.includes('TM_Street_0000_belgian_block'));
    assert.ok(script.includes('spawn_actor_from_class'));
  });

  it('includes clear logic when clearExisting is true', () => {
    const script = buildStreetSpawnScript([], { clearExisting: true });
    assert.ok(script.includes('actor.destroy()'));
    assert.ok(script.includes(STREET_PREFIX));
  });
});

// ─── Lamp Placement ─────────────────────────────────────────────

describe('Lamp Placement — placeLamps()', () => {
  it('places lamps on primary roads', () => {
    const splines = [
      { category: 'primary', points: [[0, 0, 10], [10000, 0, 10]] }  // 100m road
    ];
    const lamps = placeLamps(splines);
    assert.ok(lamps.length > 0, 'Primary road should have lamps');
  });

  it('does not place lamps on residential roads', () => {
    const splines = [
      { category: 'residential', points: [[0, 0, 10], [10000, 0, 10]] }
    ];
    const lamps = placeLamps(splines);
    assert.strictEqual(lamps.length, 0, 'Residential roads should have no lamps');
  });

  it('does not place lamps on service alleys', () => {
    const splines = [
      { category: 'service', points: [[0, 0, 10], [10000, 0, 10]] }
    ];
    const lamps = placeLamps(splines);
    assert.strictEqual(lamps.length, 0);
  });

  it('primary road lamps are on both sides', () => {
    const splines = [
      { category: 'primary', points: [[0, 0, 10], [20000, 0, 10]] }  // 200m
    ];
    const lamps = placeLamps(splines);
    // Check that Y values include both positive and negative offsets
    const yValues = lamps.map(l => l.location[1]);
    const hasPositive = yValues.some(y => y > 100);
    const hasNegative = yValues.some(y => y < -100);
    assert.ok(hasPositive && hasNegative, 'Lamps should be on both sides of road');
  });

  it('tertiary road lamps are on one side only', () => {
    const splines = [
      { category: 'tertiary', points: [[0, 0, 10], [20000, 0, 10]] }  // 200m
    ];
    const lamps = placeLamps(splines);
    // All Y values should be on the same side (all positive or all negative)
    const yValues = lamps.map(l => l.location[1]);
    const allSameSide = yValues.every(y => y > 0) || yValues.every(y => y < 0);
    assert.ok(allSameSide, 'Tertiary road lamps should be on one side');
  });

  it('lamp spacing is approximately correct (~30m for primary)', () => {
    const splines = [
      { category: 'primary', points: [[0, 0, 10], [30000, 0, 10]] }  // 300m straight
    ];
    const lamps = placeLamps(splines);
    // For a 300m primary road with 30m spacing, expect ~9 lamps per side × 2 sides
    // (minus dedup at very close positions)
    assert.ok(lamps.length >= 10 && lamps.length <= 25,
      `Expected 10-25 lamps for 300m primary road, got ${lamps.length}`);
  });

  it('de-duplicates lamps at intersections', () => {
    // Two roads that meet at the same point
    const splines = [
      { category: 'primary', points: [[0, 0, 10], [10000, 0, 10]] },
      { category: 'primary', points: [[0, 0, 10], [0, 10000, 10]] },
      { category: 'secondary', points: [[0, 0, 10], [-10000, 0, 10]] }
    ];
    const lamps = placeLamps(splines);

    // Check no two lamps are within DEDUP_RADIUS_CM
    for (let i = 0; i < lamps.length; i++) {
      for (let j = i + 1; j < lamps.length; j++) {
        const dx = lamps[i].location[0] - lamps[j].location[0];
        const dy = lamps[i].location[1] - lamps[j].location[1];
        const dist = Math.sqrt(dx * dx + dy * dy);
        assert.ok(dist >= DEDUP_RADIUS_CM,
          `Lamps ${i} and ${j} are ${dist.toFixed(0)}cm apart (min ${DEDUP_RADIUS_CM}cm)`);
      }
    }
  });

  it('lamp labels include correct prefix', () => {
    const splines = [
      { category: 'primary', points: [[0, 0, 10], [10000, 0, 10]] }
    ];
    const lamps = placeLamps(splines);
    for (const l of lamps) {
      assert.ok(l.label.startsWith(LAMP_PREFIX));
    }
  });

  it('lamp height is at gas lamp level', () => {
    const splines = [
      { category: 'primary', points: [[0, 0, 10], [10000, 0, 10]] }
    ];
    const lamps = placeLamps(splines);
    for (const l of lamps) {
      assert.strictEqual(l.location[2], 420, 'Lamp Z should be 420cm (4.2m)');
    }
  });
});

describe('Lamp Placement — buildLampSpawnScript()', () => {
  it('generates valid Python script with PointLight', () => {
    const lamps = [{
      label: 'TM_Lamp_0000_primary',
      location: [1500, 1400, 420],
      rotation: [0, 45, 0],
      color: { R: 255, G: 183, B: 76 },
      intensity: 800,
      attenuationRadius: 1200,
      category: 'primary'
    }];
    const script = buildLampSpawnScript(lamps);
    assert.ok(script.includes('import unreal'));
    assert.ok(script.includes('PointLight'));
    assert.ok(script.includes('TM_Lamp_0000_primary'));
    assert.ok(script.includes('intensity'));
    assert.ok(script.includes('light_color'));
  });
});
