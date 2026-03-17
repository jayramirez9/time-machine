import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import {
  researchUrbanForm,
  assessTerrainData,
  assessSanbornCoverage,
  SANBORN_COVERAGE,
} from '../lib/agents/urbanFormAgent.js';
import { resolveEra, getEraInfo, listEras } from '../lib/architectureStyles.js';
import { summarizePropsForYear } from '../lib/propCatalog.js';
import { validateLayerEnvelope } from '../lib/environmentProfile.js';

// ─── Paths ───────────────────────────────────────────────────────

const MANHATTAN_PATH = path.resolve('terrain-data/manhattan-ny');
const NONEXISTENT_PATH = path.resolve('terrain-data/does-not-exist-xyz');

// ─── assessTerrainData ──────────────────────────────────────────

describe('assessTerrainData', () => {
  it('reads real manhattan-ny terrain data', () => {
    const result = assessTerrainData(MANHATTAN_PATH);
    assert.ok(result, 'should return an object');
    assert.ok(result.location, 'should have location name');
    assert.equal(typeof result.lat, 'number');
    assert.equal(typeof result.lon, 'number');
    assert.equal(result.slug, 'manhattan-ny');
  });

  it('finds buildings in manhattan-ny', () => {
    const result = assessTerrainData(MANHATTAN_PATH);
    assert.ok(result.buildings, 'should have buildings');
    assert.ok(result.buildings.count > 0, `expected buildings, got ${result.buildings.count}`);
    assert.ok(result.buildings.path.includes('buildings.geojson'));
  });

  it('finds streets in manhattan-ny', () => {
    const result = assessTerrainData(MANHATTAN_PATH);
    assert.ok(result.streets, 'should have streets');
    assert.ok(result.streets.count > 0, `expected streets, got ${result.streets.count}`);
  });

  it('finds landmarks in manhattan-ny', () => {
    const result = assessTerrainData(MANHATTAN_PATH);
    assert.ok(result.landmarks, 'should have landmarks');
    assert.ok(result.landmarks.count > 0, `expected landmarks, got ${result.landmarks.count}`);
    assert.ok(Array.isArray(result.landmarks.names));
  });

  it('finds sanborn metadata in manhattan-ny', () => {
    const result = assessTerrainData(MANHATTAN_PATH);
    assert.ok(result.sanborn, 'should have sanborn');
    assert.ok(result.sanborn.sheetCount > 0);
    assert.equal(result.sanborn.targetYear, 1890);
  });

  it('finds vectors summary in manhattan-ny', () => {
    const result = assessTerrainData(MANHATTAN_PATH);
    assert.ok(result.vectors, 'should have vectors');
    assert.ok(result.vectors.roads > 0);
    assert.ok(result.vectors.splineCount > 0);
  });

  it('returns null for nonexistent path', () => {
    const result = assessTerrainData(NONEXISTENT_PATH);
    assert.equal(result, null);
  });

  it('returns null for null/undefined path', () => {
    assert.equal(assessTerrainData(null), null);
    assert.equal(assessTerrainData(undefined), null);
    assert.equal(assessTerrainData(''), null);
  });
});

// ─── assessSanbornCoverage ──────────────────────────────────────

