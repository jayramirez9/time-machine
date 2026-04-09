/**
 * OSM Vector Data — Fetch and process OpenStreetMap data via Overpass API
 *
 * Fetches roads, water bodies, and land-use boundaries within a bounding box,
 * converts to categorized GeoJSON, rasterizes polygon features to landscape
 * masks, and extracts road spline data for Unreal import.
 *
 * Zero external dependencies — uses built-in Node.js zlib for PNG encoding.
 */

import zlib from 'zlib';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const METERS_PER_DEG_LAT = 111320;

// ---------------------------------------------------------------------------
// Overpass API fetch
// ---------------------------------------------------------------------------

/**
 * Fetch OSM vector data within a bounding box from Overpass API.
 * Single query fetches roads, water, and landuse together.
 * @param {{ minLat: number, maxLat: number, minLon: number, maxLon: number }} bbox
 * @param {{ timeout?: number }} [opts]
 * @returns {Promise<object>} Raw Overpass JSON response
 */
export async function fetchOSMData(bbox, opts = {}) {
  const timeout = opts.timeout || 30;
  const bboxStr = `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`;

  const query = `
[out:json][timeout:${timeout}];
(
  way["highway"](${bboxStr});
  way["natural"="water"](${bboxStr});
  way["waterway"](${bboxStr});
  relation["natural"="water"](${bboxStr});
  way["landuse"](${bboxStr});
  relation["landuse"](${bboxStr});
);
out body;
>;
out skel qt;
`.trim();

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'TimeMachine/1.0'
    },
    body: `data=${encodeURIComponent(query)}`
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) {
      throw new Error('Overpass API rate limit hit — wait a minute and retry');
    }
    throw new Error(`Overpass API error ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

/**
 * Fetch OSM building footprints within a bounding box.
 * Includes start_date, building:levels, and building:material tags for date estimation.
 * @param {{ minLat: number, maxLat: number, minLon: number, maxLon: number }} bbox
 * @param {{ timeout?: number }} [opts]
 * @returns {Promise<object>} Raw Overpass JSON response with building ways and relations
 */
export async function fetchOSMBuildings(bbox, opts = {}) {
  const timeout = opts.timeout || 60;
  const bboxStr = `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`;

  const query = `
[out:json][timeout:${timeout}];
(
  way["building"](${bboxStr});
  relation["building"](${bboxStr});
);
out body;
>;
out skel qt;
`.trim();

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'TimeMachine/1.0'
    },
    body: `data=${encodeURIComponent(query)}`
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) {
      throw new Error('Overpass API rate limit hit — wait a minute and retry');
    }
    throw new Error(`Overpass API error ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// GeoJSON conversion
// ---------------------------------------------------------------------------

/**
 * Classify an OSM element's tags into a category and subcategory.
 * @param {object} tags
 * @returns {{ category: string, subcategory: string } | null}
 */
function classifyTags(tags) {
  if (!tags) return null;
  if (tags.highway) return { category: 'road', subcategory: tags.highway };
  if (tags.natural === 'water' || tags.waterway) return { category: 'water', subcategory: tags.waterway || 'water' };
  if (tags.landuse) return { category: 'landuse', subcategory: tags.landuse };
  if (tags.building) {
    const result = { category: 'building', subcategory: tags.building };
    if (tags.start_date) result.start_date = tags.start_date;
    if (tags['building:levels']) result.stories = parseInt(tags['building:levels'], 10) || null;
    if (tags['building:material']) result.material = tags['building:material'];
    return result;
  }
  return null;
}

/**
 * Convert raw Overpass JSON to a categorized GeoJSON FeatureCollection.
 * @param {object} overpassData - Raw Overpass JSON with elements[]
 * @returns {{ type: string, features: object[] }}
 */
export function toGeoJSON(overpassData) {
  const elements = overpassData.elements || [];

  // Build node lookup: id → {lat, lon}
  const nodes = new Map();
  for (const el of elements) {
    if (el.type === 'node') {
      nodes.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }

  const features = [];

  // Process ways
  for (const el of elements) {
    if (el.type !== 'way') continue;
    const cls = classifyTags(el.tags);
    if (!cls) continue;

    const coords = [];
    for (const nid of (el.nodes || [])) {
      const n = nodes.get(nid);
      if (n) coords.push([n.lon, n.lat]);
    }
    if (coords.length < 2) continue;

    // Determine geometry type: closed polygon or linestring
    const isClosed = coords.length >= 4 &&
      coords[0][0] === coords[coords.length - 1][0] &&
      coords[0][1] === coords[coords.length - 1][1];

    const isPolygonCategory = cls.category === 'water' || cls.category === 'landuse';
    const geometryType = (isClosed && isPolygonCategory) ? 'Polygon' : 'LineString';
    const geometry = geometryType === 'Polygon'
      ? { type: 'Polygon', coordinates: [coords] }
      : { type: 'LineString', coordinates: coords };

    features.push({
      type: 'Feature',
      properties: {
        ...cls,
        osmId: el.id,
        name: el.tags?.name || null
      },
      geometry
    });
  }

  // Process relations (multipolygons for water/landuse)
  for (const el of elements) {
    if (el.type !== 'relation') continue;
    const cls = classifyTags(el.tags);
    if (!cls) continue;

    // Collect outer and inner rings
    const outerWays = [];
    const innerWays = [];
    for (const member of (el.members || [])) {
      if (member.type !== 'way') continue;
      const target = member.role === 'inner' ? innerWays : outerWays;
      // Find the way element to get its nodes
      const wayEl = elements.find(e => e.type === 'way' && e.id === member.ref);
      if (!wayEl) continue;
      const coords = [];
      for (const nid of (wayEl.nodes || [])) {
        const n = nodes.get(nid);
        if (n) coords.push([n.lon, n.lat]);
      }
      if (coords.length >= 2) target.push(coords);
    }

    // Stitch outer ways into closed rings
    const outerRings = stitchRings(outerWays);
    const innerRings = stitchRings(innerWays);

    for (const ring of outerRings) {
      if (ring.length < 4) continue;
      const polygonCoords = [ring, ...innerRings.filter(r => r.length >= 4)];
      features.push({
        type: 'Feature',
        properties: {
          ...cls,
          osmId: el.id,
          name: el.tags?.name || null
        },
        geometry: { type: 'Polygon', coordinates: polygonCoords }
      });
    }
  }

  return { type: 'FeatureCollection', features };
}

/**
 * Stitch line segments into closed rings by matching endpoints.
 * @param {number[][][]} segments - Array of coordinate arrays
 * @returns {number[][][]} Array of closed rings
 */
function stitchRings(segments) {
  if (!segments.length) return [];
  const rings = [];
  const unused = segments.map(s => [...s]);

  while (unused.length) {
    const ring = unused.shift();
    let changed = true;

    while (changed) {
      changed = false;
      const endPt = ring[ring.length - 1];
      const startPt = ring[0];

      // Check if ring is closed
      if (ring.length >= 4 && endPt[0] === startPt[0] && endPt[1] === startPt[1]) break;

      for (let i = 0; i < unused.length; i++) {
        const seg = unused[i];
        const segStart = seg[0];
        const segEnd = seg[seg.length - 1];

        if (endPt[0] === segStart[0] && endPt[1] === segStart[1]) {
          // Append segment (skip first point, it's the same as our end)
          ring.push(...seg.slice(1));
          unused.splice(i, 1);
          changed = true;
          break;
        }
        if (endPt[0] === segEnd[0] && endPt[1] === segEnd[1]) {
          // Append reversed segment
          ring.push(...seg.slice(0, -1).reverse());
          unused.splice(i, 1);
          changed = true;
          break;
        }
      }
    }

    rings.push(ring);
  }

  return rings;
}

// ---------------------------------------------------------------------------
// Geometry simplification
// ---------------------------------------------------------------------------

/**
 * Douglas-Peucker line simplification.
 * @param {number[][]} points - Array of [x, y] coordinates
 * @param {number} tolerance - Max distance threshold
 * @returns {number[][]} Simplified points
 */
function douglasPeucker(points, tolerance) {
  if (points.length <= 2) return points;

  // Find point with max distance from line between first and last
  let maxDist = 0;
  let maxIdx = 0;
  const [x1, y1] = points[0];
  const [x2, y2] = points[points.length - 1];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    let dist;
    if (lenSq === 0) {
      dist = Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    } else {
      const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
      const projX = x1 + t * dx;
      const projY = y1 + t * dy;
      dist = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
    }
    if (dist > maxDist) { maxDist = dist; maxIdx = i; }
  }

  if (maxDist > tolerance) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), tolerance);
    const right = douglasPeucker(points.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0], points[points.length - 1]];
}

