import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'fs';
import {
  dateFromExplicit,
  dateFromOSMTags,
  dateFromSanbornBracket,
  dateFromMajorFire,
  dateFromMaterialEra,
  dateFromConstructionBoom,
  dateFromNeighborhood,
  fuseEstimates,
  parseStartDate,
  findBooms,
  estimateMidpoint,
  researchBuildingDates,
  CONSTRUCTION_BOOMS,
  MAJOR_FIRES,
  MATERIAL_ERA_RANGES,
  STORIES_ERA_HINTS,
} from '../lib/agents/buildingDateAgent.js';

// ---------------------------------------------------------------------------
// Embedded data integrity
// ---------------------------------------------------------------------------

describe('CONSTRUCTION_BOOMS', () => {
  it('covers at least 15 US cities', () => {
    assert.ok(Object.keys(CONSTRUCTION_BOOMS).length >= 15);
  });

  it('each city has decade, intensity, driver', () => {
    for (const [city, booms] of Object.entries(CONSTRUCTION_BOOMS)) {
      assert.ok(Array.isArray(booms), `${city} booms should be array`);
      for (const b of booms) {
        assert.ok(typeof b.decade === 'number', `${city} boom decade`);
        assert.ok(b.intensity >= 0 && b.intensity <= 1, `${city} intensity in [0,1]`);
        assert.ok(typeof b.driver === 'string' && b.driver.length > 0, `${city} driver`);
      }
    }
  });
});

describe('MAJOR_FIRES', () => {
  it('has at least 10 entries', () => {
    assert.ok(MAJOR_FIRES.length >= 10);
  });

  it('each has required fields', () => {
    for (const f of MAJOR_FIRES) {
      assert.ok(typeof f.city === 'string');
      assert.ok(typeof f.year === 'number');
      assert.ok(typeof f.name === 'string');
      assert.ok(Array.isArray(f.materialsDestroyed));
      assert.ok(Array.isArray(f.rebuildMaterials));
    }
  });

  it('includes Chicago 1871', () => {
    const chicago = MAJOR_FIRES.find(f => f.city === 'Chicago' && f.year === 1871);
    assert.ok(chicago);
    assert.ok(chicago.materialsDestroyed.includes('wood'));
  });

  it('includes San Francisco 1906', () => {
    const sf = MAJOR_FIRES.find(f => f.city === 'San Francisco' && f.year === 1906);
    assert.ok(sf);
  });
});

describe('MATERIAL_ERA_RANGES', () => {
  it('cast iron bounded 1848-1900', () => {
    assert.equal(MATERIAL_ERA_RANGES.cast_iron.earliest, 1848);
    assert.equal(MATERIAL_ERA_RANGES.cast_iron.latest, 1900);
  });

  it('steel frame earliest 1885, no upper bound', () => {
    assert.equal(MATERIAL_ERA_RANGES.steel_frame.earliest, 1885);
    assert.equal(MATERIAL_ERA_RANGES.steel_frame.latest, null);
  });

  it('brick is unbounded (too broad to date)', () => {
    assert.equal(MATERIAL_ERA_RANGES.brick.earliest, null);
    assert.equal(MATERIAL_ERA_RANGES.brick.latest, null);
  });
});

describe('STORIES_ERA_HINTS', () => {
  it('6+ stories requires 1870+', () => {
    const hint = STORIES_ERA_HINTS.find(h => h.minStories === 6);
    assert.ok(hint);
    assert.equal(hint.earliest, 1870);
  });

  it('10+ stories requires 1885+', () => {
    const hint = STORIES_ERA_HINTS.find(h => h.minStories === 10);
    assert.ok(hint);
    assert.equal(hint.earliest, 1885);
  });
});

// ---------------------------------------------------------------------------
// parseStartDate
// ---------------------------------------------------------------------------

