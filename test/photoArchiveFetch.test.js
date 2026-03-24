import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  searchPhotos,
  fetchPhotoMetadata,
  downloadPhoto,
  searchAndDownload,
  loadPhotoManifest,
  buildSearchQuery,
  findBestPhoto,
  _resetRateLimit,
  _getLastRequestTime
} from '../lib/photoArchiveFetch.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock LOC Pictures search response. */
function makeSearchResponse(results, pages = {}) {
  return { results, pages };
}

/** Build a single raw LOC search result. */
function makeRawResult(overrides = {}) {
  return {
    pk: 'pp012345',
    title: 'Broadway looking north from City Hall',
    created_published_date: 'c1884',
    image: {
      thumb: 'https://cdn.loc.gov/service/pnp/det/4a10000/4a17000/4a17500/4a17568r_150px.jpg',
      full: 'https://cdn.loc.gov/service/pnp/det/4a10000/4a17000/4a17500/4a17568r.jpg'
    },
    links: {
      item: 'https://www.loc.gov/pictures/item/2016795435/'
    },
    subjects: ['Streets', 'New York (N.Y.)'],
    ...overrides
  };
}

/** Build a mock LOC item detail response (for fetchPhotoMetadata). */
function makeItemResponse(overrides = {}) {
  const defaults = {
    item: {
      title: 'Broadway, north from Chambers Street',
      created_published: 'c1884',
      date: '1884',
      call_number: 'LC-D4-12345',
      subjects: [{ title: 'Streets' }, 'Architecture'],
      service_medium: 'https://tile.loc.gov/storage-services/service/pnp/det/4a10000/4a17000/4a17500/4a17568r.jpg'
    },
    resources: [
      {
        medium: 'https://cdn.loc.gov/service/pnp/det/4a10000/4a17000/4a17500/4a17568r.jpg',
        large: 'https://cdn.loc.gov/service/pnp/det/4a10000/4a17000/4a17500/4a17568v.jpg'
      }
    ]
  };
  return { ...defaults, ...overrides };
}

// ---------------------------------------------------------------------------
// searchPhotos
// ---------------------------------------------------------------------------

describe('photoArchiveFetch — searchPhotos', () => {
  let originalFetch;

  beforeEach(() => {
    _resetRateLimit();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('constructs URL with query, year, and collection params', async () => {
    let capturedUrl;
    globalThis.fetch = async (url) => {
      capturedUrl = url;
      return {
        ok: true,
        json: async () => makeSearchResponse([])
      };
    };

    await searchPhotos('broadway', { year: 1884, collection: 'det' });

    assert.ok(capturedUrl.includes('q=broadway'), `URL should contain q=broadway: ${capturedUrl}`);
    assert.ok(capturedUrl.includes('dates=1879%2F1889') || capturedUrl.includes('dates=1879/1889'),
      `URL should contain year range: ${capturedUrl}`);
    assert.ok(capturedUrl.includes('co=det'), `URL should contain collection: ${capturedUrl}`);
    assert.ok(capturedUrl.includes('fo=json'), `URL should request JSON: ${capturedUrl}`);
  });

  it('parses results into normalized objects', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => makeSearchResponse([makeRawResult()])
    });

    const results = await searchPhotos('broadway');

    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'pp012345');
    assert.equal(results[0].title, 'Broadway looking north from City Hall');
    assert.equal(results[0].date, 'c1884');
    assert.ok(results[0].thumbnailUrl.includes('4a17568r'));
    assert.ok(results[0].itemUrl.includes('loc.gov'));
    assert.deepEqual(results[0].subjects, ['Streets', 'New York (N.Y.)']);
  });

  it('returns empty array when no results', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => makeSearchResponse([])
    });

    const results = await searchPhotos('nonexistent query xyz');
    assert.deepEqual(results, []);
  });

  it('throws on HTTP error', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 503
    });

    await assert.rejects(
      () => searchPhotos('test'),
      /HTTP 503/
    );
  });

  it('respects maxResults limit', async () => {
    const manyResults = Array.from({ length: 15 }, (_, i) =>
      makeRawResult({ pk: `item_${i}`, title: `Photo ${i}` })
    );

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => makeSearchResponse(manyResults)
    });

    const results = await searchPhotos('broadway', { maxResults: 5 });
    assert.equal(results.length, 5);
  });

  it('omits date filter when year is not provided', async () => {
    let capturedUrl;
    globalThis.fetch = async (url) => {
      capturedUrl = url;
      return {
        ok: true,
        json: async () => makeSearchResponse([])
      };
    };

    await searchPhotos('broadway');
    assert.ok(!capturedUrl.includes('dates='), `URL should not contain dates param: ${capturedUrl}`);
  });

  it('handles results with missing fields gracefully', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => makeSearchResponse([{
        pk: null,
        title: undefined,
        image: {},
        links: {},
        subjects: 'not-an-array'
      }])
    });

    const results = await searchPhotos('test');
    assert.equal(results.length, 1);
    assert.equal(results[0].id, null);
    assert.equal(results[0].title, '');
    assert.equal(results[0].thumbnailUrl, null);
    assert.equal(results[0].itemUrl, null);
  });
});

