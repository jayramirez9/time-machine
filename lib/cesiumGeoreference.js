/**
 * Cesium Georeference — Set CesiumGeoreference actor origin via Remote Control API
 *
 * Discovers the CesiumGeoreference actor in the current Unreal scene and
 * writes OriginLatitude, OriginLongitude, OriginHeight.
 */

/**
 * Set the CesiumGeoreference origin to a lat/lon/height
 * @param {string} host - Unreal Remote Control API host (e.g. "http://localhost:30010")
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} [height=0] - Height above WGS84 ellipsoid in meters
 * @returns {Promise<{ok: boolean, objectPath?: string, error?: string}>}
 */
export async function setGeoreference(host, lat, lon, height = 0) {
  // Check connectivity
  try {
    const res = await fetch(`${host}/remote/info`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
  } catch (e) {
    return { ok: false, error: `Unreal not reachable at ${host}: ${e.message}` };
  }

  // Find the CesiumGeoreference actor
  const objectPath = await findCesiumGeoreference(host);
  if (!objectPath) {
    return { ok: false, error: 'CesiumGeoreference actor not found in scene' };
  }

  // Write all three properties
  const results = await Promise.all([
    rcProp(host, objectPath, 'OriginLatitude', lat),
    rcProp(host, objectPath, 'OriginLongitude', lon),
    rcProp(host, objectPath, 'OriginHeight', height)
  ]);

  const allOk = results.every(r => r.ok);
  if (!allOk) {
    const failed = ['OriginLatitude', 'OriginLongitude', 'OriginHeight']
      .filter((_, i) => !results[i].ok);
    return { ok: false, objectPath, error: `Failed to set: ${failed.join(', ')}` };
  }

  return { ok: true, objectPath };
}

/**
 * Find the CesiumGeoreference actor's objectPath
 */
async function findCesiumGeoreference(host) {
  // Search by class name
  try {
    const res = await fetch(`${host}/remote/search`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Query: 'CesiumGeoreference', Filter: 'ACTOR' })
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
