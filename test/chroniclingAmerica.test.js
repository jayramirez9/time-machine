import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Mock fetch at the module level — intercept https.get
// ---------------------------------------------------------------------------

// We mock the chroniclingAmerica module's internal fetch by replacing
// the https module before importing. Instead, we test the public API
// by importing the module and mocking globalThis fetch or https.

import https from 'https';
import { EventEmitter } from 'events';

/**
 * Create a fake https response object.
 */
function createFakeResponse(statusCode, body, headers = {}) {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  res.headers = headers;
  res.pipe = (dest) => {
    dest.write(body);
    dest.end();
  };
  return res;
}

/**
 * Set up a mock for https.get that returns controlled responses.
 * @param {Function} handler - (url, callback) => void. Call callback(fakeResponse).
 * @returns {Function} restore function
 */
function mockHttpsGet(handler) {
  const original = https.get;
  https.get = (opts, callback) => {
    const url = typeof opts === 'string' ? opts :
      `https://${opts.hostname}${opts.path}`;
    const req = new EventEmitter();
    req.end = () => {};

    // Call handler async to simulate real behavior
    process.nextTick(() => handler(url, callback, req));

    return req;
  };
  return () => { https.get = original; };
}

// Import module under test
import {
  searchPages,
  searchNewspapers,
  getPageOCR,
  _resetRateLimit,
  _getLastRequestTime
} from '../lib/chroniclingAmerica.js';

import {
  researchNewspapers,
  researchCulture
} from '../lib/agents/culturalAgent.js';

// ---------------------------------------------------------------------------
// searchPages — result parsing
// ---------------------------------------------------------------------------

describe('Chronicling America — searchPages', () => {
  let restore;

  beforeEach(() => {
    _resetRateLimit();
  });

  afterEach(() => {
    if (restore) restore();
    restore = null;
  });

  it('parses search results correctly', async () => {
    const mockResponse = {
      items: [
        {
          title: 'The New York Times',
          date: '1884-07-04',
          ocr_eng: 'The oyster sellers lined up along Pearl Street...',
          url: '/lccn/sn83030213/1884-07-04/ed-1/seq-1/',
          title_normal: 'new york times.'
        },
        {
          title: 'The Evening Post',
          date: '1884-07-05',
          ocr_eng: 'Street vendors peddling their wares on Broadway...',
          url: '/lccn/sn83030384/1884-07-05/ed-1/seq-2/',
          title_normal: 'evening post.'
        }
      ]
    };

    restore = mockHttpsGet((url, callback) => {
      const res = createFakeResponse(200, JSON.stringify(mockResponse));
      callback(res);
      process.nextTick(() => {
        res.emit('data', JSON.stringify(mockResponse));
        res.emit('end');
      });
    });

    const results = await searchPages('oyster seller', { state: 'New York', year: 1884 });

    assert.equal(results.length, 2);
    assert.equal(results[0].date, '1884-07-04');
    assert.ok(results[0].text.includes('oyster'));
    assert.ok(results[0].url.includes('chroniclingamerica.loc.gov'));
    assert.equal(results[1].newspaper, 'evening post.');
  });

  it('returns empty array when no items', async () => {
    restore = mockHttpsGet((url, callback) => {
      const res = createFakeResponse(200, '');
      callback(res);
      process.nextTick(() => {
        res.emit('data', JSON.stringify({ items: [] }));
        res.emit('end');
      });
    });

    const results = await searchPages('nonexistent query', { year: 1750 });
    assert.equal(results.length, 0);
  });

  it('respects maxResults', async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      title: `Paper ${i}`,
      date: `1884-01-0${i + 1}`,
      ocr_eng: `Text ${i}`,
      url: `/page/${i}/`,
      title_normal: `paper ${i}`
    }));

    restore = mockHttpsGet((url, callback) => {
      const res = createFakeResponse(200, '');
      callback(res);
      process.nextTick(() => {
        res.emit('data', JSON.stringify({ items }));
        res.emit('end');
      });
    });

    const results = await searchPages('test', { maxResults: 3 });
    assert.equal(results.length, 3);
  });

  it('includes state in URL params when provided', async () => {
    let capturedUrl = '';
    restore = mockHttpsGet((url, callback) => {
      capturedUrl = url;
      const res = createFakeResponse(200, '');
      callback(res);
      process.nextTick(() => {
        res.emit('data', JSON.stringify({ items: [] }));
        res.emit('end');
      });
    });

    await searchPages('test', { state: 'New York', year: 1884 });
    assert.ok(capturedUrl.includes('state=New+York') || capturedUrl.includes('state=New%20York'),
      `URL should contain state param: ${capturedUrl}`);
    assert.ok(capturedUrl.includes('date1=1883'), `URL should contain date1: ${capturedUrl}`);
    assert.ok(capturedUrl.includes('date2=1885'), `URL should contain date2: ${capturedUrl}`);
  });
});

// ---------------------------------------------------------------------------
// searchNewspapers — title search
// ---------------------------------------------------------------------------

