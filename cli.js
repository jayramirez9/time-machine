#!/usr/bin/env node

/**
 * Weather Engine CLI
 * Interactive mode or with flags: weather-engine --location "New York, NY" --date "2024-06-15T14:00:00"
 */

import readline from 'readline';
import { getWeatherTimeline, selectProvider } from './lib/weatherTimeline.js';
import { compileWorldState } from './lib/worldStateCompiler.js';
import { LOCALES, DEFAULT_LOCALE } from './lib/localePresets.js';
import { geocode } from './lib/openmeteo.js';
import { localToUtc } from './lib/timezone.js';

function parseArgs(args) {
  const parsed = {
    location: null,
    date: null,
    help: false,
    mock: false,
    mode: 'raw',
    locale: DEFAULT_LOCALE,
    provider: 'auto'
  };

  const errors = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--location' || arg === '-l') {
      const value = args[++i];
      if (!value || value.startsWith('-')) {
        errors.push('--location requires a value (e.g., --location "New York, NY")');
        i--; // back up if we consumed a flag
      } else {
        parsed.location = value;
      }
    } else if (arg === '--date' || arg === '-d') {
      const value = args[++i];
      if (!value || value.startsWith('-')) {
        errors.push('--date requires a value (e.g., --date "07-04-1978")');
        i--;
      } else {
        parsed.date = value;
      }
    } else if (arg === '--mock' || arg === '-m') {
      parsed.mock = true;
    } else if (arg === '--provider') {
      const value = args[++i];
      if (!value || value.startsWith('-')) {
        errors.push('--provider requires a value: auto, visualcrossing, or openmeteo');
        i--;
      } else if (!['auto', 'visualcrossing', 'openmeteo'].includes(value)) {
        errors.push(`Invalid provider "${value}". Must be: auto, visualcrossing, or openmeteo`);
      } else {
        parsed.provider = value;
      }
    } else if (arg === '--mode') {
      const value = args[++i];
      if (!value || value.startsWith('-')) {
        errors.push('--mode requires a value: raw, timeline, or world');
        i--;
      } else if (!['raw', 'timeline', 'world'].includes(value)) {
        errors.push(`Invalid mode "${value}". Must be: raw, timeline, or world`);
      } else {
        parsed.mode = value;
      }
    } else if (arg === '--locale') {
      const value = args[++i];
      if (!value || value.startsWith('-')) {
        errors.push(`--locale requires a value. Available: ${Object.keys(LOCALES).join(', ')}`);
        i--;
      } else if (!LOCALES[value]) {
        errors.push(`Unknown locale "${value}". Available: ${Object.keys(LOCALES).join(', ')}`);
      } else {
        parsed.locale = value;
      }
    }
  }

  parsed.errors = errors;
  return parsed;
}

function printHelp() {
  console.log(`
Time Machine CLI - Weather state generator for environmental simulation

Usage:
  ./cli.js                                    Interactive mode
  ./cli.js -l <location> -d <date>            Direct mode

Options:
  -l, --location   Location string (e.g., "New York, NY")
  -d, --date       Date in MM-DD-YYYY format (e.g., "07-04-1978")
                   Defaults to current date/time if not specified
  --mode           Output mode: raw, timeline, or world (default: raw)
  --locale         Locale preset for environment tuning (default: baton_rouge_suburb)
  --provider       Weather provider: auto, visualcrossing, or openmeteo (default: auto)
  -m, --mock       Use mock weather provider (offline/testing)
  -h, --help       Show this help message

Weather Providers:
  auto (default)   Visual Crossing if VISUALCROSSING_API_KEY is set, else Open-Meteo
  visualcrossing   Paid API, hourly data back to ~1970 (requires API key)
  openmeteo        Free API, historical data from 1940 to present

Examples:
  ./cli.js -l "Baton Rouge, LA" -d "07-04-1978"               # Raw weather
  ./cli.js -l "Baton Rouge, LA" -d "07-04-1978" --mode world   # World state for renderers
  ./cli.js -l "New York, NY" -d "01-01-1950" --mode timeline   # 6-hour timeline
  ./cli.js -l "Paris, France" --mock                           # Mock data (offline)
`);
}

/**
 * Parse date string into raw components for timezone-aware Date construction.
 * Does NOT create a Date — the caller must geocode first to get the timezone,
 * then use localToUtc() to create the correct UTC Date.
 *
 * @param {string|null} dateStr - Date string in MM-DD-YYYY format, or null for "now"
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number } | null}
 *   null means "use current time"
 */
function parseDateComponents(dateStr) {
  if (!dateStr) return null; // "now"

  // MM-DD-YYYY format → default to 3pm local at target location
  const mmddyyyyMatch = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (mmddyyyyMatch) {
    const [, month, day, year] = mmddyyyyMatch;
    return { year: parseInt(year), month: parseInt(month), day: parseInt(day), hour: 15, minute: 0 };
  }

  // Try ISO-like string
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() };
  }

  return null;
}

/**
 * Resolve date components + timezone into a UTC Date.
 * If components are null, returns "now".
 */
function resolveDate(components, timezone) {
  if (!components) return new Date();
  return localToUtc(components.year, components.month, components.day, components.hour, components.minute, timezone);
}

