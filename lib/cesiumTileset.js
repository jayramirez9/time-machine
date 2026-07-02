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
          // Find a blank tileset (not OSM Buildings, World Terrain, or the
          // dedicated splat actor — clobbering the latter's ion source with a
          // scouting URL would silently break the capture regime).
          const blank = data.Assets.find(a =>
            a.Class?.includes('Cesium3DTileset') &&
            !a.Metadata?.ActorLabel?.includes('OSM') &&
            !a.Metadata?.ActorLabel?.includes('World Terrain') &&
            a.Metadata?.ActorLabel !== DEFAULT_SPLAT_LABEL
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

// ── 3DGS (Gaussian splat) tileset streaming — Phase 7d.2-A ─────────────────
//
// A 3DGS reconstruction from Cesium ion is referenced by ion *asset ID*, not a
// URL. We give it a dedicated, labelled Cesium3DTileset actor (TM_SplatTileset)
// distinct from OSM Buildings / World Terrain / the Google scouting tileset so
// the per-feature `capture` regime (representationSelector.js) streams alongside
// the procedural pipeline without disturbing it.
//
// The find-or-spawn + ion source config goes through the Python RC path for
// parity with disableIonImagery() and the engine-start automation, and because
// IonAssetID/IonAccessToken are getter/setter-protected against direct property
// writes (same restriction the SetUrl workaround above documents).

export const DEFAULT_SPLAT_LABEL = 'TM_SplatTileset';

const PYTHON_RC_OBJECT = '/Script/PythonScriptPlugin.Default__PythonScriptLibrary';

/**
 * Build the Python RC script that find-or-spawns the dedicated splat tileset
 * actor and points it at a Cesium ion 3DGS asset. Pure (no I/O) so the RC
 * payload can be asserted offline — live render is verified against the box.
 *
 * @param {{ assetId: number, token: string, actorLabel?: string }} opts
 * @returns {string} Python script body
 */
export function buildSplatTilesetScript({ assetId, token, actorLabel = DEFAULT_SPLAT_LABEL }) {
  if (!Number.isInteger(assetId) || assetId <= 0) {
    throw new Error(`buildSplatTilesetScript: assetId must be a positive integer, got ${assetId}`);
  }
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('buildSplatTilesetScript: token must be a non-empty string');
  }
  // JSON string literals are valid Python string literals — safe embedding.
  const label = JSON.stringify(actorLabel);
  const tok = JSON.stringify(token);

  return `
import unreal

LABEL = ${label}
ASSET_ID = ${assetId}
TOKEN = ${tok}

world = unreal.EditorLevelLibrary.get_editor_world()
all_actors = unreal.GameplayStatics.get_all_actors_of_class(world, unreal.Actor)

tileset = None
for actor in all_actors:
    if actor.get_actor_label() == LABEL and 'Cesium3DTileset' in actor.get_class().get_name():
        tileset = actor
        break

if tileset is None:
    tileset_class = unreal.load_class(None, '/Script/CesiumRuntime.Cesium3DTileset')
    tileset = unreal.EditorLevelLibrary.spawn_actor_from_class(tileset_class, unreal.Vector(0.0, 0.0, 0.0))
    tileset.set_actor_label(LABEL)
    unreal.log(f"[TM] Spawned splat tileset actor '{LABEL}'")

# Point at Cesium ion. The source enum has been renamed across Cesium for Unreal
# versions (CesiumDataSource vs TilesetSource) — try known references, then fall
# back to the ion-by-default source. Verify against the installed plugin (5.8).
source_set = False
for enum_path in ('CesiumDataSource', 'TilesetSource'):
    try:
        enum_cls = getattr(unreal, enum_path)
        tileset.set_editor_property('tileset_source', enum_cls.FROM_CESIUM_ION)
        source_set = True
        break
    except Exception:
        continue
if not source_set:
    unreal.log_warning("[TM] Could not set tileset_source enum — relying on ion default")

tileset.set_editor_property('ion_asset_id', ASSET_ID)
tileset.set_editor_property('ion_access_token', TOKEN)

try:
    tileset.refresh_tileset()
except Exception as e:
    unreal.log_warning(f"[TM] refresh_tileset failed: {e}")

unreal.log(f"[TM] Splat tileset '{LABEL}' -> ion asset {ASSET_ID} (KHR_gaussian_splatting)")
`.trim();
}

/**
 * Build the Python RC script that destroys the dedicated splat tileset actor.
 * @param {string} actorLabel
 * @returns {string}
 */
