/**
 * World State Compiler
 * Transforms weather timeline into consistent simulation control values
 */

/**
 * Classify time of day from hour and solar data
 */
function classifyTimeOfDay(hour, isDaytime) {
  if (!isDaytime) {
    if (hour >= 21 || hour < 5) return 'night';
    return 'twilight';
  }
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'day';
  if (hour >= 17 && hour < 19) return 'afternoon';
  if (hour >= 19 && hour < 21) return 'dusk';
  return 'day';
}

/**
 * Classify sky condition from cloud coverage
 */
function classifySky(cloudCoverage) {
  if (cloudCoverage < 10) return 'clear';
  if (cloudCoverage < 30) return 'few';
  if (cloudCoverage < 60) return 'scattered';
  if (cloudCoverage < 85) return 'broken';
  return 'overcast';
}

/**
 * Classify precipitation
 */
function classifyPrecip(precipType, intensity) {
  if (!precipType || intensity <= 0) return 'none';
  if (precipType === 'snow') {
    return intensity < 1 ? 'light_snow' : intensity < 4 ? 'snow' : 'heavy_snow';
  }
  if (precipType === 'sleet') return 'sleet';
  return intensity < 2.5 ? 'light_rain' : intensity < 7.5 ? 'rain' : 'heavy_rain';
}

/**
 * Classify wind from speed (km/h)
 */
function classifyWind(speed) {
  if (speed < 5) return 'calm';
  if (speed < 15) return 'light';
  if (speed < 25) return 'breezy';
  if (speed < 40) return 'windy';
  return 'gusty';
}

/**
 * Classify comfort from temperature (Celsius)
 */
function classifyComfort(tempC) {
  if (tempC < 0) return 'freezing';
  if (tempC < 10) return 'cold';
  if (tempC < 18) return 'cool';
  if (tempC < 24) return 'comfortable';
  if (tempC < 30) return 'warm';
  return 'hot';
}

/**
 * Calculate exterior luminance (0-1) based on sun and clouds
 */
function calculateLuminance(solarAltitude, cloudCoverage, isDaytime) {
  if (!isDaytime) {
    return 0.02 + (1 - cloudCoverage / 100) * 0.03;
  }

  const sunFactor = Math.min(1, solarAltitude / 60);
  const cloudFactor = 1 - (cloudCoverage / 100) * 0.6;

  return Math.round(sunFactor * cloudFactor * 100) / 100;
}

/**
 * Calculate color temperature (Kelvin) based on time and conditions
 */
function calculateColorTemp(hour, solarAltitude, cloudCoverage) {
  // Golden hour warmth
  if (hour >= 5 && hour < 7) return 3200 + solarAltitude * 30;
  if (hour >= 18 && hour < 20) return 3200 + (90 - solarAltitude) * 10;

  // Midday is cooler/bluer
  const baseTempK = 5500 + solarAltitude * 10;

  // Overcast skies diffuse light, making it cooler
  const cloudAdjust = cloudCoverage > 70 ? 300 : 0;

  return Math.round(Math.min(6500, baseTempK + cloudAdjust));
}

/**
 * Calculate contrast based on cloud diffusion
 */
function calculateContrast(cloudCoverage, isDaytime) {
  if (!isDaytime) return 0.15;

  // Clear sky = high contrast, overcast = low contrast (diffused)
  return Math.round((0.8 - (cloudCoverage / 100) * 0.5) * 100) / 100;
}

/**
 * Calculate base noise floor in dB
 */
function calculateNoiseFloor(windSpeed, precipIntensity, locale) {
  let base = locale.audioBaseDb ?? 24; // rural baseline fallback

  // Wind and rain add to ambient
  base += windSpeed * 0.2;
  base += precipIntensity * 1.5;

  return Math.round(Math.min(60, base));
}

/**
 * Calculate wind audio level (0-1)
 */
function calculateWindLevel(windSpeed) {
  return Math.round(Math.min(1, windSpeed / 50) * 100) / 100;
}

/**
 * Calculate rain audio level (0-1)
 */
function calculateRainLevel(precipType, intensity) {
  if (!precipType || precipType === 'snow') return 0;
  return Math.round(Math.min(1, intensity / 10) * 100) / 100;
}

/**
 * Calculate snow audio level (0-1)
 */
