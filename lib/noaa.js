/**
 * NOAA GHCN-Daily Weather Provider
 * Historical weather from NOAA's Global Historical Climatology Network (Daily)
 * Provides daily observations (TMAX/TMIN/PRCP) back to the 1800s
 * Requires NOAA_API_TOKEN environment variable (free, register at ncdc.noaa.gov/cdo-web/token)
 */

import { geocode } from './openmeteo.js';
import { getLocalHour, getLocalMinutes, formatLocalISO, getLocalDateStr } from './timezone.js';

const CDO_API = 'https://www.ncei.noaa.gov/cdo-web/api/v2';
const DATA_API = 'https://www.ncei.noaa.gov/access/services/data/v1';

// In-memory caches
const _apiCache = new Map();
const _stationCache = new Map();

/**
 * Get the API token from environment
 * @returns {string|null}
 */
export function getApiKey() {
  return process.env.NOAA_API_TOKEN || null;
}

// ─── Station Lookup ──────────────────────────────────────────────

/**
 * Find the best GHCN-Daily station near a lat/lon that covers the requested date
 * @param {number} lat
 * @param {number} lon
 * @param {Date} date
 * @returns {Promise<{id: string, name: string, mindate: string, maxdate: string}>}
 */
async function findStation(lat, lon, date) {
  const token = getApiKey();
  if (!token) throw new Error('NOAA_API_TOKEN environment variable not set');

  // Cache key: rounded lat/lon (stations don't change)
  const cacheKey = `station:${lat.toFixed(1)},${lon.toFixed(1)}`;
  if (_stationCache.has(cacheKey)) {
    const stations = _stationCache.get(cacheKey);
    return pickBestStation(stations, date);
  }

  // Search within ~55km box
  const delta = 0.5;
  const extent = `${(lat - delta).toFixed(4)},${(lon - delta).toFixed(4)},${(lat + delta).toFixed(4)},${(lon + delta).toFixed(4)}`;
  const url = `${CDO_API}/stations?datasetid=GHCND&datatypeid=TMAX,TMIN&extent=${extent}&limit=25&sortfield=name`;

  const response = await fetch(url, {
    headers: { token }
  });

  if (!response.ok) {
    throw new Error(`NOAA stations API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const results = data.results || [];

  if (results.length === 0) {
    // Retry with wider box (~110km)
    const wideDelta = 1.0;
    const wideExtent = `${(lat - wideDelta).toFixed(4)},${(lon - wideDelta).toFixed(4)},${(lat + wideDelta).toFixed(4)},${(lon + wideDelta).toFixed(4)}`;
    const wideUrl = `${CDO_API}/stations?datasetid=GHCND&datatypeid=TMAX,TMIN&extent=${wideExtent}&limit=25&sortfield=name`;

    const wideResponse = await fetch(wideUrl, { headers: { token } });
    if (!wideResponse.ok) {
      throw new Error(`NOAA stations API error: ${wideResponse.status}`);
    }
    const wideData = await wideResponse.json();
    const wideResults = wideData.results || [];

    if (wideResults.length === 0) {
      throw new Error(`No GHCN-Daily stations found within 110km of ${lat.toFixed(2)}, ${lon.toFixed(2)}`);
    }

    // Sort by distance
    wideResults.sort((a, b) => haversine(lat, lon, a.latitude, a.longitude) - haversine(lat, lon, b.latitude, b.longitude));
    _stationCache.set(cacheKey, wideResults);
    return pickBestStation(wideResults, date);
  }

  // Sort by distance
  results.sort((a, b) => haversine(lat, lon, a.latitude, a.longitude) - haversine(lat, lon, b.latitude, b.longitude));
  _stationCache.set(cacheKey, results);
  return pickBestStation(results, date);
}

/**
 * Pick the best station that covers the requested date
 */
function pickBestStation(stations, date) {
  const dateStr = date.toISOString().split('T')[0];
  // Prefer stations whose date range covers the target
  for (const s of stations) {
    if (s.mindate <= dateStr && s.maxdate >= dateStr) {
      return s;
    }
  }
  // No station covers the exact date — use the closest one
  if (stations.length > 0) return stations[0];
  throw new Error('No suitable GHCN-Daily station found');
}

/**
 * Haversine distance in km
 */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Data Fetch ──────────────────────────────────────────────────

/**
 * Fetch daily summary from NOAA for a station and date
 * @returns {Promise<Object>} Pivoted daily record: { TMAX, TMIN, PRCP, SNOW, AWND, WDF2, ... }
 */
async function fetchDailyData(stationId, date) {
  const token = getApiKey();
  const dateStr = date.toISOString().split('T')[0];

  const url = `${DATA_API}?dataset=daily-summaries&stations=${stationId}&startDate=${dateStr}&endDate=${dateStr}&dataTypes=TMAX,TMIN,TAVG,PRCP,SNOW,SNWD,AWND,WSF2,WDF2&format=json&units=metric`;

  // Check cache
  if (_apiCache.has(url)) return _apiCache.get(url);
  if (_apiCache.has(url + ':pending')) return _apiCache.get(url + ':pending');

  const pending = (async () => {
    const response = await fetch(url, { headers: { token } });
    if (!response.ok) {
      throw new Error(`NOAA data API error: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    if (!text.trim()) {
      throw new Error(`No NOAA data available for station ${stationId} on ${dateStr}`);
    }

    // NCEI data service returns CSV-like JSON or raw records
    // Parse the response — format is array of objects with DATE, STATION, datatype columns
    let records;
    try {
      records = JSON.parse(text);
    } catch {
      throw new Error(`Failed to parse NOAA response for ${stationId} on ${dateStr}`);
    }

    // Handle both array and single-object responses
    if (!Array.isArray(records)) records = [records];

    // Pivot: multiple rows (one per datatype) → single object
    const daily = {};
    for (const r of records) {
      // NCEI v1 format: columns include DATE, STATION, and datatype fields directly
      // Each record has the datatype name as a key
      for (const key of ['TMAX', 'TMIN', 'TAVG', 'PRCP', 'SNOW', 'SNWD', 'AWND', 'WSF2', 'WDF2']) {
        if (r[key] !== undefined && r[key] !== null && r[key] !== '') {
          daily[key] = parseFloat(r[key]);
        }
      }
    }

    if (daily.TMAX === undefined || daily.TMIN === undefined) {
      throw new Error(`NOAA station ${stationId} missing TMAX/TMIN for ${dateStr}`);
    }

    _apiCache.set(url, daily);
    _apiCache.delete(url + ':pending');
    return daily;
  })();

  _apiCache.set(url + ':pending', pending);
  return pending;
}