function formatWeather(weather) {
  // Defensive defaults for potentially missing fields
  const wind = weather.wind || {};
  const windDirection = wind.direction ?? 0;
  const windSpeed = wind.speed ?? 0;
  const windUnit = wind.unit || 'km/h';

  const temp = weather.temperature || {};
  const tempF = temp.fahrenheit ?? '--';
  const tempC = temp.celsius ?? '--';

  const clouds = weather.clouds || {};
  const cloudCoverage = clouds.coverage ?? '--';

  const precip = weather.precipitation || {};
  const precipLikelihood = precip.likelihood ?? '--';

  const solar = weather.solar || {};
  const isDaytime = solar.isDaytime ?? true;

  const windDirections = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const windDir = windDirections[Math.round(windDirection / 22.5) % 16];

  const date = new Date(weather.timestampUtc || weather.timestamp || Date.now());
  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const formattedTime = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  });

  return `
Weather for ${weather.location || 'Unknown Location'}
${formattedDate} at ${formattedTime}

Temperature:  ${tempF}°F (${tempC}°C)
Humidity:     ${weather.humidity ?? '--'}%
Wind:         ${windSpeed} ${windUnit} ${windDir}
Cloud Cover:  ${cloudCoverage}%
Visibility:   ${weather.visibility ?? '--'} km
UV Index:     ${weather.uvIndex ?? '--'}
Pressure:     ${weather.pressure ?? '--'} hPa
Precipitation: ${precipLikelihood}% likelihood
${isDaytime ? '☀️  Daytime' : '🌙 Nighttime'}
`.trim();
}

function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function readPipedInput() {
  const lines = [];
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    lines.push(line);
  }

  return lines;
}

async function interactiveModeTTY() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('Weather Engine - Environmental Simulation\n');

  const location = await prompt(rl, 'Location (e.g., "New York, NY"): ');

  if (!location.trim()) {
    console.error('Error: Location is required');
    rl.close();
    process.exit(1);
  }

  const dateInput = await prompt(rl, 'Date (MM-DD-YYYY, or press Enter for today): ');

  rl.close();

  return { location: location.trim(), dateComponents: parseDateComponents(dateInput.trim() || null) };
}

async function interactiveModePiped() {
  const lines = await readPipedInput();

  const location = lines[0]?.trim();
  const dateInput = lines[1]?.trim();

  if (!location) {
    console.error('Error: Location is required');
    process.exit(1);
  }

  return { location, dateComponents: parseDateComponents(dateInput || null) };
}

function formatTimeline(timeline) {
  if (!timeline || timeline.length === 0) {
    return 'No timeline data available';
  }

  const firstLocation = timeline[0]?.location || 'Unknown Location';
  const lines = [`Weather Timeline for ${firstLocation}\n`];

  for (const weather of timeline) {
    const date = new Date(weather.timestampUtc || weather.timestamp || Date.now());
    const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    const tempF = weather.temperature?.fahrenheit ?? '--';
    const cloudCov = weather.clouds?.coverage ?? '--';
    const windSpd = weather.wind?.speed ?? '--';

    const temp = `${tempF}°F`;
    const clouds = `${cloudCov}%`;
    const wind = `${windSpd} km/h`;

    lines.push(`${time.padStart(8)}  ${temp.padStart(6)}  clouds ${clouds.padStart(4)}  wind ${wind.padStart(6)}`);
  }

  return lines.join('\n');
}

async function outputWeather(location, dateComponents, useMock = false, mode = 'raw', locale = DEFAULT_LOCALE, provider = 'auto') {
  // Geocode first to get timezone (skip for mock — use machine-local)
  let geo = null;
  let timezone = null;
  if (!useMock) {
    geo = await geocode(location);
    timezone = geo.timezone;
  }

  // Resolve date using location's timezone
  const date = resolveDate(dateComponents, timezone);

  if (mode === 'timeline') {
    const timeline = await getWeatherTimeline({
      location,
      centerDate: date,
      windowHours: 6,
      intervalMinutes: 15,
      useMock,
      geo,
      provider
    });
    console.log(formatTimeline(timeline));
    return;
  }

  if (mode === 'world') {
    const timeline = await getWeatherTimeline({
      location,
      centerDate: date,
      windowHours: 6,
      intervalMinutes: 15,
      useMock,
      geo,
      provider
    });
    const localePreset = LOCALES[locale] || LOCALES[DEFAULT_LOCALE];
    const worldState = compileWorldState({
      timeline,
      locale: localePreset,
      now: date
    });
    console.log(JSON.stringify(worldState, null, 2));
    return;
  }

  const { fn: weatherFn } = selectProvider(provider, useMock);
  const weather = await weatherFn({ location, date, geo });
  console.log(formatWeather(weather));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Check for argument parsing errors
  if (args.errors && args.errors.length > 0) {
    for (const err of args.errors) {
      console.error(`Error: ${err}`);
    }
    console.error('\nUse --help for usage information.');
    process.exit(1);
  }

  let location, dateComponents;

  try {
    if (args.location) {
      // Direct mode with flags
      location = args.location;
      dateComponents = parseDateComponents(args.date);
      await outputWeather(location, dateComponents, args.mock, args.mode, args.locale, args.provider);
    } else if (process.stdin.isTTY) {
      // Interactive TTY mode
      const input = await interactiveModeTTY();
      await outputWeather(input.location, input.dateComponents, args.mock, args.mode, args.locale);
    } else {
      // Piped input mode
      const input = await interactiveModePiped();
      await outputWeather(input.location, input.dateComponents, args.mock, args.mode, args.locale);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
