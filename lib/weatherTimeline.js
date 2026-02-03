/**
 * Weather Timeline Provider
 * Fetches surrounding hours and interpolates for smooth continuity
 */

import { getWeather as getWeatherReal } from './openmeteo.js';
import { getMockWeather as getWeatherMock } from './weather.js';

/**
 * Linear interpolation between two values
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Interpolate between two weather states
 */
function interpolateWeather(w1, w2, t, timestamp) {
  const timestampUtc = timestamp.toISOString();
  const timestampLocal = `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')}T${String(timestamp.getHours()).padStart(2, '0')}:${String(timestamp.getMinutes()).padStart(2, '0')}:${String(timestamp.getSeconds()).padStart(2, '0')}`;

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
 * @returns {Promise<Object[]>} Array of interpolated weather states
 */
export async function getWeatherTimeline({
  location,
  centerDate,
  windowHours = 6,
  intervalMinutes = 15,
  useMock = false
}) {
  const getWeather = useMock ? getWeatherMock : getWeatherReal;
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

  // Fetch weather for each hour
  const hourlyWeather = new Map();
  const fetchPromises = Array.from(hoursNeeded).map(async (timestamp) => {
    const date = new Date(timestamp);
    const weather = await getWeather({ location, date });
    hourlyWeather.set(timestamp, weather);
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

    const interpolated = interpolateWeather(w1, w2, t, currentTime);
    timeline.push(interpolated);
  }

  return timeline;
}
