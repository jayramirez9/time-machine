/**
 * Locale Presets
 * Environment-specific adjustments for world state compilation
 */

import { resolveEra } from './architectureStyles.js';

export const LOCALES = {
  baton_rouge_suburb: {
    audioBaseDb: 24,
    activity: 0.15,
    hazeBias: 0.03,
    audioProfileId: 'baton_rouge_suburb_1978'
  },
  nyc_city: {
    audioBaseDb: 30,
    activity: 0.45,
    hazeBias: 0.06,
    audioProfileId: 'nyc_city_1978'
  },
  nyc_city_1884: {
    audioBaseDb: 28,
    activity: 0.40,
    hazeBias: 0.04,
    audioProfileId: 'nyc_city_1884',
    scalePreset: 'neighborhood',
    overlay: 'nyc_city_1884',
    architecturalEra: 'nyc_1884'
  },
  harvard_square_1969: {
    audioBaseDb: 27,
    activity: 0.30,
    hazeBias: 0.04,
    audioProfileId: 'harvard_square_1969'
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
    _generatedProfile: true
  };

  return { locale, inferred: true, warnings };
}
