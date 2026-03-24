import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  validateOverlay, createBlankOverlay, confidenceSummary, filterModifications,
  loadOverlay, getFeatureAdditions, getFeatureRemovals, getSurfaceSwaps,
  CONFIDENCE, OVERLAY_TYPES
} from '../lib/historicalOverlay.js';

describe('createBlankOverlay', () => {
  it('produces a valid overlay', () => {
    const o = createBlankOverlay({ location: 'Manhattan, NY', targetYear: 1884, baseTerrainSlug: 'manhattan-ny' });
    const { valid, errors } = validateOverlay(o);
    assert.ok(valid, `Expected valid overlay, got errors: ${errors.join(', ')}`);
    assert.strictEqual(o.targetYear, 1884);
    assert.strictEqual(o.modifications.length, 0);
    assert.strictEqual(o.schemaVersion, 1);
    assert.strictEqual(o.osmBuildingFilter.maxConstructionYear, 1884);
  });

  it('sets height anchoring defaults', () => {
    const o = createBlankOverlay({ location: 'X', targetYear: 1900, baseTerrainSlug: 'x' });
    assert.strictEqual(o.heightAnchoring.strategy, 'modern_ground');
    assert.strictEqual(o.heightAnchoring.gradeToleranceMeters, 2);
    assert.strictEqual(o.heightAnchoring.historicalDEMAvailable, false);
  });
});

describe('validateOverlay', () => {
  it('rejects missing location', () => {
    const { valid, errors } = validateOverlay({ targetYear: 1884, baseTerrainSlug: 'x', modifications: [] });
    assert.ok(!valid);
    assert.ok(errors.some(e => e.includes('location')));
  });

  it('rejects missing targetYear', () => {
    const { valid, errors } = validateOverlay({ location: 'X', baseTerrainSlug: 'x', modifications: [] });
    assert.ok(!valid);
    assert.ok(errors.some(e => e.includes('targetYear')));
  });

  it('rejects non-numeric targetYear', () => {
    const { valid, errors } = validateOverlay({ location: 'X', targetYear: '1884', baseTerrainSlug: 'x', modifications: [] });
    assert.ok(!valid);
    assert.ok(errors.some(e => e.includes('targetYear')));
  });

  it('rejects unknown modification type', () => {
    const o = createBlankOverlay({ location: 'X', targetYear: 1884, baseTerrainSlug: 'x' });
    o.modifications.push({ type: 'bad_type', confidence: 'verified' });
    const { valid, errors } = validateOverlay(o);
    assert.ok(!valid);
    assert.ok(errors.some(e => e.includes('unknown type')));
  });

  it('rejects unknown confidence level', () => {
    const o = createBlankOverlay({ location: 'X', targetYear: 1884, baseTerrainSlug: 'x' });
    o.modifications.push({ type: 'osm_filter', confidence: 'maybe' });
    const { valid, errors } = validateOverlay(o);
    assert.ok(!valid);
    assert.ok(errors.some(e => e.includes('unknown confidence')));
  });

  it('requires extent for spatial types', () => {
    const o = createBlankOverlay({ location: 'X', targetYear: 1884, baseTerrainSlug: 'x' });
    o.modifications.push({ type: 'terrain_delta', confidence: 'verified' });
    const { valid, errors } = validateOverlay(o);
    assert.ok(!valid);
    assert.ok(errors.some(e => e.includes('extent')));
  });

  it('accepts spatial type with extent', () => {
    const o = createBlankOverlay({ location: 'X', targetYear: 1884, baseTerrainSlug: 'x' });
    o.modifications.push({
      type: 'terrain_delta',
      confidence: 'verified',
      extent: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }
    });
    const { valid } = validateOverlay(o);
    assert.ok(valid);
  });

  it('does not require extent for non-spatial types', () => {
    const o = createBlankOverlay({ location: 'X', targetYear: 1884, baseTerrainSlug: 'x' });
    o.modifications.push({ type: 'osm_filter', confidence: 'estimated' });
    o.modifications.push({ type: 'feature_remove', confidence: 'verified' });
    const { valid } = validateOverlay(o);
    assert.ok(valid);
  });

  it('rejects non-array modifications', () => {
    const { valid, errors } = validateOverlay({
      location: 'X', targetYear: 1884, baseTerrainSlug: 'x',
      modifications: 'not-an-array'
    });
    assert.ok(!valid);
    assert.ok(errors.some(e => e.includes('must be an array')));
  });
});

