import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createRateLimiter } from '../lib/rateLimiter.js';

describe('Rate Limiter', () => {
  describe('passthrough', () => {
    it('passes values through when no rateLimit is configured', () => {
      const limiter = createRateLimiter([
        { endpoint: 'dsp', param: '/gain', source: 'x' }
      ]);

      const { clamped, violations } = limiter.limit(
        { dsp: { '/gain': -20 } }, 5
      );

      assert.strictEqual(clamped.dsp['/gain'], -20);
      assert.strictEqual(violations.length, 0);
    });

    it('passes non-numeric values through unchanged', () => {
      const limiter = createRateLimiter([
        { endpoint: 'unreal', param: 'preset', source: 'x',
          rateLimit: { maxDelta: 1 } }
      ]);

      const { clamped } = limiter.limit(
        { unreal: { preset: 'overcast' } }, 5
      );

      assert.strictEqual(clamped.unreal.preset, 'overcast');
    });
  });

  describe('maxDelta clamping', () => {
    it('clamps large jumps to maxDelta * dt', () => {
      const limiter = createRateLimiter([
        { endpoint: 'lighting', param: 'brightness', source: 'x',
          rateLimit: { maxDelta: 10 } }
      ]);

      // Seed
      limiter.limit({ lighting: { brightness: 100 } }, 1);

      // Jump to 200 — delta 100, max allowed 10*5=50
      const { clamped, violations } = limiter.limit(
        { lighting: { brightness: 200 } }, 5
      );

      assert.strictEqual(clamped.lighting.brightness, 150);
      assert.strictEqual(violations.length, 1);
      assert.strictEqual(violations[0].endpoint, 'lighting');
      assert.strictEqual(violations[0].param, 'brightness');
      assert.strictEqual(violations[0].delta, 100);
      assert.strictEqual(violations[0].maxDelta, 50);
    });

    it('allows changes within maxDelta', () => {
      const limiter = createRateLimiter([
        { endpoint: 'dsp', param: '/gain', source: 'x',
          rateLimit: { maxDelta: 20 } }
      ]);

      limiter.limit({ dsp: { '/gain': -40 } }, 1);

      const { clamped, violations } = limiter.limit(
        { dsp: { '/gain': -30 } }, 1
      );

      assert.strictEqual(clamped.dsp['/gain'], -30);
      assert.strictEqual(violations.length, 0);
    });

    it('clamps negative jumps', () => {
      const limiter = createRateLimiter([
        { endpoint: 'dsp', param: '/gain', source: 'x',
          rateLimit: { maxDelta: 5 } }
      ]);

      limiter.limit({ dsp: { '/gain': 0 } }, 1);

      const { clamped, violations } = limiter.limit(
        { dsp: { '/gain': -60 } }, 1
      );

      assert.strictEqual(clamped.dsp['/gain'], -5);
      assert.strictEqual(violations.length, 1);
    });
  });

  describe('EMA smoothing', () => {
    it('smooths values with EMA before clamping', () => {
      const limiter = createRateLimiter([
        { endpoint: 'unreal', param: 'fog', source: 'x',
          rateLimit: { ema: 0.3, maxDelta: 100 } }
      ]);

      // Seed at 0
      limiter.limit({ unreal: { fog: 0 } }, 1);

      // Jump to 1 — EMA: 0 + 0.3*(1-0) = 0.3
      const r1 = limiter.limit({ unreal: { fog: 1 } }, 1);
      assert.strictEqual(r1.clamped.unreal.fog, 0.3);

      // Stay at 1 — EMA: 0.3 + 0.3*(1-0.3) = 0.51
      const r2 = limiter.limit({ unreal: { fog: 1 } }, 1);
      assert.strictEqual(r2.clamped.unreal.fog, 0.51);
    });
  });

  describe('multiple endpoints', () => {
    it('tracks each endpoint+param independently', () => {
      const limiter = createRateLimiter([
        { endpoint: 'dsp', param: '/wind', source: 'x',
          rateLimit: { maxDelta: 5 } },
        { endpoint: 'dsp', param: '/rain', source: 'y',
          rateLimit: { maxDelta: 10 } }
      ]);

      limiter.limit({ dsp: { '/wind': 0, '/rain': 0 } }, 1);

      const { clamped } = limiter.limit(
        { dsp: { '/wind': 20, '/rain': 20 } }, 1
      );

      assert.strictEqual(clamped.dsp['/wind'], 5);
      assert.strictEqual(clamped.dsp['/rain'], 10);
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      const limiter = createRateLimiter([
        { endpoint: 'a', param: 'x', source: 's',
          rateLimit: { maxDelta: 1 } }
      ]);

      limiter.limit({ a: { x: 100 } }, 1);
      limiter.reset();

      // After reset, next value is treated as seed — no violation
      const { violations } = limiter.limit({ a: { x: 0 } }, 1);
      assert.strictEqual(violations.length, 0);
    });
  });
});
