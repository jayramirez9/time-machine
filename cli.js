#!/usr/bin/env node

/**
 * Weather Engine CLI
 * Interactive mode or with flags: weather-engine --location "New York, NY" --date "2024-06-15T14:00:00"
 */

import readline from 'readline';
import { getWeather, getMockWeather } from './lib/index.js';

function parseArgs(args) {
  const parsed = {
    location: null,
    date: null,
    help: false,
    mock: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--location' || arg === '-l') {
      parsed.location = args[++i];
    } else if (arg === '--date' || arg === '-d') {
      parsed.date = args[++i];
    } else if (arg === '--mock' || arg === '-m') {
      parsed.mock = true;
    }
  }

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

function parseDate(dateStr) {
  if (!dateStr) return new Date();

  // Try MM-DD-YYYY format first (defaults to 3pm when no time provided)
  const mmddyyyyMatch = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (mmddyyyyMatch) {
    const [, month, day, year] = mmddyyyyMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 15, 0, 0);
  }

  // Fall back to standard Date parsing
  return new Date(dateStr);
}

function formatWeather(weather) {
  const windDirections = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const windDir = windDirections[Math.round(weather.wind.direction / 22.5) % 16];

  const date = new Date(weather.timestamp);
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
Weather for ${weather.location}
${formattedDate} at ${formattedTime}

Temperature:  ${weather.temperature.fahrenheit}°F (${weather.temperature.celsius}°C)
Humidity:     ${weather.humidity}%
Wind:         ${weather.wind.speed} ${weather.wind.unit} ${windDir}
Cloud Cover:  ${weather.clouds.coverage}%
Visibility:   ${weather.visibility} km
UV Index:     ${weather.uvIndex}
Pressure:     ${weather.pressure} hPa
Precipitation:${weather.precipitation.probability}% chance
${weather.solar.isDaytime ? '☀️  Daytime' : '🌙 Nighttime'}
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

async function outputWeather(location, date, useMock = false) {
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
      await outputWeather(location, date, args.mock);
    } else if (process.stdin.isTTY) {
      // Interactive TTY mode
      const input = await interactiveModeTTY();
      await outputWeather(input.location, input.date, args.mock);
    } else {
      // Piped input mode
      const input = await interactiveModePiped();
      await outputWeather(input.location, input.date, args.mock);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
