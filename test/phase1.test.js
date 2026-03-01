import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { compileWorldState } from '../lib/worldStateCompiler.js';
import { LOCALES, DEFAULT_LOCALE } from '../lib/localePresets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const profilesDir = path.join(__dirname, '..', 'audio-profiles');

// Helper to create a mock weather observation
function createWeather(overrides = {}) {
  return {
    location: 'Test Location',
    timestampUtc: '1978-07-04T17:00:00.000Z',
    timestampLocal: '1978-07-04T12:00:00',
    temperature: { celsius: 32, fahrenheit: 90 },
    humidity: 70,
    pressure: 1013,
    wind: { speed: 15, direction: 180, unit: 'km/h' },
    clouds: { coverage: 40, type: 'cumulus' },
    solar: { altitude: 65, azimuth: 200, isDaytime: true },
    precipitation: { likelihood: 30, type: null, intensity: 0 },
    visibility: 10,
    uvIndex: 7,
    metadata: {
      provider: 'mock',
      dataset: 'generated',
      resolutionMinutes: 60,
      confidence: 0.7
    },
    ...overrides
  };
}

function compile(weatherOverrides = {}, locale = { audioBaseDb: 24, activity: 0.15, hazeBias: 0.03 }) {
  const weather = createWeather(weatherOverrides);
  return compileWorldState({
    timeline: [weather],
    locale,
    now: new Date(weather.timestampUtc)
  });
}

// ─── Audio Profile Validation ─────────────────────────────────────
describe('Phase 1 — Audio Profile System', () => {
  const requiredProfiles = ['baton_rouge_suburb_1978', 'nyc_city_1978'];

  for (const profileId of requiredProfiles) {
    describe(`profile: ${profileId}`, () => {
      let profile;

      it('exists as a JSON file', () => {
        const filePath = path.join(profilesDir, profileId + '.json');
        assert.ok(fs.existsSync(filePath), `Missing profile file: ${filePath}`);
        profile = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      });

      it('has required top-level fields', () => {
        profile = JSON.parse(fs.readFileSync(path.join(profilesDir, profileId + '.json'), 'utf8'));
        assert.strictEqual(profile.id, profileId);
        assert.ok(profile.name, 'missing name');
        assert.ok(profile.description, 'missing description');
        assert.ok(profile.beds, 'missing beds');
        assert.ok(profile.weather, 'missing weather');
        assert.ok(profile.microEvents, 'missing microEvents');
        assert.ok(profile.mix, 'missing mix');
        assert.ok(profile.scheduling, 'missing scheduling');
      });

      it('has base bed sources', () => {
        profile = JSON.parse(fs.readFileSync(path.join(profilesDir, profileId + '.json'), 'utf8'));
        assert.ok(Array.isArray(profile.beds.base.sources), 'beds.base.sources must be array');
        assert.ok(profile.beds.base.sources.length >= 2, 'need at least 2 base bed sources');
        for (const src of profile.beds.base.sources) {
          assert.ok(src.url, 'source missing url');
          assert.ok(src.label, 'source missing label');
        }
      });

      it('has all four directional beds (N/E/S/W)', () => {
        profile = JSON.parse(fs.readFileSync(path.join(profilesDir, profileId + '.json'), 'utf8'));
        for (const dir of ['N', 'E', 'S', 'W']) {
          assert.ok(profile.beds.directional[dir], `missing directional bed: ${dir}`);
          assert.ok(profile.beds.directional[dir].sources.length > 0, `empty sources for ${dir}`);
        }
      });

      it('has weather sources (wind, rain, thunder)', () => {
        profile = JSON.parse(fs.readFileSync(path.join(profilesDir, profileId + '.json'), 'utf8'));
        assert.ok(profile.weather.wind?.sources?.length > 0, 'missing wind sources');
        assert.ok(profile.weather.rain?.sources?.length > 0, 'missing rain sources');
        assert.ok(profile.weather.thunder?.sources?.length > 0, 'missing thunder sources');
      });

      it('has at least 2 rain sources for light/heavy layering', () => {
        profile = JSON.parse(fs.readFileSync(path.join(profilesDir, profileId + '.json'), 'utf8'));
        assert.ok(
          profile.weather.rain.sources.length >= 2,
          'need at least 2 rain sources for light/heavy texture layering'
        );
      });

      it('has micro-events with valid structure', () => {
        profile = JSON.parse(fs.readFileSync(path.join(profilesDir, profileId + '.json'), 'utf8'));
        assert.ok(profile.microEvents.length >= 3, 'need at least 3 micro-event types');
        for (const evt of profile.microEvents) {
          assert.ok(evt.id, 'micro-event missing id');
          assert.ok(evt.sources?.length > 0, `micro-event ${evt.id} has no sources`);
          assert.ok(typeof evt.avgCooldownSec === 'number', `${evt.id} missing avgCooldownSec`);
          assert.ok(typeof evt.gainDb === 'number', `${evt.id} missing gainDb`);
        }
      });

      it('has scheduling config', () => {
        profile = JSON.parse(fs.readFileSync(path.join(profilesDir, profileId + '.json'), 'utf8'));
        assert.ok(typeof profile.scheduling.maxConcurrentEvents === 'number');
        assert.ok(typeof profile.scheduling.globalCooldownSec === 'number');
        assert.ok(profile.scheduling.densityMultipliers);
        assert.ok(typeof profile.scheduling.densityMultipliers.subtle === 'number');
        assert.ok(typeof profile.scheduling.densityMultipliers.present === 'number');
        assert.ok(typeof profile.scheduling.densityMultipliers.demo === 'number');
      });
    });
  }
});

