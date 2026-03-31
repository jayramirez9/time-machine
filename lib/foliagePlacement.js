/**
 * Foliage Placement — place era-appropriate vegetation along road splines
 *
 * Walks road splines and places street trees at configured intervals, offset
 * to sidewalk edges. Ground cover uses grid scatter within bounds. Building-
 * base foliage walks building footprint perimeters.
 *
 * Placement types:
 * - sidewalk: interval-based along road splines, offset to sidewalk edge
 * - grid: scatter within rectangular bounds (ground cover)
 * - perimeter: walk building footprint edges (building-base foliage)
 *
 * Follows the same spline-walking + perpendicular-offset pattern as
 * propPlacement.js and lampPlacement.js.
 */

import { seededRandom } from './math.js';
import { classifyStreet } from './streetLayout.js';
import { getFoliageForRegion, getFoliageByCategory } from './foliageCatalog.js';
import {
  scriptHeader, scriptClear, scriptCounterStart, scriptCounterEnd,
  scriptStaticMeshItem, joinScript,
} from './spawnScript.js';

// ─── Constants ──────────────────────────────────────────────────

export const TREE_PREFIX = 'TM_Tree';
export const FOLIAGE_PREFIX = 'TM_Foliage';
const TREE_DEDUP_RADIUS_CM = 500;    // 5m dedup radius between trees
const GROUND_DEDUP_RADIUS_CM = 100;  // 1m dedup radius for ground cover

// ─── Street Tree Placement ──────────────────────────────────────

/**
 * Place street trees along a single road spline.
 *
 * @param {object} spline - { category, points: number[][] }
 * @param {object[]} treeDefs - filtered foliage definitions (street_tree category)
 * @param {object} streetRules - from classifyStreet()
 * @param {number} splineIndex - for deterministic seeding
 * @param {number} density - density multiplier 0-1
 * @returns {object[]} Array of { type, x, y, yaw, foliageDef }
 */
function placeTreesAlongSpline(spline, treeDefs, streetRules, splineIndex, density) {
  const results = [];
  if (streetRules.sidewalkWidthM <= 0) return results;

  for (const treeDef of treeDefs) {
    const spacingCm = treeDef.spacingM * 100;
    if (spacingCm <= 0) continue;

    // Check road category filter
    if (treeDef.roadCategories && !treeDef.roadCategories.includes(streetRules.category)) {
      continue;
    }

    const roadHalfWidth = (streetRules.widthM * 100) / 2;
    const offsetCm = roadHalfWidth + (treeDef.offsetFromEdgeM * 100);

    // Walk the spline
    let accumulated = spacingCm * 0.5; // offset start to avoid lamp/prop alignment
    let pointIndex = 0;

    for (let i = 0; i < spline.points.length - 1; i++) {
      const a = spline.points[i];
      const b = spline.points[i + 1];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const segLen = Math.sqrt(dx * dx + dy * dy);

      if (segLen < 10) continue;

      const dirX = dx / segLen;
      const dirY = dy / segLen;
      const perpX = -dirY;
      const perpY = dirX;

      while (accumulated < segLen) {
        // Density check — use seeded random to skip some placements
        const seed = splineIndex * 10000 + pointIndex * 100 + treeDef.type.length;
        const roll = seededRandom(seed);
        pointIndex++;

        if (roll > treeDef.densityWeight * density) {
          accumulated += spacingCm;
          continue;
        }

        const px = a[0] + dirX * accumulated;
        const py = a[1] + dirY * accumulated;
        // Slight yaw jitter for natural look
        const baseYaw = Math.atan2(dirY, dirX) * (180 / Math.PI);
        const yawJitter = (seededRandom(seed + 7) - 0.5) * 30;
        const yaw = baseYaw + yawJitter;

        // Place on appropriate side(s)
        if (treeDef.sides === 'one' || treeDef.sides === 'both') {
          results.push({
            type: treeDef.type,
            x: px + perpX * offsetCm,
            y: py + perpY * offsetCm,
            yaw,
            foliageDef: treeDef,
          });
        }

        if (treeDef.sides === 'both') {
          results.push({
            type: treeDef.type,
            x: px - perpX * offsetCm,
            y: py - perpY * offsetCm,
            yaw: yaw + 180,
            foliageDef: treeDef,
          });
        }

        accumulated += spacingCm;
      }

      accumulated -= segLen;
    }
  }

  return results;
}

// ─── De-duplication ─────────────────────────────────────────────

/**
 * Remove foliage that is too close to other foliage of the same type.
 */
