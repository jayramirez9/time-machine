/**
 * Lamp Placement — Gas lamp position computation along road splines
 *
 * Walks road splines and places gas lamps at era-appropriate intervals.
 * Lamps are offset to sidewalk positions and de-duplicated at intersections.
 *
 * Gas lamp parameters based on 1880s NYC records:
 * - Height: 4.2m (cast iron post with glass globe)
 * - Color: ~2200K (warm gas flame, RGB 255/183/76)
 * - Spacing: 30–40m on major avenues, wider on minor streets
 */

import { classifyStreet } from './streetLayout.js';

// ─── Constants ──────────────────────────────────────────────────

export const LAMP_PREFIX = 'TM_Lamp';

const LAMP_HEIGHT_CM = 420;        // 4.2m post height
const LAMP_COLOR = { R: 255, G: 183, B: 76 };  // 2200K warm gas flame
const LAMP_INTENSITY = 800;        // Candela (dim gas light)
const LAMP_ATTENUATION_CM = 1200;  // 12m attenuation radius
const DEDUP_RADIUS_CM = 800;       // Skip lamp if within 8m of existing one

// ─── Core Placement ─────────────────────────────────────────────

/**
 * Walk a road spline and place lamps at the configured interval.
 * Returns lamp positions in Unreal coordinates.
 *
 * @param {object} spline - { category: string, points: number[][] }
 * @param {{ era?: string }} [opts]
 * @returns {object[]} Array of lamp placement objects
 */
function placeAlongSpline(spline, opts = {}) {
  const rules = classifyStreet(spline.category, opts);

  // No lamps for this road type
  if (rules.lampSpacingM <= 0 || rules.lampSides === 'none') return [];

  const spacingCm = rules.lampSpacingM * 100;
  const roadHalfWidth = (rules.widthM * 100) / 2;
  const offsetCm = roadHalfWidth + 150;  // 1.5m into sidewalk from road edge
  const lamps = [];

  // Walk the spline accumulating distance
  let accumulated = spacingCm / 2;  // Start half-spacing in (avoid endpoint clustering)

  for (let i = 0; i < spline.points.length - 1; i++) {
    const a = spline.points[i];
    const b = spline.points[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const segLen = Math.sqrt(dx * dx + dy * dy);

    if (segLen < 10) continue;  // Skip degenerate segments

    const dirX = dx / segLen;
    const dirY = dy / segLen;
    // Perpendicular (90° CCW)
    const perpX = -dirY;
    const perpY = dirX;

    while (accumulated < segLen) {
      // Point along segment
      const px = a[0] + dirX * accumulated;
      const py = a[1] + dirY * accumulated;

      // Compute yaw facing along the road
      const yaw = Math.atan2(dirY, dirX) * (180 / Math.PI);

      // Place on left side
      lamps.push({
        x: px + perpX * offsetCm,
        y: py + perpY * offsetCm,
        yaw,
        category: rules.category
      });

      // Place on right side (if both sides)
      if (rules.lampSides === 'both') {
        lamps.push({
          x: px - perpX * offsetCm,
          y: py - perpY * offsetCm,
          yaw: yaw + 180,
          category: rules.category
        });
      }

      accumulated += spacingCm;
    }

    // Carry remainder to next segment
    accumulated -= segLen;
  }

  return lamps;
}

/**
 * De-duplicate lamps that are too close together (intersection clustering).
 * @param {object[]} lamps - Array of { x, y, yaw, category }
 * @returns {object[]} Filtered array
 */
function deduplicateLamps(lamps) {
  const radiusSq = DEDUP_RADIUS_CM * DEDUP_RADIUS_CM;
  const kept = [];

  for (const lamp of lamps) {
    let tooClose = false;
    for (const existing of kept) {
      const dx = lamp.x - existing.x;
      const dy = lamp.y - existing.y;
      if (dx * dx + dy * dy < radiusSq) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) kept.push(lamp);
  }

  return kept;
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Compute gas lamp positions for all road splines.
 *
 * @param {object[]} splines - Array from roads-splines.json
 * @param {{ era?: string }} [opts]
 * @returns {object[]} Array of labeled lamp spawn data
 */
export function placeLamps(splines, opts = {}) {
  // Collect all raw lamp positions
  let allLamps = [];
  for (const spline of splines) {
    allLamps = allLamps.concat(placeAlongSpline(spline, opts));
  }

  // De-duplicate at intersections
  const filtered = deduplicateLamps(allLamps);

  // Label and add spawn properties
  return filtered.map((lamp, i) => ({
    label: `${LAMP_PREFIX}_${String(i).padStart(4, '0')}_${lamp.category}`,
    location: [lamp.x, lamp.y, LAMP_HEIGHT_CM],
    rotation: [0, lamp.yaw, 0],
    color: LAMP_COLOR,
    intensity: LAMP_INTENSITY,
    attenuationRadius: LAMP_ATTENUATION_CM,
    category: lamp.category
  }));
}

/**
 * Generate a Python script for spawning gas lamp PointLights in Unreal.
 *
 * @param {object[]} lampList - Output from placeLamps()
 * @param {{ clearExisting?: boolean }} [opts]
 * @returns {string} Python script string
 */
export function buildLampSpawnScript(lampList, opts = {}) {
  const { clearExisting = false } = opts;

  const lines = [
    'import unreal',
    '',
    '# ── Gas Lamp Spawn Script ──',
    '# Generated by lib/lampPlacement.js',
    '',
    'editor = unreal.EditorLevelLibrary()',
    ''
  ];

  if (clearExisting) {
    lines.push(
      '# Clear existing lamp actors',
      'all_actors = unreal.EditorLevelLibrary.get_all_level_actors()',
      'for actor in all_actors:',
      `    if actor.get_actor_label().startswith("${LAMP_PREFIX}"):`,
      '        actor.destroy()',
      `unreal.log("Cleared existing ${LAMP_PREFIX}_* actors")`,
      ''
    );
  }

  lines.push(
    `# Spawn ${lampList.length} gas lamps`,
    'spawned = 0',
    ''
  );

  for (const lamp of lampList) {
    const [x, y, z] = lamp.location;
    const { R, G, B } = lamp.color;

    lines.push(
      `# ${lamp.label}`,
      `loc = unreal.Vector(${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`,
      `rot = unreal.Rotator(0.0, ${lamp.rotation[1].toFixed(1)}, 0.0)`,
      'actor = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.PointLight, loc, rot)',
      'if actor:',
      `    actor.set_actor_label("${lamp.label}")`,
      `    actor.point_light_component.set_editor_property("intensity", ${lamp.intensity})`,
      `    actor.point_light_component.set_editor_property("light_color", unreal.Color(${R}, ${G}, ${B}, 255))`,
      `    actor.point_light_component.set_editor_property("attenuation_radius", ${lamp.attenuationRadius})`,
      '    spawned += 1',
      ''
    );
  }

  lines.push(
    `unreal.log(f"Gas lamps: spawned {spawned}/${lampList.length} lights")`,
    ''
  );

  return lines.join('\n');
}

// ─── Exports ────────────────────────────────────────────────────

export { LAMP_HEIGHT_CM, LAMP_COLOR, LAMP_INTENSITY, LAMP_ATTENUATION_CM, DEDUP_RADIUS_CM };