// ─── Solar Position ──────────────────────────────────────────────

function calculateSolarAltitude(date, lat, timezone) {
  const hour = getLocalHour(date, timezone) + getLocalMinutes(date, timezone) / 60;
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
  const declination = 23.45 * Math.sin((360 / 365) * (dayOfYear - 81) * Math.PI / 180);
  const hourAngle = (hour - 12) * 15;
  const latRad = lat * Math.PI / 180;
  const decRad = declination * Math.PI / 180;
  const hourRad = hourAngle * Math.PI / 180;
  const altitude = Math.asin(
    Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(hourRad)
  ) * 180 / Math.PI;
  return Math.max(0, Math.round(altitude));
}

function calculateSolarAzimuth(date, timezone) {
  const hour = getLocalHour(date, timezone) + getLocalMinutes(date, timezone) / 60;
  return Math.round((hour - 6) * 15 + 90) % 360;
}

/**
 * Estimate sunrise hour (local) for a given date and latitude
 */
function estimateSunriseHour(date, lat) {
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
  const declination = 23.45 * Math.sin((360 / 365) * (dayOfYear - 81) * Math.PI / 180);
  const latRad = lat * Math.PI / 180;
  const decRad = declination * Math.PI / 180;

  // Hour angle at sunrise: cos(h) = -tan(lat) * tan(dec)
  const cosH = -Math.tan(latRad) * Math.tan(decRad);
  if (cosH > 1) return 6;  // polar night fallback
  if (cosH < -1) return 3; // midnight sun fallback
  const hourAngle = Math.acos(cosH) * 180 / Math.PI;
  return Math.max(3, Math.min(9, 12 - hourAngle / 15));
}

