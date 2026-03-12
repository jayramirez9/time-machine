/**
 * Landmarks — Multi-primitive hero building compositions for Unreal
 *
 * Each landmark is a hand-authored composition of basic shape primitives
 * (cube, cone, cylinder, sphere) arranged to approximate a landmark's
 * distinctive silhouette. Completely separate from the buildings.geojson
 * massing pipeline — different data file, different actor prefix.
 *
 * Coordinate conversion uses wgs84ToUnreal() from osmVectors.js.
 */

import fs from 'fs';
import { wgs84ToUnreal } from './osmVectors.js';
import {
  scriptHeader, scriptClear, scriptCounterStart, scriptCounterEnd,
  scriptStaticMeshItem, joinScript
} from './spawnScript.js';

// ─── Constants ──────────────────────────────────────────────────

export const LANDMARK_PREFIX = 'TM_Landmark';

export const SHAPE_ASSETS = {
  cube:     '/Engine/BasicShapes/Cube.Cube',
  cone:     '/Engine/BasicShapes/Cone.Cone',
  cylinder: '/Engine/BasicShapes/Cylinder.Cylinder',
  sphere:   '/Engine/BasicShapes/Sphere.Sphere'
};

const VALID_SHAPES = new Set(Object.keys(SHAPE_ASSETS));

// ─── Validation ─────────────────────────────────────────────────

/**
 * Validate a single landmark entry.
 * @param {object} landmark
 * @returns {{ valid: boolean, warnings: string[] }}
 */
function validateLandmark(landmark) {
  const warnings = [];

  if (!landmark.id || typeof landmark.id !== 'string') {
    warnings.push('Missing or invalid "id"');
  }
  if (!landmark.anchor || typeof landmark.anchor.lat !== 'number' || typeof landmark.anchor.lon !== 'number') {
    warnings.push(`${landmark.id || '?'}: Missing or invalid "anchor" (needs lat/lon)`);
  }
  if (!Array.isArray(landmark.primitives) || landmark.primitives.length === 0) {
    warnings.push(`${landmark.id || '?'}: "primitives" must be a non-empty array`);
  } else {
    for (let i = 0; i < landmark.primitives.length; i++) {
      const p = landmark.primitives[i];
      if (!VALID_SHAPES.has(p.shape)) {
        warnings.push(`${landmark.id}[${i}]: Invalid shape "${p.shape}" (valid: ${[...VALID_SHAPES].join(', ')})`);
      }
      if (!Array.isArray(p.offset) || p.offset.length !== 3) {
        warnings.push(`${landmark.id}[${i}]: "offset" must be [x,y,z] array`);
      }
      if (!Array.isArray(p.size) || p.size.length !== 3) {
        warnings.push(`${landmark.id}[${i}]: "size" must be [w,d,h] array`);
      } else if (p.size.some(v => v <= 0)) {
        warnings.push(`${landmark.id}[${i}]: "size" values must be positive`);
      }
    }
  }
  if (typeof landmark.yearBuilt !== 'number') {
    warnings.push(`${landmark.id || '?'}: Missing "yearBuilt"`);
  }

  return { valid: warnings.length === 0, warnings };
}

// ─── Loading ────────────────────────────────────────────────────

/**
 * Load and validate a landmarks.json file.
 * @param {string} filePath - Path to landmarks.json
 * @returns {{ landmarks: object[], origin: object, era: string, valid: number, invalid: number, warnings: string[] }}
 */
export function loadLandmarks(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const landmarks = data.landmarks || [];
  const allWarnings = [];
  let valid = 0;
  let invalid = 0;

  for (const lm of landmarks) {
    const result = validateLandmark(lm);
    if (result.valid) {
      valid++;
    } else {
      invalid++;
      allWarnings.push(...result.warnings);
    }
  }

  return {
    landmarks,
    origin: data.origin,
    era: data.era,
    valid,
    invalid,
    warnings: allWarnings
  };
}

// ─── Era Filtering ──────────────────────────────────────────────

/**
 * Filter landmarks by year: built <= year AND (not demolished OR demolished > year).
 * @param {object[]} landmarks
 * @param {number} year
 * @returns {object[]}
 */
export function filterByYear(landmarks, year) {
  return landmarks.filter(lm => {
    if (lm.yearBuilt > year) return false;
    if (lm.yearDemolished != null && lm.yearDemolished <= year) return false;
    return true;
  });
}

// ─── Spawn Conversion ───────────────────────────────────────────

/**
 * Convert a single landmark's primitives to Unreal spawn entries.
 * @param {object} landmark
 * @param {{ lat: number, lon: number }} origin - Georeference origin
 * @returns {object[]} Array of spawn entries
 */
export function landmarkToSpawnList(landmark, origin) {
  const anchorUE = wgs84ToUnreal(landmark.anchor.lat, landmark.anchor.lon, origin);
  const entries = [];

  for (let i = 0; i < landmark.primitives.length; i++) {
    const p = landmark.primitives[i];
    const [ox, oy, oz] = p.offset;
    const [w, d, h] = p.size;

    entries.push({
      label: `${LANDMARK_PREFIX}_${landmark.id}_${i}`,
      shape: p.shape,
      location: [
        anchorUE.x + ox * 100,       // east offset, m→cm
        anchorUE.y - oy * 100,       // north offset, Y-flipped
        oz * 100 + h * 100 / 2       // ground offset + half-height
      ],
      scale: [w, d, h],              // meters = scale factor (100cm base)
      rotation: p.rotation || [0, 0, 0],
      material: p.material || 'stone',
      part: p.part || '',
      landmarkId: landmark.id,
      landmarkName: landmark.name || landmark.id
    });
  }

  return entries;
}

/**
 * Batch convert all landmarks to a flat spawn list.
 * @param {object[]} landmarks
 * @param {{ lat: number, lon: number }} origin
 * @returns {object[]}
 */
export function landmarksToSpawnList(landmarks, origin) {
  return landmarks.flatMap(lm => landmarkToSpawnList(lm, origin));
}

// ─── Python Script Generation ───────────────────────────────────

/**
 * Generate a Python script for batch spawning landmarks in Unreal.
 * Preloads all 4 mesh assets, spawns StaticMeshActors with correct mesh per shape.
 *
 * @param {object[]} spawnList - Output from landmarksToSpawnList()
 * @param {{ clearExisting?: boolean }} opts
 * @returns {string} Python script string
 */
export function buildLandmarkSpawnScript(spawnList, opts = {}) {
  const { clearExisting = false } = opts;

  // Preload all shape meshes into named vars
  const meshLoads = {};
  for (const [shape, assetPath] of Object.entries(SHAPE_ASSETS)) {
    meshLoads[`mesh_${shape}`] = assetPath;
  }

  const header = scriptHeader('Landmark Spawn Script', meshLoads);

  // Build a Python dict mapping shape name → mesh var
  const meshDict = [
    'meshes = {',
    ...Object.keys(SHAPE_ASSETS).map(shape => `    "${shape}": mesh_${shape},`),
    '}',
    ''
  ];

  const clear = clearExisting ? scriptClear(LANDMARK_PREFIX, 'landmark') : [];

  const counter = scriptCounterStart(spawnList.length, 'primitives');

  const items = spawnList.flatMap(s =>
    scriptStaticMeshItem(s, {
      comment: `${s.label} — ${s.part || s.shape} (${s.landmarkName})`,
      meshExpr: `meshes["${s.shape}"]`
    })
  );

  const footer = scriptCounterEnd(spawnList.length, 'Landmarks');

  return joinScript(header, meshDict, clear, counter, items, footer);
}
