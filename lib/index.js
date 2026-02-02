/**
 * Weather Engine - Main entry point
 * Environmental simulation weather state generator
 */

import { getWeather as openMeteoProvider } from './openmeteo.js';
import { getWeather as mockProvider } from './weather.js';

// Default export uses real Open-Meteo API
export { getWeather } from './openmeteo.js';

// Export mock provider for testing/offline use
export { getWeather as getMockWeather } from './weather.js';

/**
 * Create a weather engine instance with configurable providers
 * @param {Object} options
 * @param {Function} options.weatherProvider - Custom weather provider function
 * @param {boolean} options.useMock - Use mock provider instead of real API
 * @returns {Object} Weather engine instance
 */
export function createWeatherEngine(options = {}) {
  let weatherProvider;
  if (options.weatherProvider) {
    weatherProvider = options.weatherProvider;
  } else if (options.useMock) {
    weatherProvider = mockProvider;
  } else {
    weatherProvider = openMeteoProvider;
  }

  return {
    /**
     * Get weather state for a location and date
     * @param {string} location - Location string
     * @param {Date|string} date - Date for weather state
     * @returns {Object} Weather state object
     */
    getWeather(location, date) {
      const parsedDate = typeof date === 'string' ? new Date(date) : date;
      return weatherProvider({ location, date: parsedDate });
    }
  };
}