export function buildClearSplatScript(actorLabel = DEFAULT_SPLAT_LABEL) {
  const label = JSON.stringify(actorLabel);
  return `
import unreal

LABEL = ${label}
world = unreal.EditorLevelLibrary.get_editor_world()
all_actors = unreal.GameplayStatics.get_all_actors_of_class(world, unreal.Actor)

removed = 0
for actor in all_actors:
    if actor.get_actor_label() == LABEL and 'Cesium3DTileset' in actor.get_class().get_name():
        unreal.EditorLevelLibrary.destroy_actor(actor)
        removed += 1

if removed == 0:
    unreal.log(f"[TM] No splat tileset '{LABEL}' to clear")
else:
    unreal.log(f"[TM] Cleared splat tileset '{LABEL}' ({removed} actor(s))")
`.trim();
}

async function executePython(host, script) {
  try {
    const res = await fetch(`${host}/remote/object/call`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectPath: PYTHON_RC_OBJECT,
        functionName: 'ExecutePythonScript',
        parameters: { PythonScript: script }
      })
    });
    if (!res.ok) return { ok: false, status: res.status };
    // ExecutePythonScript returns HTTP 200 even when the script raises; its
    // bool ReturnValue flags a top-level execution failure (e.g. Cesium plugin
    // not loaded, so load_class returns None). Fold it into ok so the engine's
    // green "streaming" log can't lie. Absent/unparseable body → trust the 200.
    let ok = true;
    try {
      const data = await res.json();
      if (data && data.ReturnValue === false) ok = false;
    } catch { /* non-JSON body — keep the HTTP-level verdict */ }
    return ok
      ? { ok: true, status: res.status }
      : { ok: false, status: res.status, error: 'Python script reported failure (ReturnValue=false)' };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

/**
 * Stream a Cesium ion 3DGS asset into the dedicated splat tileset actor,
 * spawning the actor if absent.
 *
 * @param {string} host - Unreal Remote Control API host
 * @param {{ assetId: number, token: string, actorLabel?: string }} opts
 * @returns {Promise<{ok: boolean, assetId?: number, actorLabel?: string, error?: string}>}
 */
export async function setSplatTileset(host, { assetId, token, actorLabel = DEFAULT_SPLAT_LABEL } = {}) {
  let script;
  try {
    script = buildSplatTilesetScript({ assetId, token, actorLabel });
  } catch (e) {
    return { ok: false, error: e.message };
  }
  const res = await executePython(host, script);
  if (!res.ok) {
    return { ok: false, error: res.error || `Python execution failed: HTTP ${res.status}` };
  }
  return { ok: true, assetId, actorLabel };
}

/**
 * Remove the dedicated splat tileset actor.
 * @param {string} host
 * @param {{ actorLabel?: string }} [opts]
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function clearSplatTileset(host, { actorLabel = DEFAULT_SPLAT_LABEL } = {}) {
  const res = await executePython(host, buildClearSplatScript(actorLabel));
  if (!res.ok) {
    return { ok: false, error: res.error || `Python execution failed: HTTP ${res.status}` };
  }
  return { ok: true };
}

/**
 * Find a Cesium3DTileset actor by exact label via /remote/search/assets.
 * @returns {Promise<string|null>} objectPath or null
 */
async function findTilesetByLabel(host, label) {
  try {
    const res = await fetch(`${host}/remote/search/assets`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Query: 'Cesium3DTileset', Limit: 25 })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const match = (data?.Assets || []).find(a =>
      a.Class?.includes('Cesium3DTileset') && a.Metadata?.ActorLabel === label
    );
    return match ? match.Path : null;
  } catch {
    return null;
  }
}

/**
 * Status of the dedicated splat tileset actor.
 * @param {string} host
 * @param {{ actorLabel?: string }} [opts]
 * @returns {Promise<{ok: boolean, found: boolean, assetId?: number, objectPath?: string, error?: string}>}
 */
export async function getSplatTilesetStatus(host, { actorLabel = DEFAULT_SPLAT_LABEL } = {}) {
  const objectPath = await findTilesetByLabel(host, actorLabel);
  if (!objectPath) {
    return { ok: true, found: false };
  }
  let assetId;
  const prop = await rcRead(host, objectPath, 'IonAssetID');
  if (prop.value !== undefined) assetId = prop.value;
  return { ok: true, found: true, objectPath, assetId };
}