// ─── Locale Preset Validation ─────────────────────────────────────
describe('Phase 1 — Locale Presets', () => {
  it('all locales reference existing audio profiles', () => {
    for (const [key, locale] of Object.entries(LOCALES)) {
      assert.ok(locale.audioProfileId, `locale ${key} missing audioProfileId`);
      const filePath = path.join(profilesDir, locale.audioProfileId + '.json');
      assert.ok(fs.existsSync(filePath),
        `locale ${key} references missing profile: ${locale.audioProfileId}`);
    }
  });

  it('nyc_city has higher activity than baton_rouge_suburb', () => {
    assert.ok(
      LOCALES.nyc_city.activity > LOCALES.baton_rouge_suburb.activity,
      'NYC should be busier than Baton Rouge suburbs'
    );
  });

  it('nyc_city has higher base noise than baton_rouge_suburb', () => {
    assert.ok(
      LOCALES.nyc_city.audioBaseDb > LOCALES.baton_rouge_suburb.audioBaseDb,
      'NYC should be louder than Baton Rouge suburbs'
    );
  });
});

// ─── Wind Direction in WorldState ─────────────────────────────────
describe('Phase 1 — Wind Direction Coherence', () => {
  it('wind direction is consistent between audio and visual controls', () => {
    const result = compile({ wind: { speed: 20, direction: 270, unit: 'km/h' } });
    assert.strictEqual(result.controls.audio.windDirection, 270);
    assert.strictEqual(result.controls.visual.windDirection, 270);
  });

  it('wind direction panning: 90° (east) maps to positive sin', () => {
    // This tests the panning formula used in audio-engine.html:
    // pan = sin(direction * PI / 180)
    const dir = 90;
    const pan = Math.sin((dir * Math.PI) / 180);
    assert.ok(Math.abs(pan - 1.0) < 0.01, `East wind should pan right, got ${pan}`);
  });

  it('wind direction panning: 270° (west) maps to negative sin', () => {
    const dir = 270;
    const pan = Math.sin((dir * Math.PI) / 180);
    assert.ok(Math.abs(pan - (-1.0)) < 0.01, `West wind should pan left, got ${pan}`);
  });

  it('wind direction panning: 0° (north) maps to center', () => {
    const dir = 0;
    const pan = Math.sin((dir * Math.PI) / 180);
    assert.ok(Math.abs(pan) < 0.01, `North wind should be centered, got ${pan}`);
  });

  it('wind direction panning: 180° (south) maps to center', () => {
    const dir = 180;
    const pan = Math.sin((dir * Math.PI) / 180);
    assert.ok(Math.abs(pan) < 0.01, `South wind should be centered, got ${pan}`);
  });
});

