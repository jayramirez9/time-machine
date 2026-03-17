/**
 * Weather Research Agent (Phase 7.2)
 *
 * Given a location + year, finds the best available weather data source,
 * assesses data quality, and produces a weather layer for an Environment Profile.
 *
 * Does NOT fetch actual weather data — it researches what's available and produces
 * a provider configuration with confidence ratings and source citations.
 */

import { geocode } from '../openmeteo.js';
import { getApiKey as getVCKey } from '../visualcrossing.js';
import { getApiKey as getNOAAKey, _findStation } from '../noaa.js';
import { createLayer, createSource } from '../environmentProfile.js';

// ---------------------------------------------------------------------------
// Provider metadata
// ---------------------------------------------------------------------------

const PROVIDERS = {
  noaa: {
    name: 'NOAA GHCN-Daily',
    id: 'noaa',
    dataType: 'daily',
    interpolation: 'solar_position',
    minYear: null,      // goes back to 1800s
    maxYear: null,      // ongoing
    resolution: 1440,   // daily (minutes)
    free: true,
    requiresKey: true,
    envVar: 'NOAA_API_TOKEN',
    url: 'https://www.ncdc.noaa.gov/cdo-web/',
    citation: 'NOAA Climate Data Online, GHCN-Daily dataset'
  },
  openmeteo: {
    name: 'Open-Meteo',
    id: 'openmeteo',
    dataType: 'hourly',
    interpolation: null,
    minYear: 1940,
    maxYear: null,
    resolution: 60,     // hourly
    free: true,
    requiresKey: false,
    envVar: null,
    url: 'https://open-meteo.com/',
    citation: 'Open-Meteo Historical Weather API (ERA5 reanalysis)'
  },
  visualcrossing: {
    name: 'Visual Crossing',
    id: 'visualcrossing',
    dataType: 'hourly',
    interpolation: null,
    minYear: 1970,
    maxYear: null,
    resolution: 60,
    free: false,
    requiresKey: true,
    envVar: 'VISUALCROSSING_API_KEY',
    url: 'https://www.visualcrossing.com/',
    citation: 'Visual Crossing Weather API, hourly historical data'
  },
  mock: {
    name: 'Mock (synthetic)',
    id: 'mock',
    dataType: 'synthetic',
    interpolation: 'synthetic',
    minYear: null,
    maxYear: null,
    resolution: 60,
    free: true,
    requiresKey: false,
    envVar: null,
    url: null,
    citation: 'Synthetic weather data (no real observations)'
  }
};

// ---------------------------------------------------------------------------
// Station research (NOAA)
// ---------------------------------------------------------------------------

/**
 * Research NOAA station availability for a location + year.
 * Returns station metadata and distance, or null if unavailable.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {number} year
 * @returns {Promise<Object|null>} Station info or null
 */
