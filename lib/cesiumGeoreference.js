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

  // Write all three properties via function calls (direct property writes
  // blocked by getter/setter check on UE 5.4+)
  const results = await Promise.all([
    rcCall(host, objectPath, 'SetOriginLatitude', { NewValue: lat }),
    rcCall(host, objectPath, 'SetOriginLongitude', { NewValue: lon }),
    rcCall(host, objectPath, 'SetOriginHeight', { NewValue: height })
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
 * Check if coordinates are within the continental US + Hawaii + Alaska
 */
export function isInUS(lat, lon) {
  // Continental US
  if (lat >= 24.5 && lat <= 49.5 && lon >= -125.0 && lon <= -66.5) return true;
  // Alaska
  if (lat >= 51.0 && lat <= 71.5 && lon >= -180.0 && lon <= -130.0) return true;
  // Hawaii
  if (lat >= 18.5 && lat <= 22.5 && lon >= -160.5 && lon <= -154.5) return true;
  return false;
}

/**
 * Query USGS 3DEP for elevation (US only)
 */
async function usgsElevation(lat, lon) {
  const url = `https://epqs.nationalmap.gov/v1/json?x=${lon}&y=${lat}&wkid=4326&units=Meters&includeDate=false`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  const data = await res.json();
  const elev = parseFloat(data?.value ?? NaN);
  return isNaN(elev) ? null : elev;
}

/**
 * Query Open-Elevation API for elevation (global, free, no API key)
 */
async function openElevation(lat, lon) {
  const url = `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = await res.json();
  const elev = data?.results?.[0]?.elevation;
  return typeof elev === 'number' ? elev : null;
}

/**
 * Estimate ground elevation at a lat/lon
 * Uses USGS 3DEP for US locations, Open-Elevation for international.
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} [eyeOffset=2] - Height above ground in meters (eye height)
 * @returns {Promise<number>} Height above WGS84 ellipsoid in meters
 */
export async function estimateHeight(lat, lon, eyeOffset = 2) {
  try {
    let elev = null;
    if (isInUS(lat, lon)) {
      elev = await usgsElevation(lat, lon);
    }
    if (elev === null) {
      elev = await openElevation(lat, lon);
    }
    return elev !== null ? elev + eyeOffset : eyeOffset;
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

  // Read via function calls (direct property reads blocked by getter/setter check on UE 5.4+)
  const props = await Promise.all([
    rcCall(host, objectPath, 'GetOriginLatitude'),
    rcCall(host, objectPath, 'GetOriginLongitude'),
    rcCall(host, objectPath, 'GetOriginHeight')
  ]);

  if (props.some(p => !p.ok)) {
    return { ok: false, error: 'Failed to read georeference properties' };
  }

  return {
    ok: true,
    origin: { lat: props[0].returnValue, lon: props[1].returnValue, height: props[2].returnValue }
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
  // Try /remote/search/assets first (UE 5.4+), fall back to /remote/search
  for (const endpoint of ['search/assets', 'search']) {
    try {
      const isAssets = endpoint === 'search/assets';
      const body = isAssets
        ? { Query: 'CesiumGeoreference', Limit: 10 }
        : { Query: 'CesiumGeoreference', Filter: 'ACTOR' };
      const res = await fetch(`${host}/remote/${endpoint}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const data = await res.json();
        if (isAssets && data?.Assets?.length > 0) {
          const geo = data.Assets.find(a => a.Class?.includes('CesiumGeoreference'));
          return (geo || data.Assets[0]).Path;
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
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    // Extract return value — UE RC API returns it under ReturnValue key
    const returnValue = data?.ReturnValue ?? data?.returnValue ?? undefined;
    return { ok: true, status: res.status, returnValue };
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
