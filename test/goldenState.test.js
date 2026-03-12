import { describe, it } from 'node:test';
import assert from 'node:assert';
import { compileWorldState } from '../lib/worldStateCompiler.js';
import { getMockWeather } from '../lib/weather.js';
import { validateWorldState, STATES_ENUM, CONTROL_BOUNDS } from '../lib/worldStateContract.js';

/**
 * Golden State Tests
 * Deterministic tests using the mock provider (seeded PRNG).
 * Same inputs always produce same outputs — catches drift in the compiler.
 */

describe('Golden State - Mock Provider Determinism', () => {
  const defaultLocale = { audioBaseDb: 24, activity: 0.15, hazeBias: 0.03 };

  describe('Baton Rouge July 1978 - Daytime', () => {
    const date = new Date('1978-07-04T20:00:00Z'); // 3pm CDT (UTC-5 in summer)
    const weather = getMockWeather({ location: 'Baton Rouge, LA', date });
    const state = compileWorldState({
      timeline: [weather],
      locale: defaultLocale,
      now: date
    });

    it('produces a valid WorldState', () => {
      const result = validateWorldState(state);
      assert.ok(result.valid, `WorldState invalid: ${result.errors.join('; ')}`);
    });

    it('has all required state categories', () => {
      for (const key of Object.keys(STATES_ENUM)) {
        assert.ok(state.states[key] !== undefined, `Missing state: ${key}`);
        assert.ok(STATES_ENUM[key].includes(state.states[key]),
          `Invalid state ${key}: "${state.states[key]}"`);
      }
    });

    it('has all control groups with correct bounds', () => {
      for (const [group, bounds] of Object.entries(CONTROL_BOUNDS)) {
        assert.ok(state.controls[group], `Missing control group: ${group}`);
        for (const [key, [min, max]] of Object.entries(bounds)) {
          const value = state.controls[group][key];
          assert.ok(value !== undefined, `Missing control: ${group}.${key}`);
          assert.ok(typeof value === 'number', `${group}.${key} must be number`);
          assert.ok(value >= min && value <= max,
            `${group}.${key} = ${value} out of bounds [${min}, ${max}]`);
        }
      }
    });

    it('reports mock provider in metadata', () => {
      assert.strictEqual(state.metadata.provider, 'mock');
      assert.strictEqual(state.metadata.dataset, 'generated');
    });

    it('is deterministic across runs', () => {
      // Same inputs should always produce same outputs
      const weather2 = getMockWeather({ location: 'Baton Rouge, LA', date });
      const state2 = compileWorldState({
        timeline: [weather2],
        locale: defaultLocale,
        now: date
      });

      assert.deepStrictEqual(state.states, state2.states);
      assert.deepStrictEqual(state.controls, state2.controls);
    });
  });

  describe('Night scenario', () => {
    const date = new Date('1978-07-04T06:00:00Z'); // 1am CDT
    const weather = getMockWeather({ location: 'Baton Rouge, LA', date });
    const state = compileWorldState({
      timeline: [weather],
      locale: defaultLocale,
      now: date
    });

    it('produces a valid WorldState', () => {
      const result = validateWorldState(state);
      assert.ok(result.valid, `WorldState invalid: ${result.errors.join('; ')}`);
    });

    it('classifies as night or twilight', () => {
      assert.ok(['night', 'twilight'].includes(state.states.timeOfDay),
        `Expected night/twilight, got: ${state.states.timeOfDay}`);
    });

    it('has low luminance at night', () => {
      assert.ok(state.controls.lighting.exteriorLuminance < 0.1,
        `Night luminance too high: ${state.controls.lighting.exteriorLuminance}`);
    });

    it('has low contrast at night', () => {
      assert.strictEqual(state.controls.lighting.contrast, 0.15);
    });

    it('has zero heat distortion at night', () => {
      assert.strictEqual(state.controls.visual.heatDistortion, 0);
    });
  });

  describe('Winter scenario', () => {
    const date = new Date('1978-01-15T18:00:00Z'); // noon CST
    const weather = getMockWeather({ location: 'Baton Rouge, LA', date });
    const state = compileWorldState({
      timeline: [weather],
      locale: defaultLocale,
      now: date
    });

    it('produces a valid WorldState', () => {
      const result = validateWorldState(state);
      assert.ok(result.valid, `WorldState invalid: ${result.errors.join('; ')}`);
    });
  });

  describe('Different location', () => {
    const date = new Date('1884-06-15T18:00:00Z');
    const weather = getMockWeather({ location: 'New York, NY', date });
    const nycLocale = { audioBaseDb: 40, activity: 0.65, hazeBias: 0.1 };
    const state = compileWorldState({
      timeline: [weather],
      locale: nycLocale,
      now: date
    });

    it('produces a valid WorldState', () => {
      const result = validateWorldState(state);
      assert.ok(result.valid, `WorldState invalid: ${result.errors.join('; ')}`);
    });

    it('reflects higher activity level for urban locale', () => {
      // NYC locale has activity: 0.65 vs BR's 0.15
      const brWeather = getMockWeather({ location: 'Baton Rouge, LA', date });
      const brState = compileWorldState({
        timeline: [brWeather],
        locale: defaultLocale,
        now: date
      });
      assert.ok(state.controls.audio.activityLevel >= brState.controls.audio.activityLevel,
        `NYC activity (${state.controls.audio.activityLevel}) should be >= BR (${brState.controls.audio.activityLevel})`);
    });
  });
});

