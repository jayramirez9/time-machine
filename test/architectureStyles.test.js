import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  classifyBuilding, getFloorHeight, listEras, getEraInfo,
  resolveEra, STYLES, ERA_RULES
} from '../lib/architectureStyles.js';

// ─── Classification — NYC 1884 ──────────────────────────────────

describe('Architecture Styles — classifyBuilding() nyc_1884', () => {
  const era = 'nyc_1884';

  it('4-story brick residential → brownstone_rowhouse', () => {
    const s = classifyBuilding('brick', 'residential', 4, { era });
    assert.strictEqual(s.styleName, 'brownstone_rowhouse');
  });

  it('6-story brick residential → italianate_tenement', () => {
    const s = classifyBuilding('brick', 'residential', 6, { era });
    assert.strictEqual(s.styleName, 'italianate_tenement');
  });

  it('5-story iron commercial → cast_iron_commercial', () => {
    const s = classifyBuilding('iron', 'commercial', 5, { era });
    assert.strictEqual(s.styleName, 'cast_iron_commercial');
  });

  it('3-story brick commercial → italianate_commercial', () => {
    const s = classifyBuilding('brick', 'commercial', 3, { era });
    assert.strictEqual(s.styleName, 'italianate_commercial');
  });

  it('2-story brick unknown → federal_commercial', () => {
    const s = classifyBuilding('brick', 'unknown', 2, { era });
    assert.strictEqual(s.styleName, 'federal_commercial');
  });

  it('church → gothic_revival_church', () => {
    const s = classifyBuilding('stone', 'church', 1, { era });
    assert.strictEqual(s.styleName, 'gothic_revival_church');
  });

  it('civic/government → greek_revival_civic', () => {
    const s = classifyBuilding('stone', 'civic', 3, { era });
    assert.strictEqual(s.styleName, 'greek_revival_civic');
  });

  it('5-story stone commercial → second_empire', () => {
    const s = classifyBuilding('stone', 'commercial', 5, { era });
    assert.strictEqual(s.styleName, 'second_empire');
  });

  it('wood frame → wood_frame_vernacular', () => {
    const s = classifyBuilding('wood', 'residential', 2, { era });
    assert.strictEqual(s.styleName, 'wood_frame_vernacular');
  });

  it('iron warehouse → industrial_loft', () => {
    const s = classifyBuilding('iron', 'warehouse', 4, { era });
    assert.strictEqual(s.styleName, 'industrial_loft');
  });

  it('unknown material/use falls back to era default (italianate_tenement)', () => {
    const s = classifyBuilding('concrete', 'unknown', 4, { era });
    assert.strictEqual(s.styleName, 'italianate_tenement');
  });
});

// ─── Floor Height Variation ────────────────────────────────────

describe('Architecture Styles — getFloorHeight()', () => {
  const era = 'nyc_1884';

  it('brownstone rowhouse = 350cm', () => {
    assert.strictEqual(getFloorHeight('brick', 'residential', 4, { era }), 350);
  });

  it('cast iron commercial = 450cm', () => {
    assert.strictEqual(getFloorHeight('iron', 'commercial', 5, { era }), 450);
  });

  it('gothic revival church = 600cm', () => {
    assert.strictEqual(getFloorHeight('stone', 'church', 1, { era }), 600);
  });

  it('wood frame vernacular = 280cm', () => {
    assert.strictEqual(getFloorHeight('wood', 'residential', 2, { era }), 280);
  });

  it('different styles produce different heights', () => {
    const brownstone = getFloorHeight('brick', 'residential', 4, { era });
    const castIron = getFloorHeight('iron', 'commercial', 5, { era });
    assert.notStrictEqual(brownstone, castIron);
  });
});

// ─── Unknown Era Fallback ──────────────────────────────────────

describe('Architecture Styles — era fallback', () => {
  it('unknown era falls back to general_contemporary rules', () => {
    const s = classifyBuilding('brick', 'residential', 4, { era: 'atlantis_9000bc' });
    // general_contemporary: residential 3+ stories → generic_commercial
    assert.strictEqual(s.styleName, 'generic_commercial');
  });

  it('no era or year defaults to general_contemporary', () => {
    const s = classifyBuilding('concrete', 'commercial', 5);
    assert.strictEqual(s.styleName, 'generic_commercial');
  });
});

