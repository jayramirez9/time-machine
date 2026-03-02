import { describe, it } from 'node:test';
import assert from 'node:assert';
import { _synthesizeHourly, _estimateSunriseHour } from '../lib/noaa.js';

// ─── Diurnal Temperature Model ───────────────────────────────────

describe('NOAA Provider — Diurnal Temperature Model', () => {
  // A clear summer day: TMIN=18°C, TMAX=32°C
  const daily = { TMIN: 18, TMAX: 32, PRCP: 0 };
  const lat = 40.78;  // NYC latitude
  const date = new Date('1884-06-15T15:00:00Z');
  const tz = 'America/New_York';

  it('temperature near sunrise approximates TMIN', () => {
    const sunrise = _estimateSunriseHour(date, lat);
    const synth = _synthesizeHourly(daily, Math.round(sunrise), lat, date, tz);
    // Should be close to TMIN (within 2°C)
    assert.ok(Math.abs(synth.temp - daily.TMIN) < 2,
      `At sunrise (h=${Math.round(sunrise)}), temp ${synth.temp.toFixed(1)} should be near TMIN ${daily.TMIN}`);
  });

  it('temperature at peak (~14:00) approximates TMAX', () => {
    const synth = _synthesizeHourly(daily, 14, lat, date, tz);
    // Should be close to TMAX (within 2°C)
    assert.ok(Math.abs(synth.temp - daily.TMAX) < 2,
      `At 14:00, temp ${synth.temp.toFixed(1)} should be near TMAX ${daily.TMAX}`);
  });

  it('temperature curve is monotonically rising from sunrise to peak', () => {
    const sunrise = _estimateSunriseHour(date, lat);
    const peakHour = Math.floor(sunrise + 9); // tmaxHour floored to integer
    let prev = -Infinity;
    for (let h = Math.ceil(sunrise); h <= peakHour; h++) {
      const synth = _synthesizeHourly(daily, h, lat, date, tz);
      assert.ok(synth.temp >= prev,
        `Temperature should rise from h=${h - 1} to h=${h}: ${prev.toFixed(1)} → ${synth.temp.toFixed(1)}`);
      prev = synth.temp;
    }
  });

  it('temperature falls after peak through evening', () => {
    const peak = _synthesizeHourly(daily, 14, lat, date, tz);
    const evening = _synthesizeHourly(daily, 22, lat, date, tz);
    assert.ok(evening.temp < peak.temp,
      `Evening ${evening.temp.toFixed(1)} should be cooler than peak ${peak.temp.toFixed(1)}`);
  });

  it('temperature stays within TMIN-TMAX bounds', () => {
    for (let h = 0; h < 24; h++) {
      const synth = _synthesizeHourly(daily, h, lat, date, tz);
      assert.ok(synth.temp >= daily.TMIN - 1 && synth.temp <= daily.TMAX + 1,
        `Hour ${h}: temp ${synth.temp.toFixed(1)} should be within TMIN-TMAX ± 1°C`);
    }
  });
});

// ─── Humidity Model ──────────────────────────────────────────────

describe('NOAA Provider — Humidity Model', () => {
  const daily = { TMIN: 18, TMAX: 32, PRCP: 0 };
  const lat = 40.78;
  const date = new Date('1884-06-15T15:00:00Z');
  const tz = 'America/New_York';

  it('humidity is higher in the cool morning than hot afternoon', () => {
    const morning = _synthesizeHourly(daily, 6, lat, date, tz);
    const afternoon = _synthesizeHourly(daily, 14, lat, date, tz);
    assert.ok(morning.humidity > afternoon.humidity,
      `Morning humidity ${morning.humidity}% should exceed afternoon ${afternoon.humidity}%`);
  });

  it('humidity is between 40 and 90', () => {
    for (let h = 0; h < 24; h++) {
      const synth = _synthesizeHourly(daily, h, lat, date, tz);
      assert.ok(synth.humidity >= 40 && synth.humidity <= 90,
        `Hour ${h}: humidity ${synth.humidity}% should be 40-90%`);
    }
  });
});

// ─── Cloud Cover Inference ───────────────────────────────────────

