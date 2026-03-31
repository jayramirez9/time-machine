/**
 * Clutter Placement — scatter detail props and environmental clutter
 *
 * Three placement modes:
 * - Street clutter: density-based scatter along road splines (newspapers, leaves, manure)
 * - Cloth items: facade-attached cloth sim items (awnings, laundry, flags)
 * - Animated props: facade/rooftop animated items (signs, weathervanes, rocking chairs)
 *
 * Uses the same seeded PRNG and dedup pattern as propPlacement.js for
 * deterministic, reproducible scatter across runs.
 */

import { seededRandom } from './math.js';
import { classifyStreet } from './streetLayout.js';
import {
  getClutterForRoad,
  getClutterByCategory,
  computeSeasonalDensity,
} from './clutterCatalog.js';
import {
  scriptHeader, scriptClear, scriptCounterStart, scriptCounterEnd,
  scriptStaticMeshItem, joinScript,
} from './spawnScript.js';

// ─── Constants ──────────────────────────────────────────────────

export const CLUTTER_PREFIX = 'TM_Clutter';
const DEDUP_RADIUS_CM = 200;  // 2m dedup radius between same-type clutter

// ─── Horse Manure Density Decline ───────────────────────────────

/**
 * Horse manure density declines 2% per year after 1900, near-zero by 1950.
 * @param {number} year
 * @returns {number} multiplier 0-1
 */
function horseManureDensityMultiplier(year) {
  if (year <= 1900) return 1.0;
  const decline = (year - 1900) * 0.02;
  return Math.max(0, 1.0 - decline);
}

// ─── De-duplication ─────────────────────────────────────────────

/**
 * Remove clutter items that are too close to other items of the same type.
 */
