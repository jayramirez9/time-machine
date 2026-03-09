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

  // Set the URL property
  const urlResult = await rcProp(host, objectPath, 'Url', url);
  if (!urlResult.ok) {
    return { ok: false, objectPath, error: `Failed to set Url: status ${urlResult.status}` };
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

  const urlProp = await rcRead(host, objectPath, 'Url');
  return {
    ok: true,
    found: true,
    objectPath,
    url: urlProp.value ?? ''
  };
}

/**
 * Find the first Cesium3DTileset actor's objectPath
 */
async function findCesium3DTileset(host) {
  try {
    const res = await fetch(`${host}/remote/search`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Query: 'Cesium3DTileset', Filter: 'ACTOR' })
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.length > 0) return data[0];
    }
  } catch { /* fall through */ }

  return null;
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
