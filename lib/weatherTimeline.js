/**
 * Weather Timeline Provider
 * Fetches surrounding hours and interpolates for smooth continuity
 */

import { getWeather as getWeatherOpenMeteo } from './openmeteo.js';
import { getWeather as getWeatherVC, getApiKey as getVCKey } from './visualcrossing.js';
import { getMockWeather as getWeatherMock } from './weather.js';
import { formatLocalISO } from './timezone.js';

/**
 * Select the best available weather provider.
 * Priority: explicit provider > Visual Crossing (if key set) > Open-Meteo
 * @param {string} [provider] - 'visualcrossing', 'openmeteo', 'auto', or undefined
 * @param {boolean} useMock
 * @returns {{ fn: Function, name: string }}
 */
function selectProvider(provider, useMock) {
  if (useMock) return { fn: getWeatherMock, name: 'mock' };
  if (provider === 'visualcrossing') return { fn: getWeatherVC, name: 'visual-crossing' };
  if (provider === 'openmeteo') return { fn: getWeatherOpenMeteo, name: 'open-meteo' };
  // auto: prefer Visual Crossing if key is available
  if (getVCKey()) return { fn: getWeatherVC, name: 'visual-crossing' };
  return { fn: getWeatherOpenMeteo, name: 'open-meteo' };
}

/**
 * Linear interpolation between two values
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Interpolate between two weather states
 */
function interpolateWeather(w1, w2, t, timestamp, timezone) {
  const timestampUtc = timestamp.toISOString();
  const timestampLocal = formatLocalISO(timestamp, timezone);

  return {
    location: w1.location,
    timestampUtc,
    timestampLocal,
    temperature: {
      celsius: Math.round(lerp(w1.temperature.celsius, w2.temperature.celsius, t) * 10) / 10,
      fahrenheit: Math.round(lerp(w1.temperature.fahrenheit, w2.temperature.fahrenheit, t) * 10) / 10
    },
    humidity: Math.round(lerp(w1.humidity, w2.humidity, t)),
    pressure: Math.round(lerp(w1.pressure, w2.pressure, t)),
    wind: {
      speed: Math.round(lerp(w1.wind.speed, w2.wind.speed, t)),
      direction: Math.round(lerpAngle(w1.wind.direction, w2.wind.direction, t)),
      unit: w1.wind.unit
    },
    clouds: {
      coverage: Math.round(lerp(w1.clouds.coverage, w2.clouds.coverage, t)),
      type: t < 0.5 ? w1.clouds.type : w2.clouds.type
    },
    solar: {
      altitude: Math.round(lerp(w1.solar.altitude, w2.solar.altitude, t)),
      azimuth: Math.round(lerpAngle(w1.solar.azimuth, w2.solar.azimuth, t)),
      isDaytime: t < 0.5 ? w1.solar.isDaytime : w2.solar.isDaytime
    },
    precipitation: {
      likelihood: Math.round(lerp(w1.precipitation.likelihood, w2.precipitation.likelihood, t)),
      type: t < 0.5 ? w1.precipitation.type : w2.precipitation.type,
      intensity: Math.round(lerp(w1.precipitation.intensity, w2.precipitation.intensity, t) * 10) / 10
    },
    visibility: Math.round(lerp(w1.visibility, w2.visibility, t)),
    uvIndex: Math.round(lerp(w1.uvIndex, w2.uvIndex, t)),
    metadata: w1.metadata
  };
}

/**
 * Interpolate angles (handles wraparound at 360)
 */
function lerpAngle(a, b, t) {
  let diff = b - a;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return ((a + diff * t) + 360) % 360;
}

/**
 * Generate a weather timeline with interpolated values
 * @param {Object} params
 * @param {string} params.location - Location string
 * @param {Date} params.centerDate - Center date/time for the timeline
 * @param {number} params.windowHours - Total window size in hours (default 6)
 * @param {number} params.intervalMinutes - Interval between points in minutes (default 15)
 * @param {boolean} params.useMock - Use mock weather provider (default false)
 * @param {string} params.provider - Provider override: 'visualcrossing', 'openmeteo', 'auto'
 * @returns {Promise<Object[]>} Array of interpolated weather states
 */
export async function getWeatherTimeline({
  location,
  centerDate,
  windowHours = 6,
  intervalMinutes = 15,
  useMock = false,
  geo = null,
  provider = 'auto'
}) {
  const selected = selectProvider(provider, useMock);
  const getWeather = selected.fn;
  const timezone = geo?.timezone || null;
  const halfWindow = windowHours / 2;
  const startTime = new Date(centerDate.getTime() - halfWindow * 60 * 60 * 1000);
  const endTime = new Date(centerDate.getTime() + halfWindow * 60 * 60 * 1000);

  // Determine which hours we need to fetch (hourly boundary points)
  const hoursNeeded = new Set();
  let current = new Date(startTime);
  current.setMinutes(0, 0, 0);

  while (current <= endTime) {
    hoursNeeded.add(current.getTime());
    current = new Date(current.getTime() + 60 * 60 * 1000);
  }
  // Add one more hour past end for interpolation
  hoursNeeded.add(current.getTime());

  // Fetch weather for each hour (with fallback to Open-Meteo if primary fails)
  const hourlyWeather = new Map();
  const fetchPromises = Array.from(hoursNeeded).map(async (timestamp) => {
    const date = new Date(timestamp);
    try {
      const weather = await getWeather({ location, date, geo });
      hourlyWeather.set(timestamp, weather);
    } catch (e) {
      // If using a non-OpenMeteo provider, fall back to Open-Meteo
      if (selected.name !== 'open-meteo' && selected.name !== 'mock') {
        const weather = await getWeatherOpenMeteo({ location, date, geo });
        hourlyWeather.set(timestamp, weather);
      } else {
        throw e;
      }
    }
  });

  await Promise.all(fetchPromises);

  // Generate interpolated timeline
  const timeline = [];
  const intervalMs = intervalMinutes * 60 * 1000;

  for (let time = startTime.getTime(); time <= endTime.getTime(); time += intervalMs) {
    const currentTime = new Date(time);

    // Find surrounding hours
    const hourStart = new Date(currentTime);
    hourStart.setMinutes(0, 0, 0);
    const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

    const w1 = hourlyWeather.get(hourStart.getTime());
    const w2 = hourlyWeather.get(hourEnd.getTime());

    if (!w1 || !w2) {
      continue;
    }

    // Calculate interpolation factor (0-1 within the hour)
    const t = (time - hourStart.getTime()) / (60 * 60 * 1000);

    const interpolated = interpolateWeather(w1, w2, t, currentTime, timezone);
    timeline.push(interpolated);
  }

  return timeline;
}
