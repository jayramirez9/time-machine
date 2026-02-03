/**
 * Mock Weather Provider
 * Returns deterministic weather state based on location and date
 * Same inputs always produce same outputs (seeded PRNG)
 */

/**
 * Simple string hash function (djb2)
 * @param {string} str
 * @returns {number}
 */
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return h >>> 0;
}

/**
 * Seeded PRNG (mulberry32)
 * @param {number} seed
 * @returns {function} Random function returning 0-1
 */
function seededRandom(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Create a deterministic random generator for a location and time
 * Seed is based on location + hourly timestamp for consistency
 * @param {string} location
 * @param {Date} date
 * @returns {function} Random function returning 0-1
 */
function createRng(location, date) {
  // Seed based on location + hour (not minute/second) for hourly consistency
  const seedStr = `${location.toLowerCase()}|${date.toISOString().slice(0, 13)}`;
  return seededRandom(hash(seedStr));
}

/**
 * Generate a deterministic mock weather state
 * @param {Object} params
 * @param {string} params.location - Location string (e.g., "New York, NY")
 * @param {Date} params.date - Date for the weather state
 * @returns {Object} Weather state object
 */
export function getMockWeather({ location, date }) {
  const rng = createRng(location, date);

  const hour = date.getHours();
  const month = date.getMonth();
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));

  // Deterministic day/night and seasonal variation
  const isDaytime = hour >= 6 && hour < 20;
  const isSummer = month >= 4 && month <= 9;

  // Base temperature from season + location hash for variety
  const locationTempBias = (hash(location) % 10) - 5;
  const baseTemp = (isSummer ? 25 : 10) + locationTempBias;
  const tempVariation = isDaytime ? 5 : -5;
  const tempC = baseTemp + tempVariation + Math.floor(rng() * 6) - 3;

  // Wind - use seeded random
  const windSpeed = Math.floor(rng() * 20);
  const windDirection = Math.floor(rng() * 360);

  // Clouds - slight seasonal bias
  const cloudBase = isSummer ? 30 : 50;
  const cloudCoverage = Math.floor(cloudBase + rng() * 40 - 20);

  // Humidity - higher in summer, varies by "weather pattern"
  const humidityBase = isSummer ? 65 : 55;
  const humidity = Math.floor(humidityBase + rng() * 20 - 5);

  // Pressure
  const pressure = Math.floor(1008 + rng() * 20);

  // Solar altitude (simplified)
  const maxAltitude = 45 + 25 * Math.cos((dayOfYear - 172) * 2 * Math.PI / 365);
  const hourAngle = Math.abs(hour - 12) / 6;
  const solarAltitude = isDaytime ? Math.floor(maxAltitude * (1 - hourAngle * 0.7)) : 0;

  // UV correlates with solar altitude
  const uvIndex = isDaytime ? Math.floor(solarAltitude / 10) : 0;

  // Precipitation likelihood
  const precipLikelihood = Math.floor(rng() * 30);

  // Timestamp rule: user input is interpreted as local time at target location.
  // timestampLocal: what time it is "there" (the input time)
  // timestampUtc: the corresponding UTC instant
  // TODO: Currently timestampLocal is naive (no actual TZ conversion).
  // When timezone derivation is implemented, these will be properly aligned.
  const timestampUtc = date.toISOString();
  const timestampLocal = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;

  return {
    location,
    timestampUtc,
    timestampLocal,
    temperature: {
      celsius: tempC,
      fahrenheit: Math.round((tempC * 9/5 + 32) * 10) / 10
    },
    humidity: Math.max(30, Math.min(95, humidity)),
    pressure,
    wind: {
      speed: windSpeed,
      direction: windDirection,
      unit: 'km/h'
    },
    clouds: {
      coverage: Math.max(0, Math.min(100, cloudCoverage)),
      type: cloudCoverage < 30 ? 'few' : cloudCoverage < 70 ? 'cumulus' : 'stratus'
    },
    solar: {
      altitude: solarAltitude,
      azimuth: ((hour - 6) * 15 + 90) % 360,
      isDaytime
    },
    precipitation: {
      likelihood: precipLikelihood,
      type: null,
      intensity: 0
    },
    visibility: 10,
    uvIndex,
    metadata: {
      provider: 'mock',
      dataset: 'generated',
      resolutionMinutes: 60,
      confidence: 0.70,
      timezone: 'America/Chicago',  // TODO: derive from location
      timezoneAbbr: 'CST'
    }
  };
}