async function researchNOAAStation(lat, lon, year) {
  const token = getNOAAKey();
  if (!token) return null;

  try {
    // Use June 15 as a representative date for station coverage check
    const probeDate = new Date(`${year}-06-15T12:00:00Z`);
    const station = await _findStation(lat, lon, probeDate);

    if (!station) return null;

    // Compute distance
    const dist = haversine(lat, lon, station.latitude, station.longitude);

    // Check date coverage
    const stationStart = new Date(station.mindate);
    const stationEnd = new Date(station.maxdate);
    const targetStart = new Date(`${year}-01-01`);
    const targetEnd = new Date(`${year}-12-31`);
    const coversYear = stationStart <= targetStart && stationEnd >= targetEnd;
    const partialCoverage = stationStart <= targetEnd && stationEnd >= targetStart;

    return {
      id: station.id,
      name: station.name,
      lat: station.latitude,
      lon: station.longitude,
      distance: Math.round(dist * 10) / 10,
      distanceLabel: dist < 1 ? '<1km' : `~${Math.round(dist)}km`,
      mindate: station.mindate,
      maxdate: station.maxdate,
      coversYear,
      partialCoverage
    };
  } catch {
    return null;
  }
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

// ---------------------------------------------------------------------------
// Confidence calculation
// ---------------------------------------------------------------------------

/**
 * Calculate confidence score for a provider + station combination.
 * Factors: data resolution, station distance, date coverage, provider reliability.
 */
function calculateConfidence(provider, year, station) {
  let confidence = 0;

  if (provider.id === 'mock') return 0.1;

  // Base confidence from data resolution
  if (provider.resolution <= 60) {
    confidence = 0.85;  // hourly data
  } else {
    confidence = 0.65;  // daily data (needs interpolation)
  }

  // Year-based degradation for NOAA (older = less reliable instrumentation)
  if (provider.id === 'noaa') {
    if (year >= 1920) confidence *= 1.0;
    else if (year >= 1900) confidence *= 0.95;
    else if (year >= 1870) confidence *= 0.88;
    else confidence *= 0.80;
  }

  // Station distance penalty (NOAA only)
  if (station) {
    if (station.distance > 50) confidence *= 0.75;
    else if (station.distance > 20) confidence *= 0.85;
    else if (station.distance > 10) confidence *= 0.92;
    // < 10km: no penalty

    // Partial coverage penalty
    if (!station.coversYear) {
      confidence *= station.partialCoverage ? 0.85 : 0.5;
    }
  }

  // Open-Meteo for very old data (1940-1950) is slightly less reliable
  if (provider.id === 'openmeteo' && year < 1950) {
    confidence *= 0.92;
  }

  return Math.round(confidence * 100) / 100;
}

// ---------------------------------------------------------------------------
// Known compromises
// ---------------------------------------------------------------------------

function buildCompromises(provider, year, station) {
  const compromises = [];

  if (provider.id === 'noaa') {
    compromises.push(
      'Sub-daily interpolation is synthetic — NOAA provides only daily high/low/precip'
    );
    if (year < 1900) {
      compromises.push('Pre-1900 instrumentation is less precise — temperature readings may have ±1°C error');
    }
    if (station) {
      if (station.distance > 10) {
        compromises.push(`Weather station is ${station.distanceLabel} from target — microclimate differences possible`);
      }
      if (!station.coversYear) {
        compromises.push(
          station.partialCoverage
            ? `Station ${station.id} has partial coverage for ${year} (${station.mindate} to ${station.maxdate})`
            : `Station ${station.id} does not cover ${year} — using nearest available station`
        );
      }
    }
    compromises.push('Wind data may be sparse for pre-1940 observations');
    compromises.push('Cloud cover inferred from diurnal temperature range, not observed');
  }

  if (provider.id === 'openmeteo') {
    if (year < 1950) {
      compromises.push('ERA5 reanalysis quality decreases before 1950 due to sparse observation networks');
    }
  }

  if (provider.id === 'visualcrossing') {
    if (year < 1980) {
      compromises.push('Hourly data before 1980 may have interpolated gaps');
    }
  }

  if (provider.id === 'mock') {
    compromises.push('Synthetic weather — no real observations. For testing only.');
  }

  return compromises;
}

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

/**
 * Select the best available provider for a location + year, considering
 * what API keys are available and what data sources cover the target period.
 *
 * Returns ranked list of candidates with confidence scores.
 */
function rankProviders(year) {
  const candidates = [];

  // NOAA: any year, but requires key
  if (getNOAAKey()) {
    candidates.push({ provider: PROVIDERS.noaa, priority: year < 1940 ? 100 : 30 });
  }

  // Visual Crossing: 1970+, requires key
  if (getVCKey() && year >= 1970) {
    candidates.push({ provider: PROVIDERS.visualcrossing, priority: 90 });
  }

  // Open-Meteo: 1940+, free
  if (year >= 1940) {
    candidates.push({ provider: PROVIDERS.openmeteo, priority: 50 });
  }

  // Mock: always available as last resort
  candidates.push({ provider: PROVIDERS.mock, priority: 1 });

  // Sort by priority descending
  candidates.sort((a, b) => b.priority - a.priority);

  return candidates;
}

// ---------------------------------------------------------------------------
// Main agent function
// ---------------------------------------------------------------------------

/**
 * Research weather data availability for a Place×Time.
 *
 * @param {Object} params
 * @param {string} params.location - Location string (e.g., "New York, NY")
 * @param {number} params.year - Target year
 * @param {Object} [params.geo] - Pre-resolved geocode result { lat, lon, timezone, ... }
 * @param {boolean} [params.probeStation=true] - Whether to query NOAA for station info (requires network)
 * @returns {Promise<Object>} Environment Profile weather layer { data, confidence, sources, knownCompromises }
 */
export async function researchWeather({ location, year, geo: preGeo, probeStation = true }) {
  // Step 1: Geocode
  const geo = preGeo || await geocode(location);

  // Step 2: Rank available providers
  const candidates = rankProviders(year);
  const primary = candidates[0];
  const fallback = candidates.length > 1 ? candidates[1] : null;

  // Step 3: Research station (NOAA)
  let station = null;
  if (primary.provider.id === 'noaa' && probeStation) {
    station = await researchNOAAStation(geo.lat, geo.lon, year);
  }

  // If NOAA was selected but station lookup failed, fall through to next candidate
  let selected = primary;
  if (primary.provider.id === 'noaa' && !station && probeStation) {
    if (fallback && fallback.provider.id !== 'mock') {
      selected = fallback;
    }
    // else stick with NOAA (station probe might be disabled or will be retried at runtime)
  }

  const provider = selected.provider;

  // Step 4: Calculate confidence
  const confidence = calculateConfidence(provider, year, station);

  // Step 5: Build data
  const data = {
    provider: provider.id,
    dataType: provider.dataType,
    resolution: provider.resolution,
    interpolation: provider.interpolation,
    dateRange: [`${year}-01-01`, `${year}-12-31`],
    fallbackProvider: fallback ? fallback.provider.id : null,
    providerConfig: {
      provider: provider.id
    }
  };

  if (provider.requiresKey) {
    data.providerConfig.token = `env:${provider.envVar}`;
  }

  if (station) {
    data.stationId = station.id;
    data.stationName = station.name;
    data.stationDistance = station.distanceLabel;
    data.stationCovers = station.coversYear ? 'full_year' : station.partialCoverage ? 'partial' : 'none';
  }

  // Step 6: Build sources
  const sources = [
    createSource(
      `${provider.id}_${station ? station.id : 'api'}`,
      provider.id === 'noaa' ? 'weather_station' : 'online_database',
      station ? `${provider.name} — ${station.name}` : provider.name,
      {
        url: station
          ? `https://www.ncdc.noaa.gov/cdo-web/datasets/GHCND/stations/GHCND:${station.id}`
          : provider.url,
        citation: provider.citation
      }
    )
  ];

  // Step 7: Build compromises
  const knownCompromises = buildCompromises(provider, year, station);

  // Step 8: Build availability report (metadata for the assembler)
  data._availabilityReport = {
    candidatesEvaluated: candidates.length,
    selectedProvider: provider.id,
    selectedReason: buildSelectionReason(provider, year, station, candidates),
    alternativeProviders: candidates
      .filter(c => c.provider.id !== provider.id)
      .map(c => ({
        provider: c.provider.id,
        available: c.provider.id !== 'mock',
        confidence: calculateConfidence(c.provider, year, null)
      })),
    apiKeysPresent: {
      noaa: !!getNOAAKey(),
      visualcrossing: !!getVCKey()
    }
  };

  return createLayer(data, confidence, sources, knownCompromises);
}

/**
 * Build a human-readable reason for the provider selection.
 */
function buildSelectionReason(provider, year, station, candidates) {
  if (provider.id === 'noaa') {
    if (year < 1940) {
      return `Pre-1940 date (${year}) — NOAA GHCN-Daily is the only source with real observations`;
    }
    return `NOAA selected — station ${station?.id} covers ${year}`;
  }
  if (provider.id === 'visualcrossing') {
    return `Visual Crossing selected — hourly data available for ${year}, API key present`;
  }
  if (provider.id === 'openmeteo') {
    const noKey = !getVCKey() ? ' (no VISUALCROSSING_API_KEY)' : '';
    return `Open-Meteo selected — free hourly data for ${year}${noKey}`;
  }
  if (provider.id === 'mock') {
    return `Mock provider — no real weather data source available for ${year}`;
  }
  return 'Unknown selection reason';
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { PROVIDERS, rankProviders, calculateConfidence, buildCompromises, researchNOAAStation };
