/**
 * Runtime Engine
 * Core simulation engine: world time progression, timeline caching,
 * state smoothing, publish tick, and optional route evaluation.
 */

import fs from 'fs';
import { getWeatherTimeline } from './weatherTimeline.js';
import { compileWorldState } from './worldStateCompiler.js';
import { LOCALES, DEFAULT_LOCALE } from './localePresets.js';
import { evaluateRoutes, validateConfig } from './environmentRouter.js';
import { dispatch } from './dispatch.js';
import { createRateLimiter } from './rateLimiter.js';
import { createStateLog } from './stateLog.js';
import { geocode } from './openmeteo.js';
import { localToUtc } from './timezone.js';
import { lerp, lerpAngle } from './math.js';
import { setGeoreference, estimateHeight } from './cesiumGeoreference.js';
import { importLandscape, importVectors, slugify } from './landscapeImport.js';
import { setTilesetUrl, googleTilesUrl, getTilesetStatus } from './cesiumTileset.js';

/**
 * Ease between two world states (no snapping)
 * Smoothly interpolates all numeric control values
 */
export function easeWorldState(current, target, rate) {
  if (!current) return target;

  return {
    ...target,
    controls: {
      lighting: {
        exteriorLuminance: lerp(current.controls.lighting.exteriorLuminance, target.controls.lighting.exteriorLuminance, rate),
        colorTempK: lerp(current.controls.lighting.colorTempK, target.controls.lighting.colorTempK, rate),
        contrast: lerp(current.controls.lighting.contrast, target.controls.lighting.contrast, rate)
      },
      audio: {
        baseNoiseFloorDb: lerp(current.controls.audio.baseNoiseFloorDb, target.controls.audio.baseNoiseFloorDb, rate),
        windLevel: lerp(current.controls.audio.windLevel, target.controls.audio.windLevel, rate),
        rainLevel: lerp(current.controls.audio.rainLevel, target.controls.audio.rainLevel, rate),
        snowLevel: lerp(current.controls.audio.snowLevel, target.controls.audio.snowLevel, rate),
        gustiness: lerp(current.controls.audio.gustiness, target.controls.audio.gustiness, rate),
        thunderProb: lerp(current.controls.audio.thunderProb, target.controls.audio.thunderProb, rate),
        activityLevel: lerp(current.controls.audio.activityLevel, target.controls.audio.activityLevel, rate),
        timeOfDayPhase: lerp(current.controls.audio.timeOfDayPhase, target.controls.audio.timeOfDayPhase, rate),
        windDirection: lerpAngle(current.controls.audio.windDirection, target.controls.audio.windDirection, rate)
      },
      atmosphere: {
        cloudDensity: lerp(current.controls.atmosphere.cloudDensity, target.controls.atmosphere.cloudDensity, rate),
        haze: lerp(current.controls.atmosphere.haze, target.controls.atmosphere.haze, rate),
        wetness: lerp(current.controls.atmosphere.wetness, target.controls.atmosphere.wetness, rate)
      },
      visual: {
        windDirection: lerpAngle(current.controls.visual.windDirection, target.controls.visual.windDirection, rate),
        sunAltitude: lerp(current.controls.visual.sunAltitude, target.controls.visual.sunAltitude, rate),
        sunAzimuth: lerpAngle(current.controls.visual.sunAzimuth, target.controls.visual.sunAzimuth, rate),
        precipDensity: lerp(current.controls.visual.precipDensity, target.controls.visual.precipDensity, rate),
        heatDistortion: lerp(current.controls.visual.heatDistortion, target.controls.visual.heatDistortion, rate)
      }
    }
  };
}

/**
 * Rolling log writer
 * Maintains a fixed-size log file for debugging
 */
class RollingLog {
  constructor(filepath, maxLines) {
    this.filepath = filepath;
    this.maxLines = maxLines;
    this.lines = [];
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filepath)) {
        const content = fs.readFileSync(this.filepath, 'utf8');
        this.lines = content.split('\n').filter(l => l.trim());
        if (this.lines.length > this.maxLines) {
          this.lines = this.lines.slice(-this.maxLines);
        }
      }
    } catch (e) {
      this.lines = [];
    }
  }

  write(entry) {
    const timestamp = new Date().toISOString();
    const line = `${timestamp} ${JSON.stringify(entry)}`;
    this.lines.push(line);
    if (this.lines.length > this.maxLines) {
      this.lines.shift();
    }
    fs.writeFileSync(this.filepath, this.lines.join('\n') + '\n');
  }
}

/**
 * Load routes config from a JSON file path
 * @param {string} configPath
 * @returns {Object} validated config
 */
function loadRoutesConfig(configPath) {
  const raw = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(raw);
  return validateConfig(config);
}

