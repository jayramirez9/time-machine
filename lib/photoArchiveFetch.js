/**
 * LOC Prints & Photographs API Client
 *
 * Fetches historical photographs from the Library of Congress Prints &
 * Photographs Online Catalog. Supports search, metadata extraction,
 * and IIIF-based image downloads.
 *
 * API: https://www.loc.gov/pictures/search/?fo=json
 * IIIF: https://tile.loc.gov/image-services/iiif/...
 *
 * Follows the pattern of lib/sanborn.js (LOC API client) and
 * lib/meshyClient.js (fetch-based downloads with pipeline()).
 */

import { existsSync, mkdirSync, createWriteStream, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';

// ─── Constants ──────────────────────────────────────────────────

const LOC_PICTURES_SEARCH = 'https://www.loc.gov/pictures/search/';
const IIIF_BASE = 'https://tile.loc.gov/image-services/iiif';
const RATE_LIMIT_MS = 500;
const USER_AGENT = 'TimeMachine/1.0 (historical-simulation)';
const DEFAULT_YEAR_RANGE = 5;
const DEFAULT_MAX_RESULTS = 20;
const DEFAULT_IIIF_SCALE = 50;
const MANIFEST_FILENAME = 'PHOTO_MANIFEST.json';

let lastRequestTime = 0;

// ─── Helpers ────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Rate-limited fetch wrapper. Enforces minimum delay between requests.
 * @param {string} url
 * @param {object} [fetchOpts]
 * @returns {Promise<Response>}
 */
async function rateLimitedFetch(url, fetchOpts = {}) {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await sleep(RATE_LIMIT_MS - elapsed);
  }
  lastRequestTime = Date.now();

  const opts = {
    ...fetchOpts,
    headers: {
      'Accept': 'application/json',
      'User-Agent': USER_AGENT,
      ...(fetchOpts.headers || {})
    }
  };
  return fetch(url, opts);
}

/**
 * Fetch JSON with rate limiting and error handling.
 * @param {string} url
 * @returns {Promise<object>}
 */
async function fetchJSON(url) {
  const res = await rateLimitedFetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  return res.json();
}

/**
 * Convert a CDN storage path to a IIIF service identifier.
 * CDN:  https://cdn.loc.gov/service/pnp/det/4a10000/4a17000/4a17500/4a17568r.jpg
 * Tile: https://tile.loc.gov/storage-services/service/pnp/det/4a10000/4a17000/4a17500/4a17568r.jpg
 * IIIF: service:pnp:det:4a10000:4a17000:4a17500:4a17568r
 *
 * Extracts the path after /service/ or /storage-services/service/, strips extension,
 * replaces slashes with colons.
 */