// ---------------------------------------------------------------------------
// fetchPhotoMetadata
// ---------------------------------------------------------------------------

describe('photoArchiveFetch — fetchPhotoMetadata', () => {
  let originalFetch;

  beforeEach(() => {
    _resetRateLimit();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('extracts IIIF base URL from resource image URLs', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => makeItemResponse()
    });

    const meta = await fetchPhotoMetadata('https://www.loc.gov/pictures/item/2016795435/');

    assert.ok(meta.iiifBase, 'should have iiifBase');
    assert.ok(meta.iiifBase.includes('tile.loc.gov/image-services/iiif/service:pnp:det'),
      `iiifBase should be a IIIF URL: ${meta.iiifBase}`);
    assert.equal(meta.title, 'Broadway, north from Chambers Street');
    assert.equal(meta.date, 'c1884');
    assert.equal(meta.callNumber, 'LC-D4-12345');
    assert.ok(meta.subjects.includes('Streets'));
    assert.ok(meta.subjects.includes('Architecture'));
  });

  it('returns null iiifBase when no IIIF-compatible URLs exist', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        item: {
          title: 'Some photo',
          created_published: '1900',
          subjects: []
        },
        resources: [
          { medium: 'https://example.com/some-random-url.jpg' }
        ]
      })
    });

    const meta = await fetchPhotoMetadata('https://www.loc.gov/pictures/item/12345/');
    assert.equal(meta.iiifBase, null);
  });

  it('appends ?fo=json to item URL', async () => {
    let capturedUrl;
    globalThis.fetch = async (url) => {
      capturedUrl = url;
      return {
        ok: true,
        json: async () => makeItemResponse()
      };
    };

    await fetchPhotoMetadata('https://www.loc.gov/pictures/item/12345/');
    assert.ok(capturedUrl.includes('?fo=json'), `URL should have fo=json: ${capturedUrl}`);
  });

  it('handles item URL without trailing slash', async () => {
    let capturedUrl;
    globalThis.fetch = async (url) => {
      capturedUrl = url;
      return {
        ok: true,
        json: async () => makeItemResponse()
      };
    };

    await fetchPhotoMetadata('https://www.loc.gov/pictures/item/12345');
    assert.ok(capturedUrl.includes('/?fo=json'), `URL should have /?fo=json: ${capturedUrl}`);
  });

  it('throws on HTTP error', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 404
    });

    await assert.rejects(
      () => fetchPhotoMetadata('https://www.loc.gov/pictures/item/99999/'),
      /HTTP 404/
    );
  });

  it('extracts subjects from both string and object formats', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => makeItemResponse({
        item: {
          title: 'Test',
          subjects: ['Plain string', { title: 'Object subject' }, { noTitle: true }]
        },
        resources: []
      })
    });

    const meta = await fetchPhotoMetadata('https://www.loc.gov/pictures/item/12345/');
    assert.deepEqual(meta.subjects, ['Plain string', 'Object subject']);
  });

  it('finds IIIF URL via strategy 3 (JSON string match)', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        item: {
          title: 'Deep IIIF',
          subjects: [],
          nested: {
            someUrl: 'https://tile.loc.gov/image-services/iiif/service:pnp:cph:3b12345/full/pct:25/0/default.jpg'
          }
        },
        resources: []
      })
    });

    const meta = await fetchPhotoMetadata('https://www.loc.gov/pictures/item/12345/');
    assert.ok(meta.iiifBase, 'should find iiifBase via strategy 3');
    assert.ok(meta.iiifBase.includes('service:pnp:cph:3b12345'));
  });
});