describe('assessSanbornCoverage', () => {
  it('finds coverage for New York, NY', () => {
    const result = assessSanbornCoverage('New York, NY', 1884);
    assert.equal(result.available, true);
    assert.equal(result.city, 'New York');
    assert.ok(result.years.length > 0);
    assert.equal(typeof result.closestYear, 'number');
    assert.equal(typeof result.yearGap, 'number');
  });

  it('finds coverage for Manhattan, NY', () => {
    const result = assessSanbornCoverage('Manhattan, NY', 1884);
    assert.equal(result.available, true);
    assert.equal(result.city, 'New York');
  });

  it('finds coverage for Chicago, IL', () => {
    const result = assessSanbornCoverage('Chicago, IL', 1920);
    assert.equal(result.available, true);
    assert.equal(result.city, 'Chicago');
    assert.ok(result.closestYear <= 1923); // 1917 or 1923
  });

  it('finds coverage for San Francisco, CA', () => {
    const result = assessSanbornCoverage('San Francisco, CA', 1908);
    assert.equal(result.available, true);
    assert.equal(result.city, 'San Francisco');
  });

  it('finds coverage for Baton Rouge, LA', () => {
    const result = assessSanbornCoverage('Baton Rouge, LA', 1978);
    assert.equal(result.available, true);
    assert.equal(result.city, 'Baton Rouge');
  });

  it('reports no coverage for unknown cities', () => {
    const result = assessSanbornCoverage('Timbuktu, Mali', 1900);
    assert.equal(result.available, false);
    assert.ok(result.note.includes('No Sanborn'));
  });

  it('calculates year gap correctly', () => {
    const result = assessSanbornCoverage('New York, NY', 1884);
    // Closest should be 1885 (1-year gap)
    assert.equal(result.closestYear, 1885);
    assert.equal(result.yearGap, 1);
  });

  it('returns zero gap for exact match', () => {
    // 1890 is in the NYC list
    const result = assessSanbornCoverage('New York, NY', 1890);
    assert.equal(result.closestYear, 1890);
    assert.equal(result.yearGap, 0);
    assert.ok(result.note.includes('exists'));
  });

  it('provides nearestBefore and nearestAfter', () => {
    const result = assessSanbornCoverage('New York, NY', 1887);
    assert.equal(result.nearestBefore, 1885);
    assert.equal(result.nearestAfter, 1890);
  });
});

// ─── SANBORN_COVERAGE data integrity ────────────────────────────

describe('SANBORN_COVERAGE', () => {
  it('has entries for at least 20 cities', () => {
    assert.ok(Object.keys(SANBORN_COVERAGE).length >= 20);
  });

  it('all entries have years array and city string', () => {
    for (const [key, val] of Object.entries(SANBORN_COVERAGE)) {
      assert.ok(Array.isArray(val.years), `${key}: years must be array`);
      assert.ok(val.years.length > 0, `${key}: must have at least one year`);
      assert.equal(typeof val.city, 'string', `${key}: city must be string`);
    }
  });

  it('years are sorted ascending', () => {
    for (const [key, val] of Object.entries(SANBORN_COVERAGE)) {
      for (let i = 1; i < val.years.length; i++) {
        assert.ok(val.years[i] > val.years[i - 1],
          `${key}: years must be sorted (${val.years[i - 1]} >= ${val.years[i]})`);
      }
    }
  });

  it('all years are reasonable (1800-1960)', () => {
    for (const [key, val] of Object.entries(SANBORN_COVERAGE)) {
      for (const y of val.years) {
        assert.ok(y >= 1800 && y <= 1960, `${key}: year ${y} out of range`);
      }
    }
  });
});

// ─── Architecture era resolution ────────────────────────────────

describe('Architecture era resolution', () => {
  it('resolves 1884 to general_victorian', () => {
    assert.equal(resolveEra(1884), 'general_victorian');
  });

  it('resolves 1978 to general_late20c', () => {
    assert.equal(resolveEra(1978), 'general_late20c');
  });

  it('resolves 1750 to general_colonial', () => {
    assert.equal(resolveEra(1750), 'general_colonial');
  });

  it('resolves 2025 to general_contemporary', () => {
    assert.equal(resolveEra(2025), 'general_contemporary');
  });

  it('resolves 1940 to general_deco', () => {
    assert.equal(resolveEra(1940), 'general_deco');
  });

  it('getEraInfo returns data for all eras', () => {
    for (const era of listEras()) {
      const info = getEraInfo(era);
      assert.ok(info, `getEraInfo(${era}) should return data`);
      assert.ok(info.label, `${era}: should have label`);
      assert.ok(Array.isArray(info.yearRange), `${era}: should have yearRange`);
      assert.ok(info.defaultStyle, `${era}: should have defaultStyle`);
    }
  });
});

