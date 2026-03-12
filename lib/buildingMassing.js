/**
 * Building Massing — Convert GeoJSON building footprints to Unreal spawn data
 *
 * Takes building footprint polygons (WGS84) from Sanborn-traced GeoJSON and
 * converts them to 3D block volumes for spawning in Unreal. Each polygon
 * becomes an oriented bounding box (cube mesh) with correct position, scale,
 * and height based on the story count.
 *
 * Coordinate conversion uses wgs84ToUnreal() from osmVectors.js.
 */

import { wgs84ToUnreal } from './osmVectors.js';

// ─── Constants ──────────────────────────────────────────────────

const FLOOR_HEIGHT_CM = 350;       // 3.5m per floor — period-appropriate for 1890s NYC
const UE_CUBE_SIZE_CM = 100;       // Unreal default cube is 100cm per side
const ACTOR_PREFIX = 'TM_Building'; // Prefix for spawned building actors

// Material → future Unreal material path mapping (placeholder for Phase 6.4)
const MATERIAL_MAP = {
  brick:    null, // M_Brownstone_Brick (future)
  stone:    null, // M_Limestone (future)
  iron:     null, // M_CastIron (future)
  wood:     null, // M_WoodFrame (future)
  frame:    null,
  adobe:    null,
  concrete: null
};

// ─── Geometry Helpers ────────────────────────────────────────────

/**
 * Compute the axis-aligned bounding box of a polygon ring in Unreal space.
 * @param {number[][]} ring - Array of [lon, lat] coordinates
 * @param {{ lat: number, lon: number }} origin - Georeference origin
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number, centerX: number, centerY: number, width: number, depth: number }}
 */
function polygonBoundsUnreal(ring, origin) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  for (const [lon, lat] of ring) {
    const { x, y } = wgs84ToUnreal(lat, lon, origin);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  return {
    minX, maxX, minY, maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width: maxX - minX,
    depth: maxY - minY
  };
}

/**
 * Compute the oriented bounding box rotation angle for a polygon.
 * Uses the longest edge of the polygon to determine the primary axis.
 * @param {number[][]} ring - Array of [lon, lat] coordinates
 * @param {{ lat: number, lon: number }} origin - Georeference origin
 * @returns {number} Yaw rotation in degrees
 */
function computeYawFromLongestEdge(ring, origin) {
  let maxLen = 0;
  let bestAngle = 0;

  for (let i = 0; i < ring.length - 1; i++) {
    const a = wgs84ToUnreal(ring[i][1], ring[i][0], origin);
    const b = wgs84ToUnreal(ring[i + 1][1], ring[i + 1][0], origin);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > maxLen) {
      maxLen = len;
      bestAngle = Math.atan2(dy, dx) * (180 / Math.PI);
    }
  }

  return bestAngle;
}

// ─── Core Conversion ─────────────────────────────────────────────

/**
 * Convert a single GeoJSON building feature to Unreal spawn parameters.
 * @param {object} feature - GeoJSON Feature with Polygon geometry
 * @param {{ lat: number, lon: number }} origin - Georeference origin
 * @param {number} index - Building index for naming
 * @param {{ floorHeightCm?: number, corniceHeightCm?: number, styleName?: string }} [opts] - Style overrides from classifier
 * @returns {{ label: string, location: number[], scale: number[], rotation: number[], material: string, stories: number, use: string, address: string, styleName: string }}
 */
