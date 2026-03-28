import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  scriptHeader, scriptStaticMeshItem, scriptMaterialSetup, joinScript
} from '../lib/spawnScript.js';
import { buildSpawnScript } from '../lib/buildingMassing.js';
import { buildStreetSpawnScript } from '../lib/streetMeshing.js';
import { getMaterialRecipe, getSurfaceRecipe } from '../lib/materialCatalog.js';

// ─── scriptHeader — material preloads ───────────────────────────

describe('spawnScript — scriptHeader() material preloads', () => {
  it('emits no material lines when materialLoads is empty', () => {
    const lines = scriptHeader('Test', { mesh: '/Engine/BasicShapes/Cube.Cube' });
    const script = lines.join('\n');
    assert.ok(!script.includes('does_asset_exist'));
  });

  it('emits does_asset_exist guarded load for each material', () => {
    const lines = scriptHeader('Test', {}, {
      mat_MI_brownstone: '/Game/Materials/MI_brownstone'
    });
    const script = lines.join('\n');
    assert.ok(script.includes('mat_MI_brownstone'));
    assert.ok(script.includes('does_asset_exist'));
    assert.ok(script.includes('else None'));
  });

  it('keeps mesh preloads alongside material preloads', () => {
    const lines = scriptHeader('Test',
      { mesh: '/Engine/BasicShapes/Cube.Cube' },
      { mat_MI_brownstone: '/Game/Materials/MI_brownstone' }
    );
    const script = lines.join('\n');
    assert.ok(script.includes('mesh = unreal.EditorAssetLibrary.load_asset'));
    assert.ok(script.includes('mat_MI_brownstone'));
  });
});

// ─── scriptStaticMeshItem — materialVar ─────────────────────────

describe('spawnScript — scriptStaticMeshItem() materialVar', () => {
  const item = {
    label: 'TM_Building_000_test',
    location: [100, 200, 500],
    scale: [1, 1, 5],
    rotation: [0, 45, 0]
  };

  it('emits no set_material when materialVar is not provided', () => {
    const lines = scriptStaticMeshItem(item);
    const script = lines.join('\n');
    assert.ok(!script.includes('set_material'));
  });

  it('emits guarded set_material when materialVar is provided', () => {
    const lines = scriptStaticMeshItem(item, { materialVar: 'mat_MI_brownstone' });
    const script = lines.join('\n');
    assert.ok(script.includes('if mat_MI_brownstone:'));
    assert.ok(script.includes('set_material(0, mat_MI_brownstone)'));
  });

  it('still emits set_static_mesh and spawned counter', () => {
    const lines = scriptStaticMeshItem(item, { materialVar: 'mat_MI_brownstone' });
    const script = lines.join('\n');
    assert.ok(script.includes('set_static_mesh'));
    assert.ok(script.includes('spawned += 1'));
  });
});

// ─── scriptMaterialSetup ────────────────────────────────────────

describe('spawnScript — scriptMaterialSetup()', () => {
  it('returns empty array for empty recipes', () => {
    assert.deepStrictEqual(scriptMaterialSetup([], 'http://localhost:3000'), []);
  });

  it('returns empty array for null recipes', () => {
    assert.deepStrictEqual(scriptMaterialSetup(null, 'http://localhost:3000'), []);
  });

  it('generates MI creation block for a recipe', () => {
    const recipe = getMaterialRecipe('brownstone_rowhouse');
    const lines = scriptMaterialSetup([recipe], 'http://localhost:3000');
    const script = lines.join('\n');
    assert.ok(script.includes('Material Instance Setup'));
    assert.ok(script.includes('M_TM_Surface'), 'Should reference master material');
    assert.ok(script.includes('MaterialInstanceConstantFactoryNew'), 'Should create MI via factory');
    assert.ok(script.includes('create_asset'), 'Should call create_asset');
    assert.ok(script.includes('MI_brownstone'), 'Should name the MI');
    assert.ok(script.includes('set_texture_parameter_value'), 'Should set textures');
    assert.ok(script.includes('set_scalar_parameter_value'), 'Should set scalars');
    assert.ok(script.includes('set_vector_parameter_value'), 'Should set tint');
    assert.ok(script.includes('save_asset'), 'Should save MI');
  });

  it('includes does_asset_exist skip for existing MIs', () => {
    const recipe = getMaterialRecipe('brownstone_rowhouse');
    const lines = scriptMaterialSetup([recipe], 'http://localhost:3000');
    const script = lines.join('\n');
    assert.ok(script.includes('does_asset_exist'));
    assert.ok(script.includes('already exists'));
  });

  it('downloads textures from daemon URL', () => {
    const recipe = getMaterialRecipe('brownstone_rowhouse');
    const lines = scriptMaterialSetup([recipe], 'http://192.168.68.50:3000');
    const script = lines.join('\n');
    assert.ok(script.includes('http://192.168.68.50:3000/material-assets/brownstone/base_color.png'));
    assert.ok(script.includes('http://192.168.68.50:3000/material-assets/brownstone/normal.png'));
  });

  it('imports base_color and normal textures', () => {
    const recipe = getMaterialRecipe('cast_iron_commercial');
    const lines = scriptMaterialSetup([recipe], 'http://localhost:3000');
    const script = lines.join('\n');
    assert.ok(script.includes('T_cast_iron_base_color'));
    assert.ok(script.includes('T_cast_iron_normal'));
    assert.ok(script.includes('AssetImportTask'));
  });

  it('sets correct PBR parameters for metallic material', () => {
    const recipe = getMaterialRecipe('cast_iron_commercial');
    const lines = scriptMaterialSetup([recipe], 'http://localhost:3000');
    const script = lines.join('\n');
    assert.ok(script.includes('MetallicScale'), 'Should set metallic');
    assert.ok(script.includes('0.75'), 'Cast iron metallic should be 0.75');
  });

  it('handles multiple recipes', () => {
    const r1 = getMaterialRecipe('brownstone_rowhouse');
    const r2 = getMaterialRecipe('cast_iron_commercial');
    const lines = scriptMaterialSetup([r1, r2], 'http://localhost:3000');
    const script = lines.join('\n');
    assert.ok(script.includes('MI_brownstone'));
    assert.ok(script.includes('MI_cast_iron'));
  });
});