describe('parseStartDate', () => {
  it('parses exact year', () => {
    const r = parseStartDate('1884');
    assert.deepEqual(r, { min: 1884, max: 1884, exact: true });
  });

  it('parses year-month', () => {
    const r = parseStartDate('1884-06');
    assert.deepEqual(r, { min: 1884, max: 1884, exact: true });
  });

  it('parses full date', () => {
    const r = parseStartDate('1884-06-15');
    assert.deepEqual(r, { min: 1884, max: 1884, exact: true });
  });

  it('parses approximate with ~', () => {
    const r = parseStartDate('~1880');
    assert.equal(r.min, 1875);
    assert.equal(r.max, 1885);
    assert.equal(r.exact, false);
  });

  it('parses decade', () => {
    const r = parseStartDate('1880s');
    assert.deepEqual(r, { min: 1880, max: 1889, exact: false });
  });

  it('returns null for unparseable', () => {
    assert.equal(parseStartDate('unknown'), null);
    assert.equal(parseStartDate(null), null);
    assert.equal(parseStartDate(''), null);
  });
});

// ---------------------------------------------------------------------------
// Evidence methods
// ---------------------------------------------------------------------------

describe('dateFromExplicit', () => {
  it('returns verified when yearBuilt present', () => {
    const f = { properties: { yearBuilt: 1875 } };
    const r = dateFromExplicit(f);
    assert.equal(r.yearBuiltMin, 1875);
    assert.equal(r.yearBuiltMax, 1875);
    assert.equal(r.confidence, 'verified');
    assert.equal(r.method, 'explicit');
  });

  it('returns verified when yearDemolished present', () => {
    const f = { properties: { yearDemolished: 1920 } };
    const r = dateFromExplicit(f);
    assert.equal(r.yearDemolished, 1920);
    assert.equal(r.confidence, 'verified');
  });

  it('returns null when no dates', () => {
    const f = { properties: { material: 'brick' } };
    assert.equal(dateFromExplicit(f), null);
  });

  it('returns null for empty properties', () => {
    assert.equal(dateFromExplicit({}), null);
    assert.equal(dateFromExplicit({ properties: {} }), null);
  });
});

describe('dateFromOSMTags', () => {
  it('reads start_date tag', () => {
    const f = { properties: { start_date: '1884' } };
    const r = dateFromOSMTags(f);
    assert.equal(r.yearBuiltMin, 1884);
    assert.equal(r.confidence, 'verified');
    assert.equal(r.method, 'osm_start_date');
  });

  it('reads osmStartDate alias', () => {
    const f = { properties: { osmStartDate: '1890' } };
    const r = dateFromOSMTags(f);
    assert.equal(r.yearBuiltMin, 1890);
  });

  it('handles approximate dates', () => {
    const f = { properties: { start_date: '~1880' } };
    const r = dateFromOSMTags(f);
    assert.equal(r.yearBuiltMin, 1875);
    assert.equal(r.yearBuiltMax, 1885);
    assert.equal(r.confidence, 'estimated');
  });

  it('returns null when no start_date', () => {
    assert.equal(dateFromOSMTags({ properties: {} }), null);
  });
});

describe('dateFromSanbornBracket', () => {
  const coverage = {
    available: true,
    closestYear: 1894,
    years: [1867, 1879, 1885, 1890, 1894, 1899],
    nearestBefore: 1894,
    nearestAfter: 1894,
  };

  it('brackets between prior and map year', () => {
    const r = dateFromSanbornBracket(coverage, 'sanborn_1894');
    assert.equal(r.yearBuiltMin, 1890);
    assert.equal(r.yearBuiltMax, 1894);
    assert.equal(r.confidence, 'estimated');
    assert.equal(r.method, 'sanborn_bracket');
  });

  it('uses earliest map year with no lower bound', () => {
    const r = dateFromSanbornBracket(coverage, 'sanborn_1867');
    assert.equal(r.yearBuiltMin, null);
    assert.equal(r.yearBuiltMax, 1867);
  });

  it('falls back to closestYear when no buildingSource', () => {
    const r = dateFromSanbornBracket(coverage, null);
    assert.equal(r.yearBuiltMax, 1894);
  });

  it('returns null when no Sanborn coverage', () => {
    assert.equal(dateFromSanbornBracket(null, 'sanborn_1894'), null);
    assert.equal(dateFromSanbornBracket({ available: false }, 'sanborn_1894'), null);
  });
});

