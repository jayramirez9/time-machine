import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeBuildingAge } from '../lib/buildingMassing.js';
import { weatheringCurve, getWeatheringParams, resolveTextureKey, BASE_TEXTURES } from '../lib/materialCatalog.js';
import {
  scriptWeatheringParams, scriptPerBuildingWeathering, scriptDecalItem,
} from '../lib/spawnScript.js';

describe('computeBuildingAge', () => {
  it('returns correct age', () => {
    assert.equal(computeBuildingAge(1840, 1884), 44);
  });

  it('returns 0 for same year', () => {
    assert.equal(computeBuildingAge(1884, 1884), 0);
  });

  it('returns 0 for future yearBuilt', () => {
    assert.equal(computeBuildingAge(1900, 1884), 0);
  });

  it('returns null for null yearBuilt', () => {
    assert.equal(computeBuildingAge(null, 1884), null);
  });

  it('returns null for null targetYear', () => {
    assert.equal(computeBuildingAge(1840, null), null);
  });
});

describe('weatheringCurve', () => {
  it('returns 0 for age 0', () => {
    assert.equal(weatheringCurve('brownstone', 0), 0);
  });

  it('returns 0 for null age', () => {
    assert.equal(weatheringCurve('brownstone', null), 0);
  });

  it('caps at 1.0', () => {
    assert.equal(weatheringCurve('brownstone', 500), 1);
  });

  it('wood weathers faster than granite', () => {
    const woodAt20 = weatheringCurve('wood_clapboard', 20);
    const graniteAt20 = weatheringCurve('granite', 20);
    assert.ok(woodAt20 > graniteAt20, `wood ${woodAt20} should > granite ${graniteAt20}`);
  });

  it('returns value between 0 and 1 for typical age', () => {
    const v = weatheringCurve('brick_red', 40);
    assert.ok(v > 0 && v < 1, `expected 0 < ${v} < 1`);
  });

  it('uses default rate for unknown texture', () => {
    const v = weatheringCurve('unknown_material', 30);
    assert.ok(v > 0 && v <= 1);
  });
});

describe('getWeatheringParams', () => {
  it('returns null for null age', () => {
    assert.equal(getWeatheringParams('brownstone', null), null);
  });

  it('returns params with correct fields', () => {
    const p = getWeatheringParams('brownstone', 44);
    assert.ok(p);
    assert.equal(p.ageInYears, 44);
    assert.ok(p.weatheringStrength > 0);
    assert.ok(p.weatheringStrength <= 1);
  });

  it('strength increases with age', () => {
    const young = getWeatheringParams('brick_red', 5);
    const old = getWeatheringParams('brick_red', 80);
    assert.ok(old.weatheringStrength > young.weatheringStrength);
  });
});

describe('resolveTextureKey', () => {
  it('resolves brownstone_rowhouse to brownstone', () => {
    assert.equal(resolveTextureKey('brownstone_rowhouse'), 'brownstone');
  });

  it('returns null for unknown style', () => {
    assert.equal(resolveTextureKey('nonexistent_style'), null);
  });

  it('returns null for null', () => {
    assert.equal(resolveTextureKey(null), null);
  });
});

describe('scriptWeatheringParams', () => {
  it('emits nothing when all params null', () => {
    const lines = scriptWeatheringParams('/Game/MI_test', {});
    assert.equal(lines.length, 0);
  });

  it('emits AgeInYears when provided', () => {
    const lines = scriptWeatheringParams('/Game/MI_test', { ageInYears: 44 });
    const script = lines.join('\n');
    assert.ok(script.includes('AgeInYears'));
    assert.ok(script.includes('44.0'));
  });

  it('emits WeatheringStrength when provided', () => {
    const lines = scriptWeatheringParams('/Game/MI_test', { weatheringStrength: 0.75 });
    const script = lines.join('\n');
    assert.ok(script.includes('WeatheringStrength'));
    assert.ok(script.includes('0.750'));
  });
});

describe('scriptPerBuildingWeathering', () => {
  it('emits nothing when no params', () => {
    const lines = scriptPerBuildingWeathering('actor', '/Game/MI_test', {});
    assert.equal(lines.length, 0);
  });

  it('creates dynamic material instance', () => {
    const lines = scriptPerBuildingWeathering('actor', '/Game/MI_test', { ageInYears: 44, weatheringStrength: 0.8 });
    const script = lines.join('\n');
    assert.ok(script.includes('create_dynamic_material_instance'));
    assert.ok(script.includes('AgeInYears'));
    assert.ok(script.includes('set_material'));
  });
});

describe('scriptDecalItem', () => {
  const decal = {
    label: 'TM_Decal_water_stain_0001',
    location: [100, 200, 300],
    rotation: [0, 90, 0],
    size: [150, 60, 20],
    decalMaterial: '/Game/TimeMachine/Decals/DM_WaterStain',
  };

  it('spawns DecalActor', () => {
    const lines = scriptDecalItem(decal);
    const script = lines.join('\n');
    assert.ok(script.includes('DecalActor'));
  });

  it('sets decal_size', () => {
    const lines = scriptDecalItem(decal);
    const script = lines.join('\n');
    assert.ok(script.includes('decal_size'));
  });

  it('sets decal material', () => {
    const lines = scriptDecalItem(decal);
    const script = lines.join('\n');
    assert.ok(script.includes('set_decal_material'));
    assert.ok(script.includes('DM_WaterStain'));
  });

  it('sets actor label', () => {
    const lines = scriptDecalItem(decal);
    const script = lines.join('\n');
    assert.ok(script.includes('TM_Decal_water_stain_0001'));
  });

  it('includes comment when provided', () => {
    const lines = scriptDecalItem(decal, { comment: 'Water stain test' });
    assert.ok(lines[0].includes('Water stain test'));
  });
});