/**
 * Simplify all geometries in a GeoJSON FeatureCollection.
 * @param {{ features: object[] }} geojson
 * @param {number} [tolerance=0.00002] - ~2m in degrees at mid-latitudes
 * @returns {{ type: string, features: object[] }}
 */
export function simplifyGeoJSON(geojson, tolerance = 0.00002) {
  const features = geojson.features.map(f => {
    const g = f.geometry;
    let simplified;

    if (g.type === 'LineString') {
      simplified = { type: 'LineString', coordinates: douglasPeucker(g.coordinates, tolerance) };
    } else if (g.type === 'Polygon') {
      simplified = {
        type: 'Polygon',
        coordinates: g.coordinates.map(ring => {
          const s = douglasPeucker(ring, tolerance);
          // Ensure ring stays closed
          if (s.length >= 3 && (s[0][0] !== s[s.length - 1][0] || s[0][1] !== s[s.length - 1][1])) {
            s.push(s[0]);
          }
          return s;
        })
      };
    } else {
      simplified = g;
    }

    return { ...f, geometry: simplified };
  });

  return { type: 'FeatureCollection', features };
}

// ---------------------------------------------------------------------------
// Coordinate transform
// ---------------------------------------------------------------------------

/**
 * Convert a WGS84 coordinate to Unreal local space (centimeters).
 * Origin (lat, lon) maps to (0, 0). Uses local Mercator approximation.
 * @param {number} lat
 * @param {number} lon
 * @param {{ lat: number, lon: number }} origin
 * @returns {{ x: number, y: number }}
 */
