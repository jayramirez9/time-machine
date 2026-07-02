/**
 * Chronicling America API Client
 *
 * Library of Congress Chronicling America — free, no API key required.
 * Full-text newspaper search back to the 1770s.
 *
 * API docs: https://chroniclingamerica.loc.gov/about/api/
 * Rate limit: self-imposed 1 req/sec to be respectful of the free service.
 */

import https from 'https';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://chroniclingamerica.loc.gov';
const RATE_LIMIT_MS = 1000; // 1 request per second
const REQUEST_TIMEOUT_MS = 10000; // socket timeout — LOC rate-limits by hanging connections
const USER_AGENT = 'TimeMachine/1.0 (historical-simulation)';
const DEFAULT_MAX_RESULTS = 20;

let lastRequestTime = 0;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Rate-limited fetch that enforces 1 req/sec.
 * @param {string} url
 * @returns {Promise<Object>} Parsed JSON
 */
async function fetchJSON(url) {
  // Enforce rate limit
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await sleep(RATE_LIMIT_MS - elapsed);
  }
  lastRequestTime = Date.now();

  return new Promise((resolve, reject) => {
    const get = (reqUrl) => {
      const parsed = new URL(reqUrl);
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: { 'Accept': 'application/json', 'User-Agent': USER_AGENT }
      };
      const req = https.get(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
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
      // LOC throttles by holding connections open without responding — without
      // a socket timeout the request (and any caller) hangs forever, so the
      // callers' graceful-fallback paths are never reached.
      req.setTimeout(REQUEST_TIMEOUT_MS, () =>
        req.destroy(new Error(`Timeout after ${REQUEST_TIMEOUT_MS}ms: ${reqUrl}`)));
    };
    get(url);
  });
}

/**
 * Fetch raw text content from a URL.
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchText(url) {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await sleep(RATE_LIMIT_MS - elapsed);
  }
  lastRequestTime = Date.now();

  return new Promise((resolve, reject) => {
    const get = (reqUrl) => {
      const parsed = new URL(reqUrl);
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: { 'Accept': 'text/plain', 'User-Agent': USER_AGENT }
      };
      const req = https.get(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          get(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} from ${reqUrl}`));
          return;
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.setTimeout(REQUEST_TIMEOUT_MS, () =>
        req.destroy(new Error(`Timeout after ${REQUEST_TIMEOUT_MS}ms: ${reqUrl}`)));
    };
    get(url);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search full-text newspaper pages via Chronicling America.
 *
 * @param {string} query - Search terms (e.g., "oyster seller" or "street vendor")
 * @param {Object} [opts]
 * @param {string} [opts.state] - US state name (e.g., "New York")
 * @param {number} [opts.year] - Target year. Searches year-1 to year+1 for coverage.
 * @param {number} [opts.maxResults=20] - Max results to return
 * @returns {Promise<Object[]>} Array of { title, date, text, url, newspaper }
 */
export async function searchPages(query, opts = {}) {
  const { state, year, maxResults = DEFAULT_MAX_RESULTS } = opts;

  const params = new URLSearchParams({
    andtext: query,
    format: 'json',
    rows: String(Math.min(maxResults, 50))
  });

  if (state) {
    params.set('state', state);
  }

  if (year) {
    params.set('dateFilterType', 'yearRange');
    params.set('date1', String(year - 1));
    params.set('date2', String(year + 1));
  }

  const url = `${BASE_URL}/search/pages/results/?${params}`;
  const data = await fetchJSON(url);

  const items = data.items || [];
  return items.slice(0, maxResults).map(item => ({
    title: item.title || '',
    date: item.date || '',
    text: item.ocr_eng || '',
    url: item.url ? `${BASE_URL}${item.url}` : '',
    newspaper: item.title_normal || item.title || ''
  }));
}

/**
 * Search newspaper titles (publications) available on Chronicling America.
 *
 * @param {string} query - Search terms
 * @param {Object} [opts]
 * @param {string} [opts.state] - US state name (e.g., "New York")
 * @returns {Promise<Object[]>} Array of { name, city, state, startYear, endYear, url }
 */
export async function searchNewspapers(query, opts = {}) {
  const { state } = opts;

  const params = new URLSearchParams({
    terms: query,
    format: 'json'
  });

  if (state) {
    params.set('state', state);
  }

  const url = `${BASE_URL}/search/titles/results/?${params}`;
  const data = await fetchJSON(url);

  const items = data.items || [];
  return items.map(item => ({
    name: item.title || '',
    city: item.city || [],
    state: item.state || [],
    startYear: item.start_year ? parseInt(item.start_year) : null,
    endYear: item.end_year ? parseInt(item.end_year) : null,
    url: item.url ? `${BASE_URL}${item.url}` : ''
  }));
}

/**
 * Fetch OCR text for a specific newspaper page.
 *
 * @param {string} pageUrl - Page URL from searchPages result (the `url` field).
 *                           Should end with something like /lccn/sn83030213/1884-07-04/ed-1/seq-1/
 * @returns {Promise<string>} Full OCR text of the page
 */
export async function getPageOCR(pageUrl) {
  // Chronicling America OCR endpoint: append "ocr/" to the page URL
  const ocrUrl = pageUrl.endsWith('/') ? `${pageUrl}ocr/` : `${pageUrl}/ocr/`;
  return fetchText(ocrUrl);
}

// ---------------------------------------------------------------------------
// Exports for testing — expose internal rate-limit timestamp for reset
// ---------------------------------------------------------------------------

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
