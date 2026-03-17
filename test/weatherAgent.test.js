import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  PROVIDERS,
  rankProviders,
  calculateConfidence,
  buildCompromises,
  researchWeather
} from '../lib/agents/weatherAgent.js';

// ---------------------------------------------------------------------------
// Helpers — save/restore env vars
// ---------------------------------------------------------------------------

let savedEnv;

function setEnv(vars) {
  savedEnv = {};
  for (const [key, val] of Object.entries(vars)) {
    savedEnv[key] = process.env[key];
    if (val === null || val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }
}

function restoreEnv() {
  if (!savedEnv) return;
  for (const [key, val] of Object.entries(savedEnv)) {
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }
  savedEnv = null;
}

// ---------------------------------------------------------------------------
// PROVIDERS metadata
// ---------------------------------------------------------------------------

describe('Weather Agent — PROVIDERS', () => {
  it('has 4 providers', () => {
    assert.equal(Object.keys(PROVIDERS).length, 4);
  });

  it('NOAA has daily resolution', () => {
    assert.equal(PROVIDERS.noaa.resolution, 1440);
    assert.equal(PROVIDERS.noaa.dataType, 'daily');
  });

  it('Open-Meteo has hourly resolution', () => {
    assert.equal(PROVIDERS.openmeteo.resolution, 60);
    assert.equal(PROVIDERS.openmeteo.dataType, 'hourly');
  });

  it('Visual Crossing has hourly resolution', () => {
    assert.equal(PROVIDERS.visualcrossing.resolution, 60);
  });

  it('Open-Meteo starts at 1940', () => {
    assert.equal(PROVIDERS.openmeteo.minYear, 1940);
  });

  it('Visual Crossing starts at 1970', () => {
    assert.equal(PROVIDERS.visualcrossing.minYear, 1970);
  });

  it('NOAA has no min year (goes back to 1800s)', () => {
    assert.equal(PROVIDERS.noaa.minYear, null);
  });
});

// ---------------------------------------------------------------------------
// rankProviders
// ---------------------------------------------------------------------------

describe('Weather Agent — rankProviders', () => {
  afterEach(() => restoreEnv());

  it('pre-1940 with NOAA key: NOAA first', () => {
    setEnv({ NOAA_API_TOKEN: 'test-token', VISUALCROSSING_API_KEY: undefined });
    const ranked = rankProviders(1884);
    assert.equal(ranked[0].provider.id, 'noaa');
  });

  it('pre-1940 without NOAA key: mock only', () => {
    setEnv({ NOAA_API_TOKEN: undefined, VISUALCROSSING_API_KEY: undefined });
    const ranked = rankProviders(1884);
    // Only mock should be available (no openmeteo before 1940)
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0].provider.id, 'mock');
  });

  it('1940-1969 with no keys: Open-Meteo first', () => {
    setEnv({ NOAA_API_TOKEN: undefined, VISUALCROSSING_API_KEY: undefined });
    const ranked = rankProviders(1955);
    assert.equal(ranked[0].provider.id, 'openmeteo');
  });

  it('1970+ with VC key: Visual Crossing first', () => {
    setEnv({ NOAA_API_TOKEN: undefined, VISUALCROSSING_API_KEY: 'test-key' });
    const ranked = rankProviders(1978);
    assert.equal(ranked[0].provider.id, 'visualcrossing');
  });

  it('1970+ with both keys: VC beats Open-Meteo', () => {
    setEnv({ NOAA_API_TOKEN: 'token', VISUALCROSSING_API_KEY: 'key' });
    const ranked = rankProviders(2020);
    assert.equal(ranked[0].provider.id, 'visualcrossing');
    // NOAA should be in the list but lower priority for post-1940
    const noaa = ranked.find(c => c.provider.id === 'noaa');
    assert.ok(noaa);
  });

  it('always includes mock as last resort', () => {
    setEnv({ NOAA_API_TOKEN: undefined, VISUALCROSSING_API_KEY: undefined });
    const ranked = rankProviders(2020);
    assert.equal(ranked[ranked.length - 1].provider.id, 'mock');
  });

  it('pre-1940 with NOAA key: Open-Meteo not included', () => {
    setEnv({ NOAA_API_TOKEN: 'token', VISUALCROSSING_API_KEY: undefined });
    const ranked = rankProviders(1884);
    const om = ranked.find(c => c.provider.id === 'openmeteo');
    assert.equal(om, undefined);
  });
});