// ─── Diurnal Interpolation Model ─────────────────────────────────

/**
 * Synthesize an hourly weather observation from daily GHCN data
 * @param {Object} daily - Pivoted daily record { TMAX, TMIN, PRCP, SNOW, AWND, WDF2, ... }
 * @param {number} hour - Local hour (0-23)
 * @param {number} lat - Latitude
 * @param {Date} date - UTC date
 * @param {string} timezone - IANA timezone
 * @returns {Object} Synthesized hourly values
 */
function synthesizeHourly(daily, hour, lat, date, timezone) {
  const tmin = daily.TMIN;
  const tmax = daily.TMAX;
  const sunriseHour = estimateSunriseHour(date, lat);
  const tmaxHour = sunriseHour + 9; // Peak temperature ~2-3pm

  // ── Temperature (sinusoidal model) ──
  let temp;
  if (hour >= sunriseHour && hour <= tmaxHour) {
    // Rising phase: sinusoidal from TMIN to TMAX
    const t = (hour - sunriseHour) / (tmaxHour - sunriseHour);
    temp = tmin + (tmax - tmin) * Math.sin(t * Math.PI / 2);
  } else {
    // Falling phase: exponential decay from TMAX toward TMIN
    const hoursAfterMax = hour > tmaxHour
      ? hour - tmaxHour
      : (24 - tmaxHour) + hour;
    const hoursUntilMin = 24 - (tmaxHour - sunriseHour);
    const t = hoursAfterMax / hoursUntilMin;
    temp = tmin + (tmax - tmin) * Math.exp(-3 * t);
  }

  // ── Humidity (inverse of temperature) ──
  const tempFraction = (tmax - tmin) > 0 ? (temp - tmin) / (tmax - tmin) : 0.5;
  const humidity = Math.round(85 - tempFraction * 40); // 85% at tmin, 45% at tmax

  // ── Cloud cover (inferred from diurnal temperature range) ──
  const tempRange = tmax - tmin;
  let cloudCover;
  if (tempRange > 15) cloudCover = 10;
  else if (tempRange > 10) cloudCover = 30;
  else if (tempRange > 5) cloudCover = 60;
  else cloudCover = 85;

  // ── Precipitation ──
  const dailyPrecip = daily.PRCP || 0;
  let precipIntensity = 0;
  if (dailyPrecip > 0) {
    const isOvercast = tempRange < 5;
    if (isOvercast) {
      // Frontal/overcast: spread over 12 hours (08-20)
      precipIntensity = (hour >= 8 && hour < 20) ? dailyPrecip / 12 : 0;
    } else {
      // Convective: concentrate in afternoon (14-20)
      precipIntensity = (hour >= 14 && hour < 20) ? dailyPrecip / 6 : 0;
    }
  }

  const precipType = getPrecipitationType(temp, precipIntensity, daily.SNOW);
  const precipLikelihood = precipIntensity > 0 ? Math.min(100, Math.round(dailyPrecip * 20)) : 0;

  // ── Wind ──
  let windSpeed;
  if (daily.AWND !== undefined) {
    // AWND is in m/s in metric units, convert to km/h
    const avgWind = daily.AWND * 3.6;
    // Diurnal variation: calmer at night (0.6x), peak afternoon (1.3x)
    const windPhase = Math.max(0, Math.sin((hour - 6) / 12 * Math.PI));
    windSpeed = avgWind * (0.6 + 0.7 * windPhase);
  } else {
    // Estimate from temperature range
    windSpeed = tempRange > 15 ? 8 : tempRange > 10 ? 12 : tempRange > 5 ? 18 : 22;
  }

  const windDirection = daily.WDF2 !== undefined ? daily.WDF2 : Math.round(Math.random() * 360);

  // ── Visibility ──
  let visibility = 10;
  if (precipIntensity > 2) visibility = 2;
  else if (precipIntensity > 0) visibility = 5;
  else if (cloudCover > 80) visibility = 6;

  // ── Solar ──
  const solarAltitude = calculateSolarAltitude(date, lat, timezone);
  const solarAzimuth = calculateSolarAzimuth(date, timezone);
  const isDaytime = solarAltitude > 0;

  // ── UV ──
  const uvIndex = isDaytime ? Math.min(11, Math.round(solarAltitude / 8)) : 0;

  return {
    temp, humidity, cloudCover, precipIntensity, precipType, precipLikelihood,
    windSpeed, windDirection, visibility, solarAltitude, solarAzimuth,
    isDaytime, uvIndex
  };
}

