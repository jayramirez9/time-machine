/**
 * Particle Placement — atmospheric particle and lighting effect placement
 *
 * Places chimney smoke, street dust, lamp glow, rain splashes, and window
 * lights across a scene using building, street, and lamp data. Follows the
 * same seeded-PRNG + dedup patterns as propPlacement.js.
 *
 * Placement types:
 * - chimney_smoke: Niagara at building rooftops, wind-responsive, fuel-driven
 * - street_dust: Niagara at ground level along roads, dry + windy conditions
 * - lamp_glow: Niagara at TM_Lamp_ positions, dusk/night only
 * - rain_splash: Niagara at ground level, dense scatter along roads
 * - window_glow: PointLight per window, seeded occupancy, era-appropriate color
 */

import { seededRandom } from './math.js';
import { findIntersections } from './streetLayout.js';
import { getParticlesForYear } from './particleCatalog.js';
import { getHeatingFuel, getPrimaryLighting } from './agents/materialsInfraAgent.js';
import {
  scriptHeader, scriptClear, scriptCounterStart, scriptCounterEnd,
  scriptNiagaraItem, scriptPointLightItem, joinScript,
} from './spawnScript.js';

// ─── Constants ─────────────────────────────────────────────────

export const PARTICLE_PREFIX = 'TM_Particle';
const DEDUP_RADIUS_CM = 200;       // 2m dedup radius for same-type particles

// Window glow colors by lighting era
const WINDOW_COLOR_GAS = { R: 255, G: 170, B: 80 };    // 2200K warm gas
const WINDOW_COLOR_ELECTRIC = { R: 255, G: 220, B: 170 }; // 3200K electric
const WINDOW_INTENSITY_GAS = 400;
const WINDOW_INTENSITY_ELECTRIC = 600;
const WINDOW_ATTENUATION = 500; // 5m radius

// ─── Chimney Smoke ─────────────────────────────────────────────

/**
 * Place chimney smoke above building rooftops.
 *
 * @param {object[]} buildings - Building spawn data with location, scale, stories, styleName
 * @param {object} opts
 * @param {number} opts.year - Target year
 * @param {number} [opts.density=0.5] - Density multiplier (0-1)
 * @returns {object[]} Particle spawn entries
 */
export function placeChimneySmoke(buildings, opts = {}) {
  const { year, density = 0.5 } = opts;
  if (year > 1970) return []; // No visible chimney smoke post-1970

  const fuel = getHeatingFuel(year);
  if (fuel.smokeDensity === 0) return [];

  const results = [];
  const densityThreshold = 0.7 * density;

  for (let i = 0; i < buildings.length; i++) {
    const bldg = buildings[i];
    const roll = seededRandom(i * 1000 + 1);
    if (roll > densityThreshold) continue;

    // Top of building: location[2] + scale[2] * 50 (half-height of scaled cube)
    const topZ = bldg.location[2] + bldg.scale[2] * 50;

    results.push({
      spawnType: 'niagara',
      label: `${PARTICLE_PREFIX}_chimney_smoke_${String(results.length + 1).padStart(4, '0')}`,
      location: [bldg.location[0], bldg.location[1], topZ + 50],
      rotation: [0, 0, 0],
      niagaraSystem: '/Game/TimeMachine/Particles/NS_ChimneySmoke',
      variables: {
        'SmokeColorR': fuel.smokeColor[0],
        'SmokeColorG': fuel.smokeColor[1],
        'SmokeColorB': fuel.smokeColor[2],
        'SmokeDensity': fuel.smokeDensity,
      },
      type: 'chimney_smoke',
    });
  }

  return results;
}

// ─── Street Dust ───────────────────────────────────────────────

/**
 * Place street dust along road splines at 80m intervals.
 *
 * @param {object[]} splines - Road spline data
 * @param {object} opts
 * @param {number} opts.year - Target year
 * @param {number} [opts.density=0.5] - Density multiplier
 * @returns {object[]} Particle spawn entries
 */
export function placeStreetDust(splines, opts = {}) {
  const { density = 0.5 } = opts;
  const spacingCm = 8000; // 80m
  const results = [];
  let globalIdx = 0;

  for (let si = 0; si < splines.length; si++) {
    const spline = splines[si];
    let accumulated = spacingCm * 0.4; // stagger start

    for (let i = 0; i < spline.points.length - 1; i++) {
      const a = spline.points[i];
      const b = spline.points[i + 1];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const segLen = Math.sqrt(dx * dx + dy * dy);

      if (segLen < 10) continue;

      const dirX = dx / segLen;
      const dirY = dy / segLen;

      while (accumulated < segLen) {
        const roll = seededRandom(si * 10000 + globalIdx * 7 + 2);
        globalIdx++;

        if (roll > density) {
          accumulated += spacingCm;
          continue;
        }

        const px = a[0] + dirX * accumulated;
        const py = a[1] + dirY * accumulated;

        results.push({
          spawnType: 'niagara',
          label: `${PARTICLE_PREFIX}_street_dust_${String(results.length + 1).padStart(4, '0')}`,
          location: [px, py, 5],
          rotation: [0, 0, 0],
          niagaraSystem: '/Game/TimeMachine/Particles/NS_StreetDust',
          variables: {},
          type: 'street_dust',
        });

        accumulated += spacingCm;
      }

      accumulated -= segLen;
    }
  }

  return results;
}

