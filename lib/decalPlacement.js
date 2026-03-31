/**
 * Decal Placement — procedural weathering decal placement on building facades
 * and ground grime along streets
 *
 * Follows the propPlacement.js / lampPlacement.js pattern:
 * - Seeded PRNG for determinism (same inputs = same decals every run)
 * - Building bounding box face walking for facade decals
 * - Street spline walking for ground grime
 * - Radius-based dedup
 */

import { lerp, seededRandom } from './math.js';
import { computeBuildingAge } from './buildingMassing.js';
import { resolveTextureKey } from './materialCatalog.js';
import { getDecalsForMaterial, getGroundGrimeForYear, computeDecalDensity } from './decalCatalog.js';
import {
  scriptHeader, scriptClear, scriptCounterStart, scriptCounterEnd,
  scriptDecalItem, joinScript,
} from './spawnScript.js';

// ─── Constants ──────────────────────────────────────────────────

export const DECAL_PREFIX = 'TM_Decal';
export const GRIME_PREFIX = 'TM_Grime';
const DEDUP_RADIUS_CM = 150;

// ─── Building Face Geometry ─────────────────────────────────────

/**
 * Compute 4 face centers + normals from a building's bounding box.
 * Face 0: +X (east-ish), Face 1: -X (west-ish), Face 2: +Y (north-ish), Face 3: -Y (south-ish)
 * Rotated by building yaw.
 *
 * @param {object} building - Spawn data from footprintToSpawnData
 * @returns {object[]} Array of { centerX, centerY, normalX, normalY, width, height, facing }
 */
function getBuildingFaces(building) {
  const [cx, cy, cz] = building.location;
  const [sx, sy, sz] = building.scale;
  const yawDeg = building.rotation[1];
  const yawRad = yawDeg * (Math.PI / 180);
  const cosY = Math.cos(yawRad);
  const sinY = Math.sin(yawRad);

  const halfW = (sx * 100) / 2; // half-width in cm
  const halfD = (sy * 100) / 2; // half-depth in cm
  const heightCm = sz * 100;    // full height in cm

  // Cardinal face approximation from yaw angle
  const facings = ['east', 'west', 'north', 'south'];

  return [
    { // +X face (east side of local space)
      centerX: cx + cosY * halfW,
      centerY: cy + sinY * halfW,
      normalX: cosY,
      normalY: sinY,
      width: sy * 100,
      height: heightCm,
      facing: facings[0],
    },
    { // -X face (west side)
      centerX: cx - cosY * halfW,
      centerY: cy - sinY * halfW,
      normalX: -cosY,
      normalY: -sinY,
      width: sy * 100,
      height: heightCm,
      facing: facings[1],
    },
    { // +Y face (north side of local space)
      centerX: cx - sinY * halfD,
      centerY: cy + cosY * halfD,
      normalX: -sinY,
      normalY: cosY,
      width: sx * 100,
      height: heightCm,
      facing: facings[2],
    },
    { // -Y face (south side)
      centerX: cx + sinY * halfD,
      centerY: cy - cosY * halfD,
      normalX: sinY,
      normalY: -cosY,
      width: sx * 100,
      height: heightCm,
      facing: facings[3],
    },
  ];
}

/**
 * Check if a face's approximate facing matches a decal's preference.
 */
function matchesFacingPreference(face, preference) {
  if (preference === 'any') return true;
  if (preference === 'north') return face.facing === 'north';
  return true;
}

// ─── Deduplication ──────────────────────────────────────────────

function deduplicateDecals(decals) {
  const radiusSq = DEDUP_RADIUS_CM * DEDUP_RADIUS_CM;
  const kept = [];

  for (const d of decals) {
    let tooClose = false;
    for (const e of kept) {
      const dx = d.location[0] - e.location[0];
      const dy = d.location[1] - e.location[1];
      const dz = d.location[2] - e.location[2];
      if (dx * dx + dy * dy + dz * dz < radiusSq) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) kept.push(d);
  }

  return kept;
}