describe('Chronicling America — searchNewspapers', () => {
  let restore;

  beforeEach(() => {
    _resetRateLimit();
  });

  afterEach(() => {
    if (restore) restore();
    restore = null;
  });

  it('parses newspaper title results', async () => {
    const mockResponse = {
      items: [
        {
          title: 'The New York Herald',
          city: ['New York'],
          state: ['New York'],
          start_year: '1840',
          end_year: '1920',
          url: '/lccn/sn83030313/'
        }
      ]
    };

    restore = mockHttpsGet((url, callback) => {
      const res = createFakeResponse(200, '');
      callback(res);
      process.nextTick(() => {
        res.emit('data', JSON.stringify(mockResponse));
        res.emit('end');
      });
    });

    const results = await searchNewspapers('herald', { state: 'New York' });
    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'The New York Herald');
    assert.equal(results[0].startYear, 1840);
    assert.equal(results[0].endYear, 1920);
  });
});

// ---------------------------------------------------------------------------
// getPageOCR
// ---------------------------------------------------------------------------

describe('Chronicling America — getPageOCR', () => {
  let restore;

  beforeEach(() => {
    _resetRateLimit();
  });

  afterEach(() => {
    if (restore) restore();
    restore = null;
  });

  it('fetches OCR text for a page', async () => {
    const ocrText = 'Full page OCR content from 1884 newspaper...';

    restore = mockHttpsGet((url, callback) => {
      assert.ok(url.includes('ocr/'), `URL should end with ocr/: ${url}`);
      const res = createFakeResponse(200, '');
      callback(res);
      process.nextTick(() => {
        res.emit('data', ocrText);
        res.emit('end');
      });
    });

    const text = await getPageOCR('https://chroniclingamerica.loc.gov/lccn/sn83030213/1884-07-04/ed-1/seq-1/');
    assert.equal(text, ocrText);
  });

  it('appends ocr/ to URL without trailing slash', async () => {
    let capturedUrl = '';
    restore = mockHttpsGet((url, callback) => {
      capturedUrl = url;
      const res = createFakeResponse(200, '');
      callback(res);
      process.nextTick(() => {
        res.emit('data', 'text');
        res.emit('end');
      });
    });

    await getPageOCR('https://chroniclingamerica.loc.gov/lccn/sn83030213/1884-07-04/ed-1/seq-1');
    assert.ok(capturedUrl.includes('/ocr/'), `URL should contain /ocr/: ${capturedUrl}`);
  });
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe('Chronicling America — rate limiting', () => {
  let restore;

  afterEach(() => {
    if (restore) restore();
    restore = null;
    _resetRateLimit();
  });

  it('updates last request timestamp after a call', async () => {
    _resetRateLimit();
    const before = Date.now();

    restore = mockHttpsGet((url, callback) => {
      const res = createFakeResponse(200, '');
      callback(res);
      process.nextTick(() => {
        res.emit('data', JSON.stringify({ items: [] }));
        res.emit('end');
      });
    });

    await searchPages('test');

    const lastTime = _getLastRequestTime();
    assert.ok(lastTime >= before, `Last request time ${lastTime} should be >= ${before}`);
  });

  it('_resetRateLimit sets timestamp to 0', () => {
    _resetRateLimit();
    assert.equal(_getLastRequestTime(), 0);
  });
});

// ---------------------------------------------------------------------------
// Graceful fallback on error
// ---------------------------------------------------------------------------

describe('Chronicling America — graceful fallback', () => {
  let restore;

  beforeEach(() => {
    _resetRateLimit();
  });

  afterEach(() => {
    if (restore) restore();
    restore = null;
  });

  it('searchPages rejects on HTTP error', async () => {
    restore = mockHttpsGet((url, callback) => {
      const res = createFakeResponse(503, '');
      callback(res);
    });

    await assert.rejects(
      () => searchPages('test'),
      /HTTP 503/
    );
  });

  it('searchPages rejects on network error', async () => {
    restore = mockHttpsGet((url, callback, req) => {
      process.nextTick(() => req.emit('error', new Error('ECONNREFUSED')));
    });

    await assert.rejects(
      () => searchPages('test'),
      /ECONNREFUSED/
    );
  });
});

// ---------------------------------------------------------------------------
// researchNewspapers (culturalAgent integration)
// ---------------------------------------------------------------------------

describe('Cultural Agent — researchNewspapers', () => {
  let restore;

  beforeEach(() => {
    _resetRateLimit();
  });

  afterEach(() => {
    if (restore) restore();
    restore = null;
  });

  it('returns enrichment data from newspaper search', async () => {
    const mockResponse = {
      items: [
        {
          title: 'The Sun',
          date: '1884-06-15',
          ocr_eng: 'The oyster sellers were out in force along the Bowery yesterday',
          url: '/lccn/sn83030272/1884-06-15/ed-1/seq-3/',
          title_normal: 'the sun.'
        }
      ]
    };

    restore = mockHttpsGet((url, callback) => {
      const res = createFakeResponse(200, '');
      callback(res);
      process.nextTick(() => {
        res.emit('data', JSON.stringify(mockResponse));
        res.emit('end');
      });
    });

    const result = await researchNewspapers('New York, NY', 1884, {
      maxPatternsToSearch: 1,
      maxResultsPerPattern: 1
    });

    assert.ok(result.snippets.length > 0, 'should have snippets');
    assert.ok(result.sources.length > 0, 'should have sources');
    assert.ok(result.newspaperNames.length > 0, 'should have newspaper names');
    assert.ok(result.snippets[0].text.includes('oyster'));
    assert.equal(result.sources[0].type, 'newspaper_archive');
  });

  it('returns empty results when API is unreachable', async () => {
    restore = mockHttpsGet((url, callback, req) => {
      process.nextTick(() => req.emit('error', new Error('ECONNREFUSED')));
    });

    const result = await researchNewspapers('New York, NY', 1884, {
      maxPatternsToSearch: 1
    });

    assert.equal(result.snippets.length, 0);
    assert.equal(result.sources.length, 0);
    assert.equal(result.newspaperNames.length, 0);
  });

  it('extracts state name from location string', async () => {
    let capturedUrl = '';
    restore = mockHttpsGet((url, callback) => {
      capturedUrl = url;
      const res = createFakeResponse(200, '');
      callback(res);
      process.nextTick(() => {
        res.emit('data', JSON.stringify({ items: [] }));
        res.emit('end');
      });
    });

    await researchNewspapers('Baton Rouge, LA', 1884, {
      maxPatternsToSearch: 1
    });

    assert.ok(capturedUrl.includes('state=Louisiana') || capturedUrl.includes('state=Louisiana'),
      `URL should contain state=Louisiana: ${capturedUrl}`);
  });
});

// ---------------------------------------------------------------------------
// researchCulture — sync path unchanged (no enrichment)
// ---------------------------------------------------------------------------

describe('Cultural Agent — researchCulture without enrichment', () => {
  it('returns synchronously when enrichWithNewspapers=false', () => {
    const result = researchCulture({
      location: 'New York, NY',
      year: 1884,
      enrichWithNewspapers: false
    });

    // Should be a plain object, not a promise
    assert.ok(result.culture, 'should have culture layer');
    assert.ok(result.music, 'should have music layer');
    assert.ok(result.culture.data.eraKey === 'gilded_age');
  });

  it('defaults to no enrichment (backward compatible)', () => {
    const result = researchCulture({
      location: 'Test',
      year: 1884
    });

    assert.ok(result.culture);
    assert.ok(result.music);
  });
});

// ---------------------------------------------------------------------------
// researchCulture — async path with enrichment
// ---------------------------------------------------------------------------

describe('Cultural Agent — researchCulture with enrichment', () => {
  let restore;

  beforeEach(() => {
    _resetRateLimit();
  });

  afterEach(() => {
    if (restore) restore();
    restore = null;
  });

  it('returns a promise when enrichWithNewspapers=true', async () => {
    restore = mockHttpsGet((url, callback) => {
      const res = createFakeResponse(200, '');
      callback(res);
      process.nextTick(() => {
        res.emit('data', JSON.stringify({
          items: [{
            title: 'Test Paper',
            date: '1884-01-01',
            ocr_eng: 'Local vendors selling produce',
            url: '/page/1/',
            title_normal: 'test paper'
          }]
        }));
        res.emit('end');
      });
    });

    const result = await researchCulture({
      location: 'New York, NY',
      year: 1884,
      countryCode: 'US',
      enrichWithNewspapers: true
    });

    assert.ok(result.culture, 'should have culture layer');
    assert.ok(result.music, 'should have music layer');
    assert.ok(result.culture.data.eraKey === 'gilded_age');
    // Should have newspaper enrichment
    assert.ok(result.culture.sources.length > 1, 'should have more than just era source');
  });

  it('falls back gracefully when API fails during enrichment', async () => {
    restore = mockHttpsGet((url, callback, req) => {
      process.nextTick(() => req.emit('error', new Error('ECONNREFUSED')));
    });

    const result = await researchCulture({
      location: 'New York, NY',
      year: 1884,
      countryCode: 'US',
      enrichWithNewspapers: true
    });

    // Should still return valid layers
    assert.ok(result.culture, 'should have culture layer');
    assert.ok(result.music, 'should have music layer');
    assert.ok(result.culture.data.eraKey === 'gilded_age');
  });

  it('skips enrichment for non-US locations', () => {
    // Non-US should return synchronously (Chronicling America is US-only)
    const result = researchCulture({
      location: 'London, England',
      year: 1884,
      countryCode: 'GB',
      enrichWithNewspapers: true
    });

    // Should be a plain object, not a promise (no enrichment for non-US)
    assert.ok(result.culture);
    assert.ok(result.music);
  });
});