export function wgs84ToUnreal(lat, lon, origin) {
  const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos(origin.lat * Math.PI / 180);
  return {
    x: (lon - origin.lon) * metersPerDegLon * 100,    // East = +X
    y: -(lat - origin.lat) * METERS_PER_DEG_LAT * 100  // North = -Y (Unreal convention)
  };
}

// ---------------------------------------------------------------------------
// Road spline extraction
// ---------------------------------------------------------------------------

/**
 * Extract road features as Unreal-space spline control points.
 * Merges connected segments that share endpoints.
 * @param {object[]} roadFeatures - GeoJSON features with category='road'
 * @param {{ lat: number, lon: number }} origin - Georeference origin
 * @returns {{ category: string, points: number[][] }[]} Spline groups
 */
export function roadsToSplineData(roadFeatures, origin) {
  // Group by subcategory
  const groups = new Map();
  for (const f of roadFeatures) {
    if (f.geometry.type !== 'LineString') continue;
    const sub = f.properties.subcategory || 'road';
    if (!groups.has(sub)) groups.set(sub, []);
    groups.get(sub).push(f.geometry.coordinates);
  }

  const splines = [];
  for (const [category, segments] of groups) {
    // Merge connected segments
    const merged = mergeSegments(segments);
    for (const seg of merged) {
      const points = seg.map(([lon, lat]) => {
        const { x, y } = wgs84ToUnreal(lat, lon, origin);
        return [x, y, 10]; // Z=10cm above ground
      });
      if (points.length >= 2) {
        splines.push({ category, points });
      }
    }
  }

  return splines;
}