// ─── Lamp Glow ─────────────────────────────────────────────────

/**
 * Place particle effects at lamp positions.
 *
 * @param {object[]} lampPositions - Array of { label, location: [x,y,z] }
 * @param {object} opts
 * @param {number} opts.year - Target year
 * @returns {object[]} Particle spawn entries
 */
export function placeLampGlow(lampPositions, opts = {}) {
  const { year } = opts;
  const lighting = getPrimaryLighting(year);

  // Gas era: warm amber glow; electric: whiter
  const glowColor = lighting.primary === 'gas' || lighting.primary === 'candle_oil'
    ? { R: 1.0, G: 0.65, B: 0.2 }
    : { R: 1.0, G: 0.9, B: 0.7 };

  return lampPositions.map((lamp, i) => ({
    spawnType: 'niagara',
    label: `${PARTICLE_PREFIX}_lamp_glow_${String(i + 1).padStart(4, '0')}`,
    location: [...lamp.location],
    rotation: [0, 0, 0],
    niagaraSystem: '/Game/TimeMachine/Particles/NS_LampGlow',
    variables: {
      'GlowR': glowColor.R,
      'GlowG': glowColor.G,
      'GlowB': glowColor.B,
    },
    type: 'lamp_glow',
  }));
}

// ─── Rain Splash ───────────────────────────────────────────────

/**
 * Place rain splash effects at dense intervals along roads and at intersections.
 *
 * @param {object[]} splines - Road spline data
 * @param {object[]} intersections - From findIntersections()
 * @param {object} opts
 * @param {number} opts.year - Target year
 * @param {number} [opts.density=0.5] - Density multiplier
 * @returns {object[]} Particle spawn entries
 */
export function placeRainSplash(splines, intersections, opts = {}) {
  const { density = 0.5 } = opts;
  const spacingCm = 1000; // 10m intervals
  const results = [];
  let globalIdx = 0;

  // Along roads
  for (let si = 0; si < splines.length; si++) {
    const spline = splines[si];
    // Only major roads for density control
    if (spline.category !== 'primary' && spline.category !== 'secondary') continue;

    let accumulated = spacingCm * 0.3;

    for (let i = 0; i < spline.points.length - 1; i++) {
      const a = spline.points[i];
      const b = spline.points[i + 1];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const segLen = Math.sqrt(dx * dx + dy * dy);

      if (segLen < 10) continue;

      const dirX = dx / segLen;
      const dirY = dy / segLen;

      while (accumulated < segLen) {
        const roll = seededRandom(si * 20000 + globalIdx * 13 + 3);
        globalIdx++;

        if (roll > density) {
          accumulated += spacingCm;
          continue;
        }

        const px = a[0] + dirX * accumulated;
        const py = a[1] + dirY * accumulated;

        results.push({
          spawnType: 'niagara',
          label: `${PARTICLE_PREFIX}_rain_splash_${String(results.length + 1).padStart(4, '0')}`,
          location: [px, py, 2],
          rotation: [0, 0, 0],
          niagaraSystem: '/Game/TimeMachine/Particles/NS_RainSplash',
          variables: {},
          type: 'rain_splash',
        });

        accumulated += spacingCm;
      }

      accumulated -= segLen;
    }
  }

  // At intersections
  for (let i = 0; i < intersections.length; i++) {
    const inter = intersections[i];
    results.push({
      spawnType: 'niagara',
      label: `${PARTICLE_PREFIX}_rain_splash_${String(results.length + 1).padStart(4, '0')}`,
      location: [inter.x, inter.y, 2],
      rotation: [0, 0, 0],
      niagaraSystem: '/Game/TimeMachine/Particles/NS_RainSplash',
      variables: {},
      type: 'rain_splash',
    });
  }

  return results;
}

// ─── Window Glow ───────────────────────────────────────────────

/**
 * Place window glow PointLights on building facades.
 * Seeded PRNG determines per-window occupancy (40-60%).
 *
 * @param {object[]} buildings - Building spawn data with location, scale, stories
 * @param {object} opts
 * @param {number} opts.year - Target year
 * @param {number} [opts.density=0.5] - Density multiplier
 * @returns {object[]} PointLight spawn entries
 */
