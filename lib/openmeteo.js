/**
 * Open-Meteo Weather Provider
 * Real weather data from Open-Meteo API (no API key required for non-commercial use)
 * Supports historical data back to 1940 and forecasts up to 16 days ahead
 */

const GEOCODING_API = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_API = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_API = 'https://archive-api.open-meteo.com/v1/archive';

/**
 * Convert location string to coordinates
 * @param {string} location - Location string (e.g., "New York, NY")
 * @returns {Promise<{lat: number, lon: number, name: string}>}
 */
export async function geocode(location) {
  // Extract city name (first part before comma) for better API results
  const cityName = location.split(',')[0].trim();
  const url = `${GEOCODING_API}?name=${encodeURIComponent(cityName)}&count=5&language=en&format=json`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Geocoding API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.results || data.results.length === 0) {
    throw new Error(`Location not found: ${location}`);
  }

  // If original location had region/country info, try to match it
  const locationLower = location.toLowerCase();
  let result = data.results[0];

  if (data.results.length > 1 && location.includes(',')) {
    for (const r of data.results) {
      const admin1 = (r.admin1 || '').toLowerCase();
      const country = (r.country || '').toLowerCase();
      const countryCode = (r.country_code || '').toLowerCase();

      if (locationLower.includes(admin1) || locationLower.includes(country) || locationLower.includes(countryCode)) {
        result = r;
        break;
      }
    }
  }

  return {
    lat: result.latitude,
    lon: result.longitude,
    name: result.name + (result.admin1 ? `, ${result.admin1}` : '') + (result.country ? `, ${result.country}` : '')
  };
}

/**
 * Determine which API to use based on date
 * - Forecast API: current day to 92 days in the past, up to 16 days ahead
 * - Archive API: 1940-01-01 to ~5 days ago
 * @param {Date} date
 * @returns {'forecast' | 'archive'}
 */
function getApiType(date) {
  const now = new Date();
  const daysAgo = Math.floor((now - date) / (1000 * 60 * 60 * 24));

  // Use archive for dates more than 92 days in the past
  if (daysAgo > 92) {
    return 'archive';
  }

  return 'forecast';
}

/**
 * Fetch weather data from Open-Meteo API
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {Date} date - Date for weather data
 * @returns {Promise<Object>} Raw API response
 */
