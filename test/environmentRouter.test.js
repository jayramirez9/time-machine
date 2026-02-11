import { describe, it } from 'node:test';
import assert from 'node:assert';
import { evaluateRoutes, validateConfig } from '../lib/environmentRouter.js';

// Minimal config factory
function createConfig(routes) {
  return {
    endpoints: {
      unreal: { transport: 'http', url: 'http://localhost:8080' },
      dsp: { transport: 'osc', host: '127.0.0.1', port: 9000 },
      lighting: { transport: 'http', url: 'http://hue-bridge.local' }
    },
    routes
  };
}

// Mock WorldState matching the real output shape
const mockWorldState = {
  timeUtc: '1978-07-04T15:00:00.000Z',
  timeLocal: '1978-07-04T15:00:00',
  states: {
    timeOfDay: 'day',
    sky: 'scattered',
    precip: 'none',
    wind: 'light',
    comfort: 'warm'
  },
  controls: {
    lighting: {
      exteriorLuminance: 0.8,
      colorTempK: 5500,
      contrast: 0.65
    },
    audio: {
      baseNoiseFloorDb: 28,
      windLevel: 0.2,
      rainLevel: 0
    },
    atmosphere: {
      haze: 0.08,
      wetness: 0
    },
    visual: {
      windDirection: 180,
      sunAltitude: 60,
      sunAzimuth: 200,
      precipDensity: 0,
      heatDistortion: 0.3
    }
  },
  metadata: {
    provider: 'mock',
    dataset: 'generated',
    resolutionMinutes: 60,
    confidence: 0.7
  }
};

