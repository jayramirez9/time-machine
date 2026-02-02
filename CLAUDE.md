# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Weather Engine is a weather state generator for environmental simulation systems. By default, it fetches real weather data from the Open-Meteo API, with historical data available back to 1940. A mock provider is also available for offline use, testing, or deterministic simulation environments.

## Commands

Run the CLI directly (no build step required):
```bash
./cli.js                                    # Interactive mode
./cli.js -l "New York, NY" -d "06-15-2024"  # Direct mode with flags
./cli.js -l "London, UK" -d "01-01-1950"    # Historical data (back to 1940)
./cli.js -l "Paris, France" --mock          # Use mock provider (offline)
```

No tests are currently configured.

## Architecture

This is a Node.js ES modules project with three main files:

- **cli.js** - Command-line interface with three input modes: interactive TTY, piped stdin, and direct flags. Supports `--mock` flag for offline use.
- **lib/index.js** - Library entry point; exports `getWeather()` (Open-Meteo), `getMockWeather()`, and `createWeatherEngine()` factory
- **lib/openmeteo.js** - Open-Meteo API provider with geocoding, forecast (last 92 days + 16 days ahead), and historical archive (1940+)
- **lib/weather.js** - Mock weather provider that generates deterministic weather state based on time of day and season

The `createWeatherEngine()` factory accepts a custom `weatherProvider` function or `useMock: true` for the mock implementation.
