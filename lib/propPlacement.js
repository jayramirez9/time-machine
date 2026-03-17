/**
 * Prop Placement — place era-appropriate street furniture along road splines
 *
 * Walks road splines and places props at configured intervals, respecting
 * era rules, road categories, and density weights. Follows the same
 * spline-walking + perpendicular-offset pattern as lampPlacement.js.
 *
 * Placement types:
 * - sidewalk: interval-based along road splines, offset to sidewalk
 * - intersection: one-per-intersection at major crossroads
 * - building_facade: attached to building frontages (future)
 */

import { classifyStreet, findIntersections } from './streetLayout.js';
import { getPropsForRoad } from './propCatalog.js';
import {
  scriptHeader, scriptClear, scriptCounterStart, scriptCounterEnd,
  scriptStaticMeshItem, joinScript,
} from './spawnScript.js';

// ─── Constants ──────────────────────────────────────────────────

export const PROP_PREFIX = 'TM_Prop';
const DEDUP_RADIUS_CM = 300;  // 3m dedup radius between same-type props
const SEED_MULTIPLIER = 2654435761; // Knuth multiplicative hash for deterministic pseudo-random

// ─── Deterministic Pseudo-Random ────────────────────────────────
// Seeded PRNG for consistent prop placement across runs.
// No Math.random() — same spline data always produces same props.

function seededRandom(seed) {
  let s = (seed * SEED_MULTIPLIER) >>> 0;
  s = ((s >>> 16) ^ s) * 0x45d9f3b;
  s = ((s >>> 16) ^ s) * 0x45d9f3b;
  s = (s >>> 16) ^ s;
  return (s & 0x7fffffff) / 0x7fffffff;
}

// ─── Sidewalk Prop Placement ────────────────────────────────────

/**
 * Place sidewalk props along a single road spline.
 *
 * @param {object} spline - { category, points: number[][] }
 * @param {object[]} propDefs - filtered prop definitions (sidewalk placement only)
 * @param {object} streetRules - from classifyStreet()
 * @param {number} splineIndex - for deterministic seeding
 * @returns {object[]} Array of { type, x, y, yaw, propDef }
 */
function placeSidewalkPropsAlongSpline(spline, propDefs, streetRules, splineIndex) {
  const results = [];

  for (const propDef of propDefs) {
    const spacingCm = propDef.spacingM * 100;
    if (spacingCm <= 0) continue;

    const roadHalfWidth = (streetRules.widthM * 100) / 2;
    const offsetCm = roadHalfWidth + (propDef.offsetFromEdgeM * 100);

    // Walk the spline
    let accumulated = spacingCm * 0.3; // stagger start to avoid lamp alignment
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
        const seed = splineIndex * 10000 + pointIndex * 100 + propDef.type.length;
        const roll = seededRandom(seed);
        pointIndex++;

        if (roll > propDef.densityWeight) {
          accumulated += spacingCm;
          continue;
        }

        const px = a[0] + dirX * accumulated;
        const py = a[1] + dirY * accumulated;
        const yaw = Math.atan2(dirY, dirX) * (180 / Math.PI);

        // Place on appropriate side(s)
        if (propDef.sides === 'one' || propDef.sides === 'both') {
          // Left side
          results.push({
            type: propDef.type,
            x: px + perpX * offsetCm,
            y: py + perpY * offsetCm,
            yaw,
            propDef,
          });
        }

        if (propDef.sides === 'both') {
          // Right side
          results.push({
            type: propDef.type,
            x: px - perpX * offsetCm,
            y: py - perpY * offsetCm,
            yaw: yaw + 180,
            propDef,
          });
        }

        accumulated += spacingCm;
      }

      accumulated -= segLen;
    }
  }

  return results;
}

// ─── Intersection Prop Placement ────────────────────────────────

/**
 * Place intersection props (horse troughs, fire alarm boxes, traffic lights, bollards).
 *
 * @param {object[]} intersections - from findIntersections()
 * @param {object[]} propDefs - filtered prop definitions (intersection placement only)
 * @returns {object[]} Array of { type, x, y, yaw, propDef }
 */
function placeIntersectionProps(intersections, propDefs) {
  const results = [];

  for (let i = 0; i < intersections.length; i++) {
    const inter = intersections[i];

    for (const propDef of propDefs) {
      // Density check — deterministic skip
      const roll = seededRandom(i * 1000 + propDef.type.length);
      if (roll > propDef.densityWeight) continue;

      // Offset from intersection center
      const offsetCm = propDef.offsetFromEdgeM * 100 + 200; // 2m + offset from center
      const angle = (i * 137.5) % 360; // golden angle spread
      const rad = angle * (Math.PI / 180);

      results.push({
        type: propDef.type,
        x: inter.x + Math.cos(rad) * offsetCm,
        y: inter.y + Math.sin(rad) * offsetCm,
        yaw: angle,
        propDef,
      });
    }
  }

  return results;
}