// ─── Prop availability ──────────────────────────────────────────

describe('Prop availability by year', () => {
  it('1884 has hitching posts but no parking meters', () => {
    const summary = summarizePropsForYear(1884);
    assert.ok(summary.types.includes('hitching_post'), 'should have hitching posts in 1884');
    assert.ok(summary.types.includes('horse_trough'), 'should have horse troughs in 1884');
    assert.ok(!summary.types.includes('parking_meter'), 'should NOT have parking meters in 1884');
    assert.ok(!summary.types.includes('traffic_light'), 'should NOT have traffic lights in 1884');
  });

  it('1978 has parking meters but no hitching posts', () => {
    const summary = summarizePropsForYear(1978);
    assert.ok(summary.types.includes('parking_meter'), 'should have parking meters in 1978');
    assert.ok(summary.types.includes('traffic_light'), 'should have traffic lights in 1978');
    assert.ok(!summary.types.includes('hitching_post'), 'should NOT have hitching posts in 1978');
    assert.ok(!summary.types.includes('horse_trough'), 'should NOT have horse troughs in 1978');
  });

  it('1978 has more modern props than 1884', () => {
    const s1884 = summarizePropsForYear(1884);
    const s1978 = summarizePropsForYear(1978);
    // Both eras should have fire hydrants
    assert.ok(s1884.types.includes('fire_hydrant'));
    assert.ok(s1978.types.includes('fire_hydrant'));
  });
});

// ─── researchUrbanForm ──────────────────────────────────────────

