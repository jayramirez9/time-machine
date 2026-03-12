import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import {
  loadLandmarks, filterByYear, landmarkToSpawnList,
  landmarksToSpawnList, buildLandmarkSpawnScript,
  LANDMARK_PREFIX, SHAPE_ASSETS
} from '../lib/landmarks.js';

// ─── Test fixtures ──────────────────────────────────────────────

const origin = { lat: 40.7065, lon: -74.0135 };

function makeLandmark(overrides = {}) {
  return {
    id: 'test_building',
    name: 'Test Building',
    yearBuilt: 1850,
    yearDemolished: null,
    style: 'test_style',
    anchor: { lat: 40.708, lon: -74.012 },
    primitives: [
      { shape: 'cube', offset: [0, 0, 0], size: [20, 30, 15], rotation: [0, 45, 0], material: 'stone', part: 'body' },
      { shape: 'cone', offset: [0, 0, 15], size: [8, 8, 10], rotation: [0, 45, 0], material: 'stone', part: 'spire' }
    ],
    ...overrides
  };
}

function writeTempLandmarks(landmarks, dir) {
  const data = { era: 'nyc_1884', origin, landmarks };
  const filePath = path.join(dir, 'landmarks.json');
  fs.writeFileSync(filePath, JSON.stringify(data));
  return filePath;
}

// ─── Validation ─────────────────────────────────────────────────

describe('Landmarks — loadLandmarks() validation', () => {
  const tmpDir = fs.mkdtempSync('/tmp/landmarks-test-');

  it('loads valid landmarks', () => {
    const filePath = writeTempLandmarks([makeLandmark()], tmpDir);
    const result = loadLandmarks(filePath);
    assert.strictEqual(result.valid, 1);
    assert.strictEqual(result.invalid, 0);
    assert.strictEqual(result.warnings.length, 0);
  });

  it('rejects missing id', () => {
    const filePath = writeTempLandmarks([makeLandmark({ id: null })], tmpDir);
    const result = loadLandmarks(filePath);
    assert.strictEqual(result.invalid, 1);
    assert.ok(result.warnings.some(w => w.includes('id')));
  });

  it('rejects missing anchor', () => {
    const filePath = writeTempLandmarks([makeLandmark({ anchor: null })], tmpDir);
    const result = loadLandmarks(filePath);
    assert.strictEqual(result.invalid, 1);
    assert.ok(result.warnings.some(w => w.includes('anchor')));
  });

  it('rejects empty primitives', () => {
    const filePath = writeTempLandmarks([makeLandmark({ primitives: [] })], tmpDir);
    const result = loadLandmarks(filePath);
    assert.strictEqual(result.invalid, 1);
    assert.ok(result.warnings.some(w => w.includes('primitives')));
  });

  it('rejects invalid shape', () => {
    const lm = makeLandmark({ primitives: [{ shape: 'hexagon', offset: [0, 0, 0], size: [10, 10, 10] }] });
    const filePath = writeTempLandmarks([lm], tmpDir);
    const result = loadLandmarks(filePath);
    assert.strictEqual(result.invalid, 1);
    assert.ok(result.warnings.some(w => w.includes('hexagon')));
  });

  it('rejects bad offset length', () => {
    const lm = makeLandmark({ primitives: [{ shape: 'cube', offset: [0, 0], size: [10, 10, 10] }] });
    const filePath = writeTempLandmarks([lm], tmpDir);
    const result = loadLandmarks(filePath);
    assert.strictEqual(result.invalid, 1);
    assert.ok(result.warnings.some(w => w.includes('offset')));
  });

  it('rejects bad size length', () => {
    const lm = makeLandmark({ primitives: [{ shape: 'cube', offset: [0, 0, 0], size: [10, 10] }] });
    const filePath = writeTempLandmarks([lm], tmpDir);
    const result = loadLandmarks(filePath);
    assert.strictEqual(result.invalid, 1);
    assert.ok(result.warnings.some(w => w.includes('size')));
  });

  it('rejects negative size', () => {
    const lm = makeLandmark({ primitives: [{ shape: 'cube', offset: [0, 0, 0], size: [10, -5, 10] }] });
    const filePath = writeTempLandmarks([lm], tmpDir);
    const result = loadLandmarks(filePath);
    assert.strictEqual(result.invalid, 1);
    assert.ok(result.warnings.some(w => w.includes('positive')));
  });

  it('rejects missing yearBuilt', () => {
    const filePath = writeTempLandmarks([makeLandmark({ yearBuilt: undefined })], tmpDir);
    const result = loadLandmarks(filePath);
    assert.strictEqual(result.invalid, 1);
    assert.ok(result.warnings.some(w => w.includes('yearBuilt')));
  });
});

// ─── Era Filtering ──────────────────────────────────────────────

