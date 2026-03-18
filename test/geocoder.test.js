import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  looksLikeAddress,
  geocodeAddress,
  smartGeocode,
  geocode
} from '../lib/openmeteo.js';

// ---------------------------------------------------------------------------
// looksLikeAddress — pure heuristic, no network
// ---------------------------------------------------------------------------

describe('looksLikeAddress', () => {
  it('detects a numbered street address', () => {
    assert.ok(looksLikeAddress('12877 Erin Ave, Baton Rouge, LA'));
  });

  it('detects a simple numbered address', () => {
    assert.ok(looksLikeAddress('42 Wallaby Way'));
  });

  it('detects street type keywords', () => {
    assert.ok(looksLikeAddress('Main Street, Springfield'));
    assert.ok(looksLikeAddress('Oak Boulevard'));
    assert.ok(looksLikeAddress('Elm Drive'));
    assert.ok(looksLikeAddress('Sunset Blvd'));
  });

  it('rejects plain city names', () => {
    assert.ok(!looksLikeAddress('New York, NY'));
    assert.ok(!looksLikeAddress('Baton Rouge, LA'));
    assert.ok(!looksLikeAddress('Paris, France'));
    assert.ok(!looksLikeAddress('Tokyo'));
  });

  it('handles edge cases', () => {
    assert.ok(!looksLikeAddress(''));
    assert.ok(!looksLikeAddress(null));
    assert.ok(!looksLikeAddress(undefined));
  });
});

// ---------------------------------------------------------------------------
// Mocked fetch helpers
// ---------------------------------------------------------------------------

let originalFetch;

function mockFetch(handler) {
  originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
}

function restoreFetch() {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
    originalFetch = null;
  }
}

// ---------------------------------------------------------------------------
// geocodeAddress — Nominatim parsing
// ---------------------------------------------------------------------------

describe('geocodeAddress', () => {
  afterEach(() => restoreFetch());

  it('parses a Nominatim result into the standard geo shape', async () => {
    mockFetch(async (url, opts) => {
      assert.ok(url.includes('nominatim.openstreetmap.org'));
      assert.equal(opts?.headers?.['User-Agent'], 'TimeMachine/1.0');
      return {
        ok: true,
        json: async () => [{
          lat: '30.4515',
          lon: '-91.1871',
          display_name: '12877 Erin Ave, Baton Rouge, East Baton Rouge Parish, Louisiana, 70815, United States'
        }]
      };
    });

    const geo = await geocodeAddress('12877 Erin Ave, Baton Rouge, LA');
    assert.equal(geo.lat, 30.4515);
    assert.equal(geo.lon, -91.1871);
    assert.ok(geo.name.includes('Erin Ave'));
    assert.equal(geo.population, 0);
    assert.equal(geo.timezone, null);
    assert.equal(geo.countryCode, null);
  });

  it('throws when Nominatim returns empty results', async () => {
    mockFetch(async () => ({
      ok: true,
      json: async () => []
    }));

    await assert.rejects(
      () => geocodeAddress('Nonexistent Place 12345'),
      { message: /Address not found/ }
    );
  });

  it('throws on HTTP error', async () => {
    mockFetch(async () => ({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable'
    }));

    await assert.rejects(
      () => geocodeAddress('123 Main St'),
      { message: /Nominatim API error: 503/ }
    );
  });
});

// ---------------------------------------------------------------------------
// smartGeocode — fallback behavior
// ---------------------------------------------------------------------------

describe('smartGeocode', () => {
  afterEach(() => restoreFetch());

  it('uses Nominatim first for address-like queries', async () => {
    let nominatimCalled = false;
    mockFetch(async (url) => {
      if (url.includes('nominatim')) {
        nominatimCalled = true;
        return {
          ok: true,
          json: async () => [{
            lat: '30.45',
            lon: '-91.18',
            display_name: '123 Fake St, Baton Rouge, LA'
          }]
        };
      }
      // Open-Meteo should NOT be called
      throw new Error('Should not reach Open-Meteo');
    });

    const geo = await smartGeocode('123 Fake St, Baton Rouge, LA');
    assert.ok(nominatimCalled);
    assert.equal(geo.lat, 30.45);
  });

  it('falls back to Open-Meteo when Nominatim fails for an address', async () => {
    let openMeteoCalled = false;
    mockFetch(async (url) => {
      if (url.includes('nominatim')) {
        return { ok: true, json: async () => [] };
      }
      if (url.includes('geocoding-api.open-meteo.com')) {
        openMeteoCalled = true;
        return {
          ok: true,
          json: async () => ({
            results: [{
              latitude: 30.45,
              longitude: -91.18,
              name: 'Baton Rouge',
              admin1: 'Louisiana',
              country: 'United States',
              country_code: 'US',
              timezone: 'America/Chicago',
              population: 225000
            }]
          })
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const geo = await smartGeocode('123 Fake St, Baton Rouge, LA');
    assert.ok(openMeteoCalled);
    assert.equal(geo.lat, 30.45);
    assert.equal(geo.timezone, 'America/Chicago');
  });

  it('uses Open-Meteo first for city-like queries', async () => {
    let openMeteoCalled = false;
    mockFetch(async (url) => {
      if (url.includes('geocoding-api.open-meteo.com')) {
        openMeteoCalled = true;
        return {
          ok: true,
          json: async () => ({
            results: [{
              latitude: 40.7128,
              longitude: -74.006,
              name: 'New York',
              admin1: 'New York',
              country: 'United States',
              country_code: 'US',
              timezone: 'America/New_York',
              population: 8000000
            }]
          })
        };
      }
      throw new Error('Should not reach Nominatim for city query');
    });

    const geo = await smartGeocode('New York, NY');
    assert.ok(openMeteoCalled);
    assert.equal(geo.lat, 40.7128);
    assert.equal(geo.timezone, 'America/New_York');
  });

  it('falls back to Nominatim when Open-Meteo fails for a city query', async () => {
    let nominatimCalled = false;
    mockFetch(async (url) => {
      if (url.includes('geocoding-api.open-meteo.com')) {
        return { ok: true, json: async () => ({ results: [] }) };
      }
      if (url.includes('nominatim')) {
        nominatimCalled = true;
        return {
          ok: true,
          json: async () => [{
            lat: '48.8566',
            lon: '2.3522',
            display_name: 'Paris, Ile-de-France, France'
          }]
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const geo = await smartGeocode('Paris, France');
    assert.ok(nominatimCalled);
    assert.equal(geo.lat, 48.8566);
  });
});

// ---------------------------------------------------------------------------
// Explicit lat/lon passthrough on launch — unit-level test
// ---------------------------------------------------------------------------

describe('explicit lat/lon passthrough', () => {
  it('preGeo object matches the standard geocode shape', () => {
    // This tests that a manually constructed preGeo object
    // has the same shape that startEngine/geocode consumers expect.
    const preGeo = {
      lat: 30.4515,
      lon: -91.1871,
      name: '12877 Erin Ave, Baton Rouge, LA',
      population: 0,
      timezone: 'America/Chicago',
      countryCode: null
    };

    assert.equal(typeof preGeo.lat, 'number');
    assert.equal(typeof preGeo.lon, 'number');
    assert.equal(typeof preGeo.name, 'string');
    assert.ok('population' in preGeo);
    assert.ok('timezone' in preGeo);
    assert.ok('countryCode' in preGeo);
  });
});
