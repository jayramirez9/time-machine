/**
 * Street Meshing — Convert road spline data to Unreal spawn data
 *
 * Takes road splines (already in Unreal coordinates from osmVectors.js) and
 * converts each segment between control points into a flat Cube mesh actor
 * with correct position, width, rotation, and surface classification.
 *
 * Follows the same pattern as buildingMassing.js — generates spawn lists
 * and Python batch scripts for RC API execution.
 */

import { classifyStreet } from './streetLayout.js';
import {
  scriptHeader, scriptClear, scriptCounterStart, scriptCounterEnd,
  scriptStaticMeshItem, scriptMaterialSetup, joinScript
} from './spawnScript.js';
import {
  collectMaterialPreloads, materialVarName,
  getSurfaceRecipe, collectUniqueRecipes
} from './materialCatalog.js';

// ─── Constants ──────────────────────────────────────────────────

const UE_CUBE_SIZE_CM = 100;       // Unreal default cube is 100cm per side
const STREET_HEIGHT_CM = 10;       // Street slab thickness (visible but not blocking)
const SIDEWALK_HEIGHT_CM = 15;     // Slightly raised for curb effect
const SIDEWALK_OFFSET_CM = 150;    // 1.5m gap between road edge and sidewalk center

export const STREET_PREFIX = 'TM_Street';
export const SIDEWALK_PREFIX = 'TM_Sidewalk';

// ─── Geometry Helpers ───────────────────────────────────────────

/**
 * Compute segment properties between two Unreal-space control points.
 * @param {number[]} a - [x, y, z] start point in cm
 * @param {number[]} b - [x, y, z] end point in cm
 * @returns {{ cx: number, cy: number, length: number, yaw: number }}
 */
function segmentGeometry(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.sqrt(dx * dx + dy * dy);
  const yaw = Math.atan2(dy, dx) * (180 / Math.PI);

  return {
    cx: (a[0] + b[0]) / 2,
    cy: (a[1] + b[1]) / 2,
    length,
    yaw
  };
}

/**
 * Compute perpendicular offset points for sidewalk placement.
 * @param {number} cx - Segment center X
 * @param {number} cy - Segment center Y
 * @param {number} yaw - Segment yaw in degrees
 * @param {number} offsetCm - Distance from center to offset point
 * @returns {{ left: { x: number, y: number }, right: { x: number, y: number } }}
 */
function perpendicularOffset(cx, cy, yaw, offsetCm) {
  const rad = yaw * (Math.PI / 180);
  // Perpendicular direction (rotate 90 degrees)
  const px = -Math.sin(rad) * offsetCm;
  const py = Math.cos(rad) * offsetCm;

  return {
    left:  { x: cx + px, y: cy + py },
    right: { x: cx - px, y: cy - py }
  };
}

// ─── Core Conversion ────────────────────────────────────────────

/**
 * Convert a single road spline to an array of street segment spawn data.
 * Each pair of adjacent control points becomes one flat Cube actor.
 *
 * @param {object} spline - { category: string, points: number[][] }
 * @param {{ era?: string, includeSidewalks?: boolean }} [opts]
 * @returns {object[]} Array of spawn data objects
 */
