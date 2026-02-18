/**
 * Rate Limiter
 * Per-parameter change-rate clamping with optional EMA smoothing.
 * Sits between evaluateRoutes() and dispatch() to prevent hour-boundary pops.
 */

/**
 * Build a lookup of rate-limit configs keyed by "endpoint::param"
 * @param {Object[]} routes - routes array from config
 * @returns {Map<string, { maxDelta: number, ema?: number }>}
 */
function buildLimits(routes) {
  const limits = new Map();
  for (const route of routes) {
    if (!route.rateLimit) continue;
    const key = `${route.endpoint}::${route.param}`;
    limits.set(key, route.rateLimit);
  }
  return limits;
}

/**
 * Create a rate limiter from a routes config
 * @param {Object[]} routes - routes array (each may have optional rateLimit)
 * @returns {{ limit: Function }}
 */
export function createRateLimiter(routes) {
  const limits = buildLimits(routes);
  const prev = new Map();   // previous output values
  const ema = new Map();    // EMA state

  /**
   * Clamp routed values according to rate limits
   * @param {Object} routed - { endpoint: { param: value, ... }, ... }
   * @param {number} dtSeconds - time since last call (for future per-second scaling)
   * @returns {{ clamped: Object, violations: Array }}
   */
  function limit(routed, dtSeconds) {
    const clamped = {};
    const violations = [];

    for (const [endpoint, params] of Object.entries(routed)) {
      clamped[endpoint] = {};

      for (const [param, raw] of Object.entries(params)) {
        const key = `${endpoint}::${param}`;
        const cfg = limits.get(key);

        // No rate limit configured — passthrough
        if (!cfg || typeof raw !== 'number') {
          clamped[endpoint][param] = raw;
          prev.set(key, typeof raw === 'number' ? raw : prev.get(key));
          continue;
        }

        let value = raw;
        const prevVal = prev.get(key);

        // First value — seed and pass through
        if (prevVal === undefined) {
          prev.set(key, value);
          ema.set(key, value);
          clamped[endpoint][param] = value;
          continue;
        }

        // EMA smoothing (applied before clamping)
        if (cfg.ema != null && cfg.ema > 0 && cfg.ema < 1) {
          const emaVal = ema.get(key) ?? value;
          value = emaVal + cfg.ema * (value - emaVal);
          ema.set(key, value);
        }

        // Max-delta clamping (per tick, scaled by dt)
        if (cfg.maxDelta != null) {
          const maxDeltaThisTick = cfg.maxDelta * dtSeconds;
          const delta = value - prevVal;

          if (Math.abs(delta) > maxDeltaThisTick) {
            const clampedDelta = Math.sign(delta) * maxDeltaThisTick;
            const original = value;
            value = prevVal + clampedDelta;

            violations.push({
              endpoint,
              param,
              delta: Math.round(delta * 1000) / 1000,
              maxDelta: Math.round(maxDeltaThisTick * 1000) / 1000,
              clamped: Math.round(value * 1000) / 1000,
              wanted: Math.round(original * 1000) / 1000
            });
          }
        }

        prev.set(key, value);
        clamped[endpoint][param] = Math.round(value * 1000) / 1000;
      }
    }

    return { clamped, violations };
  }

  /**
   * Reset all state (for testing)
   */
  function reset() {
    prev.clear();
    ema.clear();
  }

  return { limit, reset };
}
