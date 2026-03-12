#!/usr/bin/env node
/**
 * generate-profile.js — Procedural audio profile generator
 *
 * Geocodes a location, generates a v2 audio profile with era-appropriate
 * micro-events, and writes it to audio-profiles/{id}.json.
 * All sources have url: null — run elevenlabs-fetch.js to fill them in.
 *
 * Usage:
 *   ./tools/generate-profile.js "Hollywood, CA" --year 1953
 *   ./tools/generate-profile.js "Reykjavik, Iceland" --year 1920 --dry-run
 *   ./tools/generate-profile.js "Paris, France" --year 1890
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { geocode } from '../lib/openmeteo.js';
import { generateProfile, classifyClimate, classifyDensity, getEraBracket } from '../lib/profileGenerator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ── Argument parsing ────────────────────────────────────────────

const args = process.argv.slice(2);

function getFlag(name, defaultVal = null) {
  const idx = args.indexOf(name);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return defaultVal;
}

function hasFlag(name) {
  return args.includes(name);
}

const location = args.find(a => !a.startsWith('--'));
const year = parseInt(getFlag('--year', new Date().getFullYear()));
const dryRun = hasFlag('--dry-run');

if (!location) {
  console.error('Usage: ./tools/generate-profile.js "Location" [--year YYYY] [--dry-run]');
  console.error('');
  console.error('Examples:');
  console.error('  ./tools/generate-profile.js "Hollywood, CA" --year 1953');
  console.error('  ./tools/generate-profile.js "Reykjavik, Iceland" --year 1920 --dry-run');
  console.error('  ./tools/generate-profile.js "Paris, France" --year 1890');
  process.exit(1);
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  console.log(`Geocoding "${location}"...`);
  const geo = await geocode(location);
  console.log(`  → ${geo.name} (${geo.lat.toFixed(4)}, ${geo.lon.toFixed(4)})`);
  console.log(`  → Population: ${geo.population ? geo.population.toLocaleString() : 'unknown'}`);
  console.log(`  → Country: ${geo.countryCode || 'unknown'}`);

  const climate = classifyClimate(geo.lat);
  const density = classifyDensity(geo.population || 0);
  const eraBracket = getEraBracket(year);

  console.log(`\nClassification:`);
  console.log(`  Climate: ${climate.zone} (${climate.hemisphere})`);
  console.log(`  Density: ${density}`);
  console.log(`  Era: ${eraBracket}`);

  const profile = generateProfile({
    location: geo.name,
    year,
    population: geo.population || 0,
    countryCode: geo.countryCode,
    lat: geo.lat,
    lon: geo.lon,
  });

  const eventCount = profile.microEvents.length;
  const nullSources = countNullSources(profile);

  console.log(`\nProfile: ${profile.id}`);
  console.log(`  Name: ${profile.name}`);
  console.log(`  Events: ${eventCount} micro-events`);
  console.log(`  Sources: ${nullSources} total (all url: null — run elevenlabs-fetch.js to generate)`);
  console.log(`  Events: ${profile.microEvents.map(e => e.id).join(', ')}`);

  if (dryRun) {
    console.log('\n[DRY RUN] Profile not written.');
    return;
  }

  const outPath = path.join(PROJECT_ROOT, 'audio-profiles', `${profile.id}.json`);
  fs.writeFileSync(outPath, JSON.stringify(profile, null, 2) + '\n');
  console.log(`\nWritten: ${outPath}`);
  console.log(`\nNext: ELEVENLABS_API_KEY=xxx ./tools/elevenlabs-fetch.js ${outPath} --dry-run`);
}

function countNullSources(profile) {
  let count = 0;
  // Beds
  count += profile.beds.base.sources.length;
  for (const dir of Object.values(profile.beds.directional)) {
    count += dir.sources.length;
  }
  // Weather
  for (const group of Object.values(profile.weather)) {
    if (group.sources) count += group.sources.length;
  }
  // Micro-events
  for (const event of profile.microEvents) {
    count += event.sources.length;
  }
  return count;
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