function calculateSnowLevel(precipType, intensity) {
  if (precipType !== 'snow' || intensity <= 0) return 0;
  return Math.round(Math.min(1, intensity / 5) * 100) / 100;
}

/**
 * Calculate gustiness (0-1) from wind classification
 */
function calculateGustiness(windSpeed) {
  if (windSpeed < 5) return 0;       // calm
  if (windSpeed < 15) return 0.1;    // light
  if (windSpeed < 25) return 0.3;    // breezy
  if (windSpeed < 40) return 0.5;    // windy
  return 0.8;                         // gusty
}

/**
 * Calculate thunder probability (0-1)
 * Only nonzero when rain is moderate or heavier
 */
function calculateThunderProb(rainLevel) {
  if (rainLevel <= 0) return 0;
  return Math.round(Math.min(1, Math.max(0, (rainLevel - 0.3) * 1.5)) * 100) / 100;
}

/**
 * Calculate activity level (0-1)
 * Locale activity modulated by time of day
 */
function calculateActivityLevel(hour, isDaytime, locale) {
  const baseActivity = locale.activity ?? 0.12; // rural baseline fallback

  // Time-of-day multiplier
  let todMult;
  if (!isDaytime) {
    todMult = (hour >= 21 || hour < 5) ? 0.2 : 0.4; // deep night vs twilight
  } else if (hour >= 5 && hour < 7) {
    todMult = 0.5;   // dawn
  } else if (hour >= 7 && hour < 10) {
    todMult = 0.8;   // morning ramp
  } else if (hour >= 10 && hour < 17) {
    todMult = 1.0;   // midday peak
  } else if (hour >= 17 && hour < 19) {
    todMult = 0.8;   // afternoon
  } else {
    todMult = 0.6;   // dusk
  }

  return Math.round(Math.min(1, baseActivity * todMult) * 100) / 100;
}

/**
 * Calculate continuous time-of-day phase (0-1)
 * 0 = midnight, 0.5 = noon, 1.0 = next midnight
 */
function calculateTimeOfDayPhase(hour, minutes) {
  return Math.round(((hour + (minutes || 0) / 60) / 24) * 1000) / 1000;
}

/**
 * Calculate atmospheric haze (0-1) from visibility
 */
function calculateHaze(visibility, locale) {
  const hazeBias = locale.hazeBias ?? 0;
  // visibility in km, lower = more haze
  let base;
  if (visibility >= 10) base = 0.05;
  else if (visibility >= 5) base = 0.15;
  else if (visibility >= 2) base = 0.35;
  else base = 0.6;

  return Math.round(Math.min(1, base + hazeBias) * 100) / 100;
}

/**
 * Calculate surface wetness (0-1)
 */
function calculateWetness(precipType, intensity, tempC) {
  if (!precipType || intensity <= 0) return 0;
  if (precipType === 'snow' && tempC < 0) return 0; // Snow doesn't wet surfaces below freezing

  // Rain and melting snow create wetness
  return Math.round(Math.min(1, intensity / 5) * 100) / 100;
}

/**
 * Calculate precipitation visual density (0-1)
 */
function calculatePrecipDensity(precipType, intensity) {
  if (!precipType || intensity <= 0) return 0;

  // Snow appears denser visually at lower intensities than rain
  const multiplier = precipType === 'snow' ? 0.3 : 0.15;
  return Math.round(Math.min(1, intensity * multiplier) * 100) / 100;
}

/**
 * Calculate heat distortion effect (0-1)
 */
function calculateHeatDistortion(tempC, isDaytime, solarAltitude) {
  if (!isDaytime || tempC < 28) return 0;

  // Heat shimmer increases with temperature and sun angle
  const tempFactor = Math.min(1, (tempC - 28) / 15);
  const sunFactor = Math.min(1, solarAltitude / 60);

  return Math.round(tempFactor * sunFactor * 100) / 100;
}

/**
 * Find the weather state closest to the target time
 */
function findCurrentWeather(timeline, targetTime) {
  const targetMs = targetTime.getTime();
  let closest = timeline[0];
  let minDiff = Infinity;

  for (const weather of timeline) {
    const diff = Math.abs(new Date(weather.timestampUtc).getTime() - targetMs);
    if (diff < minDiff) {
      minDiff = diff;
      closest = weather;
    }
  }

  return closest;
}