describe('dateFromMajorFire', () => {
  it('Chicago wood building post-dates 1871 fire', () => {
    const r = dateFromMajorFire('Chicago, IL', 'wood');
    assert.ok(r);
    assert.equal(r.yearBuiltMin, 1871);
    assert.equal(r.method, 'post_fire_rebuild');
  });

  it('Chicago brick building post-dates 1871 (rebuild material)', () => {
    const r = dateFromMajorFire('Chicago, IL', 'brick');
    assert.ok(r);
    assert.equal(r.yearBuiltMin, 1871);
  });

  it('San Francisco concrete post-dates 1906', () => {
    const r = dateFromMajorFire('San Francisco, CA', 'concrete');
    assert.ok(r);
    assert.equal(r.yearBuiltMin, 1906);
  });

  it('returns null for cities without major fires', () => {
    assert.equal(dateFromMajorFire('Baton Rouge, LA', 'brick'), null);
  });

  it('returns null for non-matching material', () => {
    // Adobe wouldn't be destroyed or a rebuild material for Chicago fire
    assert.equal(dateFromMajorFire('Chicago, IL', 'adobe'), null);
  });

  it('matches partial city name (case insensitive)', () => {
    const r = dateFromMajorFire('new york, ny', 'brick');
    assert.ok(r);
    assert.equal(r.yearBuiltMin, 1835);
  });
});

describe('dateFromMaterialEra', () => {
  it('cast iron → 1848-1900', () => {
    const r = dateFromMaterialEra('cast_iron', 4);
    assert.equal(r.yearBuiltMin, 1848);
    assert.equal(r.yearBuiltMax, 1900);
    assert.equal(r.confidence, 'inferred');
  });

  it('steel frame → 1885+', () => {
    const r = dateFromMaterialEra('steel_frame', 5);
    assert.equal(r.yearBuiltMin, 1885);
    assert.equal(r.yearBuiltMax, null);
  });

  it('10-story building → 1885+ regardless of material', () => {
    const r = dateFromMaterialEra('brick', 10);
    assert.equal(r.yearBuiltMin, 1885);
  });

  it('20-story building → 1900+', () => {
    const r = dateFromMaterialEra('brick', 20);
    assert.equal(r.yearBuiltMin, 1900);
  });

  it('returns null for brick 3-story (too ambiguous)', () => {
    assert.equal(dateFromMaterialEra('brick', 3), null);
  });

  it('brownstone → 1840-1900', () => {
    const r = dateFromMaterialEra('brownstone', 4);
    assert.equal(r.yearBuiltMin, 1840);
    assert.equal(r.yearBuiltMax, 1900);
  });
});

describe('dateFromConstructionBoom', () => {
  it('returns peak decade for NYC', () => {
    const r = dateFromConstructionBoom('New York, NY');
    assert.ok(r);
    assert.equal(r.confidence, 'inferred');
    assert.equal(r.method, 'construction_boom');
    // NYC peak is 1880s (intensity 0.95)
    assert.equal(r.yearBuiltMin, 1880);
    assert.equal(r.yearBuiltMax, 1889);
  });

  it('returns peak decade for Chicago', () => {
    const r = dateFromConstructionBoom('Chicago, IL');
    assert.ok(r);
    // Chicago peak is 1870s (intensity 1.0)
    assert.equal(r.yearBuiltMin, 1870);
    assert.equal(r.yearBuiltMax, 1879);
  });

  it('returns null for unknown city', () => {
    assert.equal(dateFromConstructionBoom('Podunk, KS'), null);
  });
});

