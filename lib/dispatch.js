/**
 * Endpoint Dispatcher
 * Plugin-model transport layer for sending routed WorldState to downstream endpoints
 */

const transports = new Map();

/**
 * Register a transport plugin
 * @param {string} name - Transport type name (e.g., "http", "osc")
 * @param {Function} fn - async (endpointConfig, params) => void
 */
export function registerTransport(name, fn) {
  transports.set(name, fn);
}

/**
 * Get a registered transport by name
 * @param {string} name
 * @returns {Function|undefined}
 */
export function getTransport(name) {
  return transports.get(name);
}

/**
 * Dispatch routed payloads to their configured endpoints
 * Each endpoint dispatches independently — one failure doesn't block others.
 *
 * @param {Object} payloadByEndpoint - { endpointName: { param: value, ... }, ... }
 * @param {Object} endpoints - { endpointName: { transport: string, ...config }, ... }
 * @returns {Promise<Object>} { endpointName: { ok, transport, params, error? }, ... }
 */
export async function dispatch(payloadByEndpoint, endpoints) {
  const results = {};

  const promises = Object.entries(payloadByEndpoint).map(async ([name, params]) => {
    const config = endpoints[name];

    if (!config) {
      results[name] = { ok: false, transport: null, params, error: `No endpoint config for "${name}"` };
      return;
    }

    const transportName = config.transport;
    const transportFn = transports.get(transportName);

    if (!transportFn) {
      results[name] = { ok: false, transport: transportName, params, error: `Unknown transport "${transportName}"` };
      return;
    }

    try {
      await transportFn(config, params);
      results[name] = { ok: true, transport: transportName, params };
    } catch (e) {
      results[name] = { ok: false, transport: transportName, params, error: e.message };
    }
  });

  await Promise.all(promises);
  return results;
}

// Built-in stubbed transports

registerTransport('http', async (config, params) => {
  console.log(`[dispatch:http] POST ${config.url} ${JSON.stringify(params)}`);
});

registerTransport('osc', async (config, params) => {
  console.log(`[dispatch:osc] ${config.host}:${config.port} ${JSON.stringify(params)}`);
});

registerTransport('log', async (config, params) => {
  console.log(`[dispatch:log] ${JSON.stringify(params)}`);
});