describe('NOAA Provider — Cloud Cover Inference', () => {
  const lat = 40.78;
  const date = new Date('1884-06-15T15:00:00Z');
  const tz = 'America/New_York';

  it('large temp range → clear skies', () => {
    const synth = _synthesizeHourly({ TMIN: 10, TMAX: 30, PRCP: 0 }, 12, lat, date, tz);
    assert.ok(synth.cloudCover <= 30, `20°C range → clear, got ${synth.cloudCover}%`);
  });

  it('small temp range → overcast', () => {
    const synth = _synthesizeHourly({ TMIN: 15, TMAX: 18, PRCP: 5 }, 12, lat, date, tz);
    assert.ok(synth.cloudCover >= 80, `3°C range → overcast, got ${synth.cloudCover}%`);
  });

  it('moderate temp range → partly cloudy', () => {
    const synth = _synthesizeHourly({ TMIN: 15, TMAX: 23, PRCP: 0 }, 12, lat, date, tz);
    assert.ok(synth.cloudCover >= 20 && synth.cloudCover <= 70,
      `8°C range → partly cloudy, got ${synth.cloudCover}%`);
  });
});

// ─── Precipitation Distribution ──────────────────────────────────

describe('NOAA Provider — Precipitation Distribution', () => {
  const lat = 40.78;
  const date = new Date('1884-06-15T15:00:00Z');
  const tz = 'America/New_York';

  it('no precip when daily total is 0', () => {
    const synth = _synthesizeHourly({ TMIN: 18, TMAX: 32, PRCP: 0 }, 15, lat, date, tz);
    assert.strictEqual(synth.precipIntensity, 0);
    assert.strictEqual(synth.precipType, null);
  });

  it('convective precip concentrated in afternoon for large temp range', () => {
    const daily = { TMIN: 18, TMAX: 32, PRCP: 12 }; // 12mm, 14°C range
    const morning = _synthesizeHourly(daily, 10, lat, date, tz);
    const afternoon = _synthesizeHourly(daily, 16, lat, date, tz);
    assert.strictEqual(morning.precipIntensity, 0, 'No rain in morning for convective');
    assert.ok(afternoon.precipIntensity > 0, 'Rain in afternoon for convective');
  });

  it('overcast precip spread across day for small temp range', () => {
    const daily = { TMIN: 15, TMAX: 18, PRCP: 12 }; // 12mm, 3°C range
    const morning = _synthesizeHourly(daily, 10, lat, date, tz);
    const afternoon = _synthesizeHourly(daily, 16, lat, date, tz);
    assert.ok(morning.precipIntensity > 0, 'Rain in morning for overcast');
    assert.ok(afternoon.precipIntensity > 0, 'Rain in afternoon for overcast');
  });

  it('snow type when SNOW reported', () => {
    const daily = { TMIN: -5, TMAX: -1, PRCP: 8, SNOW: 50 };
    const synth = _synthesizeHourly(daily, 12, lat, date, tz);
    assert.strictEqual(synth.precipType, 'snow');
  });
});

// ─── Wind Model ──────────────────────────────────────────────────

describe('NOAA Provider — Wind Model', () => {
  const lat = 40.78;
  const date = new Date('1884-06-15T15:00:00Z');
  const tz = 'America/New_York';

  it('wind has diurnal variation when AWND available', () => {
    const daily = { TMIN: 18, TMAX: 32, PRCP: 0, AWND: 4.0 }; // 4 m/s average
    const night = _synthesizeHourly(daily, 3, lat, date, tz);
    const afternoon = _synthesizeHourly(daily, 14, lat, date, tz);
    assert.ok(afternoon.windSpeed > night.windSpeed,
      `Afternoon wind ${afternoon.windSpeed} should exceed night ${night.windSpeed}`);
  });

  it('wind estimated from temp range when AWND missing', () => {
    const calm = _synthesizeHourly({ TMIN: 10, TMAX: 30, PRCP: 0 }, 12, lat, date, tz);
    const windy = _synthesizeHourly({ TMIN: 15, TMAX: 18, PRCP: 5 }, 12, lat, date, tz);
    assert.ok(windy.windSpeed > calm.windSpeed,
      `Small temp range (windy) ${windy.windSpeed} should exceed large range (calm) ${calm.windSpeed}`);
  });
});

// ─── Sunrise Estimation ──────────────────────────────────────────

describe('NOAA Provider — Sunrise Estimation', () => {
  it('summer sunrise is early (~5-6am) at mid-latitudes', () => {
    const sunrise = _estimateSunriseHour(new Date('1884-06-15T12:00:00Z'), 40.78);
    assert.ok(sunrise >= 4 && sunrise <= 7,
      `Summer NYC sunrise should be 4-7am, got ${sunrise.toFixed(1)}`);
  });

  it('winter sunrise is late (~7-8am) at mid-latitudes', () => {
    const sunrise = _estimateSunriseHour(new Date('1884-12-15T12:00:00Z'), 40.78);
    assert.ok(sunrise >= 6 && sunrise <= 9,
      `Winter NYC sunrise should be 6-9am, got ${sunrise.toFixed(1)}`);
  });
});

