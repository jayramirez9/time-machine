/**
 * Mesh Import — Import Meshy-generated FBX/GLB into Unreal via RC API
 *
 * Reads GENERATION_MANIFEST.json files from mesh-data/, matches to building
 * footprint positions, and generates Python scripts that import FBX into
 * Unreal's Content Browser and spawn StaticMeshActors at correct geo positions.
 *
 * File transfer: the daemon serves mesh-data/ files over HTTP. The Python
 * script running on the UE machine downloads them via urllib (same pattern
 * as landscapeImport.js for heightmaps).
 *
 * Follows the pattern of lib/buildingMassing.js (spawn data) and
 * lib/landscapeImport.js (Python import scripts).
 */

import { wgs84ToUnreal } from './osmVectors.js';
import {
  scriptHeader, scriptClear, scriptCounterStart, scriptCounterEnd,
  joinScript,
} from './spawnScript.js';

// ─── Constants ──────────────────────────────────────────────────

export const ACTOR_PREFIX = 'TM_Mesh';
const CONTENT_PATH = '/Game/TimeMachine/Meshes';
const FLOOR_HEIGHT_CM = 350;
const UE_CUBE_SIZE_CM = 100;

// ─── Manifest Reading ───────────────────────────────────────────

/**
 * Build a spawn entry from a GENERATION_MANIFEST.json and its matching
 * building footprint feature.
 *
 * @param {object} manifest - Parsed GENERATION_MANIFEST.json
 * @param {object} feature - GeoJSON Feature from buildings.geojson (or null)
 * @param {{ lat: number, lon: number }} origin - Georeference origin
 * @param {string} meshDir - Path to the mesh-data directory (e.g. "mesh-data/56-broad-st")
 * @returns {object} Spawn entry with label, location, scale, rotation, meshDir, assetName
 */
export function manifestToSpawnData(manifest, feature, origin, meshDir) {
  const index = manifest.buildingIndex ?? 0;
  const slug = manifest.name || `mesh-${index}`;
  const assetName = `SM_${slug.replace(/-/g, '_')}`;

  // Position and rotation from building footprint
  let location = [0, 0, 0];
  let rotation = [0, 0, 0];
  let scaleZ = 1;

  if (feature) {
    const ring = feature.geometry.coordinates[0];
    const props = feature.properties || {};
    const stories = props.stories || manifest.building?.stories || 3;
    const heightCm = stories * FLOOR_HEIGHT_CM;

    // Compute center position
    const bounds = polygonBoundsUnreal(ring, origin);
    location = [bounds.centerX, bounds.centerY, 0]; // mesh sits on ground, not centered like cubes

    // Compute yaw from longest edge
    rotation = [0, computeYawFromLongestEdge(ring, origin), 0];

    // Scale: bounding box dims → Meshy mesh (assumed ~1m unit scale, rescaled to match footprint)
    // Meshy outputs meshes at arbitrary scale — we scale to match the footprint bounding box
    const targetWidthCm = bounds.width;
    const targetDepthCm = bounds.depth;

    // Store target dimensions for the Python script (it will read mesh bounds and compute scale)
    scaleZ = heightCm / 100; // will be refined by Python script
  }

  const padIdx = String(index).padStart(3, '0');
  const label = `${ACTOR_PREFIX}_${padIdx}_${slug}`;

  return {
    label,
    location,
    rotation,
    buildingIndex: index,
    assetName,
    meshDir,
    slug,
    styleName: manifest.styleName || null,
    address: manifest.address || '',
    quality: manifest.quality || 'background',
    pipeline: manifest.pipeline || manifest.mode || 'unknown',
    format: manifest.formats?.[0] || 'fbx',
    hasPbr: manifest.pbr || false,
    feature, // kept for Python script to compute bounds
  };
}

// ─── Geometry Helpers (duplicated from buildingMassing.js to avoid circular dep) ──

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
    depth: maxY - minY,
  };
}

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

// ─── Python Script Generation ───────────────────────────────────

/**
 * Build a Python script that imports FBX meshes from the daemon's HTTP server
 * and spawns them as StaticMeshActors in Unreal.
 *
 * @param {object[]} spawnList - Array from manifestToSpawnData()
 * @param {object} opts
 * @param {string} opts.daemonUrl - Mac daemon URL reachable from PC (e.g. "http://100.68.243.96:3000")
 * @param {boolean} [opts.clearExisting=true] - Clear existing TM_Mesh_ actors first
 * @returns {string} Python script string
 */