// ---------------------------------------------------------------------------
// calculateConfidence
// ---------------------------------------------------------------------------

describe('Weather Agent — calculateConfidence', () => {
  it('hourly providers get higher base confidence than daily', () => {
    const hourly = calculateConfidence(PROVIDERS.openmeteo, 2020, null);
    const daily = calculateConfidence(PROVIDERS.noaa, 2020, null);
    assert.ok(hourly > daily, `Hourly ${hourly} should be > daily ${daily}`);
  });

  it('NOAA confidence degrades for older years', () => {
    const c1920 = calculateConfidence(PROVIDERS.noaa, 1920, null);
    const c1870 = calculateConfidence(PROVIDERS.noaa, 1870, null);
    const c1820 = calculateConfidence(PROVIDERS.noaa, 1820, null);
    assert.ok(c1920 > c1870, `1920 (${c1920}) > 1870 (${c1870})`);
    assert.ok(c1870 > c1820, `1870 (${c1870}) > 1820 (${c1820})`);
  });

  it('distant station reduces confidence', () => {
    const nearby = calculateConfidence(PROVIDERS.noaa, 1920, { distance: 5, coversYear: true });
    const far = calculateConfidence(PROVIDERS.noaa, 1920, { distance: 60, coversYear: true });
    assert.ok(nearby > far, `Nearby ${nearby} > far ${far}`);
  });

  it('partial coverage reduces confidence', () => {
    const full = calculateConfidence(PROVIDERS.noaa, 1920, { distance: 5, coversYear: true });
    const partial = calculateConfidence(PROVIDERS.noaa, 1920, { distance: 5, coversYear: false, partialCoverage: true });
    assert.ok(full > partial, `Full ${full} > partial ${partial}`);
  });

  it('no coverage severely reduces confidence', () => {
    const partial = calculateConfidence(PROVIDERS.noaa, 1920, { distance: 5, coversYear: false, partialCoverage: true });
    const none = calculateConfidence(PROVIDERS.noaa, 1920, { distance: 5, coversYear: false, partialCoverage: false });
    assert.ok(partial > none, `Partial ${partial} > none ${none}`);
  });

  it('mock provider has very low confidence', () => {
    const conf = calculateConfidence(PROVIDERS.mock, 2020, null);
    assert.equal(conf, 0.1);
  });

  it('all confidence values are 0-1', () => {
    for (const provider of Object.values(PROVIDERS)) {
      for (const year of [1800, 1884, 1940, 1978, 2020]) {
        const conf = calculateConfidence(provider, year, null);
        assert.ok(conf >= 0 && conf <= 1, `${provider.id}/${year}: ${conf}`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// buildCompromises
// ---------------------------------------------------------------------------

describe('Weather Agent — buildCompromises', () => {
  it('NOAA always mentions synthetic sub-daily', () => {
    const compromises = buildCompromises(PROVIDERS.noaa, 1920, null);
    assert.ok(compromises.some(c => c.includes('Sub-daily')));
  });

  it('NOAA pre-1900 mentions instrumentation', () => {
    const compromises = buildCompromises(PROVIDERS.noaa, 1884, null);
    assert.ok(compromises.some(c => c.includes('instrumentation') || c.includes('Pre-1900')));
  });

  it('NOAA distant station mentions microclimate', () => {
    const station = { distance: 15, distanceLabel: '~15km', coversYear: true };
    const compromises = buildCompromises(PROVIDERS.noaa, 1920, station);
    assert.ok(compromises.some(c => c.includes('microclimate') || c.includes('15km')));
  });

  it('NOAA nearby station does not mention microclimate', () => {
    const station = { distance: 3, distanceLabel: '~3km', coversYear: true };
    const compromises = buildCompromises(PROVIDERS.noaa, 1920, station);
    assert.ok(!compromises.some(c => c.includes('microclimate')));
  });

  it('Open-Meteo pre-1950 mentions ERA5 quality', () => {
    const compromises = buildCompromises(PROVIDERS.openmeteo, 1945, null);
    assert.ok(compromises.some(c => c.includes('ERA5') || c.includes('1950')));
  });

  it('Open-Meteo 2020 has no compromises', () => {
    const compromises = buildCompromises(PROVIDERS.openmeteo, 2020, null);
    assert.equal(compromises.length, 0);
  });

  it('mock always mentions synthetic', () => {
    const compromises = buildCompromises(PROVIDERS.mock, 2020, null);
    assert.ok(compromises.some(c => c.includes('Synthetic') || c.includes('synthetic')));
  });
});

// ---------------------------------------------------------------------------
// researchWeather — offline (no network calls)
// ---------------------------------------------------------------------------

describe('Weather Agent — researchWeather (offline)', () => {
  afterEach(() => restoreEnv());

  it('returns valid layer envelope', async () => {
    setEnv({ NOAA_API_TOKEN: undefined, VISUALCROSSING_API_KEY: undefined });
    const layer = await researchWeather({
      location: 'Test',
      year: 2020,
      geo: { lat: 40.7, lon: -74.0, name: 'Test', timezone: 'America/New_York' },
      probeStation: false
    });

    assert.ok(layer.data);
    assert.ok(typeof layer.confidence === 'number');
    assert.ok(Array.isArray(layer.sources));
    assert.ok(Array.isArray(layer.knownCompromises));
  });

  it('selects Open-Meteo when no keys set for 2020', async () => {
    setEnv({ NOAA_API_TOKEN: undefined, VISUALCROSSING_API_KEY: undefined });
    const layer = await researchWeather({
      location: 'Test',
      year: 2020,
      geo: { lat: 40.7, lon: -74.0, name: 'Test', timezone: 'UTC' },
      probeStation: false
    });

    assert.equal(layer.data.provider, 'openmeteo');
    assert.equal(layer.data.dataType, 'hourly');
    assert.ok(layer.confidence > 0.7);
  });

  it('selects mock for pre-1940 without NOAA key', async () => {
    setEnv({ NOAA_API_TOKEN: undefined, VISUALCROSSING_API_KEY: undefined });
    const layer = await researchWeather({
      location: 'Test',
      year: 1884,
      geo: { lat: 40.7, lon: -74.0, name: 'Test', timezone: 'UTC' },
      probeStation: false
    });

    assert.equal(layer.data.provider, 'mock');
    assert.ok(layer.confidence < 0.2);
  });

  it('selects Visual Crossing for 1978 when key is set', async () => {
    setEnv({ NOAA_API_TOKEN: undefined, VISUALCROSSING_API_KEY: 'test-key' });
    const layer = await researchWeather({
      location: 'Test',
      year: 1978,
      geo: { lat: 40.7, lon: -74.0, name: 'Test', timezone: 'UTC' },
      probeStation: false
    });

    assert.equal(layer.data.provider, 'visualcrossing');
    assert.ok(layer.confidence > 0.7);
  });

  it('includes availability report in data', async () => {
    setEnv({ NOAA_API_TOKEN: undefined, VISUALCROSSING_API_KEY: 'key' });
    const layer = await researchWeather({
      location: 'Test',
      year: 2020,
      geo: { lat: 40.7, lon: -74.0, name: 'Test', timezone: 'UTC' },
      probeStation: false
    });

    const report = layer.data._availabilityReport;
    assert.ok(report);
    assert.ok(report.candidatesEvaluated >= 2);
    assert.ok(report.selectedProvider);
    assert.ok(report.selectedReason);
    assert.ok(Array.isArray(report.alternativeProviders));
  });

  it('includes date range in data', async () => {
    setEnv({ NOAA_API_TOKEN: undefined, VISUALCROSSING_API_KEY: undefined });
    const layer = await researchWeather({
      location: 'Test',
      year: 1955,
      geo: { lat: 40.7, lon: -74.0, name: 'Test', timezone: 'UTC' },
      probeStation: false
    });

    assert.deepEqual(layer.data.dateRange, ['1955-01-01', '1955-12-31']);
  });

  it('includes fallback provider', async () => {
    setEnv({ NOAA_API_TOKEN: 'token', VISUALCROSSING_API_KEY: undefined });
    const layer = await researchWeather({
      location: 'Test',
      year: 1955,
      geo: { lat: 40.7, lon: -74.0, name: 'Test', timezone: 'UTC' },
      probeStation: false
    });

    // NOAA for 1955 has lower priority than Open-Meteo, so OM is primary
    // but NOAA should be in the mix as an alternative
    assert.ok(layer.data.fallbackProvider);
  });

  it('NOAA selected for 1884 with key, probeStation=false', async () => {
    setEnv({ NOAA_API_TOKEN: 'token', VISUALCROSSING_API_KEY: undefined });
    const layer = await researchWeather({
      location: 'Test',
      year: 1884,
      geo: { lat: 40.7, lon: -74.0, name: 'Test', timezone: 'UTC' },
      probeStation: false
    });

    assert.equal(layer.data.provider, 'noaa');
    assert.equal(layer.data.dataType, 'daily');
    assert.equal(layer.data.interpolation, 'solar_position');
  });

  it('source has citation', async () => {
    setEnv({ NOAA_API_TOKEN: undefined, VISUALCROSSING_API_KEY: undefined });
    const layer = await researchWeather({
      location: 'Test',
      year: 2020,
      geo: { lat: 40.7, lon: -74.0, name: 'Test', timezone: 'UTC' },
      probeStation: false
    });

    assert.ok(layer.sources.length > 0);
    assert.ok(layer.sources[0].id);
    assert.ok(layer.sources[0].type);
    assert.ok(layer.sources[0].citation);
  });

  it('provider config includes env var reference for keyed providers', async () => {
    setEnv({ NOAA_API_TOKEN: 'token', VISUALCROSSING_API_KEY: undefined });
    const layer = await researchWeather({
      location: 'Test',
      year: 1884,
      geo: { lat: 40.7, lon: -74.0, name: 'Test', timezone: 'UTC' },
      probeStation: false
    });

    assert.equal(layer.data.providerConfig.token, 'env:NOAA_API_TOKEN');
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('Weather Agent — edge cases', () => {
  afterEach(() => restoreEnv());

  it('1940 boundary — Open-Meteo available', () => {
    setEnv({ NOAA_API_TOKEN: undefined, VISUALCROSSING_API_KEY: undefined });
    const ranked = rankProviders(1940);
    assert.ok(ranked.some(c => c.provider.id === 'openmeteo'));
  });

  it('1939 boundary — Open-Meteo NOT available', () => {
    setEnv({ NOAA_API_TOKEN: undefined, VISUALCROSSING_API_KEY: undefined });
    const ranked = rankProviders(1939);
    assert.ok(!ranked.some(c => c.provider.id === 'openmeteo'));
  });

  it('1970 boundary — VC available', () => {
    setEnv({ NOAA_API_TOKEN: undefined, VISUALCROSSING_API_KEY: 'key' });
    const ranked = rankProviders(1970);
    assert.ok(ranked.some(c => c.provider.id === 'visualcrossing'));
  });

  it('1969 boundary — VC NOT available', () => {
    setEnv({ NOAA_API_TOKEN: undefined, VISUALCROSSING_API_KEY: 'key' });
    const ranked = rankProviders(1969);
    assert.ok(!ranked.some(c => c.provider.id === 'visualcrossing'));
  });

  it('very old date (1800) with NOAA key', async () => {
    setEnv({ NOAA_API_TOKEN: 'token', VISUALCROSSING_API_KEY: undefined });
    const layer = await researchWeather({
      location: 'Test',
      year: 1800,
      geo: { lat: 40.7, lon: -74.0, name: 'Test', timezone: 'UTC' },
      probeStation: false
    });

    assert.equal(layer.data.provider, 'noaa');
    // Confidence should be lower for 1800 than 1920
    assert.ok(layer.confidence < 0.6);
  });

  it('future date uses Open-Meteo or VC', async () => {
    setEnv({ NOAA_API_TOKEN: undefined, VISUALCROSSING_API_KEY: undefined });
    const layer = await researchWeather({
      location: 'Test',
      year: 2030,
      geo: { lat: 40.7, lon: -74.0, name: 'Test', timezone: 'UTC' },
      probeStation: false
    });

    // Should still pick Open-Meteo (or mock for far future)
    assert.ok(['openmeteo', 'mock'].includes(layer.data.provider));
  });
});