// ─── Facade Decal Placement ─────────────────────────────────────

/**
 * Place weathering decals on building facades.
 *
 * @param {object[]} spawnList - Building spawn data (from buildingsToSpawnList)
 * @param {object} opts
 * @param {number} opts.year - Target year for era filtering
 * @param {number} [opts.density=0.5] - Density multiplier (0-1)
 * @param {string[]} [opts.only] - Only place these decal types
 * @param {string[]} [opts.exclude] - Exclude these decal types
 * @returns {object[]} Decal spawn data array
 */
export function placeDecals(spawnList, opts = {}) {
  const { year, density = 0.5, only, exclude } = opts;
  if (!year) throw new Error('year is required for decal placement');

  let allDecals = [];
  const counters = {};

  for (let bi = 0; bi < spawnList.length; bi++) {
    const building = spawnList[bi];
    const textureKey = resolveTextureKey(building.styleName);
    const age = computeBuildingAge(building.yearBuilt, year);
    const eligibleDecals = textureKey
      ? getDecalsForMaterial(textureKey, year)
      : getDecalsForMaterial(null, year).filter(d => d.materialAffinity === null);

    const faces = getBuildingFaces(building);

    for (let fi = 0; fi < faces.length; fi++) {
      const face = faces[fi];

      for (const decalDef of eligibleDecals) {
        // Facing preference check
        if (!matchesFacingPreference(face, decalDef.facingPreference)) continue;

        // --only / --exclude filtering
        if (only && !only.includes(decalDef.type)) continue;
        if (exclude && exclude.includes(decalDef.type)) continue;

        // How many decals on this face?
        const effectiveDensity = computeDecalDensity(decalDef, age, density);
        const maxCount = Math.max(1, Math.floor(face.width / decalDef.scaleRange[1]));
        const targetCount = Math.floor(maxCount * effectiveDensity);

        for (let di = 0; di < targetCount; di++) {
          const baseSeed = bi * 100000 + fi * 10000 + decalDef.type.length * 100 + di;

          // Density roll
          const roll = seededRandom(baseSeed);
          if (roll > effectiveDensity) continue;

          // Position on face (u = horizontal 0-1, v = vertical 0-1 clamped to heightRange)
          const u = seededRandom(baseSeed + 1);
          const vRaw = seededRandom(baseSeed + 2);
          const v = lerp(decalDef.heightRange[0], decalDef.heightRange[1], vRaw);

          // World position
          const lateralOffset = (u - 0.5) * face.width;
          // Perpendicular to normal (tangent direction) — 90° rotation of face normal
          const tanX = -face.normalY;
          const tanY = face.normalX;
          const worldX = face.centerX + tanX * lateralOffset + face.normalX * 5; // 5cm offset from wall
          const worldY = face.centerY + tanY * lateralOffset + face.normalY * 5;
          const worldZ = v * face.height;

          // Decal scale
          const scaleW = lerp(decalDef.scaleRange[0], decalDef.scaleRange[1], seededRandom(baseSeed + 3));
          const aspect = lerp(decalDef.aspectRatio[0], decalDef.aspectRatio[1], seededRandom(baseSeed + 4));
          const scaleH = scaleW * aspect;

          // Rotation: face the wall (normal direction)
          const normalYaw = Math.atan2(face.normalY, face.normalX) * (180 / Math.PI);

          counters[decalDef.type] = (counters[decalDef.type] || 0) + 1;
          const idx = String(counters[decalDef.type]).padStart(4, '0');

          allDecals.push({
            label: `${DECAL_PREFIX}_${decalDef.type}_${idx}`,
            location: [worldX, worldY, worldZ],
            rotation: [0, normalYaw, 0],
            size: [scaleW, scaleH, 20],  // depth = 20cm projection
            type: decalDef.type,
            decalLabel: decalDef.label,
            decalMaterial: decalDef.decalMaterial,
          });
        }
      }
    }
  }

  return deduplicateDecals(allDecals);
}

// ─── Ground Grime Placement ─────────────────────────────────────

