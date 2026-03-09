import { describe, it } from 'node:test';
import assert from 'node:assert';
import { wgs84ToUnreal, toGeoJSON, simplifyGeoJSON, roadsToSplineData, rasterizeMask, encodePNG } from '../lib/osmVectors.js';

// ─── Coordinate Transform ────────────────────────────────────────

describe('wgs84ToUnreal', () => {
  const origin = { lat: 40.78, lon: -73.97 };

  it('origin maps to (0, 0)', () => {
    const { x, y } = wgs84ToUnreal(40.78, -73.97, origin);
    assert.ok(Math.abs(x) === 0, `Expected x=0, got ${x}`);
    assert.ok(Math.abs(y) === 0, `Expected y=0, got ${y}`);
  });

  it('east of origin produces positive X', () => {
    const { x } = wgs84ToUnreal(40.78, -73.96, origin);
    assert.ok(x > 0, `Expected positive X, got ${x}`);
  });

  it('north of origin produces negative Y (Unreal convention)', () => {
    const { y } = wgs84ToUnreal(40.79, -73.97, origin);
    assert.ok(y < 0, `Expected negative Y, got ${y}`);
  });

  it('produces approximately correct distances', () => {
    // 0.001 degrees latitude ≈ 111.32 meters ≈ 11132 cm
    const { y } = wgs84ToUnreal(40.781, -73.97, origin);
    const expectedCm = -111320 * 0.001 * 100; // negative because north
    assert.ok(Math.abs(y - expectedCm) < 100,
      `Expected ~${expectedCm.toFixed(0)}cm, got ${y.toFixed(0)}cm`);
  });
});

// ─── GeoJSON Conversion ──────────────────────────────────────────

describe('toGeoJSON', () => {
  const mockOverpass = {
    elements: [
      // Nodes
      { type: 'node', id: 1, lat: 40.78, lon: -73.97 },
      { type: 'node', id: 2, lat: 40.781, lon: -73.97 },
      { type: 'node', id: 3, lat: 40.782, lon: -73.97 },
      // Road way
      { type: 'way', id: 100, tags: { highway: 'residential', name: 'Test St' }, nodes: [1, 2, 3] },
      // Water polygon (closed ring)
      { type: 'node', id: 10, lat: 40.78, lon: -73.96 },
      { type: 'node', id: 11, lat: 40.781, lon: -73.96 },
      { type: 'node', id: 12, lat: 40.781, lon: -73.959 },
      { type: 'node', id: 13, lat: 40.78, lon: -73.959 },
      { type: 'way', id: 200, tags: { natural: 'water', name: 'Test Pond' }, nodes: [10, 11, 12, 13, 10] },
      // Landuse
      { type: 'node', id: 20, lat: 40.785, lon: -73.97 },
      { type: 'node', id: 21, lat: 40.786, lon: -73.97 },
      { type: 'node', id: 22, lat: 40.786, lon: -73.969 },
      { type: 'node', id: 23, lat: 40.785, lon: -73.969 },
      { type: 'way', id: 300, tags: { landuse: 'park' }, nodes: [20, 21, 22, 23, 20] }
    ]
  };

  it('extracts correct number of features', () => {
    const geojson = toGeoJSON(mockOverpass);
    assert.strictEqual(geojson.features.length, 3);
  });

  it('classifies roads correctly', () => {
    const geojson = toGeoJSON(mockOverpass);
    const roads = geojson.features.filter(f => f.properties.category === 'road');
    assert.strictEqual(roads.length, 1);
    assert.strictEqual(roads[0].properties.subcategory, 'residential');
    assert.strictEqual(roads[0].properties.name, 'Test St');
    assert.strictEqual(roads[0].geometry.type, 'LineString');
  });

  it('classifies water polygons correctly', () => {
    const geojson = toGeoJSON(mockOverpass);
    const water = geojson.features.filter(f => f.properties.category === 'water');
    assert.strictEqual(water.length, 1);
    assert.strictEqual(water[0].geometry.type, 'Polygon');
    assert.strictEqual(water[0].properties.name, 'Test Pond');
  });

  it('classifies landuse correctly', () => {
    const geojson = toGeoJSON(mockOverpass);
    const landuse = geojson.features.filter(f => f.properties.category === 'landuse');
    assert.strictEqual(landuse.length, 1);
    assert.strictEqual(landuse[0].properties.subcategory, 'park');
    assert.strictEqual(landuse[0].geometry.type, 'Polygon');
  });

  it('preserves coordinate order [lon, lat]', () => {
    const geojson = toGeoJSON(mockOverpass);
    const road = geojson.features.find(f => f.properties.category === 'road');
    const [lon, lat] = road.geometry.coordinates[0];
    assert.strictEqual(lon, -73.97);
    assert.strictEqual(lat, 40.78);
  });

  it('handles empty input', () => {
    const geojson = toGeoJSON({ elements: [] });
    assert.strictEqual(geojson.features.length, 0);
  });

  it('skips ways with fewer than 2 resolved nodes', () => {
    const sparse = {
      elements: [
        { type: 'node', id: 1, lat: 40.78, lon: -73.97 },
        { type: 'way', id: 100, tags: { highway: 'path' }, nodes: [1, 999] } // node 999 missing
      ]
    };
    const geojson = toGeoJSON(sparse);
    assert.strictEqual(geojson.features.length, 0);
  });
});

// ─── Simplification ──────────────────────────────────────────────

