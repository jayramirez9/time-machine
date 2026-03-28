import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getMaterialRecipe, getSurfaceRecipe, collectUniqueRecipes,
  getBuildingMaterialPath, getSurfaceMaterialPath,
  collectMaterialPreloads, materialVarName,
  BASE_TEXTURES, MASTER_MATERIAL_PATH, MI_BASE_PATH
} from '../lib/materialCatalog.js';
import { STYLES } from '../lib/architectureStyles.js';

// ─── getMaterialRecipe ──────────────────────────────────────────

describe('materialCatalog — getMaterialRecipe()', () => {
  it('returns recipe for brownstone_rowhouse', () => {
    const r = getMaterialRecipe('brownstone_rowhouse');
    assert.ok(r);
    assert.strictEqual(r.textureKey, 'brownstone');
    assert.strictEqual(r.miName, 'MI_brownstone');
    assert.strictEqual(r.miPath, `${MI_BASE_PATH}/MI_brownstone`);
    assert.ok(Array.isArray(r.tint) && r.tint.length === 3);
    assert.strictEqual(typeof r.roughness, 'number');
    assert.strictEqual(typeof r.metallic, 'number');
    assert.strictEqual(typeof r.tilingScale, 'number');
  });

  it('returns recipe for cast_iron_commercial', () => {
    const r = getMaterialRecipe('cast_iron_commercial');
    assert.ok(r);
    assert.strictEqual(r.textureKey, 'cast_iron');
    assert.ok(r.metallic > 0.5, 'Cast iron should have high metallic');
  });

  it('returns recipe for wood_frame_vernacular', () => {
    const r = getMaterialRecipe('wood_frame_vernacular');
    assert.ok(r);
    assert.strictEqual(r.textureKey, 'wood_clapboard');
  });

  it('returns recipe for every style that has materials.primary', () => {
    let resolved = 0;
    for (const [name, style] of Object.entries(STYLES)) {
      if (!style.materials) continue;
      const r = getMaterialRecipe(name);
      if (r) resolved++;
    }
    assert.ok(resolved >= 10, `Expected at least 10 styles resolved, got ${resolved}`);
  });

  it('returns null for unknown style', () => {
    assert.strictEqual(getMaterialRecipe('nonexistent_style'), null);
  });

  it('returns null for null input', () => {
    assert.strictEqual(getMaterialRecipe(null), null);
  });
});

// ─── getSurfaceRecipe ───────────────────────────────────────────

describe('materialCatalog — getSurfaceRecipe()', () => {
  it('returns recipe for belgian_block', () => {
    const r = getSurfaceRecipe('belgian_block');
    assert.ok(r);
    assert.strictEqual(r.textureKey, 'belgian_block');
    assert.strictEqual(r.miName, 'MI_belgian_block');
    assert.ok(r.tilingScale >= 3, 'Street surfaces need higher tiling');
  });

  it('returns recipe for all six surface types', () => {
    const surfaces = ['belgian_block', 'cobblestone', 'dirt', 'granite_flag', 'macadam', 'brick'];
    for (const s of surfaces) {
      const r = getSurfaceRecipe(s);
      assert.ok(r, `Expected recipe for surface ${s}`);
    }
  });

  it('returns null for unknown surface', () => {
    assert.strictEqual(getSurfaceRecipe('asphalt'), null);
  });

  it('returns null for null input', () => {
    assert.strictEqual(getSurfaceRecipe(null), null);
  });
});

// ─── collectUniqueRecipes ───────────────────────────────────────

describe('materialCatalog — collectUniqueRecipes()', () => {
  it('returns empty array for empty input', () => {
    assert.deepStrictEqual(collectUniqueRecipes([]), []);
  });

  it('filters out nulls', () => {
    const r = getMaterialRecipe('brownstone_rowhouse');
    assert.deepStrictEqual(collectUniqueRecipes([null, r, null]), [r]);
  });

  it('deduplicates by miName', () => {
    // italianate_tenement and italianate_commercial both resolve to brick_red
    const r1 = getMaterialRecipe('italianate_tenement');
    const r2 = getMaterialRecipe('italianate_commercial');
    assert.strictEqual(r1.miName, r2.miName);
    const unique = collectUniqueRecipes([r1, r2]);
    assert.strictEqual(unique.length, 1);
  });

  it('keeps distinct recipes', () => {
    const r1 = getMaterialRecipe('brownstone_rowhouse');
    const r2 = getMaterialRecipe('cast_iron_commercial');
    const unique = collectUniqueRecipes([r1, r2]);
    assert.strictEqual(unique.length, 2);
  });
});

