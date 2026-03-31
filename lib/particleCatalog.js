/**
 * Particle Catalog — atmospheric particle and lighting effect definitions
 *
 * Defines what particle systems exist, when they apply, and their trigger
 * conditions. Used by particlePlacement.js to populate scenes with
 * chimney smoke, street dust, lamp glow, rain splashes, and window light.
 *
 * Each particle type has:
 * - type: unique identifier
 * - label: human-readable name
 * - category: where it spawns (building, street, lamp, surface, window)
 * - yearStart / yearEnd: era filtering (null = no limit)
 * - triggerConditions: weather/time conditions for activation
 * - niagaraSystem: Unreal Niagara asset path (null for PointLight types)
 * - spawnOffset: [x, y, z] offset from anchor position
 * - baseSpawnRate: particles per second (Niagara types only)
 * - densityWeight: relative density (0-1, used for seeded skip)
 * - worldStateBindings: maps Niagara variable names to WorldState paths
 */

// ─── Particle Type Definitions ─────────────────────────────────

export const PARTICLE_TYPES = [
  {
    type: 'chimney_smoke',
    label: 'Chimney Smoke',
    category: 'building',
    yearStart: null,
    yearEnd: 1970,
    triggerConditions: {
      maxTemperatureC: 18,
      minWindLevel: 0,
      maxWindLevel: 0.8,
    },
    niagaraSystem: '/Game/TimeMachine/Particles/NS_ChimneySmoke',
    spawnOffset: [0, 0, 50],
    baseSpawnRate: 50,
    densityWeight: 0.7,
    worldStateBindings: {
      'WindDirection': 'audio.windDirection',
      'WindStrength': 'audio.windLevel',
    },
  },

  {
    type: 'street_dust',
    label: 'Street Dust',
    category: 'street',
    yearStart: null,
    yearEnd: null,
    triggerConditions: {
      maxTemperatureC: null,
      minWindLevel: 0.2,
      maxWindLevel: null,
      maxWetness: 0.1,
    },
    niagaraSystem: '/Game/TimeMachine/Particles/NS_StreetDust',
    spawnOffset: [0, 0, 5],
    baseSpawnRate: 30,
    densityWeight: 0.5,
    worldStateBindings: {
      'WindDirection': 'audio.windDirection',
      'WindStrength': 'audio.windLevel',
    },
  },

  {
    type: 'lamp_glow',
    label: 'Lamp Glow',
    category: 'lamp',
    yearStart: null,
    yearEnd: null,
    triggerConditions: {
      maxTemperatureC: null,
      minWindLevel: null,
      maxWindLevel: null,
      nightOnly: true,
    },
    niagaraSystem: '/Game/TimeMachine/Particles/NS_LampGlow',
    spawnOffset: [0, 0, 0],
    baseSpawnRate: 20,
    densityWeight: 1.0,
    worldStateBindings: {},
  },

  {
    type: 'rain_splash',
    label: 'Rain Splash',
    category: 'surface',
    yearStart: null,
    yearEnd: null,
    triggerConditions: {
      maxTemperatureC: null,
      minWindLevel: null,
      maxWindLevel: null,
      minRainLevel: 0.01,
    },
    niagaraSystem: '/Game/TimeMachine/Particles/NS_RainSplash',
    spawnOffset: [0, 0, 2],
    baseSpawnRate: 100,
    densityWeight: 0.8,
    worldStateBindings: {
      'RainIntensity': 'visual.precipDensity',
    },
  },

  {
    type: 'window_glow',
    label: 'Window Glow',
    category: 'window',
    yearStart: null,
    yearEnd: null,
    triggerConditions: {
      maxTemperatureC: null,
      minWindLevel: null,
      maxWindLevel: null,
      nightOnly: true,
    },
    niagaraSystem: null, // Uses PointLight, not Niagara
    spawnOffset: [0, 0, 0],
    baseSpawnRate: 0,
    densityWeight: 0.5,
    worldStateBindings: {},
  },
];

// ─── Filtering ─────────────────────────────────────────────────

/**
 * Get particle types available for a given year.
 * @param {number} year
 * @returns {object[]}
 */
export function getParticlesForYear(year) {
  return PARTICLE_TYPES.filter(p =>
    (p.yearStart === null || year >= p.yearStart) &&
    (p.yearEnd === null || year <= p.yearEnd)
  );
}

/**
 * Get particle types filtered by year and category.
 * @param {number} year
 * @param {string} category - building | street | lamp | surface | window
 * @returns {object[]}
 */
export function getParticlesByCategory(year, category) {
  return getParticlesForYear(year).filter(p => p.category === category);
}

/**
 * Compute smoke density from temperature and heating fuel.
 * Higher in cold weather, scaled by fuel smokeDensity.
 * Returns 0 for gas_electric fuel (no visible smoke).
 *
 * @param {number} tempC - Current temperature in Celsius
 * @param {{ fuel: string, smokeDensity: number }} heatingFuel - From getHeatingFuel()
 * @returns {number} Density 0-1
 */
export function computeSmokeDensity(tempC, heatingFuel) {
  if (!heatingFuel || heatingFuel.smokeDensity === 0) return 0;
  return heatingFuel.smokeDensity * Math.min(1, Math.max(0.2, (18 - tempC) / 30));
}

/**
 * List all particle types available for a year with counts by category.
 * @param {number} year
 * @returns {{ total: number, byCategory: Object<string, number>, types: string[] }}
 */
export function summarizeParticlesForYear(year) {
  const particles = getParticlesForYear(year);
  const byCategory = {};
  for (const p of particles) {
    byCategory[p.category] = (byCategory[p.category] || 0) + 1;
  }
  return {
    total: particles.length,
    byCategory,
    types: particles.map(p => p.type),
  };
}
