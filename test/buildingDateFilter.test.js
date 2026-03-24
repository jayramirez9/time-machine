import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { filterBuildingsByYear } from '../lib/buildingMassing.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function makeFeature(props = {}) {
  return {
    type: 'Feature',
    properties: { category: 'building', stories: 3, material: 'brick', ...props },
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }
  };
}

function makeCollection(...features) {
  return { type: 'FeatureCollection', features };
}

// ---------------------------------------------------------------------------
// filterBuildingsByYear
// ---------------------------------------------------------------------------

describe('filterBuildingsByYear', () => {
  it('includes undated buildings by default', () => {
    const geojson = makeCollection(
      makeFeature({ name: 'undated' })
    );
    const result = filterBuildingsByYear(geojson, 1884);
    assert.equal(result.included, 1);
    assert.equal(result.undated, 1);
    assert.equal(result.excluded, 0);
  });

  it('excludes undated buildings in strict mode', () => {
    const geojson = makeCollection(
      makeFeature({ name: 'undated' })
    );
    const result = filterBuildingsByYear(geojson, 1884, { strict: true });
    assert.equal(result.included, 0);
    assert.equal(result.excluded, 1);
    assert.equal(result.undated, 1);
  });

  it('includes buildings built before target year', () => {
    const geojson = makeCollection(
      makeFeature({ name: 'old', yearBuilt: 1850 })
    );
    const result = filterBuildingsByYear(geojson, 1884);
    assert.equal(result.included, 1);
    assert.equal(result.excluded, 0);
  });

  it('includes buildings built in target year', () => {
    const geojson = makeCollection(
      makeFeature({ name: 'same year', yearBuilt: 1884 })
    );
    const result = filterBuildingsByYear(geojson, 1884);
    assert.equal(result.included, 1);
  });

  it('excludes buildings built after target year', () => {
    const geojson = makeCollection(
      makeFeature({ name: 'future', yearBuilt: 1920 })
    );
    const result = filterBuildingsByYear(geojson, 1884);
    assert.equal(result.included, 0);
    assert.equal(result.excluded, 1);
  });

  it('excludes buildings demolished before target year', () => {
    const geojson = makeCollection(
      makeFeature({ name: 'gone', yearBuilt: 1800, yearDemolished: 1870 })
    );
    const result = filterBuildingsByYear(geojson, 1884);
    assert.equal(result.included, 0);
    assert.equal(result.excluded, 1);
  });

  it('excludes buildings demolished in target year', () => {
    const geojson = makeCollection(
      makeFeature({ name: 'gone this year', yearBuilt: 1800, yearDemolished: 1884 })
    );
    const result = filterBuildingsByYear(geojson, 1884);
    assert.equal(result.included, 0);
    assert.equal(result.excluded, 1);
  });

  it('includes buildings demolished after target year', () => {
    const geojson = makeCollection(
      makeFeature({ name: 'still standing', yearBuilt: 1800, yearDemolished: 1940 })
    );
    const result = filterBuildingsByYear(geojson, 1884);
    assert.equal(result.included, 1);
  });

  it('handles mixed dated and undated buildings', () => {
    const geojson = makeCollection(
      makeFeature({ name: 'old', yearBuilt: 1850 }),
      makeFeature({ name: 'undated' }),
      makeFeature({ name: 'future', yearBuilt: 1920 }),
      makeFeature({ name: 'demolished', yearBuilt: 1800, yearDemolished: 1870 }),
      makeFeature({ name: 'still here', yearBuilt: 1860, yearDemolished: 1950 })
    );
    const result = filterBuildingsByYear(geojson, 1884);
    assert.equal(result.included, 3); // old, undated, still here
    assert.equal(result.excluded, 2); // future, demolished
    assert.equal(result.undated, 1);
  });

  it('returns a valid GeoJSON FeatureCollection', () => {
    const geojson = makeCollection(
      makeFeature({ yearBuilt: 1850 }),
      makeFeature({ yearBuilt: 1920 })
    );
    const result = filterBuildingsByYear(geojson, 1884);
    assert.equal(result.filtered.type, 'FeatureCollection');
    assert.equal(result.filtered.features.length, 1);
  });

  it('preserves metadata from original geojson', () => {
    const geojson = makeCollection(makeFeature({ yearBuilt: 1850 }));
    geojson._meta = { targetYear: 1890 };
    const result = filterBuildingsByYear(geojson, 1884);
    assert.equal(result.filtered._meta.targetYear, 1890);
  });

  it('handles empty feature collection', () => {
    const geojson = makeCollection();
    const result = filterBuildingsByYear(geojson, 1884);
    assert.equal(result.included, 0);
    assert.equal(result.excluded, 0);
    assert.equal(result.undated, 0);
  });

  it('handles yearDemolished without yearBuilt', () => {
    const geojson = makeCollection(
      makeFeature({ name: 'demolished only', yearDemolished: 1870 })
    );
    const result = filterBuildingsByYear(geojson, 1884);
    // Has date metadata (yearDemolished), demolished before target → excluded
    assert.equal(result.included, 0);
    assert.equal(result.excluded, 1);
  });
});
