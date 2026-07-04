/**
 * Sanborn Map Ingestion — LOC API client + building footprint processing
 *
 * Fetches Sanborn fire insurance map metadata and sheet images from the
 * Library of Congress digital collection. Produces a sheet index and
 * seed template for building footprint tracing.
 *
 * LOC API: https://www.loc.gov/collections/sanborn-maps/?fo=json
 * IIIF images: https://tile.loc.gov/image-services/iiif/...
 */

import fs from 'fs';
import path from 'path';
import https from 'https';

// ─── Constants ──────────────────────────────────────────────────

const LOC_COLLECTION_URL = 'https://www.loc.gov/collections/sanborn-maps/';
const LOC_ITEM_BASE = 'https://www.loc.gov/item/';
const RATE_LIMIT_MS = 500;   // Delay between LOC API requests
// Socket inactivity timeout — LOC rate-limits by holding connections open
// without responding; without this, requests (and any caller, e.g.
// bootstrap-scene.js) hang forever. Same fix as lib/chroniclingAmerica.js.
const REQUEST_TIMEOUT_MS = 10000;
const DEFAULT_IIIF_SCALE = 25; // pct:25 — good balance of detail vs size

// Sanborn material legend (colors on original maps)
const MATERIAL_VOCAB = ['brick', 'wood', 'frame', 'iron', 'stone', 'adobe', 'concrete'];
const USE_VOCAB = ['residential', 'commercial', 'industrial', 'church', 'stable', 'warehouse',
  'theater', 'school', 'hotel', 'office', 'mixed', 'public', 'vacant'];
const CONFIDENCE_LEVELS = ['verified', 'estimated', 'inferred'];