/**
 * Merge line segments that share endpoints.
 * @param {number[][][]} segments
 * @returns {number[][][]} Merged segments
 */
function mergeSegments(segments) {
  if (!segments.length) return [];
  const result = segments.map(s => [...s]);
  let changed = true;

  while (changed) {
    changed = false;
    for (let i = 0; i < result.length; i++) {
      const seg = result[i];
      if (!seg) continue;
      const end = seg[seg.length - 1];

      for (let j = i + 1; j < result.length; j++) {
        const other = result[j];
        if (!other) continue;
        const otherStart = other[0];
        const otherEnd = other[other.length - 1];

        if (end[0] === otherStart[0] && end[1] === otherStart[1]) {
          seg.push(...other.slice(1));
          result[j] = null;
          changed = true;
          break;
        }
        if (end[0] === otherEnd[0] && end[1] === otherEnd[1]) {
          seg.push(...other.slice(0, -1).reverse());
          result[j] = null;
          changed = true;
          break;
        }
      }
    }
  }

  return result.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Rasterization
// ---------------------------------------------------------------------------

/**
 * Rasterize polygon features to a grayscale mask buffer.
 * White (255) = feature present, Black (0) = absent.
 * @param {object[]} polygonFeatures - GeoJSON Polygon features
 * @param {{ minLat: number, maxLat: number, minLon: number, maxLon: number }} bbox
 * @param {number} width - Output pixel width
 * @param {number} height - Output pixel height
 * @returns {Uint8Array} Raw grayscale pixel data (width * height bytes)
 */
export function rasterizeMask(polygonFeatures, bbox, width, height) {
  const pixels = new Uint8Array(width * height);
  const lonRange = bbox.maxLon - bbox.minLon;
  const latRange = bbox.maxLat - bbox.minLat;

  for (const feature of polygonFeatures) {
    if (feature.geometry.type !== 'Polygon') continue;

    for (const ring of feature.geometry.coordinates) {
      // Project ring to pixel coordinates
      const projected = ring.map(([lon, lat]) => ({
        x: ((lon - bbox.minLon) / lonRange) * width,
        y: ((bbox.maxLat - lat) / latRange) * height  // Flip Y: top = maxLat
      }));

      // Scanline fill
      scanlineFill(projected, pixels, width, height);
    }
  }

  return pixels;
}

/**
 * Scanline fill a polygon into a pixel buffer.
 * @param {{ x: number, y: number }[]} polygon - Projected polygon vertices
 * @param {Uint8Array} pixels - Output buffer
 * @param {number} width
 * @param {number} height
 */
function scanlineFill(polygon, pixels, width, height) {
  if (polygon.length < 3) return;

  // Find Y range
  let minY = Infinity, maxY = -Infinity;
  for (const p of polygon) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(height - 1, Math.ceil(maxY));

  for (let y = minY; y <= maxY; y++) {
    // Find edge intersections at this scanline
    const intersections = [];
    for (let i = 0; i < polygon.length - 1; i++) {
      const a = polygon[i];
      const b = polygon[i + 1];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        const t = (y - a.y) / (b.y - a.y);
        intersections.push(a.x + t * (b.x - a.x));
      }
    }

    // Sort and fill between pairs
    intersections.sort((a, b) => a - b);
    for (let i = 0; i < intersections.length - 1; i += 2) {
      const x0 = Math.max(0, Math.ceil(intersections[i]));
      const x1 = Math.min(width - 1, Math.floor(intersections[i + 1]));
      for (let x = x0; x <= x1; x++) {
        pixels[y * width + x] = 255;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Road mask rasterization (line buffer)
// ---------------------------------------------------------------------------

/** Buffer widths in pixels per road subcategory. */
const ROAD_BUFFER_PX = {
  motorway: 10, trunk: 9, primary: 8, secondary: 6,
  tertiary: 4, residential: 3, unclassified: 3, service: 2,
};

/**
 * Rasterize road LineString features to a grayscale mask using thick-line drawing.
 * White (255) = road surface, Black (0) = not road.
 * @param {object[]} roadFeatures - GeoJSON LineString features with category='road'
 * @param {{ minLat: number, maxLat: number, minLon: number, maxLon: number }} bbox
 * @param {number} width - Output pixel width
 * @param {number} height - Output pixel height
 * @param {number} [defaultBuffer=4] - Default buffer width in pixels
 * @returns {Uint8Array} Raw grayscale pixel data (width * height bytes)
 */
export function rasterizeRoadMask(roadFeatures, bbox, width, height, defaultBuffer = 4) {
  const pixels = new Uint8Array(width * height);
  const lonRange = bbox.maxLon - bbox.minLon;
  const latRange = bbox.maxLat - bbox.minLat;

  for (const feature of roadFeatures) {
    if (feature.geometry.type !== 'LineString') continue;
    const coords = feature.geometry.coordinates;
    if (coords.length < 2) continue;

    const sub = feature.properties?.subcategory || 'unclassified';
    const buffer = ROAD_BUFFER_PX[sub] || defaultBuffer;

    // Project coords to pixel space
    const projected = coords.map(([lon, lat]) => ({
      x: ((lon - bbox.minLon) / lonRange) * width,
      y: ((bbox.maxLat - lat) / latRange) * height
    }));

    // Draw thick line segments
    for (let i = 0; i < projected.length - 1; i++) {
      drawThickLine(pixels, width, height, projected[i], projected[i + 1], buffer);
    }
  }

  return pixels;
}

/**
 * Draw a thick line between two points using perpendicular offset fills.
 */
function drawThickLine(pixels, width, height, p0, p1, thickness) {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.5) return;

  // Step along the line
  const steps = Math.ceil(len);
  const halfT = thickness / 2;

  // Normal perpendicular to the line direction
  const nx = -dy / len;
  const ny = dx / len;

  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = p0.x + dx * t;
    const cy = p0.y + dy * t;

    // Fill perpendicular strip
    for (let d = -halfT; d <= halfT; d++) {
      const px = Math.round(cx + nx * d);
      const py = Math.round(cy + ny * d);
      if (px >= 0 && px < width && py >= 0 && py < height) {
        pixels[py * width + px] = 255;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// PNG encoding (minimal, zero-dependency)
// ---------------------------------------------------------------------------

/**
 * Encode grayscale pixel data as a PNG buffer.
 * @param {Uint8Array} pixels - Grayscale pixel data
 * @param {number} width
 * @param {number} height
 * @returns {Buffer} PNG file buffer
 */
export function encodePNG(pixels, width, height) {
  // Build raw scanlines with filter byte (0 = None)
  const rawData = Buffer.alloc(height * (1 + width));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width);
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      rawData[rowOffset + 1 + x] = pixels[y * width + x];
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // Assemble PNG
  const chunks = [];

  // Signature
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // Bit depth
  ihdr[9] = 0;   // Color type: grayscale
  ihdr[10] = 0;  // Compression
  ihdr[11] = 0;  // Filter
  ihdr[12] = 0;  // Interlace
  chunks.push(pngChunk('IHDR', ihdr));

  // IDAT
  chunks.push(pngChunk('IDAT', compressed));

  // IEND
  chunks.push(pngChunk('IEND', Buffer.alloc(0)));

  return Buffer.concat(chunks);
}

/**
 * Build a PNG chunk with length, type, data, and CRC.
 */
function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

/**
 * CRC-32 for PNG (ISO 3309 / ITU-T V.42).
 */
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
