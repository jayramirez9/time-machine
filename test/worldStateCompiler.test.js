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

describe('World State Compiler', () => {
  const defaultLocale = { audioBaseDb: 24, activity: 0.15, hazeBias: 0.03 };

  describe('time of day classification', () => {
    it('classifies morning correctly', () => {
      const weather = createWeather({
        timestampUtc: '1978-07-04T14:00:00.000Z', // 9am local-ish
        solar: { altitude: 30, azimuth: 120, isDaytime: true }
      });
      // Adjust hour for test - this depends on implementation
    });

    it('classifies night when isDaytime is false', () => {
      const weather = createWeather({
        timestampUtc: '1978-07-04T06:00:00.000Z', // 1am local-ish
        solar: { altitude: 0, azimuth: 0, isDaytime: false }
      });
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date('1978-07-04T06:00:00.000Z')
      });
      assert.ok(['night', 'twilight'].includes(result.states.timeOfDay));
    });

    it('classifies day when isDaytime is true and midday', () => {
      const weather = createWeather({
        timestampUtc: '1978-07-04T17:00:00.000Z', // noon local-ish
        solar: { altitude: 65, azimuth: 180, isDaytime: true }
      });
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date('1978-07-04T17:00:00.000Z')
      });
      assert.ok(['day', 'morning', 'afternoon'].includes(result.states.timeOfDay));
    });
  });

  describe('sky classification', () => {
    it('classifies clear sky (< 10% clouds)', () => {
      const weather = createWeather({ clouds: { coverage: 5, type: 'few' } });
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date(weather.timestampUtc)
      });
      assert.strictEqual(result.states.sky, 'clear');
    });

    it('classifies few clouds (10-30%)', () => {
      const weather = createWeather({ clouds: { coverage: 20, type: 'few' } });
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date(weather.timestampUtc)
      });
      assert.strictEqual(result.states.sky, 'few');
    });

    it('classifies scattered clouds (30-60%)', () => {
      const weather = createWeather({ clouds: { coverage: 45, type: 'cumulus' } });
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date(weather.timestampUtc)
      });
      assert.strictEqual(result.states.sky, 'scattered');
    });

    it('classifies broken clouds (60-85%)', () => {
      const weather = createWeather({ clouds: { coverage: 75, type: 'cumulus' } });
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date(weather.timestampUtc)
      });
      assert.strictEqual(result.states.sky, 'broken');
    });

    it('classifies overcast (> 85%)', () => {
      const weather = createWeather({ clouds: { coverage: 95, type: 'stratus' } });
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date(weather.timestampUtc)
      });
      assert.strictEqual(result.states.sky, 'overcast');
    });
  });

  describe('wind classification', () => {
    it('classifies calm (< 5 km/h)', () => {
      const weather = createWeather({ wind: { speed: 3, direction: 180, unit: 'km/h' } });
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date(weather.timestampUtc)
      });
      assert.strictEqual(result.states.wind, 'calm');
    });

    it('classifies light (5-15 km/h)', () => {
      const weather = createWeather({ wind: { speed: 10, direction: 180, unit: 'km/h' } });
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date(weather.timestampUtc)
      });
      assert.strictEqual(result.states.wind, 'light');
    });

    it('classifies breezy (15-25 km/h)', () => {
      const weather = createWeather({ wind: { speed: 20, direction: 180, unit: 'km/h' } });
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date(weather.timestampUtc)
      });
      assert.strictEqual(result.states.wind, 'breezy');
    });

    it('classifies windy (25-40 km/h)', () => {
      const weather = createWeather({ wind: { speed: 30, direction: 180, unit: 'km/h' } });
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date(weather.timestampUtc)
      });
      assert.strictEqual(result.states.wind, 'windy');
    });

    it('classifies gusty (> 40 km/h)', () => {
      const weather = createWeather({ wind: { speed: 50, direction: 180, unit: 'km/h' } });
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date(weather.timestampUtc)
      });
      assert.strictEqual(result.states.wind, 'gusty');
    });
  });

  describe('comfort classification', () => {
    it('classifies freezing (< 0°C)', () => {
      const weather = createWeather({ temperature: { celsius: -5, fahrenheit: 23 } });
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date(weather.timestampUtc)
      });
      assert.strictEqual(result.states.comfort, 'freezing');
    });

    it('classifies cold (0-10°C)', () => {
      const weather = createWeather({ temperature: { celsius: 5, fahrenheit: 41 } });
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date(weather.timestampUtc)
      });
      assert.strictEqual(result.states.comfort, 'cold');
    });

    it('classifies comfortable (18-24°C)', () => {
      const weather = createWeather({ temperature: { celsius: 21, fahrenheit: 70 } });
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date(weather.timestampUtc)
      });
      assert.strictEqual(result.states.comfort, 'comfortable');
    });

    it('classifies hot (> 30°C)', () => {
      const weather = createWeather({ temperature: { celsius: 35, fahrenheit: 95 } });
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date(weather.timestampUtc)
      });
      assert.strictEqual(result.states.comfort, 'hot');
    });
  });

  describe('precipitation classification', () => {
    it('classifies none when no precipitation', () => {
      const weather = createWeather({ precipitation: { likelihood: 0, type: null, intensity: 0 } });
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date(weather.timestampUtc)
      });
      assert.strictEqual(result.states.precip, 'none');
    });

    it('classifies light rain', () => {
      const weather = createWeather({ precipitation: { likelihood: 80, type: 'rain', intensity: 1 } });
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date(weather.timestampUtc)
      });
      assert.strictEqual(result.states.precip, 'light_rain');
    });

    it('classifies heavy rain', () => {
      const weather = createWeather({ precipitation: { likelihood: 100, type: 'rain', intensity: 10 } });
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date(weather.timestampUtc)
      });
      assert.strictEqual(result.states.precip, 'heavy_rain');
    });

    it('classifies snow', () => {
      const weather = createWeather({ precipitation: { likelihood: 80, type: 'snow', intensity: 2 } });
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date(weather.timestampUtc)
      });
      assert.strictEqual(result.states.precip, 'snow');
    });
  });

  describe('lighting controls', () => {
    it('luminance is higher during day with clear sky', () => {
      const clear = createWeather({
        clouds: { coverage: 5, type: 'few' },
        solar: { altitude: 60, azimuth: 180, isDaytime: true }
      });
      const overcast = createWeather({
        clouds: { coverage: 95, type: 'stratus' },
        solar: { altitude: 60, azimuth: 180, isDaytime: true }
      });

      const clearResult = compileWorldState({
        timeline: [clear],
        locale: defaultLocale,
        now: new Date(clear.timestampUtc)
      });
      const overcastResult = compileWorldState({
        timeline: [overcast],
        locale: defaultLocale,
        now: new Date(overcast.timestampUtc)
      });

      assert.ok(clearResult.controls.lighting.exteriorLuminance >
                overcastResult.controls.lighting.exteriorLuminance);
    });

    it('luminance is very low at night', () => {
      const weather = createWeather({
        solar: { altitude: 0, azimuth: 0, isDaytime: false }
      });
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date(weather.timestampUtc)
      });
      assert.ok(result.controls.lighting.exteriorLuminance < 0.1);
    });

    it('contrast is lower when overcast', () => {
      const clear = createWeather({ clouds: { coverage: 5, type: 'few' } });
      const overcast = createWeather({ clouds: { coverage: 95, type: 'stratus' } });

      const clearResult = compileWorldState({
        timeline: [clear],
        locale: defaultLocale,
        now: new Date(clear.timestampUtc)
      });
      const overcastResult = compileWorldState({
        timeline: [overcast],
        locale: defaultLocale,
        now: new Date(overcast.timestampUtc)
      });

      assert.ok(clearResult.controls.lighting.contrast >
                overcastResult.controls.lighting.contrast);
    });
  });

  describe('audio controls', () => {
    it('wind level scales with wind speed', () => {
      const calm = createWeather({ wind: { speed: 2, direction: 0, unit: 'km/h' } });
      const windy = createWeather({ wind: { speed: 35, direction: 0, unit: 'km/h' } });

      const calmResult = compileWorldState({
        timeline: [calm],
        locale: defaultLocale,
        now: new Date(calm.timestampUtc)
      });
      const windyResult = compileWorldState({
        timeline: [windy],
        locale: defaultLocale,
        now: new Date(windy.timestampUtc)
      });

      assert.ok(windyResult.controls.audio.windLevel > calmResult.controls.audio.windLevel);
    });

    it('rain level is 0 when no rain', () => {
      const weather = createWeather({ precipitation: { likelihood: 0, type: null, intensity: 0 } });
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date(weather.timestampUtc)
      });
      assert.strictEqual(result.controls.audio.rainLevel, 0);
    });

    it('rain level increases with intensity', () => {
      const light = createWeather({ precipitation: { likelihood: 80, type: 'rain', intensity: 1 } });
      const heavy = createWeather({ precipitation: { likelihood: 100, type: 'rain', intensity: 8 } });

      const lightResult = compileWorldState({
        timeline: [light],
        locale: defaultLocale,
        now: new Date(light.timestampUtc)
      });
      const heavyResult = compileWorldState({
        timeline: [heavy],
        locale: defaultLocale,
        now: new Date(heavy.timestampUtc)
      });

      assert.ok(heavyResult.controls.audio.rainLevel > lightResult.controls.audio.rainLevel);
    });

    it('noise floor uses locale audioBaseDb', () => {
      const weather = createWeather({ wind: { speed: 0, direction: 0, unit: 'km/h' } });

      const quietLocale = { audioBaseDb: 20, activity: 0.1, hazeBias: 0 };
      const loudLocale = { audioBaseDb: 40, activity: 0.5, hazeBias: 0 };

      const quietResult = compileWorldState({
        timeline: [weather],
        locale: quietLocale,
        now: new Date(weather.timestampUtc)
      });
      const loudResult = compileWorldState({
        timeline: [weather],
        locale: loudLocale,
        now: new Date(weather.timestampUtc)
      });

      assert.ok(loudResult.controls.audio.baseNoiseFloorDb >
                quietResult.controls.audio.baseNoiseFloorDb);
    });
  });

  describe('atmosphere controls', () => {
    it('haze increases when visibility decreases', () => {
      const clear = createWeather({ visibility: 15 });
      const hazy = createWeather({ visibility: 3 });

      const clearResult = compileWorldState({
        timeline: [clear],
        locale: defaultLocale,
        now: new Date(clear.timestampUtc)
      });
      const hazyResult = compileWorldState({
        timeline: [hazy],
        locale: defaultLocale,
        now: new Date(hazy.timestampUtc)
      });

      assert.ok(hazyResult.controls.atmosphere.haze > clearResult.controls.atmosphere.haze);
    });

    it('wetness is 0 when no precipitation', () => {
      const weather = createWeather({ precipitation: { likelihood: 0, type: null, intensity: 0 } });
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date(weather.timestampUtc)
      });
      assert.strictEqual(result.controls.atmosphere.wetness, 0);
    });

    it('wetness increases with rain intensity', () => {
      const light = createWeather({ precipitation: { likelihood: 80, type: 'rain', intensity: 1 } });
      const heavy = createWeather({ precipitation: { likelihood: 100, type: 'rain', intensity: 5 } });

      const lightResult = compileWorldState({
        timeline: [light],
        locale: defaultLocale,
        now: new Date(light.timestampUtc)
      });
      const heavyResult = compileWorldState({
        timeline: [heavy],
        locale: defaultLocale,
        now: new Date(heavy.timestampUtc)
      });

      assert.ok(heavyResult.controls.atmosphere.wetness > lightResult.controls.atmosphere.wetness);
    });
  });

  describe('visual controls', () => {
    it('passes through sun position', () => {
      const weather = createWeather({ solar: { altitude: 45, azimuth: 200, isDaytime: true } });
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date(weather.timestampUtc)
      });
      assert.strictEqual(result.controls.visual.sunAltitude, 45);
      assert.strictEqual(result.controls.visual.sunAzimuth, 200);
    });

    it('heat distortion is 0 when cool', () => {
      const weather = createWeather({ temperature: { celsius: 20, fahrenheit: 68 } });
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date(weather.timestampUtc)
      });
      assert.strictEqual(result.controls.visual.heatDistortion, 0);
    });

    it('heat distortion increases when hot and sunny', () => {
      const hot = createWeather({
        temperature: { celsius: 38, fahrenheit: 100 },
        solar: { altitude: 70, azimuth: 180, isDaytime: true }
      });
      const result = compileWorldState({
        timeline: [hot],
        locale: defaultLocale,
        now: new Date(hot.timestampUtc)
      });
      assert.ok(result.controls.visual.heatDistortion > 0);
    });
  });

  describe('output structure', () => {
    it('includes all required fields', () => {
      const weather = createWeather();
      const result = compileWorldState({
        timeline: [weather],
        locale: defaultLocale,
        now: new Date(weather.timestampUtc)
      });

      // Time fields
      assert.ok(result.timeUtc);
      assert.ok(result.timeLocal);

      // States
      assert.ok(result.states);
      assert.ok(result.states.timeOfDay);
      assert.ok(result.states.sky);
      assert.ok(result.states.precip);
      assert.ok(result.states.wind);
      assert.ok(result.states.comfort);

      // Controls
      assert.ok(result.controls);
      assert.ok(result.controls.lighting);
      assert.ok(result.controls.audio);
      assert.ok(result.controls.atmosphere);
      assert.ok(result.controls.visual);

      // Metadata
      assert.ok(result.metadata);
      assert.ok(typeof result.metadata.confidence === 'number');
      assert.ok(typeof result.metadata.resolutionMinutes === 'number');
    });
  });
});
