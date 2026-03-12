import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import { validateConfig, evaluateRoutes } from '../lib/environmentRouter.js';
import { compileWorldState } from '../lib/worldStateCompiler.js';
import { getMockWeather } from '../lib/weather.js';

/**
 * Route Config Deep Validation
 * Validates the production routes.json against the actual WorldState shape.
 */

describe('Production Route Config Validation', () => {
  let config;

  // Load production routes.json
  try {
    config = JSON.parse(fs.readFileSync('routes.json', 'utf8'));
  } catch {
    // If routes.json doesn't exist, skip these tests gracefully
    config = null;
  }

  it('routes.json exists and is valid JSON', () => {
    assert.ok(config !== null, 'routes.json not found or invalid');
  });

  it('passes validateConfig()', () => {
    if (!config) return;
    // validateConfig throws on invalid config
    assert.doesNotThrow(() => validateConfig(config));
  });

  it('all route sources resolve against a mock WorldState', () => {
    if (!config) return;
    const date = new Date('1978-07-04T20:00:00Z');
    const weather = getMockWeather({ location: 'Baton Rouge, LA', date });
    const state = compileWorldState({
      timeline: [weather],
      locale: { audioBaseDb: 24, activity: 0.15, hazeBias: 0.03 },
      now: date
    });

    for (let i = 0; i < config.routes.length; i++) {
      const route = config.routes[i];
      const value = resolvePath(state, route.source);
      assert.ok(value !== undefined,
        `Route ${i} source "${route.source}" does not resolve in WorldState`);
      assert.ok(typeof value === 'number' || typeof value === 'string',
        `Route ${i} source "${route.source}" resolved to ${typeof value}, expected number or string`);
    }
  });

  it('all route endpoints reference defined endpoints', () => {
    if (!config) return;
    for (let i = 0; i < config.routes.length; i++) {
      const route = config.routes[i];
      assert.ok(config.endpoints[route.endpoint],
        `Route ${i} references undefined endpoint "${route.endpoint}"`);
    }
  });

  it('all rate limits have valid parameters', () => {
    if (!config) return;
    for (let i = 0; i < config.routes.length; i++) {
      const route = config.routes[i];
      if (route.rateLimit) {
        if (route.rateLimit.maxDelta !== undefined) {
          assert.ok(typeof route.rateLimit.maxDelta === 'number' && route.rateLimit.maxDelta > 0,
            `Route ${i} rateLimit.maxDelta must be a positive number, got ${route.rateLimit.maxDelta}`);
        }
        if (route.rateLimit.ema !== undefined) {
          assert.ok(typeof route.rateLimit.ema === 'number' && route.rateLimit.ema > 0 && route.rateLimit.ema <= 1,
            `Route ${i} rateLimit.ema must be in (0, 1], got ${route.rateLimit.ema}`);
        }
      }
    }
  });

  it('evaluateRoutes produces numeric output for all routes', () => {
    if (!config) return;
    const date = new Date('1978-07-04T20:00:00Z');
    const weather = getMockWeather({ location: 'Baton Rouge, LA', date });
    const state = compileWorldState({
      timeline: [weather],
      locale: { audioBaseDb: 24, activity: 0.15, hazeBias: 0.03 },
      now: date
    });

    const routed = evaluateRoutes(state, config);
    for (const [endpoint, params] of Object.entries(routed)) {
      for (const [param, value] of Object.entries(params)) {
        assert.ok(typeof value === 'number',
          `evaluateRoutes: ${endpoint}.${param} = ${value} (${typeof value}), expected number`);
        assert.ok(Number.isFinite(value),
          `evaluateRoutes: ${endpoint}.${param} = ${value} is not finite`);
      }
    }
  });

  it('all transforms produce values in expected ranges', () => {
    if (!config) return;
    const date = new Date('1978-07-04T20:00:00Z');
    const weather = getMockWeather({ location: 'Baton Rouge, LA', date });
    const state = compileWorldState({
      timeline: [weather],
      locale: { audioBaseDb: 24, activity: 0.15, hazeBias: 0.03 },
      now: date
    });

    const routed = evaluateRoutes(state, config);

    for (const route of config.routes) {
      const value = routed[route.endpoint]?.[route.param];
      if (value === undefined) continue;

      // For scale transforms, output should be within outputRange
      if (route.transform?.type === 'scale' && route.transform.outputRange) {
        const [outMin, outMax] = route.transform.outputRange;
        assert.ok(value >= outMin && value <= outMax,
          `Route ${route.param}: ${value} outside outputRange [${outMin}, ${outMax}]`);
      }
    }
  });
});

/**
 * Resolve a dot-path on an object
 */
function resolvePath(obj, path) {
  let current = obj;
  for (const key of path.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}
