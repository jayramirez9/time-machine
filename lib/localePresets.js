/**
 * Locale Presets
 * Environment-specific adjustments for world state compilation
 */

import { resolveEra } from './architectureStyles.js';

/**
 * Era-appropriate tone mapping presets.
 * Each preset defines PostProcess parameters that evoke the visual character
 * of photography/film from that era.
 */
export const TONE_MAPPING_PRESETS = {
  // Pre-1900: warm, desaturated, slightly lifted blacks (tintype/early photo feel)
  pre_1900: {
    filmSlope: 0.78,
    filmToe: 0.60,
    filmShoulder: 0.22,
    saturation: 0.75,
    exposureBias: -0.3,
    colorGamma: { r: 1.05, g: 0.98, b: 0.92 }
  },
  // 1900-1940: orthochromatic film, medium contrast, slight sepia warmth
  early_1900s: {
    filmSlope: 0.82,
    filmToe: 0.58,
    filmShoulder: 0.24,
    saturation: 0.80,
    exposureBias: -0.1,
    colorGamma: { r: 1.03, g: 0.99, b: 0.95 }
  },
  // 1940-1970: Kodachrome / Technicolor, saturated, punchy
  kodachrome: {
    filmSlope: 0.90,
    filmToe: 0.50,
    filmShoulder: 0.28,
    saturation: 1.10,
    exposureBias: 0.1,
    colorGamma: { r: 1.0, g: 1.0, b: 1.02 }
  },
  // 1970-1990: Ektachrome, natural saturation, warm
  ektachrome: {
    filmSlope: 0.88,
    filmToe: 0.55,
    filmShoulder: 0.26,
    saturation: 0.95,
    exposureBias: 0.0,
    colorGamma: { r: 1.0, g: 1.0, b: 1.0 }
  },
  // Post-1990: modern digital, clean — UE5 defaults
  modern: {
    filmSlope: 0.88,
    filmToe: 0.55,
    filmShoulder: 0.26,
    saturation: 1.0,
    exposureBias: 0.0,
    colorGamma: { r: 1.0, g: 1.0, b: 1.0 }
  }
};

/**
 * Resolve tone mapping preset from year.
 * @param {number} year
 * @returns {object} Tone mapping preset
 */
export function resolveToneMapping(year) {
  if (!year) return TONE_MAPPING_PRESETS.modern;
  if (year < 1900) return TONE_MAPPING_PRESETS.pre_1900;
  if (year < 1940) return TONE_MAPPING_PRESETS.early_1900s;
  if (year < 1970) return TONE_MAPPING_PRESETS.kodachrome;
  if (year < 1990) return TONE_MAPPING_PRESETS.ektachrome;
  return TONE_MAPPING_PRESETS.modern;
}

export const LOCALES = {
  baton_rouge_suburb: {
    audioBaseDb: 24,
    activity: 0.15,
    hazeBias: 0.03,
    audioProfileId: 'baton_rouge_suburb_1978',
    toneMappingPreset: TONE_MAPPING_PRESETS.ektachrome
  },
  nyc_city: {
    audioBaseDb: 30,
    activity: 0.45,
    hazeBias: 0.06,
    audioProfileId: 'nyc_city_1978',
    toneMappingPreset: TONE_MAPPING_PRESETS.ektachrome
  },
  nyc_city_1884: {
    audioBaseDb: 28,
    activity: 0.40,
    hazeBias: 0.04,
    audioProfileId: 'nyc_city_1884',
    scalePreset: 'neighborhood',
    overlay: 'nyc_city_1884',
    architecturalEra: 'nyc_1884',
    toneMappingPreset: TONE_MAPPING_PRESETS.pre_1900
  },
  harvard_square_1969: {
    audioBaseDb: 27,
    activity: 0.30,
    hazeBias: 0.04,
    audioProfileId: 'harvard_square_1969',
    toneMappingPreset: TONE_MAPPING_PRESETS.kodachrome
  }
};

export const DEFAULT_LOCALE = 'baton_rouge_suburb';

/**
 * Infer a locale from geocode result + year when no hand-authored preset matches.
 *
 * @param {Object} geo - Geocode result with { population, countryCode, ... }
 * @param {number} [year] - Target year (for era-based tuning)
 * @returns {{ locale: Object, inferred: boolean, warnings: string[] }}
 */
export function resolveLocale(geo, year) {
  const population = geo?.population || 0;
  const warnings = [];

  // Population-based audio base noise floor (dB)
  let audioBaseDb;
  if (population >= 500000) audioBaseDb = 30;
  else if (population >= 100000) audioBaseDb = 28;
  else if (population >= 10000) audioBaseDb = 26;
  else audioBaseDb = 24;

  // Population-based activity level
  let activity;
  if (population >= 500000) activity = 0.40;
  else if (population >= 100000) activity = 0.30;
  else if (population >= 10000) activity = 0.20;
  else activity = 0.12;

  // Era modulation: pre-automobile cities were still busy (horse/foot traffic)
  // but slightly less noise than motor traffic era
  if (year && year < 1900) {
    activity *= 0.85;
  } else if (year && year < 1920) {
    activity *= 0.92;
  }

  // Era-based haze bias
  let hazeBias;
  if (year && year >= 1850 && year <= 1950) {
    hazeBias = 0.05; // industrial era — coal smoke, factory emissions
  } else if (year && year < 1850) {
    hazeBias = 0.02; // pre-industrial
  } else {
    hazeBias = 0.03; // post-industrial / modern
  }

  // Architectural era via existing resolver
  const architecturalEra = year ? resolveEra(year) : null;

  // Era-appropriate tone mapping
  const toneMappingPreset = resolveToneMapping(year);

  // Generate a deterministic profile ID for procedural audio
  const slug = (geo?.name || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  const audioProfileId = `gen_${slug}_${year}`;
  warnings.push(`Using procedural audio profile: ${audioProfileId}`);

  const locale = {
    audioBaseDb,
    activity: Math.round(activity * 100) / 100, // clean rounding
    hazeBias,
    audioProfileId,
    architecturalEra,
    toneMappingPreset,
    _generatedProfile: true
  };

  return { locale, inferred: true, warnings };
}