export function placeWindowGlow(buildings, opts = {}) {
  const { year, density = 0.5 } = opts;
  const lighting = getPrimaryLighting(year);
  const isGasEra = lighting.primary === 'gas' || lighting.primary === 'candle_oil';
  const color = isGasEra ? WINDOW_COLOR_GAS : WINDOW_COLOR_ELECTRIC;
  const intensity = isGasEra ? WINDOW_INTENSITY_GAS : WINDOW_INTENSITY_ELECTRIC;

  const results = [];
  const floorHeightCm = 350;
  const windowSpacingCm = 250;
  // Occupancy: 40-60% range, modulated by density
  const baseOccupancy = 0.4 + (density * 0.2);

  for (let bi = 0; bi < buildings.length; bi++) {
    const bldg = buildings[bi];
    const stories = bldg.stories || 3;
    const scaleX = bldg.scale[0] * 100; // UE scale to cm (approximate facade width)

    // Number of windows across each face
    const windowsPerFace = Math.max(1, Math.floor(scaleX / windowSpacingCm));

    for (let floor = 0; floor < stories; floor++) {
      const floorZ = bldg.location[2] - (bldg.scale[2] * 50) + (floor * floorHeightCm) + 175;

      for (let w = 0; w < windowsPerFace; w++) {
        // Seeded occupancy check
        const seed = bi * 100000 + floor * 1000 + w;
        const roll = seededRandom(seed);
        if (roll > baseOccupancy) continue;

        // Window position along facade front
        const offsetX = ((w + 0.5) / windowsPerFace - 0.5) * scaleX;

        results.push({
          spawnType: 'pointlight',
          label: `${PARTICLE_PREFIX}_window_glow_${String(results.length + 1).padStart(4, '0')}`,
          location: [
            bldg.location[0] + offsetX,
            bldg.location[1] + (bldg.scale[1] * 50) + 10, // Just in front of facade
            floorZ,
          ],
          rotation: [0, 0, 0],
          color,
          intensity,
          attenuationRadius: WINDOW_ATTENUATION,
          type: 'window_glow',
        });
      }
    }
  }

  return results;
}

// ─── Orchestrator ──────────────────────────────────────────────

/**
 * Place all atmospheric particles and effects.
 *
 * @param {object} opts
 * @param {object[]} opts.buildings - Building spawn data
 * @param {object[]} opts.splines - Road spline data
 * @param {object[]} opts.lampPositions - Lamp positions from placeLamps()
 * @param {object[]} [opts.intersections] - Intersection data (computed if not provided)
 * @param {number} opts.year - Target year
 * @param {number} [opts.month=6] - Month (for seasonal effects)
 * @param {number} [opts.density=0.5] - Density multiplier
 * @param {string[]} [opts.only] - Only place these particle types
 * @param {string[]} [opts.exclude] - Exclude these particle types
 * @returns {object[]} Combined array with spawnType field ('niagara' or 'pointlight')
 */
export function placeAllParticles(opts = {}) {
  const {
    buildings = [],
    splines = [],
    lampPositions = [],
    intersections: providedIntersections,
    year,
    month = 6,
    density = 0.5,
    only,
    exclude,
  } = opts;

  if (!year) throw new Error('year is required for particle placement');

  // Determine which particle types are available for this year
  const available = getParticlesForYear(year);
  const availableTypes = new Set(available.map(p => p.type));

  // Apply only/exclude filters
  const shouldPlace = (type) => {
    if (!availableTypes.has(type)) return false;
    if (only && !only.includes(type)) return false;
    if (exclude && exclude.includes(type)) return false;
    return true;
  };

  const intersections = providedIntersections || findIntersections(splines);
  let all = [];

  if (shouldPlace('chimney_smoke')) {
    all = all.concat(placeChimneySmoke(buildings, { year, density }));
  }

  if (shouldPlace('street_dust')) {
    all = all.concat(placeStreetDust(splines, { year, density }));
  }

  if (shouldPlace('lamp_glow')) {
    all = all.concat(placeLampGlow(lampPositions, { year }));
  }

  if (shouldPlace('rain_splash')) {
    all = all.concat(placeRainSplash(splines, intersections, { year, density }));
  }

  if (shouldPlace('window_glow')) {
    all = all.concat(placeWindowGlow(buildings, { year, density }));
  }

  return all;
}

// ─── Python Script Generation ──────────────────────────────────

/**
 * Generate a Python script for spawning particles and lights in Unreal.
 * Uses scriptNiagaraItem for Niagara types, scriptPointLightItem for window_glow.
 *
 * @param {object[]} particleList - Output from placeAllParticles()
 * @param {{ clearExisting?: boolean }} [opts]
 * @returns {string} Python script string
 */
export function buildParticleSpawnScript(particleList, opts = {}) {
  const { clearExisting = false } = opts;

  const header = scriptHeader('Atmospheric Particle Spawn Script');

  const clear = clearExisting ? scriptClear(PARTICLE_PREFIX, 'particle') : [];

  const counter = scriptCounterStart(particleList.length, 'atmospheric particles');

  const items = particleList.flatMap(p => {
    if (p.spawnType === 'pointlight') {
      return scriptPointLightItem(p, { comment: `${p.label} (${p.type})` });
    }
    return scriptNiagaraItem(p, { comment: `${p.label} (${p.type})` });
  });

  const footer = scriptCounterEnd(particleList.length, 'Atmospheric particles');

  return joinScript(header, clear, counter, items, footer);
}