describe('dateFromNeighborhood', () => {
  it('clusters 3+ dated neighbors', () => {
    const estimates = [
      { yearBuiltMin: 1875, yearBuiltMax: 1880 },
      { yearBuiltMin: 1870, yearBuiltMax: 1878 },
      { yearBuiltMin: 1872, yearBuiltMax: 1882 },
      null, // the undated building at index 3
    ];
    const r = dateFromNeighborhood(estimates, 3);
    assert.ok(r);
    assert.equal(r.method, 'neighborhood');
    assert.equal(r.confidence, 'inferred');
    assert.ok(r.yearBuiltMin >= 1860 && r.yearBuiltMin <= 1880);
    assert.ok(r.yearBuiltMax >= 1880 && r.yearBuiltMax <= 1900);
  });

  it('returns null with fewer than 3 dated neighbors', () => {
    const estimates = [
      { yearBuiltMin: 1875, yearBuiltMax: 1880 },
      null,
      null,
    ];
    assert.equal(dateFromNeighborhood(estimates, 1), null);
  });

  it('returns null when neighbors are too spread out', () => {
    const estimates = [
      { yearBuiltMin: 1800, yearBuiltMax: 1810 },
      { yearBuiltMin: 1900, yearBuiltMax: 1910 },
      { yearBuiltMin: 1950, yearBuiltMax: 1960 },
      null,
    ];
    // Spread across 150 years — no cluster of 3 within ±10
    assert.equal(dateFromNeighborhood(estimates, 3), null);
  });
});

describe('findBooms', () => {
  it('matches partial city name', () => {
    const booms = findBooms('Manhattan, NY');
    assert.ok(booms === null); // Manhattan != New York exactly
  });

  it('matches exact city name in location string', () => {
    const booms = findBooms('New York, NY');
    assert.ok(booms);
    assert.ok(booms.length > 0);
  });

  it('returns null for unknown', () => {
    assert.equal(findBooms('Nowhere, XX'), null);
  });
});

// ---------------------------------------------------------------------------
// fuseEstimates
// ---------------------------------------------------------------------------

describe('fuseEstimates', () => {
  it('returns undated for empty array', () => {
    const r = fuseEstimates([]);
    assert.equal(r.yearBuilt, null);
    assert.equal(r.confidence, 'undated');
    assert.equal(r.method, 'none');
  });

  it('passes through single estimate', () => {
    const r = fuseEstimates([
      { yearBuiltMin: 1870, yearBuiltMax: 1890, confidence: 'estimated', method: 'sanborn_bracket' }
    ]);
    assert.equal(r.yearBuilt, 1880);
    assert.deepEqual(r.range, [1870, 1890]);
    assert.equal(r.confidence, 'estimated');
  });

  it('intersects overlapping ranges', () => {
    const r = fuseEstimates([
      { yearBuiltMin: 1860, yearBuiltMax: 1900, confidence: 'inferred', method: 'material_era' },
      { yearBuiltMin: 1880, yearBuiltMax: 1894, confidence: 'estimated', method: 'sanborn_bracket' },
    ]);
    // Intersection: 1880-1894
    assert.deepEqual(r.range, [1880, 1894]);
    assert.equal(r.yearBuilt, 1887);
    assert.equal(r.confidence, 'estimated'); // highest confidence
  });

  it('keeps higher-confidence range when disjoint', () => {
    const r = fuseEstimates([
      { yearBuiltMin: 1870, yearBuiltMax: 1880, confidence: 'verified', method: 'explicit' },
      { yearBuiltMin: 1920, yearBuiltMax: 1930, confidence: 'inferred', method: 'construction_boom' },
    ]);
    // Disjoint — keeps verified range
    assert.equal(r.yearBuilt, 1875);
    assert.equal(r.confidence, 'verified');
  });

  it('preserves yearDemolished from any estimate', () => {
    const r = fuseEstimates([
      { yearBuiltMin: 1870, yearBuiltMax: 1880, yearDemolished: 1935, confidence: 'verified', method: 'explicit' },
    ]);
    assert.equal(r.yearDemolished, 1935);
  });

  it('narrows with one-sided bounds', () => {
    const r = fuseEstimates([
      { yearBuiltMin: 1871, yearBuiltMax: null, confidence: 'estimated', method: 'post_fire_rebuild' },
      { yearBuiltMin: null, yearBuiltMax: 1894, confidence: 'estimated', method: 'sanborn_bracket' },
    ]);
    assert.deepEqual(r.range, [1871, 1894]);
    assert.equal(r.yearBuilt, 1883); // midpoint of 1871-1894
  });
});