/**
 * Compile world state from weather timeline
 * @param {Object} params
 * @param {Object[]} params.timeline - Array of weather states from getWeatherTimeline
 * @param {Object} params.locale - Locale preset object with audioBaseDb, activity, hazeBias
 * @param {Date} params.now - Current time to evaluate
 * @returns {Object} Compiled world state for simulation
 */
export function compileWorldState({
  timeline,
  locale = { audioBaseDb: 24, activity: 0.12, hazeBias: 0.02 }, // generic quiet environment (rural baseline)
  now
}) {
  const weather = findCurrentWeather(timeline, now);
  const date = new Date(weather.timestampUtc);
  const hour = date.getHours();

  const tempC = weather.temperature.celsius;
  const cloudCoverage = weather.clouds.coverage;
  const windSpeed = weather.wind.speed;
  const windDirection = weather.wind.direction;
  const precipType = weather.precipitation.type;
  const precipIntensity = weather.precipitation.intensity;
  const visibility = weather.visibility;
  const solarAltitude = weather.solar.altitude;
  const solarAzimuth = weather.solar.azimuth;
  const isDaytime = weather.solar.isDaytime;
  const minutes = date.getMinutes();

  // Extract metadata with defaults
  const metadata = weather.metadata || {};
  const provider = metadata.provider || 'unknown';
  const dataset = metadata.dataset || 'unknown';
  const resolutionMinutes = metadata.resolutionMinutes ?? 60;
  const confidence = metadata.confidence ?? 0.70;

  return {
    timeUtc: weather.timestampUtc,
    timeLocal: weather.timestampLocal,
    states: {
      timeOfDay: classifyTimeOfDay(hour, isDaytime),
      sky: classifySky(cloudCoverage),
      precip: classifyPrecip(precipType, precipIntensity),
      wind: classifyWind(windSpeed),
      comfort: classifyComfort(tempC)
    },
    controls: {
      lighting: {
        exteriorLuminance: calculateLuminance(solarAltitude, cloudCoverage, isDaytime),
        colorTempK: calculateColorTemp(hour, solarAltitude, cloudCoverage),
        contrast: calculateContrast(cloudCoverage, isDaytime)
      },
      audio: {
        baseNoiseFloorDb: calculateNoiseFloor(windSpeed, precipIntensity, locale),
        windLevel: calculateWindLevel(windSpeed),
        rainLevel: calculateRainLevel(precipType, precipIntensity),
        snowLevel: calculateSnowLevel(precipType, precipIntensity),
        gustiness: calculateGustiness(windSpeed),
        thunderProb: calculateThunderProb(calculateRainLevel(precipType, precipIntensity)),
        activityLevel: calculateActivityLevel(hour, isDaytime, locale),
        timeOfDayPhase: calculateTimeOfDayPhase(hour, minutes),
        windDirection: Math.round(windDirection)
      },
      atmosphere: {
        cloudDensity: Math.round(cloudCoverage / 100 * 100) / 100,
        haze: calculateHaze(visibility, locale),
        wetness: calculateWetness(precipType, precipIntensity, tempC)
      },
      visual: {
        windDirection: Math.round(windDirection),
        sunAltitude: solarAltitude,
        sunAzimuth: solarAzimuth,
        precipDensity: calculatePrecipDensity(precipType, precipIntensity),
        heatDistortion: calculateHeatDistortion(tempC, isDaytime, solarAltitude)
      },
      postprocess: {
        exposureBias: locale.toneMappingPreset?.exposureBias ?? 0.0,
        filmSlope: locale.toneMappingPreset?.filmSlope ?? 0.88,
        filmToe: locale.toneMappingPreset?.filmToe ?? 0.55,
        filmShoulder: locale.toneMappingPreset?.filmShoulder ?? 0.26,
        saturation: locale.toneMappingPreset?.saturation ?? 1.0,
        colorGammaR: locale.toneMappingPreset?.colorGamma?.r ?? 1.0,
        colorGammaG: locale.toneMappingPreset?.colorGamma?.g ?? 1.0,
        colorGammaB: locale.toneMappingPreset?.colorGamma?.b ?? 1.0
      }
    },
    metadata: {
      provider,
      dataset,
      resolutionMinutes,
      confidence
    }
  };
}
