/**
 * Locale Presets
 * Environment-specific adjustments for world state compilation
 */

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
    audioProfileId: 'nyc_city_1884'
  }
};

export const DEFAULT_LOCALE = 'baton_rouge_suburb';
