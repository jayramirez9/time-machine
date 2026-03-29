/**
 * Cesium 3D Tileset — Manage Cesium3DTileset actors via Remote Control API
 *
 * Discovers Cesium3DTileset actors in the current Unreal scene and
 * configures their source URL (e.g. Google Photorealistic 3D Tiles).
 *
 * Scouting/preview use only — Google 3D Tiles ToS restricts production use.
 */

const GOOGLE_3D_TILES_URL = 'https://tile.googleapis.com/v1/3dtiles/root.json';

/**
 * Set the URL on a Cesium3DTileset actor
 * @param {string} host - Unreal Remote Control API host (e.g. "http://localhost:30010")
 * @param {string} url - Tileset URL to set
 * @returns {Promise<{ok: boolean, objectPath?: string, error?: string}>}
 */
export async function setTilesetUrl(host, url) {
  const objectPath = await findCesium3DTileset(host);
  if (!objectPath) {
    return { ok: false, error: 'Cesium3DTileset actor not found in scene. Add one via the Cesium panel in Unreal.' };
  }

  // Set TilesetSource to "From Url" so it reads from URL instead of Cesium Ion
  const sourceResult = await rcCall(host, objectPath, 'SetTilesetSource', { InSource: 'From Url' });
  if (!sourceResult.ok) {
    return { ok: false, objectPath, error: `Failed to set TilesetSource: ${sourceResult.error || sourceResult.status}` };
  }

  // Set the URL via function call (direct property write blocked by getter/setter check)
  const urlResult = await rcCall(host, objectPath, 'SetUrl', { InUrl: url });
  if (!urlResult.ok) {
    return { ok: false, objectPath, error: `Failed to set Url: ${urlResult.error || urlResult.status}` };
  }

  return { ok: true, objectPath, url };
}

/**
 * Build the Google 3D Tiles URL with API key
 * @param {string} apiKey - Google Maps API key
 * @returns {string}
 */
export function googleTilesUrl(apiKey) {
  return `${GOOGLE_3D_TILES_URL}?key=${apiKey}`;
}

/**
 * Clear the tileset URL (disable streaming)
 * @param {string} host
 * @returns {Promise<{ok: boolean, objectPath?: string, error?: string}>}
 */
export async function clearTileset(host) {
  return setTilesetUrl(host, '');
}

/**
 * Get the current tileset status
 * @param {string} host
 * @returns {Promise<{ok: boolean, found: boolean, url?: string, error?: string}>}
 */
export async function getTilesetStatus(host) {
  const objectPath = await findCesium3DTileset(host);
  if (!objectPath) {
    return { ok: true, found: false };
  }

  // Try direct property read first, fall back to describe for getter-protected properties
  let url = '';
  const urlProp = await rcRead(host, objectPath, 'Url');
  if (urlProp.value !== undefined) {
    url = urlProp.value;
  }

  return {
    ok: true,
    found: true,
    objectPath,
    url
  };
}

/**
 * Find the first Cesium3DTileset actor's objectPath
 */
async function findCesium3DTileset(host) {
  // Try /remote/search/assets first (UE 5.4+), fall back to /remote/search
  for (const endpoint of ['search/assets', 'search']) {
    try {
      const isAssets = endpoint === 'search/assets';
      const body = isAssets
        ? { Query: 'Cesium3DTileset', Limit: 10 }
        : { Query: 'Cesium3DTileset', Filter: 'ACTOR' };
      const res = await fetch(`${host}/remote/${endpoint}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const data = await res.json();
        if (isAssets && data?.Assets?.length > 0) {
          // Find a blank tileset (not OSM Buildings or World Terrain)
          const blank = data.Assets.find(a =>
            a.Class?.includes('Cesium3DTileset') &&
            !a.Metadata?.ActorLabel?.includes('OSM') &&
            !a.Metadata?.ActorLabel?.includes('World Terrain')
          );
          return (blank || data.Assets[0]).Path;
        }
        if (!isAssets && data?.length > 0) return data[0];
      }
    } catch { /* try next endpoint */ }
  }

  return null;
}

/**
 * Call a function on an object via Remote Control API
 */
async function rcCall(host, objectPath, functionName, parameters = {}) {
  try {
    const res = await fetch(`${host}/remote/object/call`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objectPath, functionName, parameters })
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

/**
 * Write a property via Remote Control API
 */
async function rcProp(host, objectPath, propertyName, value) {
  try {
    const res = await fetch(`${host}/remote/object/property`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectPath,
        access: 'WRITE_ACCESS',
        propertyName,
        propertyValue: { [propertyName]: value }
      })
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

/**
 * Read a property via Remote Control API
 */
async function rcRead(host, objectPath, propertyName) {
  try {
    const res = await fetch(`${host}/remote/object/property`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectPath,
        access: 'READ_ACCESS',
        propertyName
      })
    });
    if (!res.ok) return { value: undefined };
    const data = await res.json();
    return { value: data?.[propertyName] ?? data?.PropertyValue ?? undefined };
  } catch {
    return { value: undefined };
  }
}

/**
 * Disable Cesium ion imagery overlays via Python RC API.
 *
 * Finds all CesiumIonRasterOverlay components on any actor and destroys them.
 * This stops ion from streaming Bing Maps imagery tiles (which burns the
 * monthly imagery session quota). Local NAIP imagery on the Landscape actor
 * is unaffected.
 *
 * @param {string} host - Unreal Remote Control API host
 * @returns {Promise<{ok: boolean, removed: number, error?: string}>}
 */
export async function disableIonImagery(host) {
  const script = `
import unreal

removed = 0
world = unreal.EditorLevelLibrary.get_editor_world()
all_actors = unreal.GameplayStatics.get_all_actors_of_class(world, unreal.Actor)

for actor in all_actors:
    label = actor.get_actor_label()
    components = actor.get_components_by_class(unreal.ActorComponent)
    for comp in components:
        class_name = comp.get_class().get_name()
        if 'RasterOverlay' in class_name or 'IonRasterOverlay' in class_name:
            comp_name = comp.get_name()
            comp.destroy_component(comp)
            removed += 1
            unreal.log(f"[TM] Removed {class_name} '{comp_name}' from {label}")

if removed == 0:
    unreal.log("[TM] No Cesium ion raster overlays found")
else:
    unreal.log(f"[TM] Removed {removed} Cesium ion raster overlay(s) — imagery streaming disabled")
`.trim();

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
      return { ok: false, removed: 0, error: `Python execution failed: HTTP ${res.status}` };
    }
    return { ok: true, removed: -1 }; // can't easily parse count from Python log
  } catch (e) {
    return { ok: false, removed: 0, error: e.message };
  }
}
