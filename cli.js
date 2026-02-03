#!/usr/bin/env node

/**
 * Weather Engine CLI
 * Interactive mode or with flags: weather-engine --location "New York, NY" --date "2024-06-15T14:00:00"
 */

import readline from 'readline';
import { getWeather, getMockWeather } from './lib/index.js';
import { getWeatherTimeline } from './lib/weatherTimeline.js';
import { compileWorldState } from './lib/worldStateCompiler.js';
import { LOCALES, DEFAULT_LOCALE } from './lib/localePresets.js';

function parseArgs(args) {
  const parsed = {
    location: null,
    date: null,
    help: false,
    mock: false,
    mode: 'raw',
    locale: DEFAULT_LOCALE
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
Weather Engine - Environmental simulation weather state generator

Usage:
  weather-engine                              Interactive mode
  weather-engine --location <loc> --date <d>  Direct mode

Options:
  -l, --location  Location string (e.g., "New York, NY")
  -d, --date      Date in MM-DD-YYYY format (e.g., "06-15-2024")
                  Defaults to current date/time if not specified
  -m, --mock      Use mock weather provider (offline/testing)
  -h, --help      Show this help message

Data Sources:
  By default, uses Open-Meteo API for real weather data.
  Historical data available from 1940 to present.
  Use --mock for deterministic offline data.

Examples:
  weather-engine
  weather-engine -l "London, UK" -d "12-25-2024"
  weather-engine -l "Tokyo, Japan" -d "01-01-1950"  # Historical data
  weather-engine -l "Paris, France" --mock          # Mock data
`);
}

/**
 * Parse date string into Date object
 *
 * INTENDED BEHAVIOR: User input time represents local time at the target location.
 * When a user asks for "July 4, 1978 at 3pm in Baton Rouge", they mean 3pm Central
 * Time, not 3pm UTC or 3pm in the server's timezone.
 *
 * TODO: TIMEZONE CORRECTNESS
 * Currently, dates are interpreted in the machine's local timezone, not the
 * target location's timezone. This means "07-04-1978" for Baton Rouge will be
 * 3pm in whatever timezone the server runs in (e.g., UTC on cloud), not 3pm
 * Central Time.
 *
 * Proper fix requires:
 * 1. Geocode first to get location's timezone (Open-Meteo returns this)
 * 2. Interpret user's date/time as being in that timezone
 * 3. Convert to UTC for API calls
 *
 * For now, this works correctly only when the machine's timezone matches the
 * target location's timezone.
 */
function parseDate(dateStr) {
  if (!dateStr) return new Date();

  // Try MM-DD-YYYY format first (defaults to 3pm when no time provided)
  // WARNING: 15:00 is in machine-local time, not target location time
  const mmddyyyyMatch = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (mmddyyyyMatch) {
    const [, month, day, year] = mmddyyyyMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 15, 0, 0);
  }

  // Fall back to standard Date parsing
  // WARNING: ISO strings without Z or offset are parsed as local time
  return new Date(dateStr);
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

  const date = parseDate(dateInput.trim() || null);

  if (isNaN(date.getTime())) {
    console.error('Error: Invalid date format');
    process.exit(1);
  }

  return { location: location.trim(), date };
}

async function interactiveModePiped() {
  const lines = await readPipedInput();

  const location = lines[0]?.trim();
  const dateInput = lines[1]?.trim();

  if (!location) {
    console.error('Error: Location is required');
    process.exit(1);
  }

  const date = parseDate(dateInput || null);

  if (isNaN(date.getTime())) {
    console.error('Error: Invalid date format');
    process.exit(1);
  }

  return { location, date };
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

async function outputWeather(location, date, useMock = false, mode = 'raw', locale = DEFAULT_LOCALE) {
  if (mode === 'timeline') {
    const timeline = await getWeatherTimeline({
      location,
      centerDate: date,
      windowHours: 6,
      intervalMinutes: 15,
      useMock
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
      useMock
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

  const weatherFn = useMock ? getMockWeather : getWeather;
  const weather = await weatherFn({ location, date });
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

  let location, date;

  try {
    if (args.location) {
      // Direct mode with flags
      location = args.location;
      date = parseDate(args.date);

      if (isNaN(date.getTime())) {
        console.error('Error: Invalid date format');
        console.error('Use MM-DD-YYYY format, e.g., "06-15-2024"');
        process.exit(1);
      }
      await outputWeather(location, date, args.mock, args.mode, args.locale);
    } else if (process.stdin.isTTY) {
      // Interactive TTY mode
      const input = await interactiveModeTTY();
      await outputWeather(input.location, input.date, args.mock, args.mode, args.locale);
    } else {
      // Piped input mode
      const input = await interactiveModePiped();
      await outputWeather(input.location, input.date, args.mock, args.mode, args.locale);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
