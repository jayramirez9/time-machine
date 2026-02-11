/**
 * Environment Router
 * Maps WorldState fields to downstream endpoint parameters via configurable transforms
 */

/**
 * Resolve a dot-path on an object (e.g., "controls.lighting.colorTempK")
 * @param {Object} obj
 * @param {string} path
 * @returns {*} resolved value or undefined
 */
function resolve(obj, path) {
  let current = obj;
  for (const key of path.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}

/**
 * Linear remap from one range to another with optional clamping
 */
function scale(value, inputRange, outputRange, clamp = true) {
  const [inMin, inMax] = inputRange;
  const [outMin, outMax] = outputRange;

  // Normalize to 0-1
  let t = (value - inMin) / (inMax - inMin);
  if (clamp) t = Math.max(0, Math.min(1, t));

  return outMin + t * (outMax - outMin);
}

/**
 * Apply a transform to a source value
 * @param {*} value - source value from WorldState
 * @param {Object} transform - transform descriptor
 * @returns {*} transformed value
 */
function applyTransform(value, transform) {
  if (!transform || transform.type === 'passthrough') {
    return value;
  }

  switch (transform.type) {
    case 'scale': {
      const input = transform.inputRange || [0, 1];
      const output = transform.outputRange || [0, 1];
      const clamp = transform.clamp !== false;
      return Math.round(scale(value, input, output, clamp) * 1000) / 1000;
    }

    case 'map': {
      const mapped = transform.values[value];
      return mapped !== undefined ? mapped : transform.default ?? null;
    }

    case 'curve': {
      const input = transform.inputRange || [0, 1];
      const output = transform.outputRange || [0, 1];
      const gamma = transform.gamma || 1;

      // Normalize to 0-1, apply gamma, then scale to output range
      let t = (value - input[0]) / (input[1] - input[0]);
      t = Math.max(0, Math.min(1, t));
      t = Math.pow(t, gamma);

      const result = output[0] + t * (output[1] - output[0]);
      return Math.round(result * 1000) / 1000;
    }

    case 'threshold': {
      const threshold = transform.threshold ?? 0.5;
      const onValue = transform.onValue ?? 1;
      const offValue = transform.offValue ?? 0;
      return value >= threshold ? onValue : offValue;
    }

    default:
      return value;
  }
}

/**
 * Evaluate all routes against a WorldState, producing endpoint-grouped output
 * @param {Object} worldState - WorldState object from compileWorldState or engine.getState()
 * @param {Object} config - routing config with endpoints and routes arrays
 * @returns {Object} { endpointName: { param: value, ... }, ... }
 */
export function evaluateRoutes(worldState, config) {
  const results = {};

  for (const route of config.routes) {
    const value = resolve(worldState, route.source);
    if (value === undefined) continue;

    const transformed = applyTransform(value, route.transform);
    if (transformed === null || transformed === undefined) continue;

    const endpoint = route.endpoint;
    if (!results[endpoint]) results[endpoint] = {};
    results[endpoint][route.param] = transformed;
  }

  return results;
}

/**
 * Load and validate a routing config
 * @param {Object} config - raw config object
 * @returns {Object} validated config
 * @throws {Error} on invalid config
 */
export function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('Config must be an object');
  }
  if (!config.endpoints || typeof config.endpoints !== 'object') {
    throw new Error('Config must have an endpoints object');
  }
  if (!Array.isArray(config.routes)) {
    throw new Error('Config must have a routes array');
  }

  for (let i = 0; i < config.routes.length; i++) {
    const route = config.routes[i];
    if (!route.source) throw new Error(`Route ${i}: missing source`);
    if (!route.endpoint) throw new Error(`Route ${i}: missing endpoint`);
    if (!route.param) throw new Error(`Route ${i}: missing param`);
    if (!config.endpoints[route.endpoint]) {
      throw new Error(`Route ${i}: endpoint "${route.endpoint}" not defined in endpoints`);
    }
  }

  return config;
}
