/**
 * Cesium Georeference — Set CesiumGeoreference actor origin via Remote Control API
 *
 * Discovers the CesiumGeoreference actor in the current Unreal scene and
 * writes OriginLatitude, OriginLongitude, OriginHeight.
 *
 * Also provides estimateHeight() for USGS 3DEP ground elevation queries
 * and getGeoreference() for reading current actor state.
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
 * Estimate ground elevation at a lat/lon using USGS 3DEP Elevation Point Query
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} [eyeOffset=2] - Height above ground in meters (eye height)
 * @returns {Promise<number>} Height above WGS84 ellipsoid in meters
 */
export async function estimateHeight(lat, lon, eyeOffset = 2) {
  const url = `https://epqs.nationalmap.gov/v1/json?x=${lon}&y=${lat}&wkid=4326&units=Meters&includeDate=false`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return eyeOffset;
    const data = await res.json();
    const elev = parseFloat(data?.value ?? 0);
    if (isNaN(elev)) return eyeOffset;
    return elev + eyeOffset;
  } catch {
    return eyeOffset;
  }
}

/**
 * Read current CesiumGeoreference actor origin
 * @param {string} host - Unreal Remote Control API host
 * @returns {Promise<{ok: boolean, origin?: {lat: number, lon: number, height: number}, error?: string}>}
 */
export async function getGeoreference(host) {
  try {
    const res = await fetch(`${host}/remote/info`);
    if (!res.ok) return { ok: false, error: `Unreal not reachable at ${host}` };
  } catch (e) {
    return { ok: false, error: `Unreal not reachable at ${host}: ${e.message}` };
  }

  const objectPath = await findCesiumGeoreference(host);
  if (!objectPath) {
    return { ok: false, error: 'CesiumGeoreference actor not found in scene' };
  }

  const props = await Promise.all([
    rcRead(host, objectPath, 'OriginLatitude'),
    rcRead(host, objectPath, 'OriginLongitude'),
    rcRead(host, objectPath, 'OriginHeight')
  ]);

  if (props.some(p => p.value === undefined)) {
    return { ok: false, error: 'Failed to read georeference properties' };
  }

  return {
    ok: true,
    origin: { lat: props[0].value, lon: props[1].value, height: props[2].value }
  };
}

/**
 * Check if Unreal Remote Control API is reachable
 * @param {string} host
 * @returns {Promise<boolean>}
 */
export async function isUnrealReachable(host) {
  try {
    const res = await fetch(`${host}/remote/info`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
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