export function footprintToSpawnData(feature, origin, index = 0, opts = {}) {
  const ring = feature.geometry.coordinates[0]; // outer ring
  const props = feature.properties || {};
  const stories = props.stories || 3;
  const material = props.material || 'brick';

  // Compute bounding box in Unreal space
  const bounds = polygonBoundsUnreal(ring, origin);

  // Height from story count — use style override or default
  const floorHeight = opts.floorHeightCm || FLOOR_HEIGHT_CM;
  const cornice = opts.corniceHeightCm || 0;
  const heightCm = stories * floorHeight + cornice;

  // Scale: width/depth/height relative to 100cm cube
  const scaleX = Math.max(bounds.width / UE_CUBE_SIZE_CM, 0.5);
  const scaleY = Math.max(bounds.depth / UE_CUBE_SIZE_CM, 0.5);
  const scaleZ = heightCm / UE_CUBE_SIZE_CM;

  // Position: center of bounding box, Z = half-height (cube center above ground)
  const location = [
    bounds.centerX,
    bounds.centerY,
    heightCm / 2
  ];

  // Rotation: align with longest edge
  const yaw = computeYawFromLongestEdge(ring, origin);

  // Actor label — use styleName if available, else material
  const padIdx = String(index).padStart(3, '0');
  const labelTag = opts.styleName || material;
  const label = `${ACTOR_PREFIX}_${padIdx}_${labelTag}_${stories}s`;

  return {
    label,
    location,
    scale: [scaleX, scaleY, scaleZ],
    rotation: [0, yaw, 0],  // [pitch, yaw, roll]
    material,
    stories,
    use: props.use || 'unknown',
    address: props.address || '',
    confidence: props.confidence || 'estimated',
    styleName: opts.styleName || null
  };
}

/**
 * Batch convert all features in a GeoJSON FeatureCollection.
 * @param {object} geojson - GeoJSON FeatureCollection
 * @param {{ lat: number, lon: number }} origin - Georeference origin
 * @param {{ classifyFn?: (feature: object, index: number) => object }} [opts] - Optional classifier callback returning style opts per feature
 * @returns {object[]} Array of spawn data objects
 */
export function buildingsToSpawnList(geojson, origin, opts = {}) {
  const features = geojson.features || [];
  return features.map((f, i) => {
    const styleOpts = opts.classifyFn ? opts.classifyFn(f, i) : {};
    return footprintToSpawnData(f, origin, i, styleOpts);
  });
}

/**
 * Generate a Python script for batch spawning buildings in Unreal.
 * Follows the landscapeImport.js pattern — the script is executed
 * via PythonScriptLibrary.ExecutePythonScript through the RC API.
 *
 * @param {object[]} spawnList - Output from buildingsToSpawnList()
 * @param {{ clearExisting?: boolean }} opts
 * @returns {string} Python script string
 */
export function buildSpawnScript(spawnList, opts = {}) {
  const { clearExisting = false } = opts;

  const lines = [
    'import unreal',
    '',
    '# ── Building Massing Spawn Script ──',
    '# Generated by lib/buildingMassing.js',
    '',
    'editor = unreal.EditorLevelLibrary()',
    'mesh = unreal.EditorAssetLibrary.load_asset("/Engine/BasicShapes/Cube.Cube")',
    ''
  ];

  // Optional: clear existing TM_Building actors
  if (clearExisting) {
    lines.push(
      '# Clear existing building actors',
      'all_actors = unreal.EditorLevelLibrary.get_all_level_actors()',
      'for actor in all_actors:',
      `    if actor.get_actor_label().startswith("${ACTOR_PREFIX}"):`,
      '        actor.destroy()',
      `unreal.log("Cleared existing ${ACTOR_PREFIX}_* actors")`,
      ''
    );
  }

  lines.push(
    `# Spawn ${spawnList.length} buildings`,
    'spawned = 0',
    ''
  );

  for (const b of spawnList) {
    const [x, y, z] = b.location;
    const [sx, sy, sz] = b.scale;
    const [pitch, yaw, roll] = b.rotation;

    lines.push(
      `# ${b.label} — ${b.stories} stories, ${b.material}, ${b.address || 'no address'}`,
      `loc = unreal.Vector(${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`,
      `rot = unreal.Rotator(${pitch.toFixed(1)}, ${yaw.toFixed(1)}, ${roll.toFixed(1)})`,
      `actor = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.StaticMeshActor, loc, rot)`,
      'if actor:',
      `    actor.set_actor_label("${b.label}")`,
      `    actor.set_actor_scale3d(unreal.Vector(${sx.toFixed(2)}, ${sy.toFixed(2)}, ${sz.toFixed(2)}))`,
      '    actor.static_mesh_component.set_static_mesh(mesh)',
      '    spawned += 1',
      ''
    );
  }

  lines.push(
    `unreal.log(f"Building massing: spawned {spawned}/${spawnList.length} buildings")`,
    ''
  );

  return lines.join('\n');
}

// ─── Exports ─────────────────────────────────────────────────────

export { ACTOR_PREFIX, FLOOR_HEIGHT_CM, MATERIAL_MAP };