/**
 * Get precipitation type
 */
function getPrecipitationType(temp, precipIntensity, dailySnow) {
  if (precipIntensity <= 0) return null;
  if (dailySnow > 0 || temp <= 0) return 'snow';
  if (temp <= 2) return 'sleet';
  return 'rain';
}

function getCloudType(coverage) {
  if (coverage < 10) return 'clear';
  if (coverage < 30) return 'few';
  if (coverage < 60) return 'scattered';
  if (coverage < 85) return 'broken';
  return 'overcast';
}

// ─── Confidence ──────────────────────────────────────────────────

function calculateDataQuality(date) {
  const year = date.getFullYear();
  if (year >= 1920) return { confidence: 0.35, resolutionMinutes: 1440 };
  if (year >= 1900) return { confidence: 0.30, resolutionMinutes: 1440 };
  if (year >= 1869) return { confidence: 0.25, resolutionMinutes: 1440 };
  return { confidence: 0.20, resolutionMinutes: 1440 };
}

// ─── Main Provider ───────────────────────────────────────────────

/**
 * Main weather provider function — same interface as openmeteo.js getWeather()
 * @param {Object} params
 * @param {string} params.location - Location string
 * @param {Date} params.date - Date for weather data (UTC)
 * @param {Object} params.geo - Pre-resolved geocode result (optional)
 * @returns {Promise<Object>} Weather state object (identical shape to other providers)
 */
export async function getWeather({ location, date, geo: preGeo }) {
  const geo = preGeo || await geocode(location);
  const timezone = geo.timezone || 'UTC';

  // Find nearest GHCN station
  const station = await findStation(geo.lat, geo.lon, date);

  // Fetch daily data — use LOCAL date at target location
  const localDateStr = timezone ? getLocalDateStr(date, timezone) : date.toISOString().split('T')[0];
  // Build a date at midnight UTC matching the local date string for the API query
  const queryDate = new Date(localDateStr + 'T00:00:00Z');
  const daily = await fetchDailyData(station.id, queryDate);

  // Synthesize hourly values
  const localHour = getLocalHour(date, timezone);
  const synth = synthesizeHourly(daily, localHour, geo.lat, date, timezone);

  const { confidence, resolutionMinutes } = calculateDataQuality(date);

  const timestampUtc = date.toISOString();
  const timestampLocal = formatLocalISO(date, timezone);

  return {
    location: geo.name,
    timestampUtc,
    timestampLocal,
    temperature: {
      celsius: Math.round(synth.temp * 10) / 10,
      fahrenheit: Math.round((synth.temp * 9 / 5 + 32) * 10) / 10
    },
    humidity: synth.humidity,
    pressure: 1013,
    wind: {
      speed: Math.round(synth.windSpeed),
      direction: Math.round(synth.windDirection),
      unit: 'km/h'
    },
    clouds: {
      coverage: synth.cloudCover,
      type: getCloudType(synth.cloudCover)
    },
    solar: {
      altitude: synth.solarAltitude,
      azimuth: synth.solarAzimuth,
      isDaytime: synth.isDaytime
    },
    precipitation: {
      likelihood: synth.precipLikelihood,
      type: synth.precipType,
      intensity: Math.round(synth.precipIntensity * 10) / 10
    },
    visibility: synth.visibility,
    uvIndex: synth.uvIndex,
    metadata: {
      provider: 'noaa-ghcn',
      dataset: 'daily-summaries',
      resolutionMinutes,
      confidence,
      timezone,
      timezoneAbbr: 'UTC',
      stationId: station.id,
      stationName: station.name
    }
  };
}

// Export internals for testing
export { synthesizeHourly as _synthesizeHourly, estimateSunriseHour as _estimateSunriseHour, findStation as _findStation };
