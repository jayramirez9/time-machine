/**
 * representationSelector.js — choose how to represent a geometry feature.
 *
 * Implements the Representation Regimes model (PRD §17): geometry is chosen
 * per feature by the evidence that survives for it, not by a single pipeline.
 *
 *   - capture regime    → reconstruct the real thing from imagery (3DGS)
 *   - procedural regime → assemble/generate from archival record (mesh / massing)
 *
 * Pure function, no I/O. The feature fields are sourced upstream:
 *   survivesToday / yearDemolished      → buildingDateAgent
 *   photoCount / photoMaxResolutionPx   → photoArchiveFetch (findBestPhoto)
 *   evidenceConfidence                  → urbanForm / buildingDate layer (0..1)
 */

export const REGIMES = ['capture', 'procedural'];

export const METHODS = [
  'splat_modern',      // capture: dense modern imagery of a surviving structure
  'splat_archival',    // capture: reconstruction from sufficient archival photos
  'mesh_meshy',        // procedural: AI-generated mesh (hero, insufficient for splat)
  'massing_procedural',// procedural: footprint → massing + period materials
];

export const DEFAULT_THRESHOLDS = {
  // Archival photos must clear both gates to attempt a splat reconstruction.
  splatArchivalMinPhotos: 4,
  splatArchivalMinResolutionPx: 1000,
  // Below this confidence, a background feature drops to reduced-detail massing
  // rather than asserting detail it can't support (Law 5.5, Silence Over Wrongness).
  evidenceConfidenceFloor: 0.3,
};

/**
 * Decide the representation for a single feature.
 *
 * @param {object} feature
 * @param {boolean} [feature.survivesToday]      Structure still standing today
 * @param {boolean} [feature.hasModernCapture]   Modern imagery/capture available
 * @param {boolean} [feature.isHero]             Landmark vs. background
 * @param {number}  [feature.photoCount]         Usable archival photos
 * @param {number}  [feature.photoMaxResolutionPx] Largest archival master (px)
 * @param {number}  [feature.evidenceConfidence] Dating/footprint confidence 0..1
 * @param {object}  [opts]
 * @param {object}  [opts.thresholds]            Overrides for DEFAULT_THRESHOLDS
 * @returns {{regime: string, method: string, reason: string, confidence: number}}
 */
export function selectRepresentation(feature = {}, opts = {}) {
  const t = { ...DEFAULT_THRESHOLDS, ...(opts.thresholds || {}) };

  const survivesToday = !!feature.survivesToday;
  const hasModernCapture = !!feature.hasModernCapture;
  const isHero = !!feature.isHero;
  const photoCount = feature.photoCount ?? 0;
  const photoRes = feature.photoMaxResolutionPx ?? 0;
  const evidence = clamp01(feature.evidenceConfidence ?? 0);

  // 1) Surviving structure we can capture now — the strongest path. High
  //    geometric confidence regardless of how thin the archival record is.
  if (survivesToday && hasModernCapture) {
    return decision('capture', 'splat_modern',
      'Structure survives and modern capture is available — reconstruct directly.',
      Math.max(evidence, 0.9));
  }

  // 2) Hero with enough archival coverage to attempt a reconstruction.
  if (isHero && photoCount >= t.splatArchivalMinPhotos && photoRes >= t.splatArchivalMinResolutionPx) {
    return decision('capture', 'splat_archival',
      `Hero with ${photoCount} archival photos at ${photoRes}px — sufficient to attempt splat reconstruction.`,
      Math.min(evidence, 0.7));
  }

  // 3) Hero without enough (or high-enough-res) archival photos: generate an
  //    AI mesh so the landmark is still recognizable. Heroes are never silenced.
  if (isHero) {
    const why = photoCount < t.splatArchivalMinPhotos
      ? `only ${photoCount} archival photo(s) (need ${t.splatArchivalMinPhotos})`
      : `archival resolution ${photoRes}px below the ${t.splatArchivalMinResolutionPx}px gate`;
    return decision('procedural', 'mesh_meshy',
      `Hero but ${why} — sparse archival evidence; generate AI mesh from best reference.`,
      Math.min(evidence, 0.5));
  }

  // 4) Background feature with too little evidence to assert detail: drop to
  //    reduced-detail massing rather than inventing (Law 5.5).
  if (evidence < t.evidenceConfidenceFloor) {
    return decision('procedural', 'massing_procedural',
      `Evidence confidence ${evidence.toFixed(2)} below floor ${t.evidenceConfidenceFloor} — reduce detail, stay neutral (Law 5.5).`,
      evidence);
  }

  // 5) Default: demolished/changed background with usable evidence — procedural
  //    massing from footprint + period materials. The pre-photographic moat.
  return decision('procedural', 'massing_procedural',
    'Demolished or changed feature with usable archival evidence — procedural massing from footprint.',
    evidence);
}

/**
 * Aggregate a list of decisions for the accuracy manifest.
 * @param {Array<{regime: string, method: string}>} decisions
 */
export function summarizeRegimes(decisions = []) {
  const byMethod = {};
  let capture = 0;
  let procedural = 0;
  for (const d of decisions) {
    byMethod[d.method] = (byMethod[d.method] || 0) + 1;
    if (d.regime === 'capture') capture++;
    else if (d.regime === 'procedural') procedural++;
  }
  return { total: decisions.length, capture, procedural, byMethod };
}

function decision(regime, method, reason, confidence) {
  return { regime, method, reason, confidence: clamp01(confidence) };
}

function clamp01(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