// ─── Backward compatibility API ─────────────────────────────────

describe('materialCatalog — getBuildingMaterialPath() (compat)', () => {
  it('returns path for known style', () => {
    const path = getBuildingMaterialPath('brownstone_rowhouse', 'nyc_1884');
    assert.ok(path);
    assert.ok(path.startsWith('/Game/'));
    assert.ok(path.includes('MI_brownstone'));
  });

  it('works without era (era-agnostic)', () => {
    const path = getBuildingMaterialPath('brownstone_rowhouse');
    assert.ok(path);
  });

  it('returns null for unknown style', () => {
    assert.strictEqual(getBuildingMaterialPath('nonexistent'), null);
  });

  it('returns null for null styleName', () => {
    assert.strictEqual(getBuildingMaterialPath(null, 'nyc_1884'), null);
  });
});

describe('materialCatalog — getSurfaceMaterialPath() (compat)', () => {
  it('returns path for known surface', () => {
    const path = getSurfaceMaterialPath('belgian_block', 'nyc_1884');
    assert.ok(path);
    assert.ok(path.includes('MI_belgian_block'));
  });

  it('returns null for unknown surface', () => {
    assert.strictEqual(getSurfaceMaterialPath('asphalt', 'nyc_1884'), null);
  });
});

// ─── materialVarName ────────────────────────────────────────────

describe('materialCatalog — materialVarName()', () => {
  it('extracts asset name and prefixes with mat_', () => {
    assert.strictEqual(
      materialVarName('/Game/TimeMachine/Materials/MI_brownstone'),
      'mat_MI_brownstone'
    );
  });

  it('handles single-segment path', () => {
    assert.strictEqual(materialVarName('MI_Foo'), 'mat_MI_Foo');
  });
});

// ─── collectMaterialPreloads ────────────────────────────────────

describe('materialCatalog — collectMaterialPreloads()', () => {
  it('returns empty object for empty input', () => {
    assert.deepStrictEqual(collectMaterialPreloads([]), {});
  });

  it('deduplicates identical paths', () => {
    const path = '/Game/TimeMachine/Materials/MI_brownstone';
    const preloads = collectMaterialPreloads([path, path, path]);
    assert.strictEqual(Object.keys(preloads).length, 1);
  });

  it('keeps distinct paths', () => {
    const p1 = '/Game/TimeMachine/Materials/MI_brownstone';
    const p2 = '/Game/TimeMachine/Materials/MI_cast_iron';
    const preloads = collectMaterialPreloads([p1, p2]);
    assert.strictEqual(Object.keys(preloads).length, 2);
  });
});

// ─── BASE_TEXTURES integrity ────────────────────────────────────

describe('materialCatalog — BASE_TEXTURES integrity', () => {
  it('every texture has required fields', () => {
    for (const [key, tex] of Object.entries(BASE_TEXTURES)) {
      assert.ok(tex.dir, `${key} missing dir`);
      assert.ok(Array.isArray(tex.tint) && tex.tint.length === 3, `${key} missing tint`);
      assert.strictEqual(typeof tex.roughness, 'number', `${key} missing roughness`);
      assert.strictEqual(typeof tex.metallic, 'number', `${key} missing metallic`);
      assert.strictEqual(typeof tex.tilingScale, 'number', `${key} missing tilingScale`);
    }
  });

  it('tint values are in 0-1 range', () => {
    for (const [key, tex] of Object.entries(BASE_TEXTURES)) {
      for (const v of tex.tint) {
        assert.ok(v >= 0 && v <= 1, `${key} tint out of range: ${v}`);
      }
    }
  });

  it('roughness and metallic are in 0-1 range', () => {
    for (const [key, tex] of Object.entries(BASE_TEXTURES)) {
      assert.ok(tex.roughness >= 0 && tex.roughness <= 1, `${key} roughness out of range`);
      assert.ok(tex.metallic >= 0 && tex.metallic <= 1, `${key} metallic out of range`);
    }
  });
});
