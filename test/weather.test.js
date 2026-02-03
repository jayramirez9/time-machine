import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getMockWeather } from '../lib/weather.js';

describe('Mock Weather Provider', () => {
  const location = 'Baton Rouge, LA';
  const date = new Date('1978-07-04T15:00:00');

  describe('determinism', () => {
    it('returns identical results for same location and time', () => {
      const result1 = getMockWeather({ location, date });
      const result2 = getMockWeather({ location, date });

      assert.strictEqual(result1.temperature.celsius, result2.temperature.celsius);
      assert.strictEqual(result1.humidity, result2.humidity);
      assert.strictEqual(result1.wind.speed, result2.wind.speed);
      assert.strictEqual(result1.wind.direction, result2.wind.direction);
      assert.strictEqual(result1.clouds.coverage, result2.clouds.coverage);
    });

    it('returns different results for different locations', () => {
      const result1 = getMockWeather({ location: 'Baton Rouge, LA', date });
      const result2 = getMockWeather({ location: 'New York, NY', date });

      // At least one value should differ
      const differs =
        result1.temperature.celsius !== result2.temperature.celsius ||
        result1.wind.speed !== result2.wind.speed ||
        result1.clouds.coverage !== result2.clouds.coverage;

      assert.ok(differs, 'Different locations should produce different weather');
    });

    it('returns different results for different hours', () => {
      const date1 = new Date('1978-07-04T10:00:00');
      const date2 = new Date('1978-07-04T14:00:00');

      const result1 = getMockWeather({ location, date: date1 });
      const result2 = getMockWeather({ location, date: date2 });

      // Hours differ, so seeded random values should differ
      const differs =
        result1.wind.speed !== result2.wind.speed ||
        result1.clouds.coverage !== result2.clouds.coverage;

      assert.ok(differs, 'Different hours should produce different weather');
    });
  });

  describe('structure', () => {
    it('returns all required fields', () => {
      const result = getMockWeather({ location, date });

      assert.ok(result.location);
      assert.ok(result.timestampUtc);
      assert.ok(result.timestampLocal);
      assert.ok(result.temperature);
      assert.ok(typeof result.temperature.celsius === 'number');
      assert.ok(typeof result.temperature.fahrenheit === 'number');
      assert.ok(typeof result.humidity === 'number');
      assert.ok(typeof result.pressure === 'number');
      assert.ok(result.wind);
      assert.ok(typeof result.wind.speed === 'number');
      assert.ok(typeof result.wind.direction === 'number');
      assert.ok(result.clouds);
      assert.ok(typeof result.clouds.coverage === 'number');
      assert.ok(result.solar);
      assert.ok(typeof result.solar.altitude === 'number');
      assert.ok(typeof result.solar.isDaytime === 'boolean');
      assert.ok(result.precipitation);
      assert.ok(typeof result.precipitation.likelihood === 'number');
      assert.ok(result.metadata);
      assert.strictEqual(result.metadata.provider, 'mock');
    });
  });

  describe('seasonal variation', () => {
    it('is warmer in summer than winter', () => {
      const summer = getMockWeather({ location, date: new Date('1978-07-04T15:00:00') });
      const winter = getMockWeather({ location, date: new Date('1978-01-04T15:00:00') });

      assert.ok(summer.temperature.celsius > winter.temperature.celsius,
        `Summer (${summer.temperature.celsius}C) should be warmer than winter (${winter.temperature.celsius}C)`);
    });
  });

  describe('day/night cycle', () => {
    it('isDaytime true during day hours', () => {
      const noon = getMockWeather({ location, date: new Date('1978-07-04T12:00:00') });
      assert.strictEqual(noon.solar.isDaytime, true);
    });

    it('isDaytime false during night hours', () => {
      const midnight = getMockWeather({ location, date: new Date('1978-07-04T02:00:00') });
      assert.strictEqual(midnight.solar.isDaytime, false);
    });

    it('solar altitude is 0 at night', () => {
      const midnight = getMockWeather({ location, date: new Date('1978-07-04T02:00:00') });
      assert.strictEqual(midnight.solar.altitude, 0);
    });

    it('solar altitude > 0 during day', () => {
      const noon = getMockWeather({ location, date: new Date('1978-07-04T12:00:00') });
      assert.ok(noon.solar.altitude > 0);
    });
  });

  describe('value bounds', () => {
    it('humidity is between 30 and 95', () => {
      const result = getMockWeather({ location, date });
      assert.ok(result.humidity >= 30 && result.humidity <= 95);
    });

    it('cloud coverage is between 0 and 100', () => {
      const result = getMockWeather({ location, date });
      assert.ok(result.clouds.coverage >= 0 && result.clouds.coverage <= 100);
    });

    it('wind direction is between 0 and 360', () => {
      const result = getMockWeather({ location, date });
      assert.ok(result.wind.direction >= 0 && result.wind.direction < 360);
    });
  });
});
