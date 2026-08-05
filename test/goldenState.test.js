import { describe, it } from 'node:test';
import assert from 'node:assert';
import { compileWorldState } from '../lib/worldStateCompiler.js';
import { getMockWeather } from '../lib/weather.js';
import { validateWorldState, STATES_ENUM, CONTROL_BOUNDS } from '../lib/worldStateContract.js';
import { easeWorldState } from '../lib/runtimeEngine.js';

/**
 * Golden State Tests
 * Deterministic tests using the mock provider (seeded PRNG).
 * Same inputs always produce same outputs — catches drift in the compiler.
 *
 * Dates use local-component constructors (not UTC strings): the mock provider
 * reads machine-local getHours() (TZ derivation is a documented TODO), so
 * wall-clock anchoring keeps these deterministic across machine timezones.
 */

describe('Golden State - Mock Provider Determinism', () => {
  const defaultLocale = { audioBaseDb: 24, activity: 0.15, hazeBias: 0.03 };

  describe('Baton Rouge July 1978 - Daytime', () => {
    const date = new Date(1978, 6, 4, 15, 0, 0); // 3pm wall-clock
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

    it('exposes simMonth from the sim date', () => {
      assert.strictEqual(state.simMonth, 7);
    });

    it('exposes raw temperatureC in controls.audio', () => {
      const t = state.controls.audio.temperatureC;
      assert.strictEqual(typeof t, 'number');
      assert.ok(t >= -90 && t <= 60, `temperatureC ${t} outside contract bounds`);
      assert.strictEqual(t, Math.round(weather.temperature.celsius * 10) / 10);
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
    const date = new Date(1978, 6, 4, 2, 0, 0); // 2am wall-clock
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
    const date = new Date(1978, 0, 15, 12, 0, 0); // noon wall-clock
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
    const date = new Date(1884, 5, 15, 13, 0, 0); // 1pm wall-clock
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
      simMonth: 1,
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
      simMonth: 1,
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

  it('rejects out-of-range simMonth', () => {
    const date = new Date(1978, 6, 4, 15, 0, 0);
    const weather = getMockWeather({ location: 'Baton Rouge, LA', date });
    const good = compileWorldState({ timeline: [weather], locale: { audioBaseDb: 24, activity: 0.15, hazeBias: 0.03 }, now: date });
    const bad = { ...good, simMonth: 13 };
    const result = validateWorldState(bad);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('simMonth')));
  });

  it('rejects missing simMonth', () => {
    const date = new Date(1978, 6, 4, 15, 0, 0);
    const weather = getMockWeather({ location: 'Baton Rouge, LA', date });
    const good = compileWorldState({ timeline: [weather], locale: { audioBaseDb: 24, activity: 0.15, hazeBias: 0.03 }, now: date });
    const { simMonth, ...withoutMonth } = good;
    const result = validateWorldState(withoutMonth);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('simMonth')));
  });
});

describe('Winter month extraction', () => {
  it('exposes simMonth 12 for a December sim date', () => {
    const date = new Date(1978, 11, 25, 15, 0, 0);
    const weather = getMockWeather({ location: 'Baton Rouge, LA', date });
    const state = compileWorldState({ timeline: [weather], locale: { audioBaseDb: 24, activity: 0.15, hazeBias: 0.03 }, now: date });
    assert.strictEqual(state.simMonth, 12);
  });
});

describe('Publish path preserves B047 fields (easeWorldState)', () => {
  const locale = { audioBaseDb: 24, activity: 0.15, hazeBias: 0.03 };
  const dateA = new Date(1978, 6, 4, 15, 0, 0);
  const dateB = new Date(1978, 6, 4, 2, 0, 0);
  const stateA = compileWorldState({ timeline: [getMockWeather({ location: 'Baton Rouge, LA', date: dateA })], locale, now: dateA });
  const stateB = compileWorldState({ timeline: [getMockWeather({ location: 'Baton Rouge, LA', date: dateB })], locale, now: dateB });
  const eased = easeWorldState(stateA, stateB, 0.25);

  it('carries simMonth through easing', () => {
    assert.strictEqual(eased.simMonth, stateB.simMonth);
  });

  it('eases temperatureC instead of dropping it', () => {
    const t = eased.controls.audio.temperatureC;
    assert.strictEqual(typeof t, 'number');
    const a = stateA.controls.audio.temperatureC;
    const b = stateB.controls.audio.temperatureC;
    assert.strictEqual(t, a + (b - a) * 0.25);
  });

  it('easeWorldState drops no control field the compiler emits', () => {
    for (const group of ['lighting', 'audio', 'atmosphere', 'visual', 'postprocess']) {
      assert.deepStrictEqual(
        Object.keys(eased.controls[group]).sort(),
        Object.keys(stateB.controls[group]).sort(),
        `easeWorldState dropped fields from controls.${group}`);
    }
  });

  it('falls back to target temperatureC when the current state predates B047', () => {
    const legacy = JSON.parse(JSON.stringify(stateA));
    delete legacy.controls.audio.temperatureC;
    const easedLegacy = easeWorldState(legacy, stateB, 0.25);
    assert.strictEqual(easedLegacy.controls.audio.temperatureC, stateB.controls.audio.temperatureC);
  });

  it('eased state still validates against the contract', () => {
    const result = validateWorldState(eased);
    assert.ok(result.valid, `eased state invalid: ${result.errors.join('; ')}`);
  });
});