// ─── HTTP helpers ───────────────────────────────────────────────

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const get = (reqUrl) => {
      const parsed = new URL(reqUrl);
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: { 'Accept': 'application/json', 'User-Agent': 'TimeMachine/1.0 (historical-simulation)' }
      };
      const req = https.get(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Destroy the superseded request so its armed inactivity timeout
          // can't fire mid-way through the follow-up request. Bare destroy()
          // emits 'close', not 'error', so the reject handler doesn't trip.
          req.destroy();
          get(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} from ${reqUrl}`));
          return;
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`JSON parse error from ${reqUrl}: ${e.message}`)); }
        });
      });
      req.on('error', reject);
      req.setTimeout(REQUEST_TIMEOUT_MS, () =>
        req.destroy(new Error(`Timeout after ${REQUEST_TIMEOUT_MS}ms: ${reqUrl}`)));
    };
    get(url);
  });
}

function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    const get = (reqUrl) => {
      const parsed = new URL(reqUrl);
      const req = https.get({ hostname: parsed.hostname, path: parsed.pathname + parsed.search,
        headers: { 'User-Agent': 'TimeMachine/1.0' }
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Destroy the superseded request so its armed inactivity timeout
          // can't fire mid-way through the follow-up request. Bare destroy()
          // emits 'close', not 'error', so the reject handler doesn't trip.
          req.destroy();
          get(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          try { fs.unlinkSync(outputPath); } catch { /* may not exist yet */ }
          reject(new Error(`HTTP ${res.statusCode} downloading ${reqUrl}`));
          return;
        }
        let bytes = 0;
        res.on('data', chunk => { bytes += chunk.length; });
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(bytes); });
      });
      req.on('error', (e) => {
        // Don't leave a truncated partial on disk (timeout path lands here too)
        file.close();
        try { fs.unlinkSync(outputPath); } catch { /* may not exist yet */ }
        reject(e);
      });
      // Inactivity timeout, not total-duration — a steadily-streaming large
      // sheet image won't be killed; a hung LOC connection will.
      req.setTimeout(REQUEST_TIMEOUT_MS, () =>
        req.destroy(new Error(`Timeout after ${REQUEST_TIMEOUT_MS}ms downloading ${reqUrl}`)));
    };
    get(url);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── LOC API ────────────────────────────────────────────────────

/**
 * Search the LOC Sanborn Maps collection.
 * @param {string} location - State or city name (e.g., "new york")
 * @param {{ start: number, end: number }} dateRange - Year range
 * @param {{ page?: number, perPage?: number, city?: string }} opts
 * @returns {Promise<{ results: object[], total: number, page: number, pages: number }>}
 */
export async function searchSanbornMaps(location, dateRange, opts = {}) {
  const { page = 1, perPage = 50, city = null } = opts;

  // Build facet filter — LOC uses pipe-separated facets
  // location_state + location_city gives precise results for major cities
  let facet = `location_state:${location.toLowerCase()}`;
  if (city) facet += `|location_city:${city.toLowerCase()}`;

  const params = new URLSearchParams({
    fo: 'json',
    fa: facet,
    dates: `${dateRange.start}/${dateRange.end}`,
    c: String(perPage),
    sp: String(page)
  });
  const url = `${LOC_COLLECTION_URL}?${params}`;
  const data = await fetchJSON(url);

  const results = (data.results || []).map(r => ({
    id: r.id,
    title: r.title || '',
    date: r.date || '',
    url: r.url || r.id,
    digitized: r.digitized || false,
    location: r.location || [],
    locationCity: r.location_city || [],
    locationCounty: r.location_county || [],
    locationState: r.location_state || [],
    description: Array.isArray(r.description) ? r.description.join(' ') : (r.description || ''),
    imageUrls: r.image_url || [],
    resources: r.resources || [],
    sheetCount: extractSheetCount(r.description)
  }));

  const total = data.pagination?.total || 0;
  const pages = data.pagination?.pages || 1;

  return { results, total, page, pages };
}

/**
 * Fetch detailed metadata for a single Sanborn item (volumes/sheets).
 * @param {string} itemUrl - LOC item URL (e.g., https://www.loc.gov/item/sanborn06116_006/)
 * @returns {Promise<{ title: string, date: string, sheets: object[] }>}
 */
export async function fetchSheetMetadata(itemUrl) {
  // Ensure JSON format
  const url = itemUrl.endsWith('/') ? `${itemUrl}?fo=json` : `${itemUrl}/?fo=json`;
  const data = await fetchJSON(url);

  const item = data.item || data;
  const title = item.title || '';
  const date = item.date || '';

  // Extract individual sheet image URLs from resources
  const sheets = [];
  const resources = data.resources || [];
  for (const resource of resources) {
    const files = resource.files || [];
    // files is an array of arrays — each inner array contains format variants for one page
    for (let pageIdx = 0; pageIdx < files.length; pageIdx++) {
      const variants = files[pageIdx];
      if (!Array.isArray(variants)) continue;

      // Find JPEG variant (IIIF service URL) — prefer pct:25 size
      const jpeg = variants.find(v => v.mimetype === 'image/jpeg' && v.url?.includes('pct:'));
      const jp2 = variants.find(v => v.mimetype === 'image/jp2');
      const gif = variants.find(v => v.mimetype === 'image/gif');

      // Build IIIF base URL from any available image URL
      let iiifBase = null;
      const anyImage = jpeg || jp2;
      if (anyImage?.url) {
        // Extract IIIF service identifier from URL
        // Pattern: .../service:gmd:...:SEGMENT_ID/full/pct:25/0/default.jpg
        const match = anyImage.url.match(/(https:\/\/tile\.loc\.gov\/image-services\/iiif\/service:[^/]+)/);
        if (match) iiifBase = match[1];
      }

      sheets.push({
        pageIndex: pageIdx,
        iiifBase,
        thumbnailUrl: gif?.url || null,
        width: jp2?.width || jpeg?.width || null,
        height: jp2?.height || jpeg?.height || null
      });
    }
  }

  return { title, date, sheets, itemUrl };
}

/**
 * Download a single sheet image at a given IIIF scale.
 * @param {string} iiifBase - IIIF service base URL
 * @param {string} outputPath - Local file path to write
 * @param {{ scale?: number }} opts
 * @returns {Promise<number>} bytes downloaded
 */
export async function downloadSheet(iiifBase, outputPath, opts = {}) {
  const scale = opts.scale || DEFAULT_IIIF_SCALE;
  const url = `${iiifBase}/full/pct:${scale}/0/default.jpg`;
  return downloadFile(url, outputPath);
}

/**
 * Search LOC and build a sheet index for a bounding box.
 * Fetches all pages of results, filters to digitized items, returns structured index.
 *
 * @param {string} location - Search location (state name)
 * @param {{ start: number, end: number }} dateRange
 * @param {{ maxResults?: number, city?: string }} opts
 * @returns {Promise<{ items: object[], totalSearchResults: number }>}
 */
export async function fetchSanbornIndex(location, dateRange, opts = {}) {
  const { maxResults = 200, city = null } = opts;
  const allItems = [];
  let page = 1;
  let total = 0;

  // Paginate through results
  while (true) {
    const result = await searchSanbornMaps(location, dateRange, { page, perPage: 50, city });
    total = result.total;

    for (const item of result.results) {
      if (item.digitized) allItems.push(item);
    }

    if (page >= result.pages || allItems.length >= maxResults) break;
    page++;
    await sleep(RATE_LIMIT_MS);
  }

  return { items: allItems.slice(0, maxResults), totalSearchResults: total };
}

// ─── Seed Template ──────────────────────────────────────────────

/**
 * Generate a blank GeoJSON template for manual building footprint tracing.
 * @param {{ minLat: number, maxLat: number, minLon: number, maxLon: number }} bbox
 * @param {number} targetYear
 * @param {object[]} sheetIndex - Sheet index entries for reference
 * @returns {object} GeoJSON FeatureCollection
 */
export function createSeedTemplate(bbox, targetYear, sheetIndex = []) {
  return {
    type: 'FeatureCollection',
    _meta: {
      purpose: 'Manual building footprint tracing from Sanborn fire insurance maps',
      targetYear,
      bbox,
      sheetCount: sheetIndex.length,
      createdAt: new Date().toISOString(),
      propertySchema: {
        category: 'Always "building"',
        stories: 'Number of stories (integer). Read from Sanborn map — bold number on building.',
        material: `Construction material: ${MATERIAL_VOCAB.join(' | ')}. On Sanborn maps: pink=brick, yellow=wood, blue=stone, gray=iron/steel.`,
        use: `Building use: ${USE_VOCAB.join(' | ')}. From Sanborn labels inside footprint.`,
        address: 'Street address if legible on map (optional)',
        sanborn_sheet: 'Sheet filename from sanborn/sheets/ directory (for provenance)',
        confidence: `Data confidence: ${CONFIDENCE_LEVELS.join(' | ')}`,
        source: 'Human-readable citation (e.g., "Sanborn 1885 Vol.4 Sheet 73")'
      },
      sanbornLegend: {
        colors: 'Pink/red = brick, Yellow = wood/frame, Blue = stone, Gray = iron/steel, Green = special',
        numbers: 'Bold number inside building = stories. "B" suffix = basement.',
        symbols: 'D = dwelling, S = store, Sal = saloon, Sta = stable, Whs = warehouse, Fdy = foundry',
        notes: 'Lot lines are thin black. Party walls are thick black. Fire walls are double lines.'
      }
    },
    features: []
  };
}

// ─── Footprint Validation ───────────────────────────────────────

/**
 * Validate a single building footprint feature.
 * @param {object} feature - GeoJSON Feature
 * @returns {{ valid: boolean, warnings: string[] }}
 */
export function validateFootprint(feature) {
  const warnings = [];

  if (feature.type !== 'Feature') warnings.push('type must be "Feature"');
  if (!feature.geometry) warnings.push('missing geometry');
  if (feature.geometry?.type !== 'Polygon') warnings.push('geometry type must be Polygon');
  if (!feature.geometry?.coordinates?.length) warnings.push('geometry has no coordinates');

  const p = feature.properties || {};
  if (p.category !== 'building') warnings.push('category should be "building"');
  if (typeof p.stories !== 'number' || p.stories < 1) warnings.push('stories must be a positive integer');
  if (p.material && !MATERIAL_VOCAB.includes(p.material)) warnings.push(`unknown material "${p.material}"`);
  if (p.use && !USE_VOCAB.includes(p.use)) warnings.push(`unknown use "${p.use}"`);
  if (p.confidence && !CONFIDENCE_LEVELS.includes(p.confidence)) warnings.push(`unknown confidence "${p.confidence}"`);

  // Check polygon closure
  if (feature.geometry?.coordinates?.[0]) {
    const ring = feature.geometry.coordinates[0];
    if (ring.length >= 3) {
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        warnings.push('polygon ring is not closed (first and last coordinate must match)');
      }
    } else {
      warnings.push('polygon ring must have at least 3 points');
    }
  }

  return { valid: warnings.length === 0, warnings };
}

/**
 * Load and validate a buildings GeoJSON file.
 * @param {string} geojsonPath
 * @returns {{ features: object[], valid: number, invalid: number, warnings: string[] }}
 */
export function loadBuildingFootprints(geojsonPath) {
  const raw = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
  const features = raw.features || [];
  const allWarnings = [];
  let valid = 0;
  let invalid = 0;

  for (let i = 0; i < features.length; i++) {
    const result = validateFootprint(features[i]);
    if (result.valid) {
      valid++;
    } else {
      invalid++;
      for (const w of result.warnings) {
        allWarnings.push(`feature[${i}]: ${w}`);
      }
    }
  }

  return { features, valid, invalid, warnings: allWarnings };
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Extract sheet count from LOC description string.
 * e.g., "1890 - 1902 Vol. 5, 1899. 41 sheet(s)." → 41
 */
function extractSheetCount(description) {
  const desc = Array.isArray(description) ? description.join(' ') : (description || '');
  const match = desc.match(/(\d+)\s+sheet/i);
  return match ? parseInt(match[1]) : 0;
}

/**
 * Generate a filename for a downloaded sheet image.
 * @param {string} itemId - LOC item ID (e.g., "sanborn06116_006")
 * @param {number} pageIndex - Page index within the item
 * @returns {string}
 */
export function sheetFilename(itemId, pageIndex) {
  const padded = String(pageIndex).padStart(3, '0');
  return `${itemId}_${padded}.jpg`;
}

/**
 * Extract the LOC item ID from a URL.
 * e.g., "https://www.loc.gov/item/sanborn06116_006/" → "sanborn06116_006"
 */
export function extractItemId(url) {
  const match = url.match(/\/item\/(sanborn\d+_\d+)/);
  return match ? match[1] : null;
}
