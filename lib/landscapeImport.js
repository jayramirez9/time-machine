/**
 * Landscape Import — Automated terrain import into Unreal via Remote Control API
 *
 * Downloads DEM heightmap + satellite imagery, transfers to Unreal Editor via HTTP,
 * and executes Python scripts to create/update a Landscape actor with real terrain data.
 *
 * Follows the same RC API interaction pattern as lib/cesiumGeoreference.js.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchDEM, processDEM, slugify, checkGDAL } from './demFetcher.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TERRAIN_DIR = path.join(__dirname, '..', 'terrain-data');

// ---------------------------------------------------------------------------
// RC API helpers (mirrors cesiumGeoreference.js patterns)
// ---------------------------------------------------------------------------

/**
 * Execute a multi-line Python script on Unreal Editor via RC API.
 * Uses PythonScriptLibrary.ExecutePythonScript (UE 5.7+).
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function runPython(host, script) {
  try {
    const res = await fetch(`${host}/remote/object/call`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectPath: '/Script/PythonScriptPlugin.Default__PythonScriptLibrary',
        functionName: 'ExecutePythonScript',
        parameters: { PythonScript: script }
      })
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `Python execution failed: ${res.status} ${text}` };
    }
    const data = await res.json();
    return { ok: data.ReturnValue !== false, error: data.ReturnValue === false ? 'Script returned false' : undefined };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Search for a Landscape actor in the current level.
 * @returns {Promise<string|null>} objectPath of the Landscape actor, or null
 */
async function findLandscape(host) {
  try {
    // Use GetAllLevelActors via EditorActorSubsystem (works on UE 5.7)
    const res = await fetch(`${host}/remote/object/call`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectPath: '/Script/UnrealEd.Default__EditorActorSubsystem',
        functionName: 'GetAllLevelActors',
        generateTransaction: false
      })
    });
    if (res.ok) {
      const data = await res.json();
      const actors = data?.ReturnValue || [];
      // Filter to actual Landscape actors (not LandscapeStreamingProxy, LandscapeGizmo, etc.)
      const landscapes = actors.filter(p => {
        const label = p.split('.').pop();
        return /^Landscape[_\d]/.test(label) || label === 'Landscape';
      });
      return landscapes[0] || null;
    }
  } catch { /* fall through */ }
  return null;
}

/**
 * Read a property from an actor via RC API.
 */
async function rcRead(host, objectPath, propertyName) {
  try {
    const res = await fetch(`${host}/remote/object/property`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectPath, access: 'READ_ACCESS', propertyName })
    });
    if (!res.ok) return { value: undefined };
    const data = await res.json();
    return { value: data?.[propertyName] ?? undefined };
  } catch {
    return { value: undefined };
  }
}

// ---------------------------------------------------------------------------
// Terrain data management
// ---------------------------------------------------------------------------

/**
 * Ensure terrain data exists for a location, fetching + processing if needed.
 * @returns {Promise<{ok: boolean, metadata?: object, error?: string}>}
 */
async function ensureTerrainData(lat, lon, slug, radius = 500) {
  const outputDir = path.join(TERRAIN_DIR, slug);
  const metadataPath = path.join(outputDir, 'metadata.json');

  // Check if already processed
  if (fs.existsSync(metadataPath)) {
    const meta = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    const heightmapExists = meta.heightmap?.path && fs.existsSync(meta.heightmap.path);
    const png16Exists = fs.existsSync(path.join(outputDir, 'heightmap_16bit.png'));
    if (heightmapExists && png16Exists) {
      return { ok: true, metadata: meta };
    }
    // If R16 exists but no PNG16, we can still proceed — the import script handles it
    if (heightmapExists) {
      return { ok: true, metadata: meta };
    }
  }

  // Need to fetch and process — GDAL required
  const gdal = await checkGDAL();
  if (!gdal.available) {
    return { ok: false, error: 'GDAL not installed (brew install gdal) — needed to process DEM for new locations' };
  }

  try {
    console.log(`[Terrain] Fetching DEM for ${slug} (${lat.toFixed(4)}, ${lon.toFixed(4)}, r=${radius}m)...`);
    const { demPath, bbox, metadata: fetchMeta } = await fetchDEM(lat, lon, radius, {
      outputDir, slug, resolution: 1
    });

    // Save initial metadata (fetchDEM doesn't write metadata.json)
    const metadata = {
      name: slug,
      lat, lon, slug, radiusMeters: radius,
      ...fetchMeta,
      bbox
    };
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    // Process DEM → R16 + PNG16
    console.log(`[Terrain] Processing DEM...`);
    const result = await processDEM(demPath, outputDir);

    // Update metadata with heightmap info
    metadata.heightmap = {
      path: result.heightmapPath,
      format: 'r16',
      dimensions: result.dimensions,
      elevation: result.elevation,
      unrealScale: { x: result.scale.x, y: result.scale.y, z: result.scale.z }
    };
    metadata.processedAt = new Date().toISOString();
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    return { ok: true, metadata };
  } catch (e) {
    return { ok: false, error: `DEM fetch/process failed: ${e.message}` };
  }
}