function deduplicateFoliage(items, radiusCm) {
  const radiusSq = radiusCm * radiusCm;
  const kept = [];

  for (const item of items) {
    let tooClose = false;
    for (const existing of kept) {
      if (existing.type !== item.type) continue;
      const dx = item.x - existing.x;
      const dy = item.y - existing.y;
      if (dx * dx + dy * dy < radiusSq) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) kept.push(item);
  }

  return kept;
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Place street trees along road splines.
 *
 * @param {object[]} splines - Array from roads-splines.json
 * @param {object} opts
 * @param {number} opts.year - Target year for era filtering
 * @param {string} [opts.region='northeast_us'] - Region for species filtering
 * @param {number} [opts.month=6] - Month (1-12) for seasonal weighting
 * @param {number} [opts.density=0.5] - Density multiplier 0-1
 * @param {string} [opts.era] - Era key for street classification
 * @param {string[]} [opts.only] - Only place these foliage types (null = all)
 * @param {string[]} [opts.exclude] - Exclude these foliage types
 * @returns {object[]} Labeled spawn data array
 */
export function placeStreetTrees(splines, opts = {}) {
  const { year, region = 'northeast_us', month = 6, density = 0.5, era, only, exclude } = opts;
  if (!year) throw new Error('year is required for foliage placement');

  const streetOpts = era ? { era } : {};

  let treeDefs = getFoliageByCategory(year, region, 'street_tree');

  // Filter by --only / --exclude
  if (only) treeDefs = treeDefs.filter(f => only.includes(f.type));
  if (exclude) treeDefs = treeDefs.filter(f => !exclude.includes(f.type));

  let allTrees = [];

  for (let si = 0; si < splines.length; si++) {
    const spline = splines[si];
    const rules = classifyStreet(spline.category, streetOpts);
    allTrees = allTrees.concat(
      placeTreesAlongSpline(spline, treeDefs, rules, si, density)
    );
  }

  // De-duplicate
  const filtered = deduplicateFoliage(allTrees, TREE_DEDUP_RADIUS_CM);

  // Convert to labeled spawn data
  const counters = {};
  return filtered.map(t => {
    counters[t.type] = (counters[t.type] || 0) + 1;
    const idx = String(counters[t.type]).padStart(4, '0');
    const [sx, sy, sz] = t.foliageDef.scaleCm;

    return {
      label: `${TREE_PREFIX}_${t.type}_${idx}`,
      location: [t.x, t.y, t.foliageDef.heightCm / 2],
      scale: [sx / 100, sy / 100, sz / 100],
      rotation: [0, t.yaw, 0],
      type: t.type,
      foliageLabel: t.foliageDef.label,
    };
  });
}

/**
 * Place ground cover via grid scatter within rectangular bounds.
 *
 * @param {{ minX: number, minY: number, maxX: number, maxY: number }} bounds - Area in cm
 * @param {object} opts
 * @param {number} opts.year - Target year for era filtering
 * @param {string} [opts.region='northeast_us'] - Region for species filtering
 * @param {number} [opts.month=6] - Month (1-12) for seasonal weighting
 * @param {number} [opts.density=0.5] - Density multiplier 0-1
 * @param {string[]} [opts.only] - Only place these foliage types (null = all)
 * @param {string[]} [opts.exclude] - Exclude these foliage types
 * @returns {object[]} Labeled spawn data array
 */
export function placeGroundCover(bounds, opts = {}) {
  const { year, region = 'northeast_us', month = 6, density = 0.5, only, exclude } = opts;
  if (!year) throw new Error('year is required for foliage placement');

  let coverDefs = getFoliageByCategory(year, region, 'ground_cover');

  // Filter by --only / --exclude
  if (only) coverDefs = coverDefs.filter(f => only.includes(f.type));
  if (exclude) coverDefs = coverDefs.filter(f => !exclude.includes(f.type));

  let allCover = [];

  for (const coverDef of coverDefs) {
    const spacingCm = coverDef.spacingM * 100;
    if (spacingCm <= 0) continue;

    let pointIndex = 0;
    for (let x = bounds.minX; x <= bounds.maxX; x += spacingCm) {
      for (let y = bounds.minY; y <= bounds.maxY; y += spacingCm) {
        const seed = pointIndex * 1000 + coverDef.type.length;
        const roll = seededRandom(seed);
        pointIndex++;

        if (roll > coverDef.densityWeight * density) continue;

        // Jitter position for natural scatter
        const jitterX = (seededRandom(seed + 1) - 0.5) * spacingCm * 0.6;
        const jitterY = (seededRandom(seed + 2) - 0.5) * spacingCm * 0.6;
        const yaw = seededRandom(seed + 3) * 360;

        allCover.push({
          type: coverDef.type,
          x: x + jitterX,
          y: y + jitterY,
          yaw,
          foliageDef: coverDef,
        });
      }
    }
  }

  // De-duplicate
  const filtered = deduplicateFoliage(allCover, GROUND_DEDUP_RADIUS_CM);

  // Convert to labeled spawn data
  const counters = {};
  return filtered.map(c => {
    counters[c.type] = (counters[c.type] || 0) + 1;
    const idx = String(counters[c.type]).padStart(4, '0');
    const [sx, sy, sz] = c.foliageDef.scaleCm;

    return {
      label: `${FOLIAGE_PREFIX}_${c.type}_${idx}`,
      location: [c.x, c.y, c.foliageDef.heightCm / 2],
      scale: [sx / 100, sy / 100, sz / 100],
      rotation: [0, c.yaw, 0],
      type: c.type,
      foliageLabel: c.foliageDef.label,
    };
  });
}

// ─── Python Script Generation ───────────────────────────────────

/**
 * Generate a Python script for spawning vegetation in Unreal.
 *
 * @param {object[]} foliageList - Output from placeStreetTrees() and/or placeGroundCover()
 * @param {{ clearExisting?: boolean }} [opts]
 * @returns {string} Python script string
 */
export function buildFoliageSpawnScript(foliageList, opts = {}) {
  const { clearExisting = false } = opts;

  const header = scriptHeader('Vegetation Spawn Script', {
    mesh: '/Engine/BasicShapes/Cube.Cube',
  });

  const clearLines = [];
  if (clearExisting) {
    clearLines.push(...scriptClear(TREE_PREFIX, 'tree'));
    clearLines.push(...scriptClear(FOLIAGE_PREFIX, 'foliage'));
  }

  const counter = scriptCounterStart(foliageList.length, 'vegetation items');

  const items = foliageList.flatMap(f =>
    scriptStaticMeshItem(f, {
      comment: `${f.foliageLabel} (${f.type})`,
    })
  );

  const footer = scriptCounterEnd(foliageList.length, 'Vegetation items');

  return joinScript(header, clearLines, counter, items, footer);
}