// ─── buildSpawnScript — material wiring ─────────────────────────

describe('buildSpawnScript — material wiring', () => {
  const spawnList = [
    {
      label: 'TM_Building_000_brownstone_rowhouse_3s',
      location: [100, 200, 500],
      scale: [1, 1, 5],
      rotation: [0, 45, 0],
      material: 'brick',
      stories: 3,
      use: 'residential',
      address: '10 Test St',
      styleName: 'brownstone_rowhouse'
    },
    {
      label: 'TM_Building_001_cast_iron_commercial_5s',
      location: [300, 400, 800],
      scale: [2, 2, 8],
      rotation: [0, 90, 0],
      material: 'iron',
      stories: 5,
      use: 'commercial',
      address: '20 Test St',
      styleName: 'cast_iron_commercial'
    }
  ];

  it('includes MI creation when daemonUrl is provided', () => {
    const script = buildSpawnScript(spawnList, { era: 'nyc_1884', daemonUrl: 'http://localhost:3000' });
    assert.ok(script.includes('MaterialInstanceConstantFactoryNew'));
    assert.ok(script.includes('MI_brownstone'));
    assert.ok(script.includes('MI_cast_iron'));
  });

  it('includes material preloads and set_material', () => {
    const script = buildSpawnScript(spawnList, { era: 'nyc_1884', daemonUrl: 'http://localhost:3000' });
    assert.ok(script.includes('set_material(0, mat_MI_brownstone)'));
    assert.ok(script.includes('set_material(0, mat_MI_cast_iron)'));
  });

  it('skips MI creation when no daemonUrl', () => {
    const script = buildSpawnScript(spawnList, { era: 'nyc_1884' });
    assert.ok(!script.includes('MaterialInstanceConstantFactoryNew'));
    // Still has material preloads (will use pre-existing MIs if available)
    assert.ok(script.includes('does_asset_exist'));
  });

  it('omits material lines when no era or styleName', () => {
    const noStyleList = [{
      label: 'TM_Building_000_unknown',
      location: [0, 0, 0],
      scale: [1, 1, 1],
      rotation: [0, 0, 0],
      material: 'brick',
      stories: 2,
      use: 'unknown',
      address: '',
      styleName: null
    }];
    const script = buildSpawnScript(noStyleList, { era: 'nyc_1884', daemonUrl: 'http://localhost:3000' });
    assert.ok(script.includes('spawn_actor_from_class'));
    assert.ok(!script.includes('set_material'));
  });

  it('deduplicates MI creation for same-material buildings', () => {
    const twoSameStyle = [
      { ...spawnList[0], label: 'TM_Building_000' },
      { ...spawnList[0], label: 'TM_Building_001' }
    ];
    const script = buildSpawnScript(twoSameStyle, { era: 'nyc_1884', daemonUrl: 'http://localhost:3000' });
    const factoryCount = (script.match(/create_asset\("MI_brownstone"/g) || []).length;
    assert.strictEqual(factoryCount, 1, 'Should have exactly one MI_brownstone creation');
  });
});

// ─── buildStreetSpawnScript — material wiring ───────────────────

describe('buildStreetSpawnScript — material wiring', () => {
  const streetSpawnList = [
    {
      type: 'street',
      label: 'TM_Street_0000_belgian_block',
      location: [2500, 0, 5],
      scale: [50, 25, 0.1],
      rotation: [0, 0, 0],
      surface: 'belgian_block',
      category: 'primary',
      widthM: 25
    },
    {
      type: 'sidewalk',
      label: 'TM_Sidewalk_0000_granite_flag',
      location: [2500, 1500, 7.5],
      scale: [50, 5, 0.15],
      rotation: [0, 0, 0],
      surface: 'granite_flag',
      category: 'primary',
      widthM: 5
    }
  ];

  it('includes MI creation when daemonUrl is provided', () => {
    const script = buildStreetSpawnScript(streetSpawnList, { era: 'nyc_1884', daemonUrl: 'http://localhost:3000' });
    assert.ok(script.includes('MaterialInstanceConstantFactoryNew'));
    assert.ok(script.includes('MI_belgian_block'));
    assert.ok(script.includes('MI_granite_flag'));
  });

  it('includes set_material for surfaces', () => {
    const script = buildStreetSpawnScript(streetSpawnList, { era: 'nyc_1884', daemonUrl: 'http://localhost:3000' });
    assert.ok(script.includes('set_material(0, mat_MI_belgian_block)'));
    assert.ok(script.includes('set_material(0, mat_MI_granite_flag)'));
  });

  it('omits MI creation when no daemonUrl', () => {
    const script = buildStreetSpawnScript(streetSpawnList, { era: 'nyc_1884' });
    assert.ok(!script.includes('MaterialInstanceConstantFactoryNew'));
  });
});