export function splineToStreetSegments(spline, opts = {}) {
  const { era, includeSidewalks = true } = opts;
  const rules = classifyStreet(spline.category, { era });
  const widthCm = rules.widthM * 100;
  const segments = [];

  for (let i = 0; i < spline.points.length - 1; i++) {
    const a = spline.points[i];
    const b = spline.points[i + 1];
    const geo = segmentGeometry(a, b);

    // Skip very short segments (< 1m)
    if (geo.length < 100) continue;

    // Street slab
    segments.push({
      type: 'street',
      prefix: STREET_PREFIX,
      location: [geo.cx, geo.cy, STREET_HEIGHT_CM / 2],
      scale: [
        geo.length / UE_CUBE_SIZE_CM,
        widthCm / UE_CUBE_SIZE_CM,
        STREET_HEIGHT_CM / UE_CUBE_SIZE_CM
      ],
      rotation: [0, geo.yaw, 0],
      surface: rules.surface,
      category: rules.category,
      widthM: rules.widthM
    });

    // Sidewalks (if applicable)
    if (includeSidewalks && rules.sidewalkWidthM > 0) {
      const swWidthCm = rules.sidewalkWidthM * 100;
      const offsetCm = widthCm / 2 + SIDEWALK_OFFSET_CM;
      const offsets = perpendicularOffset(geo.cx, geo.cy, geo.yaw, offsetCm);

      for (const side of [offsets.left, offsets.right]) {
        segments.push({
          type: 'sidewalk',
          prefix: SIDEWALK_PREFIX,
          location: [side.x, side.y, SIDEWALK_HEIGHT_CM / 2],
          scale: [
            geo.length / UE_CUBE_SIZE_CM,
            swWidthCm / UE_CUBE_SIZE_CM,
            SIDEWALK_HEIGHT_CM / UE_CUBE_SIZE_CM
          ],
          rotation: [0, geo.yaw, 0],
          surface: rules.sidewalkSurface,
          category: rules.category,
          widthM: rules.sidewalkWidthM
        });
      }
    }
  }

  return segments;
}

/**
 * Batch convert all road splines to labeled spawn data.
 *
 * @param {object[]} splines - Array from roads-splines.json
 * @param {{ era?: string, includeSidewalks?: boolean }} [opts]
 * @returns {object[]} Array of spawn data with labels
 */
export function streetsToSpawnList(splines, opts = {}) {
  let streetIdx = 0;
  let sidewalkIdx = 0;
  const all = [];

  for (const spline of splines) {
    const segments = splineToStreetSegments(spline, opts);
    for (const seg of segments) {
      if (seg.type === 'street') {
        seg.label = `${STREET_PREFIX}_${String(streetIdx).padStart(4, '0')}_${seg.surface}`;
        streetIdx++;
      } else {
        seg.label = `${SIDEWALK_PREFIX}_${String(sidewalkIdx).padStart(4, '0')}_${seg.surface}`;
        sidewalkIdx++;
      }
      all.push(seg);
    }
  }

  return all;
}

/**
 * Generate a Python script for batch spawning street elements in Unreal.
 * Follows the buildingMassing.js buildSpawnScript() pattern.
 *
 * @param {object[]} spawnList - Output from streetsToSpawnList()
 * @param {{ clearExisting?: boolean, era?: string, daemonUrl?: string }} [opts]
 * @returns {string} Python script string
 */
export function buildStreetSpawnScript(spawnList, opts = {}) {
  const { clearExisting = false, era = null, daemonUrl = null } = opts;

  // Single pass: resolve recipe, material path, and var name per segment
  const itemMaterialVars = [];
  const rawPaths = [];
  const rawRecipes = [];
  for (const s of spawnList) {
    const recipe = s.surface ? getSurfaceRecipe(s.surface) : null;
    rawRecipes.push(recipe);
    const matPath = recipe ? recipe.miPath : null;
    rawPaths.push(matPath);
    itemMaterialVars.push(matPath ? materialVarName(matPath) : null);
  }
  const materialPreloads = collectMaterialPreloads(rawPaths.filter(Boolean));
  const recipes = collectUniqueRecipes(rawRecipes);
  const materialSetup = daemonUrl ? scriptMaterialSetup(recipes, daemonUrl) : [];

  const header = scriptHeader('Street Layout Spawn Script', {
    mesh: '/Engine/BasicShapes/Cube.Cube'
  }, materialPreloads);

  const clear = clearExisting
    ? scriptClear([STREET_PREFIX, SIDEWALK_PREFIX], 'street and sidewalk')
    : [];

  const counter = scriptCounterStart(spawnList.length, 'street elements');

  const items = spawnList.flatMap((s, i) =>
    scriptStaticMeshItem(s, {
      comment: `${s.label} — ${s.surface}, ${s.widthM}m wide`,
      materialVar: itemMaterialVars[i]
    })
  );

  const footer = scriptCounterEnd(spawnList.length, 'Street layout');

  return joinScript(header, materialSetup, clear, counter, items, footer);
}
