/**
 * Environment Profile — validation, loading, and layer helpers.
 *
 * An Environment Profile is the complete description of a place at a moment
 * in history. See docs/environment-profile-schema.md for the full spec.
 */

import { readFileSync } from 'fs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SCHEMA_VERSION = 1;

export const LAYER_NAMES = [
  'terrain', 'weather', 'soundscape', 'urbanForm',
  'ecology', 'culture', 'music', 'materials', 'infrastructure'
];

export const SOURCE_TYPES = [
  'weather_station', 'historical_map', 'census_record', 'photo_archive',
  'newspaper_archive', 'ornithological_survey', 'botanical_survey',
  'museum_collection', 'published_book', 'online_database', 'oral_history',
  'procedural_generation', 'ai_generation'
];

export const CONFIDENCE_LABELS = [
  { min: 0.9, label: 'verified' },
  { min: 0.7, label: 'complete' },
  { min: 0.6, label: 'likely' },
  { min: 0.5, label: 'partial' },
  { min: 0.4, label: 'interpolated' },
  { min: 0.0, label: 'assumed' }
];

export const GENERATION_METHODS = ['hand_authored', 'procedural', 'agent_researched'];
export const ASSET_STATUSES = ['pending', 'partial', 'complete'];
export const MUSIC_ERAS = ['pre_recording', 'early_recording', 'broadcast_radio', 'broadcast_tv', 'streaming'];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate an Environment Profile object.
 * Returns { valid: boolean, errors: string[] }.
 */