export function buildMeshImportScript(spawnList, opts = {}) {
  const { daemonUrl, clearExisting = true } = opts;
  if (!daemonUrl) throw new Error('daemonUrl is required for mesh import');

  const lines = [];

  // Header
  lines.push(
    'import unreal',
    'import urllib.request',
    'import os',
    'import tempfile',
    'import socket',
    '',
    '# ── Mesh Import + Spawn Script ──',
    '',
    'socket.setdefaulttimeout(60)',
    'tmp = tempfile.gettempdir()',
    `content_path = "${CONTENT_PATH}"`,
    '',
  );

  // Clear
  if (clearExisting) {
    lines.push(
      `# Clear existing ${ACTOR_PREFIX}_* actors`,
      'all_actors = unreal.EditorLevelLibrary.get_all_level_actors()',
      'cleared = 0',
      'for actor in all_actors:',
      `    if actor.get_actor_label().startswith("${ACTOR_PREFIX}"):`,
      '        actor.destroy()',
      '        cleared += 1',
      'unreal.log(f"[TM] Cleared {cleared} existing mesh actors")',
      '',
    );
  }

  // Import + spawn each mesh
  lines.push(
    `# Import and spawn ${spawnList.length} meshes`,
    'spawned = 0',
    '',
  );

  for (const entry of spawnList) {
    const ext = entry.format;
    const fileName = `model.${ext}`;
    const localVar = `mesh_${entry.buildingIndex}`;
    const safeSlug = entry.slug.replace(/-/g, '_');
    const downloadUrl = `${daemonUrl}/mesh-data/${entry.slug}/${fileName}`;
    const localPath = `os.path.join(tmp, "tm_${safeSlug}.${ext}")`;

    // Position
    const [x, y, z] = entry.location;
    const [pitch, yaw, roll] = entry.rotation;

    // Compute footprint bounds for scale (if feature exists)
    let targetWidth = 0;
    let targetDepth = 0;
    let targetHeight = 0;
    if (entry.feature) {
      const ring = entry.feature.geometry.coordinates[0];
      const props = entry.feature.properties || {};
      const stories = props.stories || 3;
      // Get bounds in Unreal space
      // We already have the data from manifestToSpawnData, but let's compute target dims
      const origin = { lat: 0, lon: 0 }; // placeholder — we embed the UE coords directly
      targetHeight = stories * FLOOR_HEIGHT_CM;
    }

    lines.push(
      `# ── ${entry.label} (${entry.address || entry.slug}) ──`,
      `unreal.log("[TM] Importing ${entry.slug}...")`,
      `${localVar}_path = ${localPath}`,
      'try:',
      `    urllib.request.urlretrieve("${downloadUrl}", ${localVar}_path)`,
      'except Exception as e:',
      `    unreal.log_warning(f"[TM] Download failed for ${entry.slug}: {e}")`,
      '',
    );

    // Import as asset
    lines.push(
      `task = unreal.AssetImportTask()`,
      `task.set_editor_property("filename", ${localVar}_path)`,
      `task.set_editor_property("destination_path", content_path)`,
      `task.set_editor_property("destination_name", "${entry.assetName}")`,
      `task.set_editor_property("replace_existing", True)`,
      `task.set_editor_property("automated", True)`,
      `task.set_editor_property("save", True)`,
      `unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])`,
      '',
    );

    // Load the imported mesh and spawn
    lines.push(
      `${localVar} = unreal.EditorAssetLibrary.load_asset(content_path + "/${entry.assetName}")`,
      `if ${localVar}:`,
      `    loc = unreal.Vector(${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`,
      `    rot = unreal.Rotator(${pitch.toFixed(1)}, ${yaw.toFixed(1)}, ${roll.toFixed(1)})`,
      '    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.StaticMeshActor, loc, rot)',
      '    if actor:',
      `        actor.set_actor_label("${entry.label}")`,
      `        actor.static_mesh_component.set_static_mesh(${localVar})`,
    );

    // If PBR textures, import and create material instance
    if (entry.hasPbr) {
      const texBaseUrl = `${daemonUrl}/mesh-data/${entry.slug}/textures`;
      lines.push(
        `        # Import PBR textures`,
        `        for map_name in ["base_color", "metallic", "roughness", "normal"]:`,
        `            tex_url = "${texBaseUrl}/" + map_name + ".png"`,
        `            tex_local = os.path.join(tmp, f"tm_${safeSlug}_{entry.buildingIndex}_{'{'}map_name{'}'}.png")`,
        '            try:',
        '                urllib.request.urlretrieve(tex_url, tex_local)',
        '                tex_task = unreal.AssetImportTask()',
        '                tex_task.set_editor_property("filename", tex_local)',
        `                tex_task.set_editor_property("destination_path", content_path + "/Textures")`,
        `                tex_task.set_editor_property("destination_name", "${entry.assetName}_" + map_name)`,
        '                tex_task.set_editor_property("replace_existing", True)',
        '                tex_task.set_editor_property("automated", True)',
        '                tex_task.set_editor_property("save", True)',
        '                unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([tex_task])',
        '            except:',
        '                pass  # texture map may not exist for all channels',
      );
    }

    lines.push(
      '        spawned += 1',
      `        unreal.log(f"[TM] Spawned ${entry.label}")`,
      'else:',
      `    unreal.log_warning("[TM] Failed to load ${entry.assetName}")`,
      '',
    );
  }

  lines.push(
    `unreal.log(f"[TM] Mesh import complete: spawned {spawned}/${spawnList.length}")`,
  );

  return lines.join('\n');
}

/**
 * Build a clear-only Python script to remove all TM_Mesh_ actors.
 * @returns {string}
 */
export function buildMeshClearScript() {
  return joinScript(
    scriptHeader('Mesh Actor Clear Script'),
    scriptClear(ACTOR_PREFIX, 'mesh'),
  );
}