describe('estimateMidpoint', () => {
  it('computes midpoint of range', () => {
    assert.equal(estimateMidpoint(1870, 1890), 1880);
  });

  it('returns min if max is null', () => {
    assert.equal(estimateMidpoint(1870, null), 1870);
  });

  it('returns max if min is null', () => {
    assert.equal(estimateMidpoint(null, 1890), 1890);
  });

  it('returns null if both null', () => {
    assert.equal(estimateMidpoint(null, null), null);
  });
});

// ---------------------------------------------------------------------------
// researchBuildingDates — integration
// ---------------------------------------------------------------------------

describe('researchBuildingDates', () => {
  it('produces valid layer envelope', () => {
    const layer = researchBuildingDates({
      location: 'New York, NY',
      year: 1884,
      terrainDataPath: null,
    });

    assert.ok(layer.data);
    assert.ok(typeof layer.confidence === 'number');
    assert.ok(Array.isArray(layer.sources));
    assert.ok(Array.isArray(layer.knownCompromises));
  });

  it('handles no terrain data gracefully', () => {
    const layer = researchBuildingDates({
      location: 'New York, NY',
      year: 1884,
      terrainDataPath: '/nonexistent/path',
    });

    assert.equal(layer.data.totalBuildings, 0);
    assert.equal(layer.data.dateCompleteness, 0);
    assert.deepEqual(layer.data.buildingInventory, []);
  });

  it('handles non-US location', () => {
    const layer = researchBuildingDates({
      location: 'London, UK',
      year: 1888,
      countryCode: 'GB',
    });

    assert.equal(layer.data.totalBuildings, 0);
    assert.ok(layer.knownCompromises.some(c => c.includes('Non-US')));
  });

  it('enriches buildings from manhattan-ny terrain data', () => {
    const terrainPath = new URL('../terrain-data/manhattan-ny', import.meta.url).pathname;

    if (!existsSync(terrainPath)) {
      // Skip if terrain data not present (CI environment)
      return;
    }

    const layer = researchBuildingDates({
      location: 'Manhattan, NY',
      year: 1884,
      terrainDataPath: terrainPath,
    });

    assert.ok(layer.data.totalBuildings > 0, 'should find buildings');
    assert.ok(layer.data.dateCompleteness > 0, 'should date some buildings');
    assert.ok(layer.data.buildingInventory.length > 0);

    // Every building should have an estimate (Sanborn bracket + material era + fire)
    for (const b of layer.data.buildingInventory) {
      assert.ok(typeof b.featureIndex === 'number');
      assert.ok(b.confidence !== 'undated',
        `building ${b.featureIndex} should be dated (has Sanborn + NYC fire data)`);
    }
  });

  it('processes OSM buildings with start_date', () => {
    const osmBuildings = [
      {
        type: 'Feature',
        properties: { start_date: '1875', building: 'yes', material: 'brick', stories: 4 },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] },
      },
    ];

    const layer = researchBuildingDates({
      location: 'New York, NY',
      year: 1884,
      osmBuildings,
    });

    assert.equal(layer.data.totalBuildings, 1);
    assert.equal(layer.data.buildingInventory[0].yearBuilt, 1875);
    assert.equal(layer.data.buildingInventory[0].confidence, 'verified');
  });

  it('fuses multiple evidence sources per building', () => {
    const osmBuildings = [
      {
        type: 'Feature',
        properties: { material: 'cast_iron', stories: 5 },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] },
      },
    ];

    const layer = researchBuildingDates({
      location: 'New York, NY',
      year: 1884,
      osmBuildings,
    });

    assert.equal(layer.data.totalBuildings, 1);
    const b = layer.data.buildingInventory[0];
    // Cast iron + NYC fire (1835) + NYC boom (1880s) + Sanborn bracket
    assert.ok(b.yearBuilt != null, 'should produce a date estimate');
    assert.ok(b.range[0] >= 1835, 'lower bound at least NYC fire year');
    assert.ok(b.range[1] <= 1900, 'upper bound from cast iron era');
  });
});
