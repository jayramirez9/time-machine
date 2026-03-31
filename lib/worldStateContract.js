/**
 * WorldState Contract
 * Single source of truth for valid WorldState shape, enum values, and numeric bounds.
 * Extracted from worldStateCompiler.js logic.
 *
 * Used by: tm-eval.js, test/goldenState.test.js, review-prompt.md
 */

/**
 * Allowed values for each categorical state field
 */
export const STATES_ENUM = {
  timeOfDay: ['dawn', 'morning', 'day', 'afternoon', 'dusk', 'twilight', 'night'],
  sky: ['clear', 'few', 'scattered', 'broken', 'overcast'],
  precip: ['none', 'light_rain', 'rain', 'heavy_rain', 'light_snow', 'snow', 'heavy_snow', 'sleet'],
  wind: ['calm', 'light', 'breezy', 'windy', 'gusty'],
  comfort: ['freezing', 'cold', 'cool', 'comfortable', 'warm', 'hot']
};

/**
 * Numeric bounds [min, max] for every control value.
 * Derived from the calculation functions in worldStateCompiler.js.
 */
export const CONTROL_BOUNDS = {
  lighting: {
    // calculateLuminance: nighttime min ~0.02, daytime max = sunFactor * cloudFactor ≤ 1.0
    exteriorLuminance: [0, 1],
    // calculateColorTemp: golden hour base 3200, midday max clamped to 6500
    colorTempK: [3200, 6500],
    // calculateContrast: nighttime 0.15, clear daytime 0.8
    contrast: [0.15, 0.8]
  },
  audio: {
    // calculateNoiseFloor: base ~24 + wind + precip, clamped to 60
    baseNoiseFloorDb: [20, 60],
    // calculateWindLevel: 0 to min(1, windSpeed/50)
    windLevel: [0, 1],
    // calculateRainLevel: 0 to min(1, intensity/10)
    rainLevel: [0, 1],
    // calculateSnowLevel: 0 to min(1, intensity/5)
    snowLevel: [0, 1],
    // calculateGustiness: discrete 0, 0.1, 0.3, 0.5, 0.8
    gustiness: [0, 0.8],
    // calculateThunderProb: 0 to min(1, ...)
    thunderProb: [0, 1],
    // calculateActivityLevel: 0 to min(1, baseActivity * todMult)
    activityLevel: [0, 1],
    // calculateTimeOfDayPhase: (hour + min/60) / 24
    timeOfDayPhase: [0, 1],
    // wind direction in degrees
    windDirection: [0, 360]
  },
  atmosphere: {
    // cloudCoverage / 100
    cloudDensity: [0, 1],
    // calculateHaze: base 0.05–0.6 + hazeBias, clamped to 1
    haze: [0, 1],
    // calculateWetness: 0 to min(1, intensity/5)
    wetness: [0, 1]
  },
  visual: {
    // degrees
    windDirection: [0, 360],
    // solar altitude: 0 at horizon/night, up to ~90
    sunAltitude: [-10, 90],
    // solar azimuth: 0–360 degrees
    sunAzimuth: [0, 360],
    // calculatePrecipDensity: 0 to min(1, intensity * multiplier)
    precipDensity: [0, 1],
    // calculateHeatDistortion: 0 to tempFactor * sunFactor ≤ 1
    heatDistortion: [0, 1]
  },
  postprocess: {
    // Auto-exposure EV offset (era-driven from locale toneMappingPreset)
    exposureBias: [-5, 5],
    // UE PostProcess FilmSlope
    filmSlope: [0, 2],
    // UE PostProcess FilmToe
    filmToe: [0, 1],
    // UE PostProcess FilmShoulder
    filmShoulder: [0, 1],
    // Color saturation multiplier
    saturation: [0, 2],
    // Color gamma per channel
    colorGammaR: [0, 2],
    colorGammaG: [0, 2],
    colorGammaB: [0, 2]
  }
};

/**
 * Required top-level fields and their expected types
 */
const REQUIRED_FIELDS = {
  timeUtc: 'string',
  timeLocal: 'string',
  states: 'object',
  controls: 'object',
  metadata: 'object'
};

/**
 * Validate a WorldState object against the contract.
 * @param {Object} state - WorldState to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateWorldState(state) {
  const errors = [];

  if (!state || typeof state !== 'object') {
    return { valid: false, errors: ['WorldState must be an object'] };
  }

  // Check required top-level fields
  for (const [field, expectedType] of Object.entries(REQUIRED_FIELDS)) {
    if (state[field] === undefined) {
      errors.push(`Missing required field: ${field}`);
    } else if (typeof state[field] !== expectedType) {
      errors.push(`${field} must be ${expectedType}, got ${typeof state[field]}`);
    }
  }

  // Validate categorical states
  if (state.states && typeof state.states === 'object') {
    for (const [key, allowed] of Object.entries(STATES_ENUM)) {
      const value = state.states[key];
      if (value === undefined) {
        errors.push(`Missing state: states.${key}`);
      } else if (!allowed.includes(value)) {
        errors.push(`Invalid states.${key}: "${value}" (allowed: ${allowed.join(', ')})`);
      }
    }
  }

  // Validate numeric controls
  if (state.controls && typeof state.controls === 'object') {
    for (const [group, bounds] of Object.entries(CONTROL_BOUNDS)) {
      if (!state.controls[group]) {
        errors.push(`Missing control group: controls.${group}`);
        continue;
      }
      for (const [key, [min, max]] of Object.entries(bounds)) {
        const value = state.controls[group][key];
        if (value === undefined) {
          errors.push(`Missing control: controls.${group}.${key}`);
        } else if (typeof value !== 'number') {
          errors.push(`controls.${group}.${key} must be number, got ${typeof value}`);
        } else if (value < min || value > max) {
          errors.push(`controls.${group}.${key} = ${value} out of bounds [${min}, ${max}]`);
        }
      }
    }
  }

  // Validate metadata
  if (state.metadata && typeof state.metadata === 'object') {
    if (!state.metadata.provider || typeof state.metadata.provider !== 'string') {
      errors.push('metadata.provider must be a non-empty string');
    }
    if (state.metadata.confidence !== undefined) {
      if (typeof state.metadata.confidence !== 'number' || state.metadata.confidence < 0 || state.metadata.confidence > 1) {
        errors.push(`metadata.confidence = ${state.metadata.confidence} must be 0-1`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