/**
 * Start the runtime engine
 *
 * Owns the tick loop internally. Returns a handle for querying state,
 * subscribing to publish events, and stopping the engine.
 *
 * @param {Object} options
 * @param {string} options.location - Location string (default: "Baton Rouge, LA")
 * @param {string} options.startLocalISO - Start time as ISO string or MM-DD-YYYY
 * @param {number} options.timescale - Sim speed multiplier (default: 1)
 * @param {number} options.tickMs - Tick interval in ms (default: 1000)
 * @param {number} options.publishEveryMs - Publish interval in ms (default: 5000)
 * @param {string} options.localePreset - Locale preset key (default: "baton_rouge_suburb")
 * @param {string} options.routesConfigPath - Path to routes JSON config (optional)
 * @returns {Promise<Object>} Engine handle
 */
export async function startEngine({
  location = 'Baton Rouge, LA',
  startLocalISO,
  timescale = 1,
  tickMs = 1000,
  publishEveryMs = 5000,
  localePreset,
  routesConfigPath,
  logDir = 'logs',
  useMock = false,
  provider = 'auto'
} = {}) {
  const localeKey = (localePreset && LOCALES[localePreset]) ? localePreset : DEFAULT_LOCALE;
  const locale = LOCALES[localeKey];
  const easeRate = 0.1;
  const ticksPerPublish = Math.max(1, Math.round(publishEveryMs / tickMs));
  const refreshInterval = 300;

  // Geocode to get timezone for correct date interpretation
  let geo = null;
  try {
    geo = await geocode(location);
  } catch (e) {
    console.warn(`[Engine] Geocode failed (${e.message}), using machine-local timezone`);
  }
  const timezone = geo?.timezone || null;

  // Parse start time using location's timezone
  let simTime;
  if (!startLocalISO) {
    simTime = new Date();
  } else if (startLocalISO instanceof Date) {
    simTime = startLocalISO;
  } else {
    const match = startLocalISO.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (match) {
      const [, month, day, year] = match;
      simTime = localToUtc(parseInt(year), parseInt(month), parseInt(day), 12, 0, timezone);
    } else {
      simTime = new Date(startLocalISO);
    }
  }

  // Load routes config if provided
  let routesConfig = null;
  if (routesConfigPath) {
    routesConfig = loadRoutesConfig(routesConfigPath);
  }

  // Rate limiter (only when routes are configured)
  let limiter = null;
  if (routesConfig) {
    limiter = createRateLimiter(routesConfig.routes);
  }

  // State logging
  const stateLog = createStateLog(logDir);

  // State
  let currentState = null;
  let targetState = null;
  let timeline = null;
  let tickCount = 0;
  let lastTickTime = Date.now();
  let lastPublishTime = Date.now();
  let intervalId = null;
  const listeners = [];

  // Logging
  const log = new RollingLog('tm-engine.log', 1000);

  // Timeline fetch
  async function refreshTimeline() {
    try {
      timeline = await getWeatherTimeline({
        location,
        centerDate: simTime,
        windowHours: 6,
        intervalMinutes: 15,
        useMock,
        geo,
        provider
      });
    } catch (e) {
      console.error(`[Engine] Failed to refresh timeline: ${e.message}`);
    }
  }

  function updateTargetState() {
    if (!timeline) return;
    targetState = compileWorldState({
      timeline,
      locale,
      now: simTime
    });
  }

  function getState() {
    const state = {
      ...currentState,
      engine: {
        simTime: simTime.toISOString(),
        location,
        timescale,
        tickCount,
        localePreset: localeKey,
        audioProfileId: locale.audioProfileId || null,
        georeference: geo ? { lat: geo.lat, lon: geo.lon } : null
      }
    };

    if (routesConfig) {
      state.routed = evaluateRoutes(state, routesConfig);
    }

    return state;
  }

  function logState() {
    log.write({
      simTime: simTime.toISOString(),
      states: currentState?.states,
      luminance: currentState?.controls?.lighting?.exteriorLuminance
    });
  }

  // Tick
  function tick() {
    const now = Date.now();
    const deltaMs = now - lastTickTime;
    lastTickTime = now;

    // Advance simulation time
    const simDeltaMs = deltaMs * timescale;
    simTime = new Date(simTime.getTime() + simDeltaMs);

    // Update target and ease
    updateTargetState();
    currentState = easeWorldState(currentState, targetState, easeRate);

    tickCount++;

    // Refresh timeline periodically
    if (tickCount % refreshInterval === 0) {
      refreshTimeline();
    }

    // Publish
    if (tickCount % ticksPerPublish === 0) {
      const now2 = Date.now();
      const dtSeconds = (now2 - lastPublishTime) / 1000;
      lastPublishTime = now2;

      const state = getState();
      logState();

      // Rate-limit routed values before dispatch
      let violations = [];
      if (limiter && state.routed) {
        const result = limiter.limit(state.routed, dtSeconds);
        state.routed = result.clamped;
        violations = result.violations;
      }

      if (violations.length > 0) {
        state.violations = violations;
      }

      // Dispatch to endpoints if routes are configured
      if (routesConfig && state.routed) {
        dispatch(state.routed, routesConfig.endpoints);
      }

      // Log to JSONL
      stateLog.append(state, violations);

      for (const fn of listeners) {
        try { fn(state); } catch (e) { /* listener error */ }
      }
    }
  }

  // Initialize
  await refreshTimeline();
  updateTargetState();
  currentState = targetState;

  // Set CesiumGeoreference if routes are configured and we have coordinates
  let georefResult = null;
  if (routesConfig && geo) {
    const unrealEndpoint = routesConfig.endpoints?.unreal;
    if (unrealEndpoint?.host) {
      const height = await estimateHeight(geo.lat, geo.lon);
      const geoResult = await setGeoreference(unrealEndpoint.host, geo.lat, geo.lon, height);
      georefResult = { lat: geo.lat, lon: geo.lon, height, ok: geoResult.ok, error: geoResult.error };
      if (geoResult.ok) {
        console.log(`[Engine] CesiumGeoreference → ${geo.lat.toFixed(4)}, ${geo.lon.toFixed(4)} @ ${height.toFixed(1)}m`);
      } else {
        console.warn(`[Engine] CesiumGeoreference skipped: ${geoResult.error}`);
      }
    }
  }

  // Import terrain if routes are configured and we have coordinates
  let terrainResult = null;
  if (routesConfig && geo) {
    const unrealEndpoint = routesConfig.endpoints?.unreal;
    if (unrealEndpoint?.host && unrealEndpoint?.daemonUrl) {
      try {
        terrainResult = await importLandscape({
          host: unrealEndpoint.host,
          daemonUrl: unrealEndpoint.daemonUrl,
          lat: geo.lat,
          lon: geo.lon,
          slug: slugify(location),
          location,
          radius: 500
        });
        if (terrainResult.ok) {
          console.log(`[Engine] Terrain imported for ${location}`);
        } else {
          console.warn(`[Engine] Terrain import skipped: ${terrainResult.error}`);
        }
      } catch (e) {
        console.warn(`[Engine] Terrain import failed: ${e.message}`);
      }
    }
  }

  // Import vector data (roads, water, landuse) if available
  let vectorResult = null;
  if (routesConfig && geo && terrainResult?.ok) {
    const unrealEndpoint = routesConfig.endpoints?.unreal;
    if (unrealEndpoint?.host && unrealEndpoint?.daemonUrl) {
      try {
        vectorResult = await importVectors({
          host: unrealEndpoint.host,
          daemonUrl: unrealEndpoint.daemonUrl,
          slug: slugify(location)
        });
        if (vectorResult.ok) {
          const parts = [];
          if (vectorResult.splines) parts.push(`${vectorResult.splines} road splines`);
          if (vectorResult.masks?.length) parts.push(`${vectorResult.masks.join(', ')} masks`);
          console.log(`[Engine] Vectors imported: ${parts.join(', ') || 'none'}`);
        } else {
          console.warn(`[Engine] Vector import skipped: ${vectorResult.error}`);
        }
      } catch (e) {
        console.warn(`[Engine] Vector import failed: ${e.message}`);
      }
    }
  }

  // Configure Cesium 3D Tileset if Google API key is set
  let tilesetResult = null;
  if (routesConfig && process.env.GOOGLE_3D_TILES_API_KEY) {
    const unrealEndpoint = routesConfig.endpoints?.unreal;
    if (unrealEndpoint?.host) {
      const url = googleTilesUrl(process.env.GOOGLE_3D_TILES_API_KEY);
      const result = await setTilesetUrl(unrealEndpoint.host, url);
      tilesetResult = { ok: result.ok, error: result.error };
      if (result.ok) {
        console.log('[Engine] Google 3D Tiles → streaming (scouting mode)');
      } else {
        console.warn(`[Engine] 3D Tileset skipped: ${result.error}`);
      }
    }
  }

  // Start tick loop
  intervalId = setInterval(tick, tickMs);

  // Return engine handle
  return {
    /** Get current world state (pull) */
    getState,

    /** Subscribe to publish events (push) */
    onPublish(fn) {
      listeners.push(fn);
      return () => {
        const idx = listeners.indexOf(fn);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },

    /** Current simulation time */
    get simTime() { return simTime; },

    /** Engine location */
    get location() { return location; },

    /** Time scale */
    get timescale() { return timescale; },

    /** Location timezone (IANA) */
    get timezone() { return timezone; },

    /** Geocode result {lat, lon, name, timezone} */
    get geo() { return geo; },

    /** Georeference result {lat, lon, height, ok, error} — null if not attempted */
    get georeference() { return georefResult; },

    /** Terrain import result {ok, landscape, error} — null if not attempted */
    get terrain() { return terrainResult; },

    /** Vector import result {ok, splines, masks, error} — null if not attempted */
    get vectors() { return vectorResult; },

    /** Tileset result {ok, error} — null if not attempted */
    get tileset() { return tilesetResult; },

    /** Tick count */
    get tickCount() { return tickCount; },

    /** Stop the engine */
    stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      stateLog.close();
    }
  };
}