/**
 * Place ground grime decals along street splines.
 *
 * @param {object[]} splines - Road spline data (from roads-splines.json)
 * @param {object} opts
 * @param {number} opts.year - Target year for era filtering
 * @param {number} [opts.density=0.5] - Density multiplier (0-1)
 * @param {string[]} [opts.only] - Only place these grime types
 * @param {string[]} [opts.exclude] - Exclude these grime types
 * @returns {object[]} Grime spawn data array
 */
export function placeGroundGrime(splines, opts = {}) {
  const { year, density = 0.5, only, exclude } = opts;
  if (!year) throw new Error('year is required for ground grime placement');

  const grimeTypes = getGroundGrimeForYear(year);
  let allGrime = [];
  const counters = {};
  const spacingCm = 1500; // 15m between grime placements

  for (let si = 0; si < splines.length; si++) {
    const spline = splines[si];
    if (!spline.points || spline.points.length < 2) continue;

    for (const grimeDef of grimeTypes) {
      if (only && !only.includes(grimeDef.type)) continue;
      if (exclude && exclude.includes(grimeDef.type)) continue;

      let accumulated = spacingCm * 0.5;

      for (let pi = 0; pi < spline.points.length - 1; pi++) {
        const a = spline.points[pi];
        const b = spline.points[pi + 1];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const segLen = Math.sqrt(dx * dx + dy * dy);

        if (segLen < 10) continue;

        const dirX = dx / segLen;
        const dirY = dy / segLen;

        while (accumulated < segLen) {
          const seed = si * 100000 + pi * 1000 + grimeDef.type.length * 10 + Math.floor(accumulated / spacingCm);
          const roll = seededRandom(seed);

          if (roll < grimeDef.baseDensityWeight * density) {
            const px = a[0] + dirX * accumulated;
            const py = a[1] + dirY * accumulated;

            // Random lateral offset within road width
            const lateralOffset = (seededRandom(seed + 1) - 0.5) * 400; // ±2m
            const perpX = -dirY;
            const perpY = dirX;

            const scale = lerp(grimeDef.scaleRange[0], grimeDef.scaleRange[1], seededRandom(seed + 2));
            const yaw = seededRandom(seed + 3) * 360;

            counters[grimeDef.type] = (counters[grimeDef.type] || 0) + 1;
            const idx = String(counters[grimeDef.type]).padStart(4, '0');

            allGrime.push({
              label: `${GRIME_PREFIX}_${grimeDef.type}_${idx}`,
              location: [px + perpX * lateralOffset, py + perpY * lateralOffset, 1], // 1cm above ground
              rotation: [90, yaw, 0], // pitch 90 = project downward
              size: [scale, scale, 50], // square decal, 50cm projection depth
              type: grimeDef.type,
              decalLabel: grimeDef.label,
              decalMaterial: grimeDef.decalMaterial,
            });
          }

          accumulated += spacingCm;
        }

        accumulated -= segLen;
      }
    }
  }

  return deduplicateDecals(allGrime);
}

// ─── Python Script Generation ───────────────────────────────────

/**
 * Generate a Python script for spawning decals in Unreal.
 *
 * @param {object[]} decalList - Combined facade + grime decal spawn data
 * @param {{ clearExisting?: boolean, clearPrefixes?: string[] }} [opts]
 * @returns {string} Python script string
 */
export function buildDecalSpawnScript(decalList, opts = {}) {
  const { clearExisting = false, clearPrefixes = [DECAL_PREFIX, GRIME_PREFIX] } = opts;

  const header = scriptHeader('Decal Spawn Script');
  const clear = clearExisting ? scriptClear(clearPrefixes, 'decal/grime') : [];
  const counter = scriptCounterStart(decalList.length, 'decals');

  const items = decalList.flatMap(d =>
    scriptDecalItem(d, { comment: `${d.decalLabel} (${d.type})` })
  );

  const footer = scriptCounterEnd(decalList.length, 'Decals');

  return joinScript(header, clear, counter, items, footer);
}
