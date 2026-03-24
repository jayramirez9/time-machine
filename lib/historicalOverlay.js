/**
 * Historical Overlay — Schema, validation, and utilities for terrain time-travel
 *
 * Defines the overlay metadata format that describes how modern terrain
 * differs from its historical state. Used by Phase 6 tools to:
 * - Filter modern buildings (hide post-era construction)
 * - Place historical features (add disappeared water, old coastlines)
 * - Modify terrain height (remove landfill, restore hills)
 * - Swap surface materials (asphalt → cobblestone)
 */

import { readFileSync, existsSync } from 'fs';

export const CONFIDENCE = {
  verified:    'verified',     // Primary source with precise coordinates (surveys, engineering records)
  estimated:   'estimated',    // Derived from maps, photos, or secondary sources
  inferred:    'inferred',     // Extrapolated from patterns or general knowledge
  unavailable: 'unavailable'   // No data — use modern terrain as-is
};

export const OVERLAY_TYPES = {
  terrain_delta:   'terrain_delta',    // Height modification (add/remove fill)
  surface_swap:    'surface_swap',     // Material replacement
  feature_add:     'feature_add',      // Add historical feature (water body, road, railway)
  feature_remove:  'feature_remove',   // Remove modern feature (building, highway)
  coastline:       'coastline',        // Historical shoreline polygon
  osm_filter:      'osm_filter'        // Date-based OSM building filter rule
};

const CONFIDENCE_RANK = { verified: 3, estimated: 2, inferred: 1, unavailable: 0 };

const SPATIAL_TYPES = new Set([
  OVERLAY_TYPES.terrain_delta,
  OVERLAY_TYPES.surface_swap,
  OVERLAY_TYPES.feature_add,
  OVERLAY_TYPES.coastline
]);

/**
 * Validate an overlay document.
 * @param {object} overlay
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateOverlay(overlay) {
  const errors = [];

  if (!overlay.location) errors.push('Missing "location"');
  if (!overlay.targetYear) errors.push('Missing "targetYear"');
  if (typeof overlay.targetYear !== 'number') errors.push('"targetYear" must be a number');
  if (!overlay.baseTerrainSlug) errors.push('Missing "baseTerrainSlug"');

  if (!Array.isArray(overlay.modifications)) {
    errors.push('"modifications" must be an array');
  } else {
    for (let i = 0; i < overlay.modifications.length; i++) {
      const mod = overlay.modifications[i];
      const prefix = `modifications[${i}]`;
      if (!mod.type) errors.push(`${prefix}: missing "type"`);
      if (mod.type && !Object.values(OVERLAY_TYPES).includes(mod.type)) {
        errors.push(`${prefix}: unknown type "${mod.type}"`);
      }
      if (!mod.confidence) errors.push(`${prefix}: missing "confidence"`);
      if (mod.confidence && !Object.values(CONFIDENCE).includes(mod.confidence)) {
        errors.push(`${prefix}: unknown confidence "${mod.confidence}"`);
      }
      if (SPATIAL_TYPES.has(mod.type) && !mod.extent?.type) {
        errors.push(`${prefix}: spatial modification type "${mod.type}" requires "extent" with GeoJSON geometry`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Create a blank overlay document for a location/year.
 * @param {object} opts
 * @param {string} opts.location
 * @param {number} opts.targetYear
 * @param {string} opts.baseTerrainSlug
 * @returns {object}
 */
export function createBlankOverlay({ location, targetYear, baseTerrainSlug }) {
  return {
    schemaVersion: 1,
    location,
    targetYear,
    baseTerrainSlug,
    createdAt: new Date().toISOString(),
    modifications: [],
    heightAnchoring: {
      strategy: 'modern_ground',
      gradeToleranceMeters: 2,
      historicalDEMAvailable: false
    },
    osmBuildingFilter: {
      enabled: true,
      maxConstructionYear: targetYear
    },
    sources: []
  };
}

/**
 * Compute a summary of an overlay's confidence distribution.
 * @param {object} overlay
 * @returns {{ total: number, verified: number, estimated: number, inferred: number, unavailable: number }}
 */
export function confidenceSummary(overlay) {
  const counts = { total: 0, verified: 0, estimated: 0, inferred: 0, unavailable: 0 };
  for (const mod of overlay.modifications || []) {
    counts.total++;
    if (counts[mod.confidence] !== undefined) counts[mod.confidence]++;
  }
  return counts;
}

/**
 * Filter overlay modifications by type and/or minimum confidence.
 * @param {object} overlay
 * @param {{ type?: string, minConfidence?: string }} filters
 * @returns {object[]}
 */
export function filterModifications(overlay, filters = {}) {
  const minRank = CONFIDENCE_RANK[filters.minConfidence] ?? 0;

  return (overlay.modifications || []).filter(mod => {
    if (filters.type && mod.type !== filters.type) return false;
    const rank = CONFIDENCE_RANK[mod.confidence] ?? 0;
    return rank >= minRank;
  });
}

/**
 * Load and validate an overlay from a JSON file path.
 * @param {string} filePath
 * @returns {object} Validated overlay document
 * @throws {Error} If file missing or validation fails
 */
export function loadOverlay(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Overlay file not found: ${filePath}`);
  }
  const overlay = JSON.parse(readFileSync(filePath, 'utf-8'));
  const { valid, errors } = validateOverlay(overlay);
  if (!valid) {
    throw new Error(`Invalid overlay at ${filePath}:\n  - ${errors.join('\n  - ')}`);
  }
  return overlay;
}

/**
 * Get the feature_add modifications from an overlay (historical features to spawn).
 * @param {object} overlay
 * @returns {object[]} feature_add modifications with geometry
 */
export function getFeatureAdditions(overlay) {
  return filterModifications(overlay, { type: OVERLAY_TYPES.feature_add });
}

/**
 * Get the feature_remove IDs from an overlay (modern features to hide).
 * @param {object} overlay
 * @returns {object[]} feature_remove modifications
 */
export function getFeatureRemovals(overlay) {
  return filterModifications(overlay, { type: OVERLAY_TYPES.feature_remove });
}

/**
 * Get surface swap modifications from an overlay.
 * @param {object} overlay
 * @returns {object[]} surface_swap modifications with extent + material info
 */
export function getSurfaceSwaps(overlay) {
  return filterModifications(overlay, { type: OVERLAY_TYPES.surface_swap });
}