describe('Environment Router', () => {
  describe('dot-path resolution', () => {
    it('resolves nested fields', () => {
      const config = createConfig([{
        source: 'controls.lighting.colorTempK',
        endpoint: 'lighting',
        param: 'colortemp',
        transform: { type: 'passthrough' }
      }]);
      const result = evaluateRoutes(mockWorldState, config);
      assert.strictEqual(result.lighting.colortemp, 5500);
    });

    it('resolves top-level state fields', () => {
      const config = createConfig([{
        source: 'states.sky',
        endpoint: 'unreal',
        param: 'sky',
        transform: { type: 'passthrough' }
      }]);
      const result = evaluateRoutes(mockWorldState, config);
      assert.strictEqual(result.unreal.sky, 'scattered');
    });

    it('skips routes with missing source fields', () => {
      const config = createConfig([{
        source: 'controls.nonexistent.field',
        endpoint: 'unreal',
        param: 'missing',
        transform: { type: 'passthrough' }
      }]);
      const result = evaluateRoutes(mockWorldState, config);
      assert.strictEqual(result.unreal, undefined);
    });
  });

  describe('scale transform', () => {
    it('remaps value from input range to output range', () => {
      const config = createConfig([{
        source: 'controls.lighting.colorTempK',
        endpoint: 'lighting',
        param: 'colortemp',
        transform: { type: 'scale', inputRange: [3200, 6500], outputRange: [153, 500] }
      }]);
      const result = evaluateRoutes(mockWorldState, config);
      // 5500 is (5500-3200)/(6500-3200) = 0.697 through the range
      // 153 + 0.697 * (500-153) = 153 + 241.8 = 394.8 ≈ 394.848
      assert.ok(result.lighting.colortemp > 390 && result.lighting.colortemp < 400);
    });

    it('clamps by default when value exceeds input range', () => {
      const config = createConfig([{
        source: 'controls.lighting.exteriorLuminance',
        endpoint: 'lighting',
        param: 'brightness',
        transform: { type: 'scale', inputRange: [0, 0.5], outputRange: [0, 254] }
      }]);
      // luminance is 0.8, exceeds inputRange max of 0.5
      const result = evaluateRoutes(mockWorldState, config);
      assert.strictEqual(result.lighting.brightness, 254);
    });

    it('does not clamp when clamp is false', () => {
      const config = createConfig([{
        source: 'controls.lighting.exteriorLuminance',
        endpoint: 'lighting',
        param: 'brightness',
        transform: { type: 'scale', inputRange: [0, 0.5], outputRange: [0, 254], clamp: false }
      }]);
      const result = evaluateRoutes(mockWorldState, config);
      assert.ok(result.lighting.brightness > 254);
    });

    it('handles 0 input correctly', () => {
      const config = createConfig([{
        source: 'controls.audio.rainLevel',
        endpoint: 'dsp',
        param: 'rain',
        transform: { type: 'scale', inputRange: [0, 1], outputRange: [-60, 0] }
      }]);
      const result = evaluateRoutes(mockWorldState, config);
      assert.strictEqual(result.dsp.rain, -60);
    });
  });

  describe('map transform', () => {
    it('maps categorical value to number', () => {
      const config = createConfig([{
        source: 'states.sky',
        endpoint: 'unreal',
        param: 'skyPreset',
        transform: { type: 'map', values: { clear: 0, few: 1, scattered: 2, broken: 3, overcast: 4 } }
      }]);
      const result = evaluateRoutes(mockWorldState, config);
      assert.strictEqual(result.unreal.skyPreset, 2);
    });

    it('returns default when value not in map', () => {
      const config = createConfig([{
        source: 'states.comfort',
        endpoint: 'unreal',
        param: 'comfortIdx',
        transform: { type: 'map', values: { freezing: 0, cold: 1 }, default: -1 }
      }]);
      // comfort is 'warm', not in the map
      const result = evaluateRoutes(mockWorldState, config);
      assert.strictEqual(result.unreal.comfortIdx, -1);
    });

    it('skips route when value not in map and no default', () => {
      const config = createConfig([{
        source: 'states.comfort',
        endpoint: 'unreal',
        param: 'comfortIdx',
        transform: { type: 'map', values: { freezing: 0, cold: 1 } }
      }]);
      const result = evaluateRoutes(mockWorldState, config);
      assert.strictEqual(result.unreal, undefined);
    });

    it('maps to 0 correctly (falsy but valid)', () => {
      const config = createConfig([{
        source: 'states.precip',
        endpoint: 'unreal',
        param: 'precipIdx',
        transform: { type: 'map', values: { none: 0, light_rain: 1, rain: 2 } }
      }]);
      const result = evaluateRoutes(mockWorldState, config);
      assert.strictEqual(result.unreal.precipIdx, 0);
    });
  });

  describe('curve transform', () => {
    it('applies gamma curve', () => {
      const config = createConfig([{
        source: 'controls.atmosphere.haze',
        endpoint: 'unreal',
        param: 'fogDensity',
        transform: { type: 'curve', gamma: 2.0, outputRange: [0, 0.05] }
      }]);
      // haze is 0.08, gamma 2 → 0.08^2 = 0.0064, * 0.05 = 0.00032
      const result = evaluateRoutes(mockWorldState, config);
      assert.ok(result.unreal.fogDensity < 0.001);
    });

    it('gamma 1.0 is equivalent to linear scale', () => {
      const config = createConfig([{
        source: 'controls.lighting.exteriorLuminance',
        endpoint: 'unreal',
        param: 'brightness',
        transform: { type: 'curve', gamma: 1.0, outputRange: [0, 100] }
      }]);
      const result = evaluateRoutes(mockWorldState, config);
      assert.strictEqual(result.unreal.brightness, 80);
    });
  });

  describe('threshold transform', () => {
    it('returns onValue when above threshold', () => {
      const config = createConfig([{
        source: 'controls.visual.heatDistortion',
        endpoint: 'unreal',
        param: 'heatHaze',
        transform: { type: 'threshold', threshold: 0.1, onValue: 1, offValue: 0 }
      }]);
      // heatDistortion is 0.3
      const result = evaluateRoutes(mockWorldState, config);
      assert.strictEqual(result.unreal.heatHaze, 1);
    });

    it('returns offValue when below threshold', () => {
      const config = createConfig([{
        source: 'controls.atmosphere.wetness',
        endpoint: 'unreal',
        param: 'puddlesEnabled',
        transform: { type: 'threshold', threshold: 0.1, onValue: 1, offValue: 0 }
      }]);
      // wetness is 0
      const result = evaluateRoutes(mockWorldState, config);
      assert.strictEqual(result.unreal.puddlesEnabled, 0);
    });

    it('returns onValue when exactly at threshold', () => {
      const config = createConfig([{
        source: 'controls.audio.windLevel',
        endpoint: 'dsp',
        param: 'windEnabled',
        transform: { type: 'threshold', threshold: 0.2, onValue: true, offValue: false }
      }]);
      // windLevel is 0.2
      const result = evaluateRoutes(mockWorldState, config);
      assert.strictEqual(result.dsp.windEnabled, true);
    });
  });

  describe('passthrough transform', () => {
    it('returns raw value unchanged', () => {
      const config = createConfig([{
        source: 'controls.visual.sunAltitude',
        endpoint: 'unreal',
        param: 'sunElevation',
        transform: { type: 'passthrough' }
      }]);
      const result = evaluateRoutes(mockWorldState, config);
      assert.strictEqual(result.unreal.sunElevation, 60);
    });

    it('works with no transform specified', () => {
      const config = createConfig([{
        source: 'controls.visual.sunAzimuth',
        endpoint: 'unreal',
        param: 'sunAzimuth'
      }]);
      const result = evaluateRoutes(mockWorldState, config);
      assert.strictEqual(result.unreal.sunAzimuth, 200);
    });
  });

  describe('multi-endpoint grouping', () => {
    it('groups params by endpoint', () => {
      const config = createConfig([
        {
          source: 'controls.lighting.exteriorLuminance',
          endpoint: 'lighting',
          param: 'brightness',
          transform: { type: 'scale', inputRange: [0, 1], outputRange: [0, 254] }
        },
        {
          source: 'controls.lighting.colorTempK',
          endpoint: 'lighting',
          param: 'colortemp',
          transform: { type: 'passthrough' }
        },
        {
          source: 'controls.audio.windLevel',
          endpoint: 'dsp',
          param: 'windGain',
          transform: { type: 'scale', inputRange: [0, 1], outputRange: [-60, 0] }
        },
        {
          source: 'controls.atmosphere.haze',
          endpoint: 'unreal',
          param: 'fogDensity',
          transform: { type: 'passthrough' }
        }
      ]);

      const result = evaluateRoutes(mockWorldState, config);

      assert.ok(result.lighting);
      assert.ok(result.dsp);
      assert.ok(result.unreal);
      assert.strictEqual(Object.keys(result.lighting).length, 2);
      assert.strictEqual(Object.keys(result.dsp).length, 1);
      assert.strictEqual(Object.keys(result.unreal).length, 1);
    });
  });

  describe('validateConfig', () => {
    it('accepts a valid config', () => {
      const config = createConfig([{
        source: 'controls.lighting.exteriorLuminance',
        endpoint: 'lighting',
        param: 'brightness'
      }]);
      assert.doesNotThrow(() => validateConfig(config));
    });

    it('rejects missing endpoints', () => {
      assert.throws(() => validateConfig({ routes: [] }), /endpoints/);
    });

    it('rejects missing routes', () => {
      assert.throws(() => validateConfig({ endpoints: {} }), /routes/);
    });

    it('rejects route with missing source', () => {
      const config = createConfig([{ endpoint: 'lighting', param: 'x' }]);
      assert.throws(() => validateConfig(config), /source/);
    });

    it('rejects route with missing endpoint', () => {
      const config = createConfig([{ source: 'controls.lighting.contrast', param: 'x' }]);
      assert.throws(() => validateConfig(config), /endpoint/);
    });

    it('rejects route with missing param', () => {
      const config = createConfig([{ source: 'controls.lighting.contrast', endpoint: 'lighting' }]);
      assert.throws(() => validateConfig(config), /param/);
    });

    it('rejects route referencing undefined endpoint', () => {
      const config = createConfig([{ source: 'controls.lighting.contrast', endpoint: 'dmx', param: 'ch1' }]);
      assert.throws(() => validateConfig(config), /dmx.*not defined/);
    });
  });
});