describe('Landmarks — filterByYear()', () => {
  const landmarks = [
    makeLandmark({ id: 'old', yearBuilt: 1846, yearDemolished: null }),
    makeLandmark({ id: 'bridge', yearBuilt: 1883, yearDemolished: null }),
    makeLandmark({ id: 'future', yearBuilt: 1900, yearDemolished: null }),
    makeLandmark({ id: 'gone', yearBuilt: 1800, yearDemolished: 1870 }),
    makeLandmark({ id: 'barely', yearBuilt: 1800, yearDemolished: 1885 })
  ];

  it('built 1846 visible in 1884', () => {
    const result = filterByYear(landmarks, 1884);
    assert.ok(result.some(lm => lm.id === 'old'));
  });

  it('built 1883 visible in 1884', () => {
    const result = filterByYear(landmarks, 1884);
    assert.ok(result.some(lm => lm.id === 'bridge'));
  });

  it('built 1900 NOT visible in 1884', () => {
    const result = filterByYear(landmarks, 1884);
    assert.ok(!result.some(lm => lm.id === 'future'));
  });

  it('demolished 1870 NOT visible in 1884', () => {
    const result = filterByYear(landmarks, 1884);
    assert.ok(!result.some(lm => lm.id === 'gone'));
  });

  it('demolished 1885 visible in 1884', () => {
    const result = filterByYear(landmarks, 1884);
    assert.ok(result.some(lm => lm.id === 'barely'));
  });

  it('yearBuilt == year is visible', () => {
    const result = filterByYear(landmarks, 1900);
    assert.ok(result.some(lm => lm.id === 'future'));
  });

  it('yearDemolished == year is NOT visible', () => {
    const result = filterByYear(landmarks, 1870);
    assert.ok(!result.some(lm => lm.id === 'gone'));
  });

  it('1870 filter excludes bridge (1883) and future (1900)', () => {
    const result = filterByYear(landmarks, 1870);
    assert.ok(!result.some(lm => lm.id === 'bridge'));
    assert.ok(!result.some(lm => lm.id === 'future'));
  });
});

// ─── Spawn Conversion ───────────────────────────────────────────

describe('Landmarks — landmarkToSpawnList()', () => {
  const lm = makeLandmark();

  it('returns correct number of entries', () => {
    const entries = landmarkToSpawnList(lm, origin);
    assert.strictEqual(entries.length, 2);
  });

  it('label format is TM_Landmark_{id}_{index}', () => {
    const entries = landmarkToSpawnList(lm, origin);
    assert.strictEqual(entries[0].label, `${LANDMARK_PREFIX}_test_building_0`);
    assert.strictEqual(entries[1].label, `${LANDMARK_PREFIX}_test_building_1`);
  });

  it('shape propagates from primitive', () => {
    const entries = landmarkToSpawnList(lm, origin);
    assert.strictEqual(entries[0].shape, 'cube');
    assert.strictEqual(entries[1].shape, 'cone');
  });

  it('scale equals size in meters', () => {
    const entries = landmarkToSpawnList(lm, origin);
    assert.deepStrictEqual(entries[0].scale, [20, 30, 15]);
    assert.deepStrictEqual(entries[1].scale, [8, 8, 10]);
  });

  it('Z includes half-height for ground-level primitive', () => {
    const entries = landmarkToSpawnList(lm, origin);
    // offset[2]=0, size[2]=15 → z = 0*100 + 15*100/2 = 750
    assert.strictEqual(entries[0].location[2], 750);
  });

  it('Z includes offset + half-height for elevated primitive', () => {
    const entries = landmarkToSpawnList(lm, origin);
    // offset[2]=15, size[2]=10 → z = 15*100 + 10*100/2 = 2000
    assert.strictEqual(entries[1].location[2], 2000);
  });

  it('Y offset is flipped (north = -Y in Unreal)', () => {
    const lm2 = makeLandmark({
      primitives: [{ shape: 'cube', offset: [0, 10, 0], size: [5, 5, 5], rotation: [0, 0, 0] }]
    });
    const entries = landmarkToSpawnList(lm2, origin);
    const lm3 = makeLandmark({
      primitives: [{ shape: 'cube', offset: [0, 0, 0], size: [5, 5, 5], rotation: [0, 0, 0] }]
    });
    const entriesRef = landmarkToSpawnList(lm3, origin);
    // 10m north offset should decrease Y by 1000cm
    assert.strictEqual(entries[0].location[1], entriesRef[0].location[1] - 1000);
  });

  it('landmarkId and landmarkName propagate', () => {
    const entries = landmarkToSpawnList(lm, origin);
    assert.strictEqual(entries[0].landmarkId, 'test_building');
    assert.strictEqual(entries[0].landmarkName, 'Test Building');
  });

  it('material and part propagate', () => {
    const entries = landmarkToSpawnList(lm, origin);
    assert.strictEqual(entries[0].material, 'stone');
    assert.strictEqual(entries[0].part, 'body');
    assert.strictEqual(entries[1].part, 'spire');
  });
});

