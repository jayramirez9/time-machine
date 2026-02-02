/**
 * Weather provider module
 * Returns a weather state object for a given location and date
 */

/**
 * Generate a mock weather state object
 * @param {Object} params
 * @param {string} params.location - Location string (e.g., "New York, NY")
 * @param {Date} params.date - Date for the weather state
 * @returns {Object} Weather state object
 */
export function getWeather({ location, date }) {
  // Mock implementation - returns plausible weather data
  const hour = date.getHours();
  const month = date.getMonth();

  // Simple day/night and seasonal variation
  const isDaytime = hour >= 6 && hour < 20;
  const isSummer = month >= 4 && month <= 9;

  const baseTemp = isSummer ? 25 : 10;
  const tempVariation = isDaytime ? 5 : -5;

  return {
    location,
    timestamp: date.toISOString(),
    temperature: {
      celsius: baseTemp + tempVariation,
      fahrenheit: ((baseTemp + tempVariation) * 9/5) + 32
    },
    humidity: 60 + Math.floor(Math.random() * 20),
    pressure: 1013 + Math.floor(Math.random() * 10) - 5,
    wind: {
      speed: Math.floor(Math.random() * 20),
      direction: Math.floor(Math.random() * 360),
      unit: 'km/h'
    },
    clouds: {
      coverage: Math.floor(Math.random() * 100),
      type: 'cumulus'
    },
    solar: {
      altitude: isDaytime ? 30 + Math.floor(Math.random() * 40) : 0,
      azimuth: hour * 15,
      isDaytime
    },
    precipitation: {
      probability: Math.floor(Math.random() * 30),
      type: null,
      intensity: 0
    },
    visibility: 10,
    uvIndex: isDaytime ? Math.floor(Math.random() * 8) : 0,
    source: 'mock'
  };
}