describe('simplifyGeoJSON', () => {
  it('removes collinear intermediate points', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { category: 'road' },
        geometry: {
          type: 'LineString',
          // Straight line with redundant middle points
          coordinates: [[0, 0], [0.00001, 0.00001], [0.00002, 0.00002], [0.00003, 0.00003], [0.001, 0.001]]
        }
      }]
    };
    const simplified = simplifyGeoJSON(geojson, 0.00002);
    const coords = simplified.features[0].geometry.coordinates;
    assert.ok(coords.length < 5, `Expected fewer points, got ${coords.length}`);
    // First and last points always preserved
    assert.deepStrictEqual(coords[0], [0, 0]);
    assert.deepStrictEqual(coords[coords.length - 1], [0.001, 0.001]);
  });

  it('preserves sharp corners', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { category: 'road' },
        geometry: {
          type: 'LineString',
          // L-shaped line: the corner should be preserved
          coordinates: [[0, 0], [0.001, 0], [0.001, 0.001]]
        }
      }]
    };
    const simplified = simplifyGeoJSON(geojson, 0.00002);
    assert.strictEqual(simplified.features[0].geometry.coordinates.length, 3);
  });

  it('keeps polygon rings closed', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { category: 'water' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]]]
        }
      }]
    };
    const simplified = simplifyGeoJSON(geojson);
    const ring = simplified.features[0].geometry.coordinates[0];
    assert.deepStrictEqual(ring[0], ring[ring.length - 1], 'Ring should be closed');
  });
});

// ─── Road Spline Extraction ──────────────────────────────────────

describe('roadsToSplineData', () => {
  const origin = { lat: 40.78, lon: -73.97 };

  it('converts road features to spline data', () => {
    const roads = [{
      type: 'Feature',
      properties: { category: 'road', subcategory: 'residential' },
      geometry: { type: 'LineString', coordinates: [[-73.97, 40.78], [-73.969, 40.781]] }
    }];
    const splines = roadsToSplineData(roads, origin);
    assert.strictEqual(splines.length, 1);
    assert.strictEqual(splines[0].category, 'residential');
    assert.strictEqual(splines[0].points.length, 2);
  });

  it('sets Z=10 on all points', () => {
    const roads = [{
      type: 'Feature',
      properties: { category: 'road', subcategory: 'primary' },
      geometry: { type: 'LineString', coordinates: [[-73.97, 40.78], [-73.969, 40.781]] }
    }];
    const splines = roadsToSplineData(roads, origin);
    for (const pt of splines[0].points) {
      assert.strictEqual(pt[2], 10, 'Z should be 10cm');
    }
  });

  it('groups by subcategory', () => {
    const roads = [
      { type: 'Feature', properties: { category: 'road', subcategory: 'primary' }, geometry: { type: 'LineString', coordinates: [[-73.97, 40.78], [-73.969, 40.78]] } },
      { type: 'Feature', properties: { category: 'road', subcategory: 'secondary' }, geometry: { type: 'LineString', coordinates: [[-73.97, 40.781], [-73.969, 40.781]] } },
      { type: 'Feature', properties: { category: 'road', subcategory: 'primary' }, geometry: { type: 'LineString', coordinates: [[-73.968, 40.78], [-73.967, 40.78]] } }
    ];
    const splines = roadsToSplineData(roads, origin);
    const categories = new Set(splines.map(s => s.category));
    assert.ok(categories.has('primary'));
    assert.ok(categories.has('secondary'));
  });
});

// ─── Rasterization ───────────────────────────────────────────────

describe('rasterizeMask', () => {
  const bbox = { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 };

  it('fills a full-coverage polygon', () => {
    const features = [{
      type: 'Feature',
      properties: { category: 'water' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
      }
    }];
    const pixels = rasterizeMask(features, bbox, 10, 10);
    // Most pixels should be filled (edge pixels might not be)
    const filled = pixels.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
    assert.ok(filled > 50, `Expected >50% filled, got ${filled}%`);
  });

  it('leaves pixels empty outside polygon', () => {
    // Small triangle in corner
    const features = [{
      type: 'Feature',
      properties: { category: 'water' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 0], [0.1, 0], [0.05, 0.1], [0, 0]]]
      }
    }];
    const pixels = rasterizeMask(features, bbox, 100, 100);
    // Check a pixel far from the polygon
    assert.strictEqual(pixels[50 * 100 + 90], 0, 'Pixel far from polygon should be 0');
  });

  it('handles empty feature list', () => {
    const pixels = rasterizeMask([], bbox, 10, 10);
    const filled = pixels.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
    assert.strictEqual(filled, 0);
  });
});

// ─── PNG Encoding ────────────────────────────────────────────────

describe('encodePNG', () => {
  it('produces a valid PNG header', () => {
    const pixels = new Uint8Array(4 * 4); // 4x4 black image
    const png = encodePNG(pixels, 4, 4);
    // PNG signature
    assert.deepStrictEqual([...png.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it('produces non-empty output', () => {
    const pixels = new Uint8Array(10 * 10);
    pixels.fill(128);
    const png = encodePNG(pixels, 10, 10);
    assert.ok(png.length > 50, `Expected >50 bytes, got ${png.length}`);
  });

  it('contains IHDR chunk type', () => {
    const pixels = new Uint8Array(4 * 4);
    const png = encodePNG(pixels, 4, 4);
    const ihdrPos = png.indexOf(Buffer.from('IHDR'));
    assert.ok(ihdrPos >= 0, 'Should contain IHDR chunk');
  });

  it('contains IEND chunk type', () => {
    const pixels = new Uint8Array(4 * 4);
    const png = encodePNG(pixels, 4, 4);
    const iendPos = png.indexOf(Buffer.from('IEND'));
    assert.ok(iendPos >= 0, 'Should contain IEND chunk');
  });
});