// ─── Batch conversion ───────────────────────────────────────────

describe('Landmarks — landmarksToSpawnList()', () => {
  it('flattens multiple landmarks into single list', () => {
    const landmarks = [
      makeLandmark({ id: 'a', primitives: [{ shape: 'cube', offset: [0, 0, 0], size: [10, 10, 10], rotation: [0, 0, 0] }] }),
      makeLandmark({ id: 'b', primitives: [
        { shape: 'cube', offset: [0, 0, 0], size: [10, 10, 10], rotation: [0, 0, 0] },
        { shape: 'cone', offset: [0, 0, 10], size: [5, 5, 5], rotation: [0, 0, 0] }
      ]})
    ];
    const entries = landmarksToSpawnList(landmarks, origin);
    assert.strictEqual(entries.length, 3);
  });
});

// ─── Script Generation ──────────────────────────────────────────

describe('Landmarks — buildLandmarkSpawnScript()', () => {
  const lm = makeLandmark();
  const spawnList = landmarkToSpawnList(lm, origin);

  it('contains mesh asset loads for all shapes', () => {
    const script = buildLandmarkSpawnScript(spawnList);
    for (const [shape, assetPath] of Object.entries(SHAPE_ASSETS)) {
      assert.ok(script.includes(assetPath), `Script should load ${shape} mesh`);
    }
  });

  it('contains correct actor labels', () => {
    const script = buildLandmarkSpawnScript(spawnList);
    assert.ok(script.includes(`${LANDMARK_PREFIX}_test_building_0`));
    assert.ok(script.includes(`${LANDMARK_PREFIX}_test_building_1`));
  });

  it('assigns correct mesh per shape', () => {
    const script = buildLandmarkSpawnScript(spawnList);
    assert.ok(script.includes('meshes["cube"]'));
    assert.ok(script.includes('meshes["cone"]'));
  });

  it('includes clear logic when clearExisting=true', () => {
    const script = buildLandmarkSpawnScript(spawnList, { clearExisting: true });
    assert.ok(script.includes(`startswith("${LANDMARK_PREFIX}")`));
    assert.ok(script.includes('destroy()'));
  });

  it('omits clear logic when clearExisting=false', () => {
    const script = buildLandmarkSpawnScript(spawnList, { clearExisting: false });
    assert.ok(!script.includes('destroy()'));
  });
});

// ─── Manhattan landmarks.json integration ───────────────────────

describe('Landmarks — manhattan-ny/landmarks.json', () => {
  const filePath = path.resolve('terrain-data/manhattan-ny/landmarks.json');

  it('loads without validation errors', () => {
    const result = loadLandmarks(filePath);
    assert.strictEqual(result.invalid, 0, `Validation warnings: ${result.warnings.join('; ')}`);
    assert.ok(result.valid >= 6);
  });

  it('has 6 landmarks for NYC 1884', () => {
    const result = loadLandmarks(filePath);
    assert.strictEqual(result.landmarks.length, 6);
  });

  it('era is nyc_1884', () => {
    const result = loadLandmarks(filePath);
    assert.strictEqual(result.era, 'nyc_1884');
  });

  it('Trinity Church is visible in 1884', () => {
    const { landmarks } = loadLandmarks(filePath);
    const filtered = filterByYear(landmarks, 1884);
    assert.ok(filtered.some(lm => lm.id === 'trinity_church'));
  });

  it('all 6 landmarks visible in 1884', () => {
    const { landmarks } = loadLandmarks(filePath);
    const filtered = filterByYear(landmarks, 1884);
    assert.strictEqual(filtered.length, 6);
  });

  it('year 1870 filters out Brooklyn Bridge (1883) and Tribune (1875)', () => {
    const { landmarks } = loadLandmarks(filePath);
    const filtered = filterByYear(landmarks, 1870);
    assert.ok(!filtered.some(lm => lm.id === 'brooklyn_bridge_manhattan_tower'));
    assert.ok(!filtered.some(lm => lm.id === 'ny_tribune_building'));
    assert.ok(!filtered.some(lm => lm.id === 'western_union_building'));
  });

  it('generates spawn list with multiple primitives per landmark', () => {
    const { landmarks, origin } = loadLandmarks(filePath);
    const spawnList = landmarksToSpawnList(landmarks, origin);
    assert.ok(spawnList.length > 6, `Expected >6 primitives, got ${spawnList.length}`);
    // Trinity Church alone has 4 primitives
    const trinityPrims = spawnList.filter(s => s.landmarkId === 'trinity_church');
    assert.strictEqual(trinityPrims.length, 4);
  });
});