export function validateProfile(profile) {
  const errors = [];

  // Top-level required fields
  if (profile.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SCHEMA_VERSION}, got ${profile.schemaVersion}`);
  }
  if (!profile.id || typeof profile.id !== 'string') {
    errors.push('id is required and must be a string');
  }
  if (!profile.name || typeof profile.name !== 'string') {
    errors.push('name is required and must be a string');
  }

  // Location
  if (!profile.location || typeof profile.location !== 'object') {
    errors.push('location is required');
  } else {
    if (!profile.location.name) errors.push('location.name is required');
    if (typeof profile.location.lat !== 'number') errors.push('location.lat must be a number');
    if (typeof profile.location.lon !== 'number') errors.push('location.lon must be a number');
    if (profile.location.lat != null && (profile.location.lat < -90 || profile.location.lat > 90)) {
      errors.push('location.lat must be between -90 and 90');
    }
    if (profile.location.lon != null && (profile.location.lon < -180 || profile.location.lon > 180)) {
      errors.push('location.lon must be between -180 and 180');
    }
  }

  // Date
  if (!profile.date || typeof profile.date !== 'object') {
    errors.push('date is required');
  } else {
    if (typeof profile.date.year !== 'number') errors.push('date.year must be a number');
    if (profile.date.month != null && (profile.date.month < 1 || profile.date.month > 12)) {
      errors.push('date.month must be 1-12');
    }
    if (profile.date.day != null && (profile.date.day < 1 || profile.date.day > 31)) {
      errors.push('date.day must be 1-31');
    }
  }

  // Layers
  if (!profile.layers || typeof profile.layers !== 'object') {
    errors.push('layers is required');
  } else {
    const layerKeys = Object.keys(profile.layers);
    const unknownKeys = layerKeys.filter(k => !LAYER_NAMES.includes(k));
    if (unknownKeys.length) {
      errors.push(`Unknown layer(s): ${unknownKeys.join(', ')}`);
    }

    // At least one non-null layer
    const nonNull = LAYER_NAMES.filter(k => profile.layers[k] != null);
    if (nonNull.length === 0) {
      errors.push('At least one layer must be non-null');
    }

    // Validate each non-null layer envelope
    for (const name of nonNull) {
      const layer = profile.layers[name];
      const layerErrors = validateLayerEnvelope(layer, name);
      errors.push(...layerErrors);
    }
  }

  // Accuracy manifest (optional but validated if present)
  if (profile.accuracyManifest) {
    const manifestErrors = validateAccuracyManifest(profile.accuracyManifest);
    errors.push(...manifestErrors);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate the standard layer envelope: { data, confidence, sources, knownCompromises }.
 */
export function validateLayerEnvelope(layer, layerName) {
  const errors = [];
  const prefix = `layers.${layerName}`;

  if (typeof layer !== 'object' || layer === null) {
    errors.push(`${prefix} must be an object`);
    return errors;
  }

  if (layer.data === undefined) {
    errors.push(`${prefix}.data is required`);
  }

  if (typeof layer.confidence !== 'number' || layer.confidence < 0 || layer.confidence > 1) {
    errors.push(`${prefix}.confidence must be a number between 0 and 1`);
  }

  if (!Array.isArray(layer.sources)) {
    errors.push(`${prefix}.sources must be an array`);
  } else {
    for (let i = 0; i < layer.sources.length; i++) {
      const src = layer.sources[i];
      if (!src.id) errors.push(`${prefix}.sources[${i}].id is required`);
      if (!src.type) errors.push(`${prefix}.sources[${i}].type is required`);
    }
  }

  if (!Array.isArray(layer.knownCompromises)) {
    errors.push(`${prefix}.knownCompromises must be an array`);
  }

  return errors;
}

/**
 * Validate the accuracy manifest structure.
 */
export function validateAccuracyManifest(manifest) {
  const errors = [];

  if (!manifest.profileId) errors.push('accuracyManifest.profileId is required');

  if (typeof manifest.overallConfidence !== 'number' ||
      manifest.overallConfidence < 0 || manifest.overallConfidence > 1) {
    errors.push('accuracyManifest.overallConfidence must be 0-1');
  }

  if (!manifest.layerSummary || typeof manifest.layerSummary !== 'object') {
    errors.push('accuracyManifest.layerSummary is required');
  }

  if (!Array.isArray(manifest.gaps)) {
    errors.push('accuracyManifest.gaps must be an array');
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/**
 * Load and validate an Environment Profile from a JSON file path.
 * Throws on read error or validation failure.
 */
export function loadProfile(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  const profile = JSON.parse(raw);
  const { valid, errors } = validateProfile(profile);
  if (!valid) {
    throw new Error(`Invalid Environment Profile at ${filePath}:\n  - ${errors.join('\n  - ')}`);
  }
  return profile;
}

// ---------------------------------------------------------------------------
// Layer Helpers
// ---------------------------------------------------------------------------

/**
 * Get the confidence label for a numeric confidence value.
 */
export function confidenceLabel(confidence) {
  for (const { min, label } of CONFIDENCE_LABELS) {
    if (confidence >= min) return label;
  }
  return 'assumed';
}

/**
 * Get a specific layer from a profile, or null if missing.
 */
export function getLayer(profile, layerName) {
  return profile?.layers?.[layerName] ?? null;
}

/**
 * Get the data from a specific layer, or null if the layer is missing.
 */
export function getLayerData(profile, layerName) {
  return profile?.layers?.[layerName]?.data ?? null;
}

/**
 * Count how many layers are populated (non-null) in a profile.
 */
export function populatedLayerCount(profile) {
  if (!profile?.layers) return 0;
  return LAYER_NAMES.filter(k => profile.layers[k] != null).length;
}

/**
 * Return the names of layers that are null/missing.
 */
export function missingLayers(profile) {
  if (!profile?.layers) return [...LAYER_NAMES];
  return LAYER_NAMES.filter(k => profile.layers[k] == null);
}

// ---------------------------------------------------------------------------
// Accuracy Manifest Generation
// ---------------------------------------------------------------------------

/**
 * Generate an accuracy manifest from a profile's layers.
 * Each layer's confidence and sources are summarized.
 */
export function generateAccuracyManifest(profile) {
  const layerSummary = {};
  const gaps = [];
  let totalConfidence = 0;
  let layerCount = 0;

  for (const name of LAYER_NAMES) {
    const layer = profile.layers?.[name];
    if (layer == null) {
      layerSummary[name] = { confidence: 0, status: 'missing' };
      gaps.push(`${name}: Layer not populated`);
      continue;
    }

    const conf = layer.confidence ?? 0;
    const status = confidenceLabel(conf);
    layerSummary[name] = { confidence: conf, status };
    totalConfidence += conf;
    layerCount++;

    // Add known compromises as gaps
    if (Array.isArray(layer.knownCompromises)) {
      for (const compromise of layer.knownCompromises) {
        gaps.push(`${name}: ${compromise}`);
      }
    }
  }

  const overallConfidence = layerCount > 0
    ? Math.round((totalConfidence / layerCount) * 100) / 100
    : 0;

  return {
    profileId: profile.id,
    overallConfidence,
    generatedAt: new Date().toISOString(),
    layerSummary,
    gaps
  };
}

// ---------------------------------------------------------------------------
// Profile Creation Helpers
// ---------------------------------------------------------------------------

/**
 * Create a layer envelope with standard fields.
 */
export function createLayer(data, confidence, sources = [], knownCompromises = []) {
  return { data, confidence, sources, knownCompromises };
}

/**
 * Create a source citation object.
 */
export function createSource(id, type, name, opts = {}) {
  return {
    id,
    type,
    name,
    ...opts
  };
}

/**
 * Create a minimal valid profile scaffold.
 */
export function createProfileScaffold(id, name, location, date) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    name,
    location,
    date,
    layers: {
      terrain: null,
      weather: null,
      soundscape: null,
      urbanForm: null,
      ecology: null,
      culture: null,
      music: null,
      materials: null,
      infrastructure: null
    },
    accuracyManifest: null,
    generatedAt: new Date().toISOString(),
    generatedBy: null
  };
}