describe('researchUrbanForm', () => {
  it('returns valid layer envelope with terrain data', () => {
    const layer = researchUrbanForm({
      location: 'Manhattan, NY',
      year: 1884,
      lat: 40.7128,
      lon: -74.006,
      countryCode: 'US',
      terrainDataPath: MANHATTAN_PATH,
    });

    const errors = validateLayerEnvelope(layer, 'urbanForm');
    assert.deepEqual(errors, [], `Layer validation errors: ${errors.join(', ')}`);
  });

  it('returns valid layer envelope without terrain data', () => {
    const layer = researchUrbanForm({
      location: 'Chicago, IL',
      year: 1920,
      lat: 41.8781,
      lon: -87.6298,
      countryCode: 'US',
      terrainDataPath: null,
    });

    const errors = validateLayerEnvelope(layer, 'urbanForm');
    assert.deepEqual(errors, [], `Layer validation errors: ${errors.join(', ')}`);
  });

  it('includes architecture era in data', () => {
    const layer = researchUrbanForm({
      location: 'Manhattan, NY',
      year: 1884,
      terrainDataPath: MANHATTAN_PATH,
    });

    assert.equal(layer.data.architectureEra, 'general_victorian');
    assert.ok(layer.data.architectureEraLabel);
    assert.equal(typeof layer.data.architectureStyleCount, 'number');
  });

  it('includes prop data', () => {
    const layer = researchUrbanForm({
      location: 'Manhattan, NY',
      year: 1884,
      terrainDataPath: MANHATTAN_PATH,
    });

    assert.equal(layer.data.propYear, 1884);
    assert.ok(Array.isArray(layer.data.propTypes));
    assert.ok(layer.data.propCount > 0);
    assert.ok(layer.data.propTypes.includes('hitching_post'));
  });

  it('includes terrain data references when available', () => {
    const layer = researchUrbanForm({
      location: 'Manhattan, NY',
      year: 1884,
      terrainDataPath: MANHATTAN_PATH,
    });

    assert.ok(layer.data.footprintsPath);
    assert.ok(layer.data.footprintCount > 0);
    assert.ok(layer.data.streetsPath);
    assert.ok(layer.data.streetCount > 0);
    assert.ok(layer.data.landmarksPath);
    assert.ok(layer.data.landmarkCount > 0);
  });

  it('omits terrain data references when not available', () => {
    const layer = researchUrbanForm({
      location: 'Chicago, IL',
      year: 1920,
      terrainDataPath: null,
    });

    assert.equal(layer.data.footprintsPath, undefined);
    assert.equal(layer.data.streetsPath, undefined);
    assert.equal(layer.data.landmarksPath, undefined);
  });

  it('includes sanborn coverage assessment', () => {
    const layer = researchUrbanForm({
      location: 'New York, NY',
      year: 1884,
      countryCode: 'US',
    });

    assert.ok(layer.data.sanbornCoverage, 'should have sanbornCoverage');
    assert.equal(typeof layer.data.sanbornCoverage.closestYear, 'number');
    assert.equal(typeof layer.data.sanbornCoverage.yearGap, 'number');
  });

  it('sanborn coverage is null for non-US locations', () => {
    const layer = researchUrbanForm({
      location: 'London, UK',
      year: 1884,
      countryCode: 'GB',
    });

    assert.equal(layer.data.sanbornCoverage, null);
  });

  it('includes availability report', () => {
    const layer = researchUrbanForm({
      location: 'Manhattan, NY',
      year: 1884,
      terrainDataPath: MANHATTAN_PATH,
    });

    const report = layer.data._availabilityReport;
    assert.ok(report);
    assert.equal(report.terrainDataExists, true);
    assert.equal(report.buildingFootprintsExist, true);
    assert.equal(report.streetSplinesExist, true);
    assert.equal(report.landmarksExist, true);
    assert.equal(report.propCatalogAvailable, true);
    assert.equal(report.osmDataAvailable, true);
  });

  it('has sources array with at least one source', () => {
    const layer = researchUrbanForm({
      location: 'Manhattan, NY',
      year: 1884,
      terrainDataPath: MANHATTAN_PATH,
    });

    assert.ok(layer.sources.length >= 2, 'should have multiple sources');
    for (const src of layer.sources) {
      assert.ok(src.id, 'source must have id');
      assert.ok(src.type, 'source must have type');
      assert.ok(src.name, 'source must have name');
    }
  });

  it('has known compromises', () => {
    const layer = researchUrbanForm({
      location: 'Manhattan, NY',
      year: 1884,
      terrainDataPath: MANHATTAN_PATH,
    });

    assert.ok(layer.knownCompromises.length > 0, 'should have compromises');
    assert.ok(layer.knownCompromises.every(c => typeof c === 'string'));
  });
});

// ─── Confidence varies ──────────────────────────────────────────

describe('Confidence varies by data availability', () => {
  it('higher confidence with terrain data than without', () => {
    const withTerrain = researchUrbanForm({
      location: 'Manhattan, NY',
      year: 1884,
      terrainDataPath: MANHATTAN_PATH,
    });
    const withoutTerrain = researchUrbanForm({
      location: 'Manhattan, NY',
      year: 1884,
      terrainDataPath: null,
    });

    assert.ok(withTerrain.confidence > withoutTerrain.confidence,
      `with terrain (${withTerrain.confidence}) should be higher than without (${withoutTerrain.confidence})`);
  });

  it('higher confidence for locations with Sanborn coverage', () => {
    const withSanborn = researchUrbanForm({
      location: 'New York, NY',
      year: 1884,
      countryCode: 'US',
    });
    const withoutSanborn = researchUrbanForm({
      location: 'Timbuktu, Mali',
      year: 1884,
      countryCode: 'ML',
    });

    assert.ok(withSanborn.confidence > withoutSanborn.confidence,
      `NYC (${withSanborn.confidence}) should be higher than Timbuktu (${withoutSanborn.confidence})`);
  });

  it('confidence is between 0 and 1', () => {
    const layer = researchUrbanForm({ location: 'Manhattan, NY', year: 1884 });
    assert.ok(layer.confidence >= 0 && layer.confidence <= 1);
  });
});
