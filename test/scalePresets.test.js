import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SCALE_PRESETS, resolveScale, inferScale, DEFAULT_SCALE } from '../lib/scalePresets.js';

describe('SCALE_PRESETS', () => {
  it('all presets have required fields', () => {
    for (const [key, p] of Object.entries(SCALE_PRESETS)) {
      assert.ok(p.radiusMeters > 0, `${key} missing radiusMeters`);
      assert.ok(p.demResolution > 0, `${key} missing demResolution`);
      assert.ok(p.landscapeSize > 0, `${key} missing landscapeSize`);
      assert.ok(p.cesium?.maxScreenSpaceError > 0, `${key} missing cesium.maxScreenSpaceError`);
      assert.ok(p.cesium?.maxSimultaneousTileLoads > 0, `${key} missing cesium.maxSimultaneousTileLoads`);
      assert.ok(p.cesium?.loadingDescendantLimit > 0, `${key} missing cesium.loadingDescendantLimit`);
      assert.ok(typeof p.osmSimplifyTolerance === 'number', `${key} missing osmSimplifyTolerance`);
      assert.ok(typeof p.label === 'string', `${key} missing label`);
    }
  });

  it('radii are strictly increasing', () => {
    const radii = Object.values(SCALE_PRESETS).map(p => p.radiusMeters);
    for (let i = 1; i < radii.length; i++) {
      assert.ok(radii[i] > radii[i - 1], `Radius not increasing at index ${i}: ${radii[i - 1]} >= ${radii[i]}`);
    }
  });

  it('landscape sizes are valid Unreal dimensions', () => {
    const VALID = [127, 253, 505, 1009, 2017, 4033, 8129];
    for (const [key, p] of Object.entries(SCALE_PRESETS)) {
      assert.ok(VALID.includes(p.landscapeSize), `${key} landscapeSize ${p.landscapeSize} not a valid UE dimension`);
    }
  });
});

describe('resolveScale', () => {
  it('returns default for null', () => {
    assert.strictEqual(resolveScale(null).key, DEFAULT_SCALE);
  });

  it('returns default for undefined', () => {
    assert.strictEqual(resolveScale(undefined).key, DEFAULT_SCALE);
  });

  it('returns named preset', () => {
    const { key, preset } = resolveScale('canyon');
    assert.strictEqual(key, 'canyon');
    assert.strictEqual(preset.radiusMeters, 15000);
  });

  it('returns default for unknown name', () => {
    assert.strictEqual(resolveScale('nonexistent').key, DEFAULT_SCALE);
  });

  it('returns matching preset object', () => {
    const { preset } = resolveScale('city_block');
    assert.strictEqual(preset, SCALE_PRESETS.city_block);
  });
});

describe('inferScale', () => {
  it('infers city_block for small radius', () => {
    assert.strictEqual(inferScale(100).key, 'city_block');
  });

  it('infers neighborhood for 500m', () => {
    assert.strictEqual(inferScale(500).key, 'neighborhood');
  });

  it('infers district for 1200m', () => {
    assert.strictEqual(inferScale(1200).key, 'district');
  });

  it('infers canyon for 12000m', () => {
    assert.strictEqual(inferScale(12000).key, 'canyon');
  });

  it('infers region for very large radius', () => {
    assert.strictEqual(inferScale(40000).key, 'region');
  });

  it('returns preset object matching the key', () => {
    const { key, preset } = inferScale(5000);
    assert.strictEqual(preset, SCALE_PRESETS[key]);
  });
});