// ---------------------------------------------------------------------------
// Python script templates
// ---------------------------------------------------------------------------

/**
 * Build the Python script that imports a heightmap into an existing Landscape.
 */
function buildHeightmapImportScript(daemonUrl, slug, dimensions, landscapePath, scale) {
  return `
import unreal
import urllib.request
import os
import tempfile
import socket

socket.setdefaulttimeout(30)
tmp = tempfile.gettempdir()

# Download PNG16 heightmap from Mac daemon
png_url = "${daemonUrl}/terrain-data/${slug}/heightmap_16bit.png"
png_path = os.path.join(tmp, "tm_${slug}_hm.png")
unreal.log(f"[TM] Downloading heightmap from {png_url}")
urllib.request.urlretrieve(png_url, png_path)
unreal.log(f"[TM] Saved to {png_path}")

# Import as texture asset
task = unreal.AssetImportTask()
task.set_editor_property("filename", png_path)
task.set_editor_property("destination_path", "/Game/TimeMachine/Terrain")
task.set_editor_property("destination_name", "HM_${slug.replace(/-/g, '_')}")
task.set_editor_property("replace_existing", True)
task.set_editor_property("automated", True)
task.set_editor_property("save", True)
unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])

tex = unreal.EditorAssetLibrary.load_asset("/Game/TimeMachine/Terrain/HM_${slug.replace(/-/g, '_')}")
if not tex:
    unreal.log_error("[TM] Failed to load imported heightmap texture")
else:
    unreal.log("[TM] Heightmap texture imported")

    # Create RenderTarget2D via RenderingLibrary (UE 5.7 — no KismetRenderingLibrary)
    dim = ${dimensions}
    world = unreal.EditorLevelLibrary.get_editor_world()
    rt = unreal.RenderingLibrary.create_render_target2d(world, dim, dim)

    # Draw heightmap texture to render target via canvas
    canvas, size, context = unreal.RenderingLibrary.begin_draw_canvas_to_render_target(world, rt)
    canvas.draw_texture(tex, unreal.Vector2D(0, 0), unreal.Vector2D(dim, dim), unreal.Vector2D(0, 0), unreal.Vector2D(1, 1), unreal.LinearColor(1, 1, 1, 1))
    unreal.RenderingLibrary.end_draw_canvas_to_render_target(world, context)

    # Find the Landscape actor and import
    landscapes = unreal.GameplayStatics.get_all_actors_of_class(world, unreal.Landscape)
    if landscapes:
        landscape = landscapes[0]
        result = landscape.landscape_import_heightmap_from_render_target(rt)
        if result:
            unreal.log("[TM] Heightmap imported into Landscape")
            # Set scale
            landscape.set_actor_scale3d(unreal.Vector(${scale.x.toFixed(4)}, ${scale.y.toFixed(4)}, ${scale.z.toFixed(4)}))
            unreal.log(f"[TM] Landscape scale set to ${scale.x.toFixed(2)}, ${scale.y.toFixed(2)}, ${scale.z.toFixed(2)}")
        else:
            unreal.log_error("[TM] landscape_import_heightmap_from_render_target returned false")
    else:
        unreal.log_error("[TM] No Landscape actor found in level")
`.trim();
}

/**
 * Build the Python script that imports satellite imagery as a Landscape material.
 */
