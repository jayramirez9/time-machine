#!/usr/bin/env node
/**
 * set-location.js — Teleport the Cesium scene to any location
 *
 * Geocodes a location string and sets the CesiumGeoreference actor's
 * OriginLatitude, OriginLongitude, and OriginHeight via Unreal's
 * Remote Control API.
 *
 * Usage:
 *   node tools/set-location.js "Manhattan, NY"
 *   node tools/set-location.js "Grand Canyon, AZ" --height 1500
 *   node tools/set-location.js "Baton Rouge, LA" --host http://localhost:30010
 *   node tools/set-location.js --lat 40.7128 --lon -74.0060   # Direct coordinates
 */

import { geocode } from '../lib/openmeteo.js';
import { setGeoreference } from '../lib/cesiumGeoreference.js';

// ─── Argument parsing ────────────────────────────────────────────

const args = process.argv.slice(2);

function getFlag(name, defaultValue) {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultValue;
  return args[idx + 1];
}

const HOST = getFlag('--host', 'http://localhost:30010');
const HEIGHT = parseFloat(getFlag('--height', '0'));
const directLat = getFlag('--lat', null);
const directLon = getFlag('--lon', null);

// Location is the first positional arg (not a flag)
const locationArg = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));

if (!locationArg && !directLat) {
  console.error('Usage: node tools/set-location.js "Location Name" [--height N] [--host URL]');
  console.error('       node tools/set-location.js --lat 40.71 --lon -74.00 [--height N]');
  process.exit(1);
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(' Cesium Location Setter');
  console.log(`  Host: ${HOST}`);
  console.log('═══════════════════════════════════════════════\n');

  // Get coordinates
  let lat, lon, name;

  if (directLat && directLon) {
    lat = parseFloat(directLat);
    lon = parseFloat(directLon);
    name = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    console.log(`  Coordinates: ${lat}, ${lon}`);
  } else {
    console.log(`  Geocoding: "${locationArg}"`);
    try {
      const geo = await geocode(locationArg);
      lat = geo.lat;
      lon = geo.lon;
      name = geo.name;
      console.log(`  Resolved: ${name}`);
      console.log(`  Coordinates: ${lat}, ${lon}`);
      console.log(`  Timezone: ${geo.timezone}\n`);
    } catch (e) {
      console.error(`  Geocode failed: ${e.message}`);
      process.exit(1);
    }
  }

  // Set georeference
  console.log('  Setting CesiumGeoreference origin...');
  const result = await setGeoreference(HOST, lat, lon, HEIGHT);

  if (result.ok) {
    console.log(`    OriginLatitude:  ${lat}`);
    console.log(`    OriginLongitude: ${lon}`);
    console.log(`    OriginHeight:    ${HEIGHT}m`);
    console.log(`    Actor: ${result.objectPath}`);
    console.log(`\n  Cesium scene teleported to ${name}`);
  } else {
    console.error(`  Failed: ${result.error}`);
    process.exit(1);
  }

  console.log('\n═══════════════════════════════════════════════');
}

main().catch(e => { console.error(e); process.exit(1); });