// ---------------------------------------------------------------------------
// downloadPhoto
// ---------------------------------------------------------------------------

describe('photoArchiveFetch — downloadPhoto', () => {
  let originalFetch;

  beforeEach(() => {
    _resetRateLimit();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('constructs correct IIIF URL with scale parameter', async () => {
    let capturedUrl;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-dl-'));
    const outputPath = path.join(tmpDir, 'test.jpg');

    // Create a readable stream-like body
    const { Readable } = await import('node:stream');
    const body = Readable.from([Buffer.from('fake-jpeg-data')]);

    globalThis.fetch = async (url) => {
      capturedUrl = url;
      return {
        ok: true,
        body,
        headers: new Map([['content-length', '14']])
      };
    };

    await downloadPhoto(
      'https://tile.loc.gov/image-services/iiif/service:pnp:det:4a10000',
      outputPath,
      { scale: 75 }
    );

    assert.ok(capturedUrl.includes('/full/pct:75/0/default.jpg'),
      `URL should have scale 75: ${capturedUrl}`);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('uses default scale of 50 when not specified', async () => {
    let capturedUrl;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-dl-'));
    const outputPath = path.join(tmpDir, 'test.jpg');

    const { Readable } = await import('node:stream');
    const body = Readable.from([Buffer.from('fake')]);

    globalThis.fetch = async (url) => {
      capturedUrl = url;
      return {
        ok: true,
        body,
        headers: new Map([['content-length', '4']])
      };
    };

    await downloadPhoto(
      'https://tile.loc.gov/image-services/iiif/service:pnp:det:test',
      outputPath
    );

    assert.ok(capturedUrl.includes('/full/pct:50/0/default.jpg'),
      `URL should have default scale 50: ${capturedUrl}`);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('throws on HTTP error', async () => {
    globalThis.fetch = async () => ({
      ok: false,
      status: 403
    });

    await assert.rejects(
      () => downloadPhoto('https://tile.loc.gov/image-services/iiif/service:pnp:test', '/tmp/nope.jpg'),
      /Download failed.*403/
    );
  });
});

// ---------------------------------------------------------------------------
// searchAndDownload
// ---------------------------------------------------------------------------

describe('photoArchiveFetch — searchAndDownload', () => {
  let originalFetch;
  let tmpDir;

  beforeEach(() => {
    _resetRateLimit();
    originalFetch = globalThis.fetch;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-sad-'));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('dry run mode does not download or write manifest', async () => {
    let fetchCount = 0;

    globalThis.fetch = async (url) => {
      fetchCount++;
      // Search request
      if (url.includes('/pictures/search/')) {
        return {
          ok: true,
          json: async () => makeSearchResponse([makeRawResult()])
        };
      }
      // Metadata request
      if (url.includes('/pictures/item/') || url.includes('fo=json')) {
        return {
          ok: true,
          json: async () => makeItemResponse()
        };
      }
      // Should not reach download
      throw new Error('Unexpected download request in dry run');
    };

    const manifest = await searchAndDownload('broadway', tmpDir, {
      year: 1884,
      dryRun: true
    });

    assert.ok(manifest.photos.length > 0, 'should have photo entries');
    assert.equal(manifest.photos[0].downloaded, false, 'photos should not be marked downloaded');
    // Manifest file should not exist in dry run
    const manifestPath = path.join(tmpDir, 'PHOTO_MANIFEST.json');
    assert.ok(!fs.existsSync(manifestPath), 'should not write manifest in dry run');
  });

  it('writes PHOTO_MANIFEST.json on successful download', async () => {
    const { Readable } = await import('node:stream');

    globalThis.fetch = async (url) => {
      if (url.includes('/pictures/search/')) {
        return {
          ok: true,
          json: async () => makeSearchResponse([makeRawResult()])
        };
      }
      if (url.includes('fo=json')) {
        return {
          ok: true,
          json: async () => makeItemResponse()
        };
      }
      // Download request — return a fake image body
      return {
        ok: true,
        body: Readable.from([Buffer.from('fake-jpeg')]),
        headers: new Map([['content-length', '9']])
      };
    };

    const manifest = await searchAndDownload('broadway', tmpDir, {
      year: 1884,
      maxPhotos: 1
    });

    assert.ok(manifest.photos.length > 0);
    assert.equal(manifest.photos[0].downloaded, true);
    assert.equal(manifest.query, 'broadway');
    assert.equal(manifest.year, 1884);

    // Manifest file should exist
    const manifestPath = path.join(tmpDir, 'PHOTO_MANIFEST.json');
    assert.ok(fs.existsSync(manifestPath), 'PHOTO_MANIFEST.json should exist');
    const written = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(written.photos.length, manifest.photos.length);
  });

  it('skips items without IIIF URLs', async () => {
    let metadataCallCount = 0;

    globalThis.fetch = async (url) => {
      if (url.includes('/pictures/search/')) {
        return {
          ok: true,
          json: async () => makeSearchResponse([
            makeRawResult({ pk: 'has_iiif' }),
            makeRawResult({ pk: 'no_iiif' })
          ])
        };
      }
      if (url.includes('fo=json')) {
        metadataCallCount++;
        if (metadataCallCount === 1) {
          // First item: no IIIF
          return {
            ok: true,
            json: async () => ({
              item: { title: 'No IIIF', subjects: [] },
              resources: [{ medium: 'https://example.com/not-iiif.jpg' }]
            })
          };
        }
        // Second item: has IIIF
        return {
          ok: true,
          json: async () => makeItemResponse()
        };
      }
      // Download
      const { Readable } = await import('node:stream');
      return {
        ok: true,
        body: Readable.from([Buffer.from('img')]),
        headers: new Map([['content-length', '3']])
      };
    };

    const manifest = await searchAndDownload('test', tmpDir, { maxPhotos: 2 });
    assert.ok(manifest.skippedNoIiif >= 1, 'should report skipped items without IIIF');
  });

  it('returns empty photos array when search yields no results', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => makeSearchResponse([])
    });

    const manifest = await searchAndDownload('nonexistent', tmpDir);
    assert.deepEqual(manifest.photos, []);
  });

  it('invokes onProgress callback', async () => {
    const stages = [];

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => makeSearchResponse([])
    });

    await searchAndDownload('test', tmpDir, {
      onProgress: (stage, msg) => stages.push(stage)
    });

    assert.ok(stages.includes('search'), 'should report search stage');
  });
});

// ---------------------------------------------------------------------------
// loadPhotoManifest
// ---------------------------------------------------------------------------

describe('photoArchiveFetch — loadPhotoManifest', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-manifest-'));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('reads a valid manifest file', () => {
    const manifest = { query: 'broadway', year: 1884, photos: [{ id: 'abc' }] };
    fs.writeFileSync(path.join(tmpDir, 'PHOTO_MANIFEST.json'), JSON.stringify(manifest));

    const loaded = loadPhotoManifest(tmpDir);
    assert.deepEqual(loaded, manifest);
  });

  it('returns null for missing directory', () => {
    const result = loadPhotoManifest('/tmp/nonexistent-dir-' + Date.now());
    assert.equal(result, null);
  });

  it('returns null for directory without manifest', () => {
    const result = loadPhotoManifest(tmpDir);
    assert.equal(result, null);
  });

  it('returns null for invalid JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'PHOTO_MANIFEST.json'), 'not valid json{{{');
    const result = loadPhotoManifest(tmpDir);
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// buildSearchQuery
// ---------------------------------------------------------------------------

describe('photoArchiveFetch — buildSearchQuery', () => {
  it('strips two-letter state abbreviations', () => {
    const q = buildSearchQuery('New York, NY', 1884);
    assert.ok(!q.includes('NY'), `should strip state abbreviation: ${q}`);
    assert.ok(q.includes('New York'), `should keep city name: ${q}`);
  });

  it('strips full state/country names', () => {
    const q = buildSearchQuery('Baton Rouge, United States', 1978);
    assert.ok(!q.includes('United States'), `should strip "United States": ${q}`);
    assert.ok(q.includes('Baton Rouge'));
  });

  it('strips USA suffix', () => {
    const q = buildSearchQuery('Chicago, USA', 1920);
    assert.ok(!q.includes('USA'), `should strip "USA": ${q}`);
    assert.ok(q.includes('Chicago'));
  });

  it('adds street context term', () => {
    const q = buildSearchQuery('New York, NY', 1884);
    assert.ok(q.includes('street'), `should include "street": ${q}`);
  });

  it('adds decade for pre-1900 dates', () => {
    const q = buildSearchQuery('New York, NY', 1884);
    assert.ok(q.includes('1880s'), `should include decade: ${q}`);
  });

  it('does not add decade for 1900+ dates', () => {
    const q = buildSearchQuery('New York, NY', 1920);
    assert.ok(!q.includes('1920s'), `should not include decade for 1900+: ${q}`);
  });

  it('handles location with no state/country suffix', () => {
    const q = buildSearchQuery('Manhattan', 1884);
    assert.ok(q.includes('Manhattan'), `should keep plain location: ${q}`);
    assert.ok(q.includes('street'));
  });
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe('photoArchiveFetch — rate limiting', () => {
  let originalFetch;

  afterEach(() => {
    if (originalFetch) globalThis.fetch = originalFetch;
    _resetRateLimit();
  });

  it('_resetRateLimit sets timestamp to 0', () => {
    _resetRateLimit();
    assert.equal(_getLastRequestTime(), 0);
  });

  it('updates last request timestamp after a call', async () => {
    _resetRateLimit();
    originalFetch = globalThis.fetch;
    const before = Date.now();

    globalThis.fetch = async () => ({
      ok: true,
      json: async () => makeSearchResponse([])
    });

    await searchPhotos('test');

    const lastTime = _getLastRequestTime();
    assert.ok(lastTime >= before, `Last request time ${lastTime} should be >= ${before}`);
  });
});

// ---------------------------------------------------------------------------
// findBestPhoto
// ---------------------------------------------------------------------------

describe('photoArchiveFetch — findBestPhoto', () => {
  const makeManifest = (photos) => ({ query: 'test', year: 1884, photos });

  const broadwayPhoto = {
    id: 'p1',
    title: 'Broadway looking north from City Hall',
    date: 'c1884',
    filename: 'p1.jpg',
    subjects: ['Streets', 'New York (N.Y.)'],
    downloaded: true,
    bytes: 5000,
    itemUrl: 'https://www.loc.gov/pictures/item/p1/'
  };

  const wallStreetPhoto = {
    id: 'p2',
    title: 'Wall Street and buildings',
    date: 'c1885',
    filename: 'p2.jpg',
    subjects: ['Financial district', 'Architecture'],
    downloaded: true,
    bytes: 6000,
    itemUrl: 'https://www.loc.gov/pictures/item/p2/'
  };

  const notDownloaded = {
    id: 'p3',
    title: 'Some great photo',
    date: 'c1884',
    filename: 'p3.jpg',
    subjects: ['Broadway'],
    downloaded: false,
    bytes: null
  };

  it('returns null when manifest is null', () => {
    assert.equal(findBestPhoto(null, { address: '56 Broadway' }), null);
  });

  it('returns null when manifest has no photos', () => {
    assert.equal(findBestPhoto(makeManifest([]), { address: '56 Broadway' }), null);
  });

  it('returns null when no photos are downloaded', () => {
    assert.equal(findBestPhoto(makeManifest([notDownloaded]), { address: '56 Broadway' }), null);
  });

  it('matches photo by street name in title', () => {
    const manifest = makeManifest([broadwayPhoto, wallStreetPhoto]);
    const result = findBestPhoto(manifest, { address: '56 Broadway' });
    assert.equal(result.id, 'p1', 'should prefer Broadway photo for Broadway address');
  });

  it('matches photo by street name in subjects', () => {
    const photoWithSubject = {
      ...wallStreetPhoto,
      id: 'p4',
      title: 'A view of buildings',
      subjects: ['Broad Street', 'Financial district']
    };
    const manifest = makeManifest([photoWithSubject]);
    const result = findBestPhoto(manifest, { address: '56 Broad Street' });
    assert.equal(result.id, 'p4');
  });

  it('prefers street-matched photo over generic', () => {
    const manifest = makeManifest([wallStreetPhoto, broadwayPhoto]);
    const result = findBestPhoto(manifest, { address: '100 Wall Street' });
    assert.equal(result.id, 'p2', 'should prefer Wall Street photo for Wall Street address');
  });

  it('falls back to a downloaded photo when no street match', () => {
    const manifest = makeManifest([broadwayPhoto, wallStreetPhoto]);
    const result = findBestPhoto(manifest, { address: '42 Pine Street' });
    // No street match — should return some downloaded photo as generic era fallback
    assert.ok(result, 'should return a fallback photo');
    assert.ok(result.downloaded, 'fallback should be a downloaded photo');
  });

  it('returns null in strictMatch mode when no street match', () => {
    const manifest = makeManifest([broadwayPhoto]);
    const result = findBestPhoto(manifest, { address: '42 Pine Street' }, { strictMatch: true });
    assert.equal(result, null, 'strict mode should not return generic fallback');
  });

  it('returns null when building has no address', () => {
    const manifest = makeManifest([broadwayPhoto]);
    const result = findBestPhoto(manifest, { address: '' }, { strictMatch: true });
    assert.equal(result, null);
  });

  it('gives bonus score for architecture-related title terms', () => {
    const archPhoto = {
      ...broadwayPhoto,
      id: 'p5',
      title: 'Broadway building facade with storefronts',
    };
    const plainPhoto = {
      ...broadwayPhoto,
      id: 'p6',
      title: 'Broadway looking north',
    };
    const manifest = makeManifest([plainPhoto, archPhoto]);
    const result = findBestPhoto(manifest, { address: '56 Broadway' });
    assert.equal(result.id, 'p5', 'should prefer photo with architecture terms');
  });

  it('skips not-downloaded photos even if they match', () => {
    const manifest = makeManifest([notDownloaded, wallStreetPhoto]);
    const result = findBestPhoto(manifest, { address: '56 Broadway' });
    // notDownloaded mentions Broadway in subjects but is not downloaded
    assert.equal(result.id, 'p2', 'should skip not-downloaded and use fallback');
  });
});