// ─── Skeleton Eras ─────────────────────────────────────────────

describe('Architecture Styles — skeleton eras', () => {
  it('chicago_1920 brick commercial → chicago_school (not NYC style)', () => {
    const s = classifyBuilding('brick', 'commercial', 5, { era: 'chicago_1920' });
    assert.strictEqual(s.styleName, 'chicago_school');
  });

  it('chicago_1920 civic → beaux_arts', () => {
    const s = classifyBuilding('stone', 'civic', 4, { era: 'chicago_1920' });
    assert.strictEqual(s.styleName, 'beaux_arts');
  });

  it('sf_1908 wood residential (2 stories) → victorian_queen_anne', () => {
    const s = classifyBuilding('wood', 'residential', 2, { era: 'sf_1908' });
    assert.strictEqual(s.styleName, 'victorian_queen_anne');
  });

  it('sf_1908 wood residential (3 stories) → edwardian', () => {
    const s = classifyBuilding('wood', 'residential', 3, { era: 'sf_1908' });
    assert.strictEqual(s.styleName, 'edwardian');
  });

  it('sf_1908 church → mission_revival', () => {
    const s = classifyBuilding('stone', 'church', 1, { era: 'sf_1908' });
    assert.strictEqual(s.styleName, 'mission_revival');
  });
});

// ─── Data Integrity ────────────────────────────────────────────

describe('Architecture Styles — data integrity', () => {
  it('every rule references a valid style', () => {
    for (const [eraKey, era] of Object.entries(ERA_RULES)) {
      for (const rule of era.rules) {
        assert.ok(STYLES[rule.style],
          `Rule in ${eraKey} references unknown style "${rule.style}"`);
      }
    }
  });

  it('every style has required massing fields', () => {
    const required = ['floorHeightCm', 'corniceHeightCm', 'roofType', 'materials', 'label'];
    for (const [key, style] of Object.entries(STYLES)) {
      for (const field of required) {
        assert.ok(field in style,
          `Style "${key}" missing required field "${field}"`);
      }
    }
  });

  it('every style has future-phase metadata fields', () => {
    const metaFields = ['facadeRhythm', 'decorativeElements', 'textureSearchTerms', 'compatibleProps'];
    for (const [key, style] of Object.entries(STYLES)) {
      for (const field of metaFields) {
        assert.ok(field in style,
          `Style "${key}" missing metadata field "${field}"`);
      }
    }
  });

  it('every era has a valid defaultStyle', () => {
    for (const [eraKey, era] of Object.entries(ERA_RULES)) {
      assert.ok(STYLES[era.defaultStyle],
        `Era "${eraKey}" has invalid defaultStyle "${era.defaultStyle}"`);
    }
  });

  it('floor heights are positive and reasonable (200-800cm)', () => {
    for (const [key, style] of Object.entries(STYLES)) {
      assert.ok(style.floorHeightCm >= 200 && style.floorHeightCm <= 800,
        `Style "${key}" floorHeightCm=${style.floorHeightCm} out of range`);
    }
  });

  it('cornice heights are non-negative', () => {
    for (const [key, style] of Object.entries(STYLES)) {
      assert.ok(style.corniceHeightCm >= 0,
        `Style "${key}" corniceHeightCm=${style.corniceHeightCm} is negative`);
    }
  });
});

// ─── listEras / getEraInfo ─────────────────────────────────────

describe('Architecture Styles — listEras() / getEraInfo()', () => {
  it('listEras returns all era keys', () => {
    const eras = listEras();
    assert.ok(eras.includes('nyc_1884'));
    assert.ok(eras.includes('chicago_1920'));
    assert.ok(eras.includes('sf_1908'));
    assert.ok(eras.includes('general_colonial'));
    assert.ok(eras.includes('general_contemporary'));
    assert.strictEqual(eras.length, 11); // 3 curated + 8 general
  });

  it('getEraInfo returns metadata for valid era', () => {
    const info = getEraInfo('nyc_1884');
    assert.strictEqual(info.label, '1884 New York City');
    assert.deepStrictEqual(info.yearRange, [1870, 1895]);
    assert.strictEqual(info.defaultStyle, 'italianate_tenement');
  });

  it('getEraInfo returns null for unknown era', () => {
    assert.strictEqual(getEraInfo('atlantis_9000bc'), null);
  });
});