describe('WorldState Contract Module', () => {
  it('rejects null input', () => {
    const result = validateWorldState(null);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  it('rejects empty object', () => {
    const result = validateWorldState({});
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Missing required field')));
  });

  it('rejects out-of-bounds control values', () => {
    const state = {
      timeUtc: '2024-01-01T00:00:00Z',
      timeLocal: '2024-01-01T00:00:00',
      states: {
        timeOfDay: 'day', sky: 'clear', precip: 'none',
        wind: 'calm', comfort: 'comfortable'
      },
      controls: {
        lighting: { exteriorLuminance: 5.0, colorTempK: 5500, contrast: 0.5 },
        audio: {
          baseNoiseFloorDb: 30, windLevel: 0, rainLevel: 0,
          snowLevel: 0, gustiness: 0, thunderProb: 0,
          activityLevel: 0.5, timeOfDayPhase: 0.5, windDirection: 180
        },
        atmosphere: { cloudDensity: 0, haze: 0.05, wetness: 0 },
        visual: {
          windDirection: 180, sunAltitude: 60, sunAzimuth: 180,
          precipDensity: 0, heatDistortion: 0
        }
      },
      metadata: { provider: 'mock', dataset: 'test', resolutionMinutes: 60, confidence: 0.7 }
    };
    const result = validateWorldState(state);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('exteriorLuminance') && e.includes('out of bounds')));
  });

  it('rejects invalid state enum values', () => {
    const state = {
      timeUtc: '2024-01-01T00:00:00Z',
      timeLocal: '2024-01-01T00:00:00',
      states: {
        timeOfDay: 'midnight', // invalid
        sky: 'clear', precip: 'none', wind: 'calm', comfort: 'comfortable'
      },
      controls: {
        lighting: { exteriorLuminance: 0.5, colorTempK: 5500, contrast: 0.5 },
        audio: {
          baseNoiseFloorDb: 30, windLevel: 0, rainLevel: 0,
          snowLevel: 0, gustiness: 0, thunderProb: 0,
          activityLevel: 0.5, timeOfDayPhase: 0.5, windDirection: 180
        },
        atmosphere: { cloudDensity: 0, haze: 0.05, wetness: 0 },
        visual: {
          windDirection: 180, sunAltitude: 60, sunAzimuth: 180,
          precipDensity: 0, heatDistortion: 0
        }
      },
      metadata: { provider: 'mock', dataset: 'test', resolutionMinutes: 60, confidence: 0.7 }
    };
    const result = validateWorldState(state);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('midnight')));
  });
});