export async function fetchWeatherData(lat, lon, date) {
  const apiType = getApiType(date);
  const dateStr = date.toISOString().split('T')[0];

  // Validate date range for archive
  if (apiType === 'archive') {
    const minDate = new Date('1940-01-01');
    if (date < minDate) {
      throw new Error('Date out of range: Open-Meteo historical data only available from 1940 onwards');
    }
  }

  const baseUrl = apiType === 'archive' ? ARCHIVE_API : FORECAST_API;

  const hourlyParams = [
    'temperature_2m',
    'relative_humidity_2m',
    'surface_pressure',
    'wind_speed_10m',
    'wind_direction_10m',
    'cloud_cover',
    'visibility',
    'precipitation_probability',
    'precipitation',
    'is_day'
  ];

  // Archive API doesn't support some parameters
  const archiveParams = [
    'temperature_2m',
    'relative_humidity_2m',
    'surface_pressure',
    'wind_speed_10m',
    'wind_direction_10m',
    'cloud_cover',
    'precipitation'
  ];

  const params = apiType === 'archive' ? archiveParams : hourlyParams;

  let url;
  if (apiType === 'archive') {
    url = `${baseUrl}?latitude=${lat}&longitude=${lon}&start_date=${dateStr}&end_date=${dateStr}&hourly=${params.join(',')}&timezone=auto`;
  } else {
    // Forecast API with past_days for historical recent data
    const now = new Date();
    const daysAgo = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    const pastDays = Math.min(Math.max(daysAgo, 0), 92);

    url = `${baseUrl}?latitude=${lat}&longitude=${lon}&hourly=${params.join(',')}&past_days=${pastDays}&forecast_days=16&timezone=auto`;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get cloud type description based on coverage percentage
 * @param {number} coverage - Cloud coverage percentage
 * @returns {string}
 */
function getCloudType(coverage) {
  if (coverage < 10) return 'clear';
  if (coverage < 30) return 'few';
  if (coverage < 60) return 'scattered';
  if (coverage < 85) return 'broken';
  return 'overcast';
}

/**
 * Get precipitation type based on temperature
 * @param {number} temp - Temperature in Celsius
 * @param {number} precipitation - Precipitation amount in mm
 * @returns {string|null}
 */
function getPrecipitationType(temp, precipitation) {
  if (precipitation <= 0) return null;
  if (temp <= 0) return 'snow';
  if (temp <= 2) return 'sleet';
  return 'rain';
}

/**
 * Calculate solar altitude (simplified approximation)
 * @param {Date} date - Date/time
 * @param {number} lat - Latitude
 * @returns {number} Solar altitude in degrees
 */
function calculateSolarAltitude(date, lat) {
  const hour = date.getHours() + date.getMinutes() / 60;
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));

  // Simplified solar declination
  const declination = 23.45 * Math.sin((360 / 365) * (dayOfYear - 81) * Math.PI / 180);

  // Hour angle (15 degrees per hour from solar noon)
  const hourAngle = (hour - 12) * 15;

  // Solar altitude
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
 * Calculate solar azimuth (simplified approximation)
 * @param {Date} date - Date/time
 * @returns {number} Solar azimuth in degrees
 */
function calculateSolarAzimuth(date) {
  const hour = date.getHours() + date.getMinutes() / 60;
  // Simplified: sun moves 15 degrees per hour, starting from east (90°) at 6am
  return Math.round((hour - 6) * 15 + 90) % 360;
}

/**
 * Main weather provider function
 * @param {Object} params
 * @param {string} params.location - Location string
 * @param {Date} params.date - Date for weather data
 * @returns {Promise<Object>} Weather state object
 */
export async function getWeather({ location, date }) {
  // Geocode the location
  const geo = await geocode(location);

  // Fetch weather data
  const data = await fetchWeatherData(geo.lat, geo.lon, date);

  // Find the hour index for the requested time
  const targetHour = date.getHours();
  const dateStr = date.toISOString().split('T')[0];

  // Find the index matching our target date and hour
  let hourIndex = -1;
  for (let i = 0; i < data.hourly.time.length; i++) {
    const timeStr = data.hourly.time[i];
    if (timeStr.startsWith(dateStr) && new Date(timeStr).getHours() === targetHour) {
      hourIndex = i;
      break;
    }
  }

  // If exact hour not found, find closest match for the date
  if (hourIndex === -1) {
    for (let i = 0; i < data.hourly.time.length; i++) {
      if (data.hourly.time[i].startsWith(dateStr)) {
        hourIndex = i;
        break;
      }
    }
  }

  if (hourIndex === -1) {
    throw new Error(`Weather data not available for ${date.toISOString()}`);
  }

  const hourly = data.hourly;
  const temp = hourly.temperature_2m[hourIndex];
  const humidity = hourly.relative_humidity_2m[hourIndex];
  const pressure = hourly.surface_pressure[hourIndex];
  const windSpeed = hourly.wind_speed_10m[hourIndex];
  const windDirection = hourly.wind_direction_10m[hourIndex];
  const cloudCover = hourly.cloud_cover[hourIndex];
  const precipitation = hourly.precipitation[hourIndex];

  // These may not be available in archive API
  const visibility = hourly.visibility ? hourly.visibility[hourIndex] / 1000 : 10; // Convert m to km
  const precipProb = hourly.precipitation_probability ? hourly.precipitation_probability[hourIndex] : (precipitation > 0 ? 100 : 0);
  const isDay = hourly.is_day ? hourly.is_day[hourIndex] === 1 : (date.getHours() >= 6 && date.getHours() < 20);

  // Calculate UV index approximation (not available in all APIs)
  const uvIndex = isDay ? Math.min(11, Math.round((90 - calculateSolarAltitude(date, geo.lat)) / 10)) : 0;

  return {
    location: geo.name,
    timestamp: date.toISOString(),
    temperature: {
      celsius: Math.round(temp * 10) / 10,
      fahrenheit: Math.round((temp * 9/5 + 32) * 10) / 10
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
      altitude: calculateSolarAltitude(date, geo.lat),
      azimuth: calculateSolarAzimuth(date),
      isDaytime: isDay
    },
    precipitation: {
      probability: Math.round(precipProb),
      type: getPrecipitationType(temp, precipitation),
      intensity: Math.round(precipitation * 10) / 10
    },
    visibility: Math.round(visibility),
    uvIndex,
    source: 'open-meteo'
  };
}
