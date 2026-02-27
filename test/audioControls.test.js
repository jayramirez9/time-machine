import { describe, it } from 'node:test';
import assert from 'node:assert';
import { compileWorldState } from '../lib/worldStateCompiler.js';

// Helper to create a mock weather observation
function createWeather(overrides = {}) {
  return {
    location: 'Test Location',
    timestampUtc: '1978-07-04T15:00:00.000Z',
    timestampLocal: '1978-07-04T15:00:00',
    temperature: { celsius: 25, fahrenheit: 77 },
    humidity: 60,
    pressure: 1013,
    wind: { speed: 10, direction: 180, unit: 'km/h' },
    clouds: { coverage: 30, type: 'cumulus' },
    solar: { altitude: 60, azimuth: 180, isDaytime: true },
    precipitation: { likelihood: 10, type: null, intensity: 0 },
    visibility: 10,
    uvIndex: 6,
    metadata: {
      provider: 'mock',
      dataset: 'generated',
      resolutionMinutes: 60,
      confidence: 0.7
    },
    ...overrides
  };
}

const defaultLocale = { audioBaseDb: 24, activity: 0.15, hazeBias: 0.03 };

function compile(weatherOverrides = {}, locale = defaultLocale) {
  const weather = createWeather(weatherOverrides);
  return compileWorldState({
    timeline: [weather],
    locale,
    now: new Date(weather.timestampUtc)
  });
}