function buildImageryImportScript(daemonUrl, slug) {
  return `
import unreal
import urllib.request
import os
import tempfile
import socket

socket.setdefaulttimeout(60)
tmp = tempfile.gettempdir()

# Download satellite imagery from Mac daemon
img_url = "${daemonUrl}/terrain-data/${slug}/imagery.png"
img_path = os.path.join(tmp, "tm_${slug}_imagery.png")
unreal.log(f"[TM] Downloading imagery from {img_url}")
urllib.request.urlretrieve(img_url, img_path)
unreal.log(f"[TM] Saved imagery to {img_path}")

# Import as texture asset
task = unreal.AssetImportTask()
task.set_editor_property("filename", img_path)
task.set_editor_property("destination_path", "/Game/TimeMachine/Terrain")
task.set_editor_property("destination_name", "Imagery_${slug.replace(/-/g, '_')}")
task.set_editor_property("replace_existing", True)
task.set_editor_property("automated", True)
task.set_editor_property("save", True)
unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])

tex = unreal.EditorAssetLibrary.load_asset("/Game/TimeMachine/Terrain/Imagery_${slug.replace(/-/g, '_')}")
if not tex:
    unreal.log_error("[TM] Failed to load imported imagery texture")
else:
    unreal.log("[TM] Imagery texture imported")

    # Apply to Landscape material
    mat_path = "/Game/TimeMachine/Terrain/MI_Landscape"
    if unreal.EditorAssetLibrary.does_asset_exist(mat_path):
        mat = unreal.EditorAssetLibrary.load_asset(mat_path)
        mat.set_texture_parameter_value(unreal.Name("BaseColor"), tex)
        unreal.EditorAssetLibrary.save_asset(mat_path)
        unreal.log("[TM] Updated Landscape material with imagery")
    else:
        unreal.log_warning("[TM] No MI_Landscape material found — imagery imported but not applied")

    # Set material on Landscape actor
    world = unreal.EditorLevelLibrary.get_editor_world()
    landscapes = unreal.GameplayStatics.get_all_actors_of_class(world, unreal.Landscape)
    if landscapes and unreal.EditorAssetLibrary.does_asset_exist(mat_path):
        mat = unreal.EditorAssetLibrary.load_asset(mat_path)
        landscapes[0].editor_set_landscape_material(mat)
        unreal.log("[TM] Applied material to Landscape")
`.trim();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Import terrain data into Unreal as a Landscape actor.
 *
 * @param {Object} opts
 * @param {string} opts.host - Unreal RC API host (e.g. "http://100.96.244.16:30010")
 * @param {string} opts.daemonUrl - Mac daemon URL reachable from PC (e.g. "http://100.68.243.96:3000")
 * @param {number} opts.lat - Latitude
 * @param {number} opts.lon - Longitude
 * @param {string} opts.slug - Location slug for terrain-data directory
 * @param {string} [opts.location] - Human-readable location name
 * @param {number} [opts.radius=500] - Terrain radius in meters
 * @param {boolean} [opts.skipImagery=false] - Skip imagery import
 * @returns {Promise<{ok: boolean, landscape?: string, error?: string}>}
 */
export async function importLandscape(opts) {
  const { host, daemonUrl, lat, lon, slug, radius = 500, skipImagery = false } = opts;

  // Step 1: Ensure terrain data exists locally
  console.log(`[Terrain] Ensuring terrain data for ${slug}...`);
  const terrainResult = await ensureTerrainData(lat, lon, slug, radius);
  if (!terrainResult.ok) {
    return { ok: false, error: terrainResult.error };
  }
  const meta = terrainResult.metadata;

  // Step 2: Check PNG16 exists (needed for UE import)
  const png16Path = path.join(TERRAIN_DIR, slug, 'heightmap_16bit.png');
  if (!fs.existsSync(png16Path)) {
    return { ok: false, error: `Missing ${png16Path} — re-run fetch-dem.js to regenerate` };
  }

  // Step 3: Find existing Landscape actor
  console.log(`[Terrain] Searching for Landscape actor...`);
  const landscapePath = await findLandscape(host);
  if (!landscapePath) {
    return { ok: false, error: 'No Landscape actor found in the current level. Create one in Landscape Mode first.' };
  }
  console.log(`[Terrain] Found Landscape: ${landscapePath}`);

  // Step 4: Import heightmap
  const dimensions = meta.heightmap?.dimensions?.w || 1009;
  const scale = meta.heightmap?.unrealScale || { x: 100, y: 100, z: 1 };

  console.log(`[Terrain] Importing heightmap (${dimensions}x${dimensions}, scale ${scale.x.toFixed(1)}, ${scale.y.toFixed(1)}, ${scale.z.toFixed(1)})...`);
  const hmScript = buildHeightmapImportScript(daemonUrl, slug, dimensions, landscapePath, scale);
  const hmResult = await runPython(host, hmScript);
  if (!hmResult.ok) {
    return { ok: false, error: `Heightmap import failed: ${hmResult.error}` };
  }
  console.log(`[Terrain] Heightmap import script executed`);

  // Step 5: Import imagery (optional)
  if (!skipImagery && fs.existsSync(path.join(TERRAIN_DIR, slug, 'imagery.png'))) {
    console.log(`[Terrain] Importing satellite imagery...`);
    const imgScript = buildImageryImportScript(daemonUrl, slug);
    const imgResult = await runPython(host, imgScript);
    if (!imgResult.ok) {
      console.warn(`[Terrain] Imagery import failed (non-fatal): ${imgResult.error}`);
    } else {
      console.log(`[Terrain] Imagery import script executed`);
    }
  }

  // Step 6: Verify — read back Landscape scale
  const scaleResult = await rcRead(host, landscapePath, 'RelativeScale3D');
  if (scaleResult.value) {
    console.log(`[Terrain] Landscape scale verified: ${JSON.stringify(scaleResult.value)}`);
  }

  return { ok: true, landscape: landscapePath };
}

export { findLandscape, runPython, ensureTerrainData, slugify };