// ─── Output Structure ────────────────────────────────────────────

describe('NOAA Provider — Output Structure', () => {
  const daily = { TMIN: 18, TMAX: 32, PRCP: 0 };
  const lat = 40.78;
  const date = new Date('1884-06-15T15:00:00Z');
  const tz = 'America/New_York';

  it('synthesized output has all required fields', () => {
    const synth = _synthesizeHourly(daily, 12, lat, date, tz);
    assert.ok(typeof synth.temp === 'number');
    assert.ok(typeof synth.humidity === 'number');
    assert.ok(typeof synth.cloudCover === 'number');
    assert.ok(typeof synth.precipIntensity === 'number');
    assert.ok(typeof synth.windSpeed === 'number');
    assert.ok(typeof synth.windDirection === 'number');
    assert.ok(typeof synth.visibility === 'number');
    assert.ok(typeof synth.solarAltitude === 'number');
    assert.ok(typeof synth.solarAzimuth === 'number');
    assert.ok(typeof synth.isDaytime === 'boolean');
    assert.ok(typeof synth.uvIndex === 'number');
  });
});

// ─── Confidence Tiers ────────────────────────────────────────────

describe('NOAA Provider — Confidence Metadata', () => {
  // We can't call getWeather without an API key, but we can verify the
  // exported confidence function behavior is correct by checking the
  // provider module exports the right shape. Testing via synthesizeHourly.
  const daily = { TMIN: 18, TMAX: 32, PRCP: 0 };
  const lat = 40.78;
  const tz = 'America/New_York';

  it('all synthesized values are finite numbers', () => {
    // Spot check across eras
    for (const year of [1884, 1900, 1920, 1935]) {
      const date = new Date(`${year}-06-15T15:00:00Z`);
      const synth = _synthesizeHourly(daily, 12, lat, date, tz);
      assert.ok(Number.isFinite(synth.temp), `${year}: temp should be finite`);
      assert.ok(Number.isFinite(synth.humidity), `${year}: humidity should be finite`);
      assert.ok(Number.isFinite(synth.windSpeed), `${year}: windSpeed should be finite`);
    }
  });
});

// ─── Integration Test (requires NOAA_API_TOKEN) ──────────────────

describe('Phase 3 — 1884 NYC Integration', { skip: !process.env.NOAA_API_TOKEN }, () => {
  // Dynamic import to avoid module-level errors when token is missing
  it('fetches real weather for 1884-06-15 in New York City', async () => {
    const { getWeather } = await import('../lib/noaa.js');
    const { geocode } = await import('../lib/openmeteo.js');
    const { localToUtc } = await import('../lib/timezone.js');

    const geo = await geocode('New York, NY');
    const date = localToUtc(1884, 6, 15, 15, 0, geo.timezone);
    const weather = await getWeather({ location: 'New York, NY', date, geo });

    assert.ok(weather.temperature.celsius !== undefined);
    assert.ok(weather.temperature.celsius > -50 && weather.temperature.celsius < 60);
    assert.strictEqual(weather.metadata.provider, 'noaa-ghcn');
    assert.ok(weather.metadata.confidence <= 0.35);
    assert.strictEqual(weather.metadata.resolutionMinutes, 1440);
    assert.ok(weather.metadata.stationId, 'should include station ID');
  });

  it('produces valid WorldState for 1884 NYC', async () => {
    const { getWeather } = await import('../lib/noaa.js');
    const { geocode } = await import('../lib/openmeteo.js');
    const { localToUtc } = await import('../lib/timezone.js');
    const { compileWorldState } = await import('../lib/worldStateCompiler.js');
    const { LOCALES } = await import('../lib/localePresets.js');

    const geo = await geocode('New York, NY');
    const date = localToUtc(1884, 6, 15, 15, 0, geo.timezone);
    const weather = await getWeather({ location: 'New York, NY', date, geo });
    const worldState = compileWorldState({ timeline: [weather], locale: LOCALES.nyc_city, now: date });

    assert.ok(worldState.states.timeOfDay);
    assert.ok(worldState.controls.lighting.exteriorLuminance >= 0);
    assert.ok(worldState.controls.audio.activityLevel >= 0);
  });
});