// ─── classifyBuilding returns full style object ────────────────

describe('Architecture Styles — classifyBuilding() output shape', () => {
  it('returns styleName plus all style properties', () => {
    const s = classifyBuilding('brick', 'residential', 4, { era: 'nyc_1884' });
    assert.strictEqual(s.styleName, 'brownstone_rowhouse');
    assert.strictEqual(s.floorHeightCm, 350);
    assert.strictEqual(s.corniceHeightCm, 90);
    assert.strictEqual(s.roofType, 'flat');
    assert.ok(s.materials);
    assert.ok(s.facadeRhythm);
  });
});

// ─── resolveEra() ──────────────────────────────────────────────

describe('Architecture Styles — resolveEra()', () => {
  it('1776 → general_colonial', () => {
    assert.strictEqual(resolveEra(1776), 'general_colonial');
  });

  it('1800 → general_colonial', () => {
    assert.strictEqual(resolveEra(1800), 'general_colonial');
  });

  it('1850 → general_antebellum', () => {
    assert.strictEqual(resolveEra(1850), 'general_antebellum');
  });

  it('1884 → general_victorian', () => {
    assert.strictEqual(resolveEra(1884), 'general_victorian');
  });

  it('1915 → general_progressive', () => {
    assert.strictEqual(resolveEra(1915), 'general_progressive');
  });

  it('1935 → general_deco', () => {
    assert.strictEqual(resolveEra(1935), 'general_deco');
  });

  it('1955 → general_midcentury', () => {
    assert.strictEqual(resolveEra(1955), 'general_midcentury');
  });

  it('1985 → general_late20c', () => {
    assert.strictEqual(resolveEra(1985), 'general_late20c');
  });

  it('2020 → general_contemporary', () => {
    assert.strictEqual(resolveEra(2020), 'general_contemporary');
  });

  it('boundary: 1830 → general_colonial', () => {
    assert.strictEqual(resolveEra(1830), 'general_colonial');
  });

  it('boundary: 1831 → general_antebellum', () => {
    assert.strictEqual(resolveEra(1831), 'general_antebellum');
  });
});

// ─── year option in classifyBuilding ────────────────────────────

describe('Architecture Styles — classifyBuilding() with year option', () => {
  it('year 1955 brick residential 1-story → ranch_house', () => {
    const s = classifyBuilding('brick', 'residential', 1, { year: 1955 });
    assert.strictEqual(s.styleName, 'ranch_house');
    assert.strictEqual(s.floorHeightCm, 260);
  });

  it('year 1935 brick commercial 3-story → art_deco_commercial', () => {
    const s = classifyBuilding('brick', 'commercial', 3, { year: 1935 });
    assert.strictEqual(s.styleName, 'art_deco_commercial');
    assert.strictEqual(s.floorHeightCm, 380);
  });

  it('year 2005 concrete commercial → generic_commercial', () => {
    const s = classifyBuilding('concrete', 'commercial', 5, { year: 2005 });
    assert.strictEqual(s.styleName, 'generic_commercial');
  });

  it('year 1915 wood residential → craftsman_bungalow', () => {
    const s = classifyBuilding('wood', 'residential', 1, { year: 1915 });
    assert.strictEqual(s.styleName, 'craftsman_bungalow');
  });

  it('year 1960 residential 2 stories → split_level', () => {
    const s = classifyBuilding('brick', 'residential', 2, { year: 1960 });
    assert.strictEqual(s.styleName, 'split_level');
  });

  it('explicit era takes priority over year', () => {
    const s = classifyBuilding('brick', 'residential', 4, { era: 'nyc_1884', year: 2020 });
    assert.strictEqual(s.styleName, 'brownstone_rowhouse');
  });
});