function extractIiifId(imageUrl) {
  if (!imageUrl) return null;

  // Match IIIF URL already in tile.loc.gov format
  const iiifMatch = imageUrl.match(/tile\.loc\.gov\/image-services\/iiif\/(service:[^/]+)/);
  if (iiifMatch) return iiifMatch[1];

  // Extract path from CDN or tile storage URL
  // Patterns: /service/pnp/... or /storage-services/service/pnp/...
  const pathMatch = imageUrl.match(/(?:storage-services\/)?(service\/pnp\/[^\s?]+)/);
  if (!pathMatch) return null;

  let servicePath = pathMatch[1];
  // Remove file extension (.jpg, .tif, etc.)
  servicePath = servicePath.replace(/\.[a-z0-9]+$/i, '');
  // Remove size suffixes like _150px, _75x75px
  servicePath = servicePath.replace(/_\d+(?:x\d+)?px$/, '');
  // Replace slashes with colons
  return servicePath.replace(/\//g, ':');
}

/**
 * Build a IIIF base URL from an identifier.
 */
function iiifBaseUrl(iiifId) {
  return `${IIIF_BASE}/${iiifId}`;
}

// ─── Search ─────────────────────────────────────────────────────

/**
 * Normalize a single search result from the LOC Pictures API.
 * @param {object} r - Raw result object
 * @returns {object} Normalized result
 */
function normalizeResult(r) {
  const links = r.links || {};
  const image = r.image || {};
  const subjects = Array.isArray(r.subjects) ? r.subjects : [];

  return {
    id: r.pk || null,
    title: r.title || '',
    date: r.created_published_date || '',
    thumbnailUrl: image.thumb || image.full || null,
    itemUrl: links.item || null,
    subjects
  };
}

/**
 * Search the LOC Prints & Photographs catalog.
 *
 * @param {string} query - Search terms
 * @param {object} [opts]
 * @param {number} [opts.year] - Target year (adds date filter +/- yearRange)
 * @param {number} [opts.yearRange=5] - Range around year for date filter
 * @param {number} [opts.maxResults=20] - Maximum results to return
 * @param {string} [opts.collection] - Collection code (e.g. 'det' for Detroit Publishing)
 * @returns {Promise<object[]>} Array of normalized results
 */
export async function searchPhotos(query, opts = {}) {
  const {
    year,
    yearRange = DEFAULT_YEAR_RANGE,
    maxResults = DEFAULT_MAX_RESULTS,
    collection
  } = opts;

  const allResults = [];
  let page = 1;
  const perPage = Math.min(maxResults, 50); // LOC max per page

  while (allResults.length < maxResults) {
    const params = new URLSearchParams({
      q: query,
      fo: 'json',
      c: String(perPage),
      sp: String(page)
    });

    if (year) {
      const start = year - yearRange;
      const end = year + yearRange;
      params.set('dates', `${start}/${end}`);
    }

    if (collection) {
      params.set('co', collection);
    }

    const url = `${LOC_PICTURES_SEARCH}?${params}`;
    const data = await fetchJSON(url);

    const results = data.results || [];
    if (results.length === 0) break;

    for (const r of results) {
      allResults.push(normalizeResult(r));
      if (allResults.length >= maxResults) break;
    }

    const pages = data.pages || {};
    if (!pages.next || page >= (pages.total || 1)) break;
    page++;
  }

  return allResults;
}

// ─── Item Metadata ──────────────────────────────────────────────

/**
 * Fetch detailed metadata for a single photo item.
 * Extracts IIIF base URL from resources or service image URLs.
 *
 * @param {string} itemUrl - LOC item URL (e.g. https://www.loc.gov/pictures/item/2016795435/)
 * @returns {Promise<object>} { title, date, iiifBase, itemUrl, subjects, callNumber }
 */
export async function fetchPhotoMetadata(itemUrl) {
  // Ensure JSON format
  const jsonUrl = itemUrl.endsWith('/')
    ? `${itemUrl}?fo=json`
    : `${itemUrl}/?fo=json`;

  const data = await fetchJSON(jsonUrl);

  const item = data.item || {};
  const resources = data.resources || [];

  // Try to find a IIIF-compatible image URL from resources
  let iiifBase = null;

  // Strategy 1: Check resource image URLs (medium, large, larger have resolution variants)
  for (const resource of resources) {
    // Prefer medium-resolution service image — it has the base path we need
    const candidates = [
      resource.medium,
      resource.large,
      resource.larger,
      resource.small,
      item.service_medium
    ].filter(Boolean);

    for (const url of candidates) {
      const iiifId = extractIiifId(url);
      if (iiifId) {
        iiifBase = iiifBaseUrl(iiifId);
        break;
      }
    }
    if (iiifBase) break;
  }

  // Strategy 2: Try item service URLs
  if (!iiifBase && item.service_medium) {
    const iiifId = extractIiifId(item.service_medium);
    if (iiifId) iiifBase = iiifBaseUrl(iiifId);
  }

  // Strategy 3: Look for IIIF pattern directly in any URL string
  if (!iiifBase) {
    const allUrls = JSON.stringify(data);
    const iiifMatch = allUrls.match(/tile\.loc\.gov\/image-services\/iiif\/service:[^/"\s]+/);
    if (iiifMatch) {
      iiifBase = `https://${iiifMatch[0]}`;
    }
  }

  // Extract subjects
  const rawSubjects = item.subjects || [];
  const subjects = rawSubjects.map(s =>
    typeof s === 'string' ? s : (s.title || '')
  ).filter(Boolean);

  return {
    title: item.title || '',
    date: item.created_published || item.date || '',
    iiifBase,
    itemUrl,
    subjects,
    callNumber: item.call_number || ''
  };
}

// ─── Download ───────────────────────────────────────────────────

/**
 * Download a photo via IIIF Image API.
 *
 * @param {string} iiifBase - IIIF service base URL
 * @param {string} outputPath - Local file path to write
 * @param {object} [opts]
 * @param {number} [opts.scale=50] - IIIF scale percentage (pct:N)
 * @returns {Promise<number>} Bytes downloaded
 */
export async function downloadPhoto(iiifBase, outputPath, opts = {}) {
  const scale = opts.scale || DEFAULT_IIIF_SCALE;
  const url = `${iiifBase}/full/pct:${scale}/0/default.jpg`;

  const res = await rateLimitedFetch(url, {
    headers: { 'Accept': 'image/jpeg' }
  });

  if (!res.ok) {
    throw new Error(`Download failed (${res.status}): ${url}`);
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  await pipeline(res.body, createWriteStream(outputPath));

  // Calculate bytes from content-length header or stat the file
  const contentLength = res.headers.get('content-length');
  if (contentLength) return parseInt(contentLength, 10);

  // Fallback: read file size
  const { statSync } = await import('node:fs');
  try {
    return statSync(outputPath).size;
  } catch {
    return 0;
  }
}

// ─── Search Query Builder ───────────────────────────────────────

/**
 * Build an effective LOC search query from location and year.
 * Strips state abbreviations, adds contextual terms for street-level photos.
 *
 * @param {string} location - Location name (e.g. "New York, NY" or "Baton Rouge, Louisiana")
 * @param {number} year - Target year
 * @returns {string} Search query string
 */
export function buildSearchQuery(location, year) {
  // Strip state abbreviations and common suffixes
  let cleaned = location
    .replace(/,?\s*[A-Z]{2}$/, '')          // ", NY" or " NY"
    .replace(/,?\s*(United States|USA?)$/i, '')
    .trim();

  // Add "street" for street-level context and the year/decade
  const decade = Math.floor(year / 10) * 10;
  const parts = [cleaned, 'street'];

  // Add decade for broader matching (LOC date metadata is often imprecise)
  if (year < 1900) {
    parts.push(`${decade}s`);
  }

  return parts.join(' ');
}

// ─── Manifest ───────────────────────────────────────────────────

/**
 * Load PHOTO_MANIFEST.json from a directory.
 *
 * @param {string} dir - Directory containing the manifest
 * @returns {object|null} Parsed manifest or null if not found
 */
export function loadPhotoManifest(dir) {
  const manifestPath = join(dir, MANIFEST_FILENAME);
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Write PHOTO_MANIFEST.json to a directory.
 *
 * @param {string} dir - Output directory
 * @param {object} manifest - Manifest data
 */
function writeManifest(dir, manifest) {
  const manifestPath = join(dir, MANIFEST_FILENAME);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

// ─── Orchestrator ───────────────────────────────────────────────

/**
 * Search for photos, fetch metadata, and download images.
 *
 * @param {string} query - Search query
 * @param {string} outputDir - Directory to save photos and manifest
 * @param {object} [opts]
 * @param {number} [opts.year] - Target year for date filtering
 * @param {number} [opts.maxPhotos=10] - Maximum photos to download
 * @param {number} [opts.scale] - IIIF scale percentage (default 50)
 * @param {boolean} [opts.dryRun=false] - If true, skip downloads
 * @param {boolean} [opts.force=false] - Re-download existing files
 * @param {string} [opts.collection] - LOC collection code
 * @param {Function} [opts.onProgress] - Progress callback (stage, message)
 * @returns {Promise<object>} Manifest with downloaded photos
 */
export async function searchAndDownload(query, outputDir, opts = {}) {
  const {
    year,
    maxPhotos = 10,
    scale,
    dryRun = false,
    force = false,
    collection,
    onProgress
  } = opts;

  const progress = onProgress || (() => {});

  // Step 1: Search
  progress('search', `Searching LOC Pictures: "${query}"`);
  const results = await searchPhotos(query, {
    year,
    maxResults: maxPhotos * 2, // fetch extra to account for items without IIIF
    collection
  });
  progress('search', `Found ${results.length} results`);

  if (results.length === 0) {
    return { query, year, photos: [], downloadedAt: new Date().toISOString() };
  }

  // Step 2: Fetch metadata and filter to items with IIIF URLs
  mkdirSync(outputDir, { recursive: true });
  const photos = [];
  let skippedNoIiif = 0;

  for (const result of results) {
    if (photos.length >= maxPhotos) break;
    if (!result.itemUrl) continue;

    progress('metadata', `Fetching metadata: ${result.title.slice(0, 60)}...`);

    let meta;
    try {
      meta = await fetchPhotoMetadata(result.itemUrl);
    } catch (err) {
      progress('warn', `Metadata fetch failed for ${result.id}: ${err.message}`);
      continue;
    }

    if (!meta.iiifBase) {
      skippedNoIiif++;
      continue;
    }

    // Build filename from ID
    const safeId = String(result.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safeId}.jpg`;
    const outputPath = join(outputDir, filename);

    // Check if already downloaded
    if (!force && existsSync(outputPath)) {
      progress('skip', `Already exists: ${filename}`);
      photos.push({
        id: result.id,
        title: meta.title,
        date: meta.date,
        filename,
        iiifBase: meta.iiifBase,
        itemUrl: result.itemUrl,
        subjects: meta.subjects,
        callNumber: meta.callNumber,
        downloaded: true,
        bytes: null
      });
      continue;
    }

    // Step 3: Download
    if (dryRun) {
      progress('dry-run', `Would download: ${filename}`);
      photos.push({
        id: result.id,
        title: meta.title,
        date: meta.date,
        filename,
        iiifBase: meta.iiifBase,
        itemUrl: result.itemUrl,
        subjects: meta.subjects,
        callNumber: meta.callNumber,
        downloaded: false,
        bytes: null
      });
      continue;
    }

    try {
      progress('download', `Downloading: ${filename}`);
      const bytes = await downloadPhoto(meta.iiifBase, outputPath, { scale });
      photos.push({
        id: result.id,
        title: meta.title,
        date: meta.date,
        filename,
        iiifBase: meta.iiifBase,
        itemUrl: result.itemUrl,
        subjects: meta.subjects,
        callNumber: meta.callNumber,
        downloaded: true,
        bytes
      });
      progress('download', `Downloaded ${filename} (${bytes} bytes)`);
    } catch (err) {
      progress('warn', `Download failed for ${result.id}: ${err.message}`);
    }
  }

  // Step 4: Write manifest
  const manifest = {
    query,
    year: year || null,
    collection: collection || null,
    downloadedAt: new Date().toISOString(),
    skippedNoIiif,
    photos
  };

  if (!dryRun) {
    writeManifest(outputDir, manifest);
    progress('done', `Wrote ${MANIFEST_FILENAME} with ${photos.length} photos`);
  }

  return manifest;
}

// ─── Test helpers ───────────────────────────────────────────────

/**
 * Reset the rate limiter timestamp. Used in tests.
 */
export function _resetRateLimit() {
  lastRequestTime = 0;
}

/**
 * Get the last request timestamp. Used in tests.
 * @returns {number}
 */
export function _getLastRequestTime() {
  return lastRequestTime;
}
