/**
 * Visual Crossing Weather Provider
 * Paid weather API with generous rate limits and hourly data back to ~1970
 * Requires VISUALCROSSING_API_KEY environment variable
 */

import { geocode } from './openmeteo.js';
import { getLocalHour, getLocalMinutes, formatLocalISO, getLocalDateStr } from './timezone.js';

const BASE_URL = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline';

// In-memory cache for raw API responses keyed by URL
const _apiCache = new Map();

/**
 * Get the API key from environment
 * @returns {string|null}
 */
export function getApiKey() {
  return process.env.VISUALCROSSING_API_KEY || null;
}

/**
 * Fetch weather data from Visual Crossing Timeline API
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {Date} date - Date for weather data
 * @param {string} timezone - IANA timezone
 * @returns {Promise<Object>} Raw API response
 */
async function fetchWeatherData(lat, lon, date, timezone) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('VISUALCROSSING_API_KEY environment variable not set');
  }

  const dateStr = timezone ? getLocalDateStr(date, timezone) : date.toISOString().split('T')[0];

  // Visual Crossing Timeline API: /timeline/{lat},{lon}/{date}
  const url = `${BASE_URL}/${lat},${lon}/${dateStr}?unitGroup=metric&include=hours&key=${apiKey}&elements=datetime,temp,humidity,pressure,windspeed,winddir,cloudcover,precip,precipprob,preciptype,visibility,uvindex,solarradiation,conditions`;

  // Check cache first
  if (_apiCache.has(url)) {
    return _apiCache.get(url);
  }

  // In-flight dedup
  if (_apiCache.has(url + ':pending')) {
    return _apiCache.get(url + ':pending');
  }

  const pending = (async () => {
    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Visual Crossing API error: ${response.status} ${response.statusText} — ${body}`);
    }
    const data = await response.json();
    _apiCache.set(url, data);
    _apiCache.delete(url + ':pending');
    return data;
  })();

  _apiCache.set(url + ':pending', pending);
  return pending;
}

/**
 * Get cloud type description based on coverage percentage
 */
function getCloudType(coverage) {
  if (coverage < 10) return 'clear';
  if (coverage < 30) return 'few';
  if (coverage < 60) return 'scattered';
  if (coverage < 85) return 'broken';
  return 'overcast';
}

/**
 * Get precipitation type from VC's preciptype array
 * @param {string[]|null} preciptype - e.g. ["rain"], ["snow"], ["rain","freezingrain"], null
 * @param {number} temp - Temperature in Celsius
 * @param {number} precip - Precipitation mm
 * @returns {string|null}
 */
function getPrecipitationType(preciptype, temp, precip) {
  if (!precip || precip <= 0) return null;
  if (!preciptype || preciptype.length === 0) {
    // Infer from temperature
    if (temp <= 0) return 'snow';
    if (temp <= 2) return 'sleet';
    return 'rain';
  }
  if (preciptype.includes('snow')) return 'snow';
  if (preciptype.includes('freezingrain') || preciptype.includes('ice')) return 'sleet';
  return 'rain';
}

/**
 * Calculate solar altitude (same simplified model as openmeteo.js)
 */
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

/**
 * Calculate solar azimuth (same simplified model as openmeteo.js)
 */
function calculateSolarAzimuth(date, timezone) {
  const hour = getLocalHour(date, timezone) + getLocalMinutes(date, timezone) / 60;
  return Math.round((hour - 6) * 15 + 90) % 360;
}

/**
 * Calculate data quality metrics based on date
 */
function calculateDataQuality(date) {
  const year = date.getFullYear();
  const now = new Date();
  const yearsAgo = now.getFullYear() - year;

  if (yearsAgo <= 1) return { confidence: 0.95, resolutionMinutes: 15 };
  if (yearsAgo <= 10) return { confidence: 0.90, resolutionMinutes: 30 };
  if (year >= 1990) return { confidence: 0.82, resolutionMinutes: 60 };
  if (year >= 1970) return { confidence: 0.70, resolutionMinutes: 60 };
  // VC may have some data pre-1970 from reanalysis, lower confidence
  return { confidence: 0.50, resolutionMinutes: 180 };
}

/**
 * Main weather provider function — same interface as openmeteo.js getWeather()
 * @param {Object} params
 * @param {string} params.location - Location string
 * @param {Date} params.date - Date for weather data (UTC)
 * @param {Object} params.geo - Pre-resolved geocode result (optional)
 * @returns {Promise<Object>} Weather state object (identical shape to openmeteo.js)
 */
export async function getWeather({ location, date, geo: preGeo }) {
  // Geocode (reuse Open-Meteo geocoding — it's free and already works)
  const geo = preGeo || await geocode(location);
  const timezone = geo.timezone || 'UTC';

  const data = await fetchWeatherData(geo.lat, geo.lon, date, timezone);

  // Find the matching hour in the response
  const targetHour = getLocalHour(date, timezone);
  const day = data.days?.[0];
  if (!day || !day.hours) {
    throw new Error(`No hourly data returned from Visual Crossing for ${date.toISOString()}`);
  }

  // Find hour entry — VC hours have "datetime": "HH:00:00"
  let hourData = null;
  for (const h of day.hours) {
    const hh = parseInt(h.datetime.slice(0, 2), 10);
    if (hh === targetHour) {
      hourData = h;
      break;
    }
  }

  if (!hourData) {
    // Fall back to closest hour
    hourData = day.hours[Math.min(targetHour, day.hours.length - 1)];
  }

  const temp = hourData.temp;
  const humidity = hourData.humidity;
  const pressure = hourData.pressure || day.pressure || 1013;
  const windSpeed = hourData.windspeed;
  const windDirection = hourData.winddir;
  const cloudCover = hourData.cloudcover;
  const precipitation = hourData.precip || 0;
  const precipProb = hourData.precipprob || (precipitation > 0 ? 100 : 0);
  const preciptype = hourData.preciptype;
  const visibility = hourData.visibility || 10;
  const uvIndex = hourData.uvindex || 0;

  // Determine daytime from solar radiation or hour
  const localHour = getLocalHour(date, timezone);
  const solarRad = hourData.solarradiation || 0;
  const isDay = solarRad > 0 ? true : (localHour >= 6 && localHour < 20);

  const { confidence, resolutionMinutes } = calculateDataQuality(date);

  const timestampUtc = date.toISOString();
  const timestampLocal = formatLocalISO(date, timezone);

  return {
    location: geo.name,
    timestampUtc,
    timestampLocal,
    temperature: {
      celsius: Math.round(temp * 10) / 10,
      fahrenheit: Math.round((temp * 9 / 5 + 32) * 10) / 10
    },
    humidity: Math.round(humidity),
    pressure: Math.round(pressure),
    wind: {
      speed: Math.round(windSpeed),
      direction: Math.round(windDirection),
      unit: 'km/h'
    },
    clouds: {
      coverage: Math.round(cloudCover),
      type: getCloudType(cloudCover)
    },
    solar: {
      altitude: calculateSolarAltitude(date, geo.lat, timezone),
      azimuth: calculateSolarAzimuth(date, timezone),
      isDaytime: isDay
    },
    precipitation: {
      likelihood: Math.round(precipProb),
      type: getPrecipitationType(preciptype, temp, precipitation),
      intensity: Math.round(precipitation * 10) / 10
    },
    visibility: Math.round(visibility),
    uvIndex: Math.round(uvIndex),
    metadata: {
      provider: 'visual-crossing',
      dataset: 'timeline',
      resolutionMinutes,
      confidence,
      timezone,
      timezoneAbbr: data.tzoffset != null ? `UTC${data.tzoffset >= 0 ? '+' : ''}${data.tzoffset}` : 'UTC'
    }
  };
}