// ─── De-duplication ─────────────────────────────────────────────

/**
 * Remove props that are too close to other props of the same type.
 */
function deduplicateProps(props) {
  const radiusSq = DEDUP_RADIUS_CM * DEDUP_RADIUS_CM;
  const kept = [];

  for (const prop of props) {
    let tooClose = false;
    for (const existing of kept) {
      if (existing.type !== prop.type) continue;
      const dx = prop.x - existing.x;
      const dy = prop.y - existing.y;
      if (dx * dx + dy * dy < radiusSq) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) kept.push(prop);
  }

  return kept;
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Place all era-appropriate props along road splines.
 *
 * @param {object[]} splines - Array from roads-splines.json
 * @param {object} opts
 * @param {number} opts.year - Target year for era filtering
 * @param {string} [opts.era] - Era key for street classification
 * @param {string[]} [opts.only] - Only place these prop types (null = all)
 * @param {string[]} [opts.exclude] - Exclude these prop types
 * @returns {object[]} Labeled spawn data array
 */
export function placeProps(splines, opts = {}) {
  const { year, era, only, exclude } = opts;
  if (!year) throw new Error('year is required for prop placement');

  const streetOpts = era ? { era } : {};

  // Collect all sidewalk placements
  let allProps = [];

  for (let si = 0; si < splines.length; si++) {
    const spline = splines[si];
    const rules = classifyStreet(spline.category, streetOpts);
    const propDefs = getPropsForRoad(year, rules.category)
      .filter(p => p.placement === 'sidewalk');

    allProps = allProps.concat(
      placeSidewalkPropsAlongSpline(spline, propDefs, rules, si)
    );
  }

  // Collect intersection placements
  const intersections = findIntersections(splines);
  const interPropDefs = getPropsForRoad(year, 'primary')
    .filter(p => p.placement === 'intersection');
  allProps = allProps.concat(placeIntersectionProps(intersections, interPropDefs));

  // Filter by --only / --exclude
  if (only) {
    allProps = allProps.filter(p => only.includes(p.type));
  }
  if (exclude) {
    allProps = allProps.filter(p => !exclude.includes(p.type));
  }

  // De-duplicate
  const filtered = deduplicateProps(allProps);

  // Convert to labeled spawn data
  const counters = {};
  return filtered.map(p => {
    counters[p.type] = (counters[p.type] || 0) + 1;
    const idx = String(counters[p.type]).padStart(4, '0');
    const [sx, sy, sz] = p.propDef.scaleCm;

    return {
      label: `${PROP_PREFIX}_${p.type}_${idx}`,
      location: [p.x, p.y, p.propDef.heightCm / 2], // center of prop above ground
      scale: [sx / 100, sy / 100, sz / 100], // cm to UE scale (100cm cube = scale 1)
      rotation: [0, p.yaw, 0],
      type: p.type,
      propLabel: p.propDef.label,
    };
  });
}

/**
 * Get placement statistics without generating spawn data.
 *
 * @param {object[]} splines
 * @param {object} opts - same as placeProps
 * @returns {{ total: number, byType: Object<string, number> }}
 */
export function placePropsDryRun(splines, opts = {}) {
  const propList = placeProps(splines, opts);
  const byType = {};
  for (const p of propList) {
    byType[p.type] = (byType[p.type] || 0) + 1;
  }
  return { total: propList.length, byType };
}

// ─── Python Script Generation ───────────────────────────────────

/**
 * Generate a Python script for spawning street props in Unreal.
 *
 * @param {object[]} propList - Output from placeProps()
 * @param {{ clearExisting?: boolean }} [opts]
 * @returns {string} Python script string
 */
export function buildPropSpawnScript(propList, opts = {}) {
  const { clearExisting = false } = opts;

  const header = scriptHeader('Street Prop Spawn Script', {
    mesh: '/Engine/BasicShapes/Cube.Cube',
  });

  const clear = clearExisting ? scriptClear(PROP_PREFIX, 'prop') : [];

  const counter = scriptCounterStart(propList.length, 'street props');

  const items = propList.flatMap(p =>
    scriptStaticMeshItem(p, {
      comment: `${p.propLabel} (${p.type})`,
    })
  );

  const footer = scriptCounterEnd(propList.length, 'Street props');

  return joinScript(header, clear, counter, items, footer);
}
