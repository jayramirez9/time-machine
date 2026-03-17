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

/**
 * Unreal Engine Remote Control API transport
 *
 * Sends routed params to Unreal via the Remote Control API (port 30010).
 * Each param key in the routes config maps to an entry in the endpoint's
 * "actors" lookup, which specifies the objectPath, propertyName, and
 * how to format the propertyValue.
 *
 * Config shape:
 *   {
 *     "transport": "unreal",
 *     "host": "http://localhost:30010",
 *     "actors": {
 *       "DirectionalLight.Elevation": {
 *         "objectPath": "/Temp/...:PersistentLevel.DirectionalLight_...",
 *         "type": "rotation",
 *         "component": "Pitch"
 *       },
 *       "ExponentialHeightFog.FogDensity": {
 *         "objectPath": "/Temp/...:PersistentLevel.ExponentialHeightFog_...",
 *         "type": "property",
 *         "propertyName": "FogDensity",
 *         "componentPath": "ExponentialHeightFogComponent0"
 *       }
 *     }
 *   }
 */
registerTransport('unreal', async (config, params) => {
  const host = config.host || 'http://localhost:30010';

  // Collect rotation components (Pitch/Yaw) into a single SetActorRotation call
  const rotationActors = {};

  const promises = Object.entries(params).map(async ([paramKey, value]) => {
    const actor = config.actors?.[paramKey];
    if (!actor) {
      // No actor mapping — skip silently
      return;
    }

    if (actor.type === 'rotation') {
      // Accumulate rotation components to batch into one call per actor
      const key = actor.objectPath;
      if (!rotationActors[key]) rotationActors[key] = { Pitch: 0, Yaw: 0, Roll: 0 };
      rotationActors[key][actor.component] = value;
      return;
    }

    if (actor.type === 'property') {
      // Direct property write on a component
      const objectPath = actor.componentPath
        ? `${actor.objectPath}.${actor.componentPath}`
        : actor.objectPath;

      const body = {
        objectPath,
        access: 'WRITE_ACCESS',
        propertyName: actor.propertyName,
        propertyValue: { [actor.propertyName]: value }
      };

      try {
        const res = await fetch(`${host}/remote/object/property`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          const text = await res.text();
          console.error(`[dispatch:unreal] property ${paramKey}: ${res.status} ${text}`);
        }
      } catch (e) {
        console.error(`[dispatch:unreal] property ${paramKey}: ${e.message}`);
      }
      return;
    }

    if (actor.type === 'material_scalar') {
      // Write a scalar parameter on a MaterialInstance
      // actor config: { objectPath, parameterName, expressionGUID }
      const body = {
        objectPath: actor.objectPath,
        access: 'WRITE_ACCESS',
        propertyName: 'ScalarParameterValues',
        propertyValue: {
          ScalarParameterValues: [
            {
              ParameterInfo: {
                Name: actor.parameterName,
                Association: 'Global Parameter',
                Index: -1
              },
              ParameterValue: value,
              ExpressionGUID: actor.expressionGUID || { A: 0, B: 0, C: 0, D: 0 }
            }
          ]
        }
      };

      try {
        const res = await fetch(`${host}/remote/object/property`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          const text = await res.text();
          console.error(`[dispatch:unreal] material_scalar ${paramKey}: ${res.status} ${text}`);
        }
      } catch (e) {
        console.error(`[dispatch:unreal] material_scalar ${paramKey}: ${e.message}`);
      }
      return;
    }

    if (actor.type === 'postprocess') {
      // Write a post-process setting on a PostProcessVolume
      // actor config: { objectPath, settingName, overrideName? }
      // Writes to the actor's Settings struct and enables the override flag
      const overrideName = actor.overrideName || `bOverride_${actor.settingName}`;
      const body = {
        objectPath: actor.objectPath,
        access: 'WRITE_ACCESS',
        propertyName: 'Settings',
        propertyValue: {
          Settings: {
            [overrideName]: true,
            [actor.settingName]: value
          }
        }
      };

      try {
        const res = await fetch(`${host}/remote/object/property`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          const text = await res.text();
          console.error(`[dispatch:unreal] postprocess ${paramKey}: ${res.status} ${text}`);
        }
      } catch (e) {
        console.error(`[dispatch:unreal] postprocess ${paramKey}: ${e.message}`);
      }
      return;
    }

    if (actor.type === 'niagara') {
      // Set a float variable on a NiagaraComponent via SetVariableFloat
      // actor config: { objectPath, componentName, variableName }
      const compPath = actor.componentName
        ? `${actor.objectPath}.${actor.componentName}`
        : `${actor.objectPath}.NiagaraComponent0`;

      const body = {
        objectPath: compPath,
        functionName: 'SetVariableFloat',
        parameters: {
          InVariableName: actor.variableName,
          InValue: value
        }
      };

      try {
        const res = await fetch(`${host}/remote/object/call`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          const text = await res.text();
          console.error(`[dispatch:unreal] niagara ${paramKey}: ${res.status} ${text}`);
        }
      } catch (e) {
        console.error(`[dispatch:unreal] niagara ${paramKey}: ${e.message}`);
      }
      return;
    }

    if (actor.type === 'landscape_scalar') {
      // Set a scalar parameter on a Landscape's dynamic material instance
      // actor config: { objectPath, parameterName }
      // Calls ALandscape::SetLandscapeMaterialScalarParameterValue
      const body = {
        objectPath: actor.objectPath,
        functionName: 'SetLandscapeMaterialScalarParameterValue',
        parameters: {
          ParameterName: actor.parameterName,
          Value: value
        }
      };

      try {
        const res = await fetch(`${host}/remote/object/call`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          const text = await res.text();
          console.error(`[dispatch:unreal] landscape_scalar ${paramKey}: ${res.status} ${text}`);
        }
      } catch (e) {
        console.error(`[dispatch:unreal] landscape_scalar ${paramKey}: ${e.message}`);
      }
      return;
    }

    if (actor.type === 'call') {
      // Function call on an actor
      const body = {
        objectPath: actor.objectPath,
        functionName: actor.functionName,
        parameters: typeof actor.formatParams === 'function'
          ? actor.formatParams(value)
          : { [actor.parameterName || 'Value']: value }
      };

      try {
        const res = await fetch(`${host}/remote/object/call`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          const text = await res.text();
          console.error(`[dispatch:unreal] call ${paramKey}: ${res.status} ${text}`);
        }
      } catch (e) {
        console.error(`[dispatch:unreal] call ${paramKey}: ${e.message}`);
      }
    }
  });

  await Promise.all(promises);

  // Dispatch accumulated rotation calls
  const rotationPromises = Object.entries(rotationActors).map(async ([objectPath, rotation]) => {
    // Unreal: Pitch = elevation (negative = pointing down), Yaw = azimuth
    const body = {
      objectPath,
      functionName: 'SetActorRotation',
      parameters: {
        NewRotation: {
          Pitch: -(rotation.Pitch || 0),   // negate: sun altitude → negative pitch
          Yaw: rotation.Yaw || 0,
          Roll: rotation.Roll || 0
        }
      }
    };

    try {
      const res = await fetch(`${host}/remote/object/call`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`[dispatch:unreal] rotation: ${res.status} ${text}`);
      }
    } catch (e) {
      console.error(`[dispatch:unreal] rotation: ${e.message}`);
    }
  });

  await Promise.all(rotationPromises);
});
