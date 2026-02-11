import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { dispatch, registerTransport, getTransport } from '../lib/dispatch.js';

const endpoints = {
  unreal: { transport: 'http', url: 'http://localhost:8080/remote/preset/WorldWeather' },
  dsp: { transport: 'osc', host: '127.0.0.1', port: 9000 },
  lighting: { transport: 'http', url: 'http://hue-bridge.local/api' }
};

describe('Endpoint Dispatcher', () => {
  describe('dispatch', () => {
    it('routes each endpoint to its configured transport', async () => {
      const calls = [];
      registerTransport('http', async (config, params) => {
        calls.push({ transport: 'http', url: config.url, params });
      });
      registerTransport('osc', async (config, params) => {
        calls.push({ transport: 'osc', host: config.host, port: config.port, params });
      });

      const payload = {
        unreal: { fogDensity: 0.003 },
        dsp: { '/buses/wind_bed/gain': -48 }
      };

      const results = await dispatch(payload, endpoints);

      assert.strictEqual(results.unreal.ok, true);
      assert.strictEqual(results.unreal.transport, 'http');
      assert.strictEqual(results.dsp.ok, true);
      assert.strictEqual(results.dsp.transport, 'osc');
      assert.strictEqual(calls.length, 2);

      const httpCall = calls.find(c => c.transport === 'http');
      assert.deepStrictEqual(httpCall.params, { fogDensity: 0.003 });
      assert.strictEqual(httpCall.url, 'http://localhost:8080/remote/preset/WorldWeather');

      const oscCall = calls.find(c => c.transport === 'osc');
      assert.deepStrictEqual(oscCall.params, { '/buses/wind_bed/gain': -48 });
    });

    it('returns error for unknown transport without blocking others', async () => {
      registerTransport('http', async () => {});

      const badEndpoints = {
        good: { transport: 'http', url: 'http://localhost' },
        bad: { transport: 'mqtt', host: 'localhost' }
      };

      const payload = {
        good: { brightness: 100 },
        bad: { temp: 22 }
      };

      const results = await dispatch(payload, badEndpoints);

      assert.strictEqual(results.good.ok, true);
      assert.strictEqual(results.bad.ok, false);
      assert.ok(results.bad.error.includes('mqtt'));
    });

    it('returns error when endpoint config is missing', async () => {
      const payload = { nonexistent: { value: 1 } };
      const results = await dispatch(payload, {});

      assert.strictEqual(results.nonexistent.ok, false);
      assert.ok(results.nonexistent.error.includes('nonexistent'));
    });

    it('catches transport errors and reports per endpoint', async () => {
      registerTransport('http', async () => {
        throw new Error('connection refused');
      });

      const payload = { unreal: { fogDensity: 0.01 } };
      const results = await dispatch(payload, endpoints);

      assert.strictEqual(results.unreal.ok, false);
      assert.strictEqual(results.unreal.transport, 'http');
      assert.ok(results.unreal.error.includes('connection refused'));
    });

    it('returns empty result for empty payload', async () => {
      const results = await dispatch({}, endpoints);
      assert.deepStrictEqual(results, {});
    });

    it('includes params in result', async () => {
      registerTransport('http', async () => {});

      const params = { brightness: 200, colortemp: 350 };
      const results = await dispatch({ lighting: params }, endpoints);

      assert.deepStrictEqual(results.lighting.params, params);
    });
  });

  describe('registerTransport', () => {
    it('overrides a built-in transport', async () => {
      let customCalled = false;
      registerTransport('osc', async () => {
        customCalled = true;
      });

      await dispatch({ dsp: { gain: -12 } }, endpoints);
      assert.strictEqual(customCalled, true);
    });
  });

  describe('getTransport', () => {
    it('returns a registered transport', () => {
      const fn = async () => {};
      registerTransport('test-transport', fn);
      assert.strictEqual(getTransport('test-transport'), fn);
    });

    it('returns undefined for unregistered transport', () => {
      assert.strictEqual(getTransport('nonexistent-transport'), undefined);
    });
  });
});