function deduplicateClutter(items) {
  const radiusSq = DEDUP_RADIUS_CM * DEDUP_RADIUS_CM;
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

// ─── Street Clutter Placement ───────────────────────────────────

/**
 * Scatter ground-level clutter along road splines using density-based placement.
 *
 * Unlike prop placement (interval-based), clutter uses scatterDensityPer100m
 * to determine how many items per segment, then picks random positions along it.
 *
 * @param {object[]} splines - Array from roads-splines.json
 * @param {object} opts
 * @param {number} opts.year - Target year for era filtering
 * @param {number} [opts.month=6] - Month for seasonal density modulation
 * @param {number} [opts.density=0.5] - Global density multiplier (0-1)
 * @param {string[]} [opts.only] - Only place these types
 * @param {string[]} [opts.exclude] - Exclude these types
 * @returns {object[]} Array of { type, x, y, yaw, clutterDef }
 */
export function placeStreetClutter(splines, opts = {}) {
  const { year, month = 6, density = 0.5, only, exclude } = opts;
  if (!year) throw new Error('year is required for clutter placement');

  let allItems = [];

  for (let si = 0; si < splines.length; si++) {
    const spline = splines[si];
    const rules = classifyStreet(spline.category);

    // Get ground-level clutter for this road type
    let clutterDefs = getClutterForRoad(year, rules.category)
      .filter(c => c.category === 'clutter');

    // Apply --only / --exclude
    if (only) clutterDefs = clutterDefs.filter(c => only.includes(c.type));
    if (exclude) clutterDefs = clutterDefs.filter(c => !exclude.includes(c.type));

    for (const clutterDef of clutterDefs) {
      // Walk each segment and scatter based on density
      for (let i = 0; i < spline.points.length - 1; i++) {
        const a = spline.points[i];
        const b = spline.points[i + 1];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const segLen = Math.sqrt(dx * dx + dy * dy);

        if (segLen < 50) continue; // skip tiny segments

        const dirX = dx / segLen;
        const dirY = dy / segLen;
        const perpX = -dirY;
        const perpY = dirX;

        // Compute effective density
        const roadHalfWidth = (rules.widthM * 100) / 2;
        const segLenM = segLen / 100;
        let effectiveDensity = clutterDef.scatterDensityPer100m * (segLenM / 100)
          * clutterDef.densityWeight * density;

        // Seasonal modulation
        effectiveDensity *= computeSeasonalDensity(clutterDef, month);

        // Horse manure decline post-1900
        if (clutterDef.type === 'horse_manure') {
          effectiveDensity *= horseManureDensityMultiplier(year);
        }

        const count = Math.floor(effectiveDensity);

        for (let k = 0; k < count; k++) {
          const seed = si * 100000 + i * 1000 + k * 10 + clutterDef.type.length;
          const t = seededRandom(seed); // position along segment (0-1)
          const lateralSeed = seededRandom(seed + 1);

          // Position along segment
          const px = a[0] + dirX * segLen * t;
          const py = a[1] + dirY * segLen * t;

          // Offset to gutter/sidewalk edge
          const offsetCm = roadHalfWidth + (clutterDef.offsetFromEdgeM * 100);
          const side = lateralSeed > 0.5 ? 1 : -1;

          const yaw = seededRandom(seed + 2) * 360;

          allItems.push({
            type: clutterDef.type,
            x: px + perpX * offsetCm * side,
            y: py + perpY * offsetCm * side,
            yaw,
            clutterDef,
          });
        }
      }
    }
  }

  return deduplicateClutter(allItems);
}

// ─── Cloth Item Placement ───────────────────────────────────────

/**
 * Place cloth simulation items at building facade positions.
 *
 * For each building, a seeded PRNG decides which cloth items appear based
 * on density weight. Items are placed at the configured height on the
 * building's street-facing facade.
 *
 * @param {object[]} buildings - Array of building features from buildings.geojson
 * @param {object} opts
 * @param {number} opts.year - Target year for era filtering
 * @param {string[]} [opts.only] - Only place these types
 * @param {string[]} [opts.exclude] - Exclude these types
 * @returns {object[]} Array of { type, x, y, yaw, clutterDef }
 */
export function placeClothItems(buildings, opts = {}) {
  const { year, only, exclude } = opts;
  if (!year) throw new Error('year is required for cloth placement');

  let clothDefs = getClutterByCategory(year, 'cloth');
  if (only) clothDefs = clothDefs.filter(c => only.includes(c.type));
  if (exclude) clothDefs = clothDefs.filter(c => !exclude.includes(c.type));

  const results = [];

  for (let bi = 0; bi < buildings.length; bi++) {
    const bldg = buildings[bi];
    const coords = bldg.geometry?.coordinates?.[0];
    if (!coords || coords.length < 2) continue;

    // Use first edge as facade
    const facadeX = (coords[0][0] + coords[1][0]) / 2;
    const facadeY = (coords[0][1] + coords[1][1]) / 2;
    const edgeDx = coords[1][0] - coords[0][0];
    const edgeDy = coords[1][1] - coords[0][1];
    const facadeYaw = Math.atan2(edgeDy, edgeDx) * (180 / Math.PI);

    for (const clothDef of clothDefs) {
      const seed = bi * 10000 + clothDef.type.length * 100;
      const roll = seededRandom(seed);
      if (roll > clothDef.densityWeight) continue;

      results.push({
        type: clothDef.type,
        x: facadeX,
        y: facadeY,
        yaw: facadeYaw,
        clutterDef: clothDef,
      });
    }
  }

  return results;
}

// ─── Animated Prop Placement ────────────────────────────────────

/**
 * Place animated props at building facade or rooftop positions.
 *
 * @param {object[]} buildings - Array of building features from buildings.geojson
 * @param {object} opts
 * @param {number} opts.year - Target year for era filtering
 * @param {string[]} [opts.only] - Only place these types
 * @param {string[]} [opts.exclude] - Exclude these types
 * @returns {object[]} Array of { type, x, y, yaw, clutterDef }
 */
export function placeAnimatedProps(buildings, opts = {}) {
  const { year, only, exclude } = opts;
  if (!year) throw new Error('year is required for animated prop placement');

  let animDefs = getClutterByCategory(year, 'animated');
  if (only) animDefs = animDefs.filter(c => only.includes(c.type));
  if (exclude) animDefs = animDefs.filter(c => !exclude.includes(c.type));

  const results = [];

  for (let bi = 0; bi < buildings.length; bi++) {
    const bldg = buildings[bi];
    const coords = bldg.geometry?.coordinates?.[0];
    if (!coords || coords.length < 2) continue;

    // Use first edge as facade, centroid for rooftop
    const facadeX = (coords[0][0] + coords[1][0]) / 2;
    const facadeY = (coords[0][1] + coords[1][1]) / 2;
    const edgeDx = coords[1][0] - coords[0][0];
    const edgeDy = coords[1][1] - coords[0][1];
    const facadeYaw = Math.atan2(edgeDy, edgeDx) * (180 / Math.PI);

    // Centroid for rooftop items
    let cx = 0, cy = 0;
    for (const pt of coords) { cx += pt[0]; cy += pt[1]; }
    cx /= coords.length;
    cy /= coords.length;

    const stories = bldg.properties?.stories || 3;

    for (const animDef of animDefs) {
      const seed = bi * 10000 + animDef.type.length * 100 + 7;
      const roll = seededRandom(seed);
      if (roll > animDef.densityWeight) continue;

      const isRooftop = animDef.placement === 'rooftop';
      const baseHeight = isRooftop ? stories * 350 : 0;

      results.push({
        type: animDef.type,
        x: isRooftop ? cx : facadeX,
        y: isRooftop ? cy : facadeY,
        yaw: isRooftop ? seededRandom(seed + 3) * 360 : facadeYaw,
        clutterDef: animDef,
        _baseHeight: baseHeight,
      });
    }
  }

  return results;
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Convert raw placement data to labeled spawn data.
 *
 * @param {object[]} items - from placeStreetClutter / placeClothItems / placeAnimatedProps
 * @returns {object[]} Labeled spawn data array
 */
function toSpawnData(items) {
  const counters = {};
  return items.map(item => {
    counters[item.type] = (counters[item.type] || 0) + 1;
    const idx = String(counters[item.type]).padStart(4, '0');
    const [sx, sy, sz] = item.clutterDef.scaleCm;
    const baseHeight = item._baseHeight || 0;

    return {
      label: `${CLUTTER_PREFIX}_${item.type}_${idx}`,
      location: [item.x, item.y, baseHeight + item.clutterDef.heightCm / 2],
      scale: [sx / 100, sy / 100, sz / 100],
      rotation: [0, item.yaw, 0],
      type: item.type,
      clutterLabel: item.clutterDef.label,
      animationType: item.clutterDef.animationType,
    };
  });
}

/**
 * Place all clutter types and return labeled spawn data.
 *
 * @param {object[]} splines - Road splines for ground scatter
 * @param {object[]} buildings - Building features for facade/rooftop items
 * @param {object} opts
 * @param {number} opts.year - Target year
 * @param {number} [opts.month=6] - Month for seasonal modulation
 * @param {number} [opts.density=0.5] - Global density multiplier
 * @param {string[]} [opts.only] - Only place these types
 * @param {string[]} [opts.exclude] - Exclude these types
 * @param {boolean} [opts.noCloth=false] - Skip cloth items
 * @param {boolean} [opts.noAnimated=false] - Skip animated items
 * @returns {object[]} Labeled spawn data array
 */
export function placeAllClutter(splines, buildings, opts = {}) {
  const { noCloth = false, noAnimated = false } = opts;

  const streetItems = placeStreetClutter(splines, opts);
  const clothItems = noCloth ? [] : placeClothItems(buildings, opts);
  const animItems = noAnimated ? [] : placeAnimatedProps(buildings, opts);

  return toSpawnData([...streetItems, ...clothItems, ...animItems]);
}

// ─── Python Script Generation ───────────────────────────────────

/**
 * Generate a Python script for spawning clutter in Unreal.
 *
 * @param {object[]} clutterList - Output from placeAllClutter() or toSpawnData()
 * @param {{ clearExisting?: boolean }} [opts]
 * @returns {string} Python script string
 */
export function buildClutterSpawnScript(clutterList, opts = {}) {
  const { clearExisting = false } = opts;

  const header = scriptHeader('Clutter & Detail Spawn Script', {
    mesh: '/Engine/BasicShapes/Cube.Cube',
  });

  const clear = clearExisting ? scriptClear(CLUTTER_PREFIX, 'clutter') : [];

  const counter = scriptCounterStart(clutterList.length, 'clutter items');

  const items = clutterList.flatMap(c =>
    scriptStaticMeshItem(c, {
      comment: `${c.clutterLabel} (${c.type})${c.animationType ? ' [' + c.animationType + ']' : ''}`,
    })
  );

  const footer = scriptCounterEnd(clutterList.length, 'Clutter items');

  return joinScript(header, clear, counter, items, footer);
}
