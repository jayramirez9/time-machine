/**
 * Cesium Georeference
 * One-shot dispatch of lat/lon/height to a CesiumGeoreference actor in Unreal
 * via the Remote Control API.
 *
 * CesiumGeoreference properties are written directly to the actor objectPath
 * (not a component subpath). After writing lat/lon/height, the Cesium tiles
 * re-stream around the new origin automatically.
 */

const DEFAULT_HOST = 'http://localhost:30010';

/**
 * Set CesiumGeoreference origin in Unreal
 *
 * @param {Object} options
 * @param {number} options.lat - Latitude in degrees
 * @param {number} options.lon - Longitude in degrees
 * @param {number} options.height - Height in meters above WGS84 ellipsoid (default: 0)
 * @param {string} options.objectPath - Full objectPath to the CesiumGeoreference actor
 * @param {string} options.host - Unreal Remote Control API host (default: http://localhost:30010)
 * @returns {Promise<{ok: boolean, errors?: string[]}>}
 */
export async function setCesiumGeoreference({ lat, lon, height = 0, objectPath, host = DEFAULT_HOST }) {
  if (!objectPath) {
    return { ok: false, errors: ['No objectPath configured for CesiumGeoreference'] };
  }

  const properties = [
    { name: 'OriginLatitude', value: lat },
    { name: 'OriginLongitude', value: lon },
    { name: 'OriginHeight', value: height }
  ];

  const results = await Promise.all(properties.map(async ({ name, value }) => {
    const body = {
      objectPath,
      access: 'WRITE_ACCESS',
      propertyName: name,
      propertyValue: { [name]: value }
    };

    try {
      const res = await fetch(`${host}/remote/object/property`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const text = await res.text();
        return `${name}: ${res.status} ${text}`;
      }
    } catch (e) {
      return `${name}: ${e.message}`;
    }
    return null;
  }));

  const errors = results.filter(Boolean);
  if (errors.length === 0) {
    console.log(`[Cesium] Georeference set: ${lat.toFixed(6)}, ${lon.toFixed(6)} @ ${height}m`);
    return { ok: true };
  }

  console.warn(`[Cesium] Georeference errors:`, errors);
  return { ok: false, errors };
}