// ─── Rain Layering ────────────────────────────────────────────────
describe('Phase 1 — Rain Intensity Layering', () => {
  it('light rain produces non-zero rainLevel', () => {
    const result = compile({
      precipitation: { likelihood: 60, type: 'rain', intensity: 1.5 }
    });
    assert.ok(result.controls.audio.rainLevel > 0);
    assert.ok(result.controls.audio.rainLevel < 0.5);
  });

  it('heavy rain produces high rainLevel', () => {
    const result = compile({
      precipitation: { likelihood: 100, type: 'rain', intensity: 9 }
    });
    assert.ok(result.controls.audio.rainLevel >= 0.8);
  });

  it('rainLevel increases monotonically with intensity', () => {
    const levels = [1, 3, 5, 8, 10].map(intensity => {
      const result = compile({
        precipitation: { likelihood: 100, type: 'rain', intensity }
      });
      return result.controls.audio.rainLevel;
    });
    for (let i = 1; i < levels.length; i++) {
      assert.ok(levels[i] >= levels[i - 1],
        `rainLevel should increase: ${levels[i]} >= ${levels[i - 1]}`);
    }
  });
});

// ─── Thunder Distance Model ───────────────────────────────────────
describe('Phase 1 — Thunder Distance Model', () => {
  const SPEED_OF_SOUND_KM_S = 0.343;

  it('delay increases with distance', () => {
    const delay1km = 1 / SPEED_OF_SOUND_KM_S;
    const delay5km = 5 / SPEED_OF_SOUND_KM_S;
    assert.ok(delay5km > delay1km);
    assert.ok(Math.abs(delay1km - 2.92) < 0.1, `1km delay should be ~2.9s, got ${delay1km.toFixed(2)}s`);
    assert.ok(Math.abs(delay5km - 14.58) < 0.1, `5km delay should be ~14.6s, got ${delay5km.toFixed(2)}s`);
  });

  it('attenuation increases with distance (inverse square in dB)', () => {
    const atten1km = -20 * Math.log10(1);   // -0 dB
    const atten5km = -20 * Math.log10(5);   // ~-14 dB
    const atten15km = -20 * Math.log10(15); // ~-23.5 dB
    assert.ok(Math.abs(atten1km) < 0.001, `1km attenuation should be ~0 dB, got ${atten1km}`);
    assert.ok(atten5km < -13 && atten5km > -15);
    assert.ok(atten15km < -23 && atten15km > -24);
  });

  it('thunderProb is 0 when no rain', () => {
    const result = compile({ precipitation: { likelihood: 0, type: null, intensity: 0 } });
    assert.strictEqual(result.controls.audio.thunderProb, 0);
  });

  it('thunderProb increases with heavy rain', () => {
    const light = compile({ precipitation: { likelihood: 50, type: 'rain', intensity: 2 } });
    const heavy = compile({ precipitation: { likelihood: 100, type: 'rain', intensity: 8 } });
    assert.ok(heavy.controls.audio.thunderProb > light.controls.audio.thunderProb);
  });
});

// ─── NYC vs Baton Rouge WorldState Comparison ─────────────────────
describe('Phase 1 — NYC vs Baton Rouge WorldState', () => {
  const nycLocale = LOCALES.nyc_city;
  const brLocale = LOCALES.baton_rouge_suburb;

  it('NYC has louder base noise floor', () => {
    const nyc = compile({}, nycLocale);
    const br = compile({}, brLocale);
    assert.ok(nyc.controls.audio.baseNoiseFloorDb > br.controls.audio.baseNoiseFloorDb);
  });

  it('NYC has higher activity level during daytime', () => {
    const nyc = compile({}, nycLocale);
    const br = compile({}, brLocale);
    assert.ok(nyc.controls.audio.activityLevel > br.controls.audio.activityLevel);
  });

  it('NYC has more haze', () => {
    const nyc = compile({}, nycLocale);
    const br = compile({}, brLocale);
    assert.ok(nyc.controls.atmosphere.haze > br.controls.atmosphere.haze);
  });
});