describe('confidenceSummary', () => {
  it('counts by confidence level', () => {
    const o = createBlankOverlay({ location: 'X', targetYear: 1884, baseTerrainSlug: 'x' });
    o.modifications = [
      { type: 'osm_filter', confidence: 'verified' },
      { type: 'osm_filter', confidence: 'estimated' },
      { type: 'osm_filter', confidence: 'estimated' },
      { type: 'osm_filter', confidence: 'inferred' }
    ];
    const s = confidenceSummary(o);
    assert.strictEqual(s.total, 4);
    assert.strictEqual(s.verified, 1);
    assert.strictEqual(s.estimated, 2);
    assert.strictEqual(s.inferred, 1);
    assert.strictEqual(s.unavailable, 0);
  });

  it('handles empty modifications', () => {
    const o = createBlankOverlay({ location: 'X', targetYear: 1884, baseTerrainSlug: 'x' });
    const s = confidenceSummary(o);
    assert.strictEqual(s.total, 0);
  });
});

describe('filterModifications', () => {
  const overlay = createBlankOverlay({ location: 'X', targetYear: 1884, baseTerrainSlug: 'x' });
  overlay.modifications = [
    { type: 'terrain_delta', confidence: 'verified', extent: { type: 'Polygon', coordinates: [] } },
    { type: 'surface_swap', confidence: 'estimated', extent: { type: 'Polygon', coordinates: [] } },
    { type: 'osm_filter', confidence: 'inferred' },
    { type: 'feature_remove', confidence: 'unavailable' }
  ];

  it('filters by type', () => {
    const results = filterModifications(overlay, { type: 'terrain_delta' });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].type, 'terrain_delta');
  });

  it('filters by minimum confidence', () => {
    const results = filterModifications(overlay, { minConfidence: 'estimated' });
    assert.strictEqual(results.length, 2); // verified + estimated
  });

  it('filters by both type and confidence', () => {
    const results = filterModifications(overlay, { type: 'surface_swap', minConfidence: 'verified' });
    assert.strictEqual(results.length, 0); // surface_swap is only estimated
  });

  it('returns all with no filters', () => {
    const results = filterModifications(overlay);
    assert.strictEqual(results.length, 4);
  });
});

describe('CONFIDENCE and OVERLAY_TYPES enums', () => {
  it('CONFIDENCE has four levels', () => {
    assert.strictEqual(Object.keys(CONFIDENCE).length, 4);
  });

  it('OVERLAY_TYPES has six types', () => {
    assert.strictEqual(Object.keys(OVERLAY_TYPES).length, 6);
  });
});

describe('loadOverlay', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tm-overlay-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads a valid overlay file', () => {
    const overlay = createBlankOverlay({ location: 'Test', targetYear: 1900, baseTerrainSlug: 'test' });
    const filePath = join(tmpDir, 'overlay.json');
    writeFileSync(filePath, JSON.stringify(overlay));
    const loaded = loadOverlay(filePath);
    assert.strictEqual(loaded.targetYear, 1900);
  });

  it('throws on missing file', () => {
    assert.throws(() => loadOverlay(join(tmpDir, 'nope.json')), /not found/);
  });

  it('throws on invalid overlay', () => {
    const filePath = join(tmpDir, 'bad.json');
    writeFileSync(filePath, JSON.stringify({ bad: true }));
    assert.throws(() => loadOverlay(filePath), /Invalid overlay/);
  });
});

describe('accessor helpers', () => {
  const overlay = createBlankOverlay({ location: 'NYC', targetYear: 1884, baseTerrainSlug: 'manhattan-ny' });
  overlay.modifications = [
    { type: 'feature_add', confidence: 'verified', extent: { type: 'LineString' }, featureType: 'elevated_railway' },
    { type: 'feature_add', confidence: 'estimated', extent: { type: 'LineString' }, featureType: 'canal' },
    { type: 'feature_remove', confidence: 'verified', id: 'fdr-drive' },
    { type: 'surface_swap', confidence: 'verified', extent: { type: 'Polygon' }, historicalMaterial: 'granite' }
  ];

  it('getFeatureAdditions returns feature_add mods', () => {
    assert.strictEqual(getFeatureAdditions(overlay).length, 2);
  });

  it('getFeatureRemovals returns feature_remove mods', () => {
    assert.strictEqual(getFeatureRemovals(overlay).length, 1);
  });

  it('getSurfaceSwaps returns surface_swap mods', () => {
    const swaps = getSurfaceSwaps(overlay);
    assert.strictEqual(swaps.length, 1);
    assert.strictEqual(swaps[0].historicalMaterial, 'granite');
  });
});
