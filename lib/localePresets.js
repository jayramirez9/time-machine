/**
 * Locale Presets
 * Environment-specific adjustments for world state compilation
 */

export const LOCALES = {
  baton_rouge_suburb: {
    audioBaseDb: 24,
    activity: 0.15,
    hazeBias: 0.03
  },
  nyc_city: {
    audioBaseDb: 30,
    activity: 0.45,
    hazeBias: 0.06
  }
};

export const DEFAULT_LOCALE = 'baton_rouge_suburb';