describe('Audio Controls — Extended', () => {
  describe('gustiness', () => {
    it('is 0 when calm (< 5 km/h)', () => {
      const result = compile({ wind: { speed: 3, direction: 0, unit: 'km/h' } });
      assert.strictEqual(result.controls.audio.gustiness, 0);
    });

    it('is 0.1 when light wind (5-15 km/h)', () => {
      const result = compile({ wind: { speed: 10, direction: 0, unit: 'km/h' } });
      assert.strictEqual(result.controls.audio.gustiness, 0.1);
    });

    it('is 0.3 when breezy (15-25 km/h)', () => {
      const result = compile({ wind: { speed: 20, direction: 0, unit: 'km/h' } });
      assert.strictEqual(result.controls.audio.gustiness, 0.3);
    });

    it('is 0.5 when windy (25-40 km/h)', () => {
      const result = compile({ wind: { speed: 30, direction: 0, unit: 'km/h' } });
      assert.strictEqual(result.controls.audio.gustiness, 0.5);
    });

    it('is 0.8 when gusty (> 40 km/h)', () => {
      const result = compile({ wind: { speed: 50, direction: 0, unit: 'km/h' } });
      assert.strictEqual(result.controls.audio.gustiness, 0.8);
    });
  });

  describe('thunderProb', () => {
    it('is 0 when no rain', () => {
      const result = compile({ precipitation: { likelihood: 0, type: null, intensity: 0 } });
      assert.strictEqual(result.controls.audio.thunderProb, 0);
    });

    it('is 0 when light rain (rainLevel < 0.3)', () => {
      const result = compile({ precipitation: { likelihood: 50, type: 'rain', intensity: 1 } });
      // rainLevel = min(1, 1/10) = 0.1 → thunderProb = max(0, (0.1 - 0.3) * 1.5) = 0
      assert.strictEqual(result.controls.audio.thunderProb, 0);
    });

    it('increases with heavier rain', () => {
      const result = compile({ precipitation: { likelihood: 100, type: 'rain', intensity: 8 } });
      // rainLevel = min(1, 8/10) = 0.8 → thunderProb = (0.8 - 0.3) * 1.5 = 0.75
      assert.ok(result.controls.audio.thunderProb > 0.5);
    });

    it('caps at 1.0', () => {
      const result = compile({ precipitation: { likelihood: 100, type: 'rain', intensity: 15 } });
      assert.ok(result.controls.audio.thunderProb <= 1);
    });
  });

  describe('snowLevel', () => {
    it('is 0 when no precipitation', () => {
      const result = compile({ precipitation: { likelihood: 0, type: null, intensity: 0 } });
      assert.strictEqual(result.controls.audio.snowLevel, 0);
    });

    it('is 0 when rain (not snow)', () => {
      const result = compile({ precipitation: { likelihood: 80, type: 'rain', intensity: 5 } });
      assert.strictEqual(result.controls.audio.snowLevel, 0);
    });

    it('scales with snow intensity', () => {
      const light = compile({ precipitation: { likelihood: 80, type: 'snow', intensity: 1 } });
      const heavy = compile({ precipitation: { likelihood: 100, type: 'snow', intensity: 4 } });
      assert.ok(heavy.controls.audio.snowLevel > light.controls.audio.snowLevel);
    });

    it('caps at 1.0', () => {
      const result = compile({ precipitation: { likelihood: 100, type: 'snow', intensity: 10 } });
      assert.strictEqual(result.controls.audio.snowLevel, 1);
    });
  });

  describe('activityLevel', () => {
    it('is higher during midday than at night', () => {
      const midday = compile({
        timestampUtc: '1978-07-04T17:00:00.000Z', // ~noon
        solar: { altitude: 65, azimuth: 180, isDaytime: true }
      });
      const night = compile({
        timestampUtc: '1978-07-04T06:00:00.000Z', // ~1am
        solar: { altitude: 0, azimuth: 0, isDaytime: false }
      });
      assert.ok(midday.controls.audio.activityLevel > night.controls.audio.activityLevel);
    });

    it('reflects locale activity level', () => {
      const quiet = compile({}, { audioBaseDb: 20, activity: 0.1, hazeBias: 0 });
      const busy = compile({}, { audioBaseDb: 30, activity: 0.5, hazeBias: 0 });
      assert.ok(busy.controls.audio.activityLevel > quiet.controls.audio.activityLevel);
    });

    it('is between 0 and 1', () => {
      const result = compile();
      assert.ok(result.controls.audio.activityLevel >= 0);
      assert.ok(result.controls.audio.activityLevel <= 1);
    });
  });

  describe('timeOfDayPhase', () => {
    it('is continuous between 0 and 1', () => {
      const result = compile();
      assert.ok(result.controls.audio.timeOfDayPhase >= 0);
      assert.ok(result.controls.audio.timeOfDayPhase < 1);
    });

    it('increases from morning to afternoon', () => {
      // Use timestamps that are 6 hours apart — regardless of timezone,
      // the later one should have a higher phase
      const morning = compile({
        timestampUtc: '1978-07-04T10:00:00.000Z',
        solar: { altitude: 30, azimuth: 120, isDaytime: true }
      });
      const afternoon = compile({
        timestampUtc: '1978-07-04T16:00:00.000Z',
        solar: { altitude: 50, azimuth: 220, isDaytime: true }
      });
      // Phase is based on getHours() which is local — but the 6-hour gap
      // should always produce a higher phase for the later timestamp
      assert.ok(afternoon.controls.audio.timeOfDayPhase > morning.controls.audio.timeOfDayPhase);
    });
  });

  describe('windDirection (audio)', () => {
    it('passes through wind direction', () => {
      const result = compile({ wind: { speed: 10, direction: 225, unit: 'km/h' } });
      assert.strictEqual(result.controls.audio.windDirection, 225);
    });

    it('matches visual wind direction', () => {
      const result = compile({ wind: { speed: 10, direction: 135, unit: 'km/h' } });
      assert.strictEqual(result.controls.audio.windDirection, result.controls.visual.windDirection);
    });
  });

  describe('output structure includes new fields', () => {
    it('has all extended audio control fields', () => {
      const result = compile();
      const audio = result.controls.audio;
      assert.ok('gustiness' in audio, 'missing gustiness');
      assert.ok('thunderProb' in audio, 'missing thunderProb');
      assert.ok('activityLevel' in audio, 'missing activityLevel');
      assert.ok('timeOfDayPhase' in audio, 'missing timeOfDayPhase');
      assert.ok('snowLevel' in audio, 'missing snowLevel');
      assert.ok('windDirection' in audio, 'missing windDirection');
    });
  });
});
