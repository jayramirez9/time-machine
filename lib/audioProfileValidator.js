/**
 * Audio Profile Validator
 * Structural validation for audio profile JSON files.
 *
 * Checks required fields, source structure, and v2-specific requirements.
 * Used by: tm-eval.js
 */

import fs from 'fs';
import path from 'path';

const DIRECTIONAL_KEYS = ['N', 'E', 'S', 'W'];

/**
 * Validate a single source object
 * @param {Object} source
 * @param {string} context - Where this source lives (for error messages)
 * @param {string} [assetsDir] - Optional base dir for file existence checks
 * @returns {{ errors: string[], warnings: string[] }}
 */
function validateSource(source, context, assetsDir) {
  const errors = [];
  const warnings = [];

  if (source.url === null) {
    // Explicitly-null url = generated profile whose assets haven't been
    // fetched yet (tools/elevenlabs-fetch.js populates urls). Structurally
    // sound, just un-provisioned — warn, don't fail.
    warnings.push(`${context}: un-provisioned (url null) — run tools/elevenlabs-fetch.js`);
  } else if (!source.url || typeof source.url !== 'string') {
    errors.push(`${context}: source missing url`);
  }
  if (!source.label || typeof source.label !== 'string') {
    errors.push(`${context}: source missing label`);
  }

  // Optional: check file existence on disk
  if (assetsDir && source.url) {
    // URLs are like /audio-assets/profile_id/file.mp3
    const filePath = path.join(assetsDir, '..', source.url.replace(/^\//, ''));
    if (!fs.existsSync(filePath)) {
      warnings.push(`${context}: file not found on disk: ${source.url}`);
    }
  }

  return { errors, warnings };
}

/**
 * Validate an audio profile object against structural requirements.
 * @param {Object} profile - Parsed audio profile JSON
 * @param {Object} [options]
 * @param {string} [options.assetsDir] - Base dir for checking file existence
 * @param {boolean} [options.checkFiles=false] - Whether to check audio file existence
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateAudioProfile(profile, options = {}) {
  const errors = [];
  const warnings = [];
  const assetsDir = options.checkFiles ? options.assetsDir : null;

  if (!profile || typeof profile !== 'object') {
    return { valid: false, errors: ['Profile must be an object'], warnings: [] };
  }

  // Required top-level fields
  if (!profile.id) errors.push('Missing required field: id');
  if (!profile.name) errors.push('Missing required field: name');
  if (!profile.description) errors.push('Missing required field: description');

  // Beds
  if (!profile.beds) {
    errors.push('Missing required field: beds');
  } else {
    // Base bed
    if (!profile.beds.base) {
      errors.push('Missing required field: beds.base');
    } else if (!profile.beds.base.sources || !Array.isArray(profile.beds.base.sources) || profile.beds.base.sources.length === 0) {
      errors.push('beds.base.sources must be a non-empty array');
    } else {
      for (let i = 0; i < profile.beds.base.sources.length; i++) {
        const result = validateSource(profile.beds.base.sources[i], `beds.base.sources[${i}]`, assetsDir);
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      }
    }

    // Directional beds
    if (!profile.beds.directional) {
      errors.push('Missing required field: beds.directional');
    } else {
      for (const dir of DIRECTIONAL_KEYS) {
        if (!profile.beds.directional[dir]) {
          errors.push(`Missing directional bed: beds.directional.${dir}`);
        } else {
          const sources = profile.beds.directional[dir].sources;
          if (!sources || !Array.isArray(sources) || sources.length === 0) {
            errors.push(`beds.directional.${dir}.sources must be a non-empty array`);
          } else {
            for (let i = 0; i < sources.length; i++) {
              const result = validateSource(sources[i], `beds.directional.${dir}.sources[${i}]`, assetsDir);
              errors.push(...result.errors);
              warnings.push(...result.warnings);
            }
          }
        }
      }
    }
  }

  // Micro events
  if (!profile.microEvents) {
    errors.push('Missing required field: microEvents');
  } else if (!Array.isArray(profile.microEvents)) {
    errors.push('microEvents must be an array');
  } else {
    for (let i = 0; i < profile.microEvents.length; i++) {
      const event = profile.microEvents[i];
      if (!event.id) errors.push(`microEvents[${i}]: missing id`);
      if (!event.sources || !Array.isArray(event.sources) || event.sources.length === 0) {
        errors.push(`microEvents[${i}]: sources must be a non-empty array`);
      } else {
        for (let j = 0; j < event.sources.length; j++) {
          const result = validateSource(event.sources[j], `microEvents[${i}].sources[${j}]`, assetsDir);
          errors.push(...result.errors);
          warnings.push(...result.warnings);
        }
      }
    }
  }

  // Weather
  if (!profile.weather) {
    errors.push('Missing required field: weather');
  } else {
    if (!profile.weather.wind) errors.push('Missing required field: weather.wind');
    if (!profile.weather.rain) errors.push('Missing required field: weather.rain');
  }

  // v2-specific requirements
  if (profile.schemaVersion === 2) {
    if (!profile.listener) errors.push('v2 profile missing required field: listener');
    if (!profile.era) errors.push('v2 profile missing required field: era');
    if (!profile.spatialConfig) errors.push('v2 profile missing required field: spatialConfig');

    if (profile.listener) {
      if (!profile.listener.position) warnings.push('v2 listener missing position');
      if (!profile.listener.facing) warnings.push('v2 listener missing facing');
      if (!profile.listener.enclosure) warnings.push('v2 listener missing enclosure');
    }

    if (profile.era) {
      if (!profile.era.year) errors.push('v2 era missing year');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
