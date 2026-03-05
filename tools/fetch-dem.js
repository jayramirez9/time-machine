#!/usr/bin/env node
/**
 * fetch-dem.js — Download USGS 3DEP elevation data and produce Unreal heightmaps
 *
 * Downloads elevation data from USGS 3DEP for a given location, processes it
 * with GDAL, and outputs an Unreal-compatible heightmap (R16 or PNG16).
 *
 * Requires: GDAL CLI tools (brew install gdal)
 *
 * Usage:
 *   node tools/fetch-dem.js "Baton Rouge, LA"
 *   node tools/fetch-dem.js "Manhattan, NY" --radius 1000
 *   node tools/fetch-dem.js --lat 40.71 --lon -74.00 --radius 500
 *   node tools/fetch-dem.js "Grand Canyon, AZ" --radius 2000 --resolution 10
 *   node tools/fetch-dem.js "Baton Rouge, LA" --dry-run
 */

import { geocode } from '../lib/openmeteo.js';
import { fetchDEM, processDEM, checkGDAL, slugify } from '../lib/demFetcher.js';
import fs from 'fs';
import path from 'path';

// ─── Argument parsing ────────────────────────────────────────────

const args = process.argv.slice(2);

function getFlag(name, defaultValue) {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultValue;
  return args[idx + 1];
}

const hasFlag = (name) => args.includes(name);

const RADIUS = parseInt(getFlag('--radius', '500'));
const RESOLUTION = parseInt(getFlag('--resolution', '1'));
const FORMAT = getFlag('--format', 'r16');
const DRY_RUN = hasFlag('--dry-run');
const directLat = getFlag('--lat', null);
const directLon = getFlag('--lon', null);

// Location is the first positional arg (not a flag)
const locationArg = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));

if (!locationArg && !directLat) {
  console.error('Usage: node tools/fetch-dem.js "Location Name" [options]');
  console.error('       node tools/fetch-dem.js --lat 40.71 --lon -74.00 [options]');
  console.error('');
  console.error('Options:');
  console.error('  --radius N      Radius in meters (default: 500)');
  console.error('  --resolution N  Target resolution in meters/pixel (default: 1)');
  console.error('  --format r16|png16  Output format (default: r16)');
  console.error('  --dry-run       Show what would be fetched without downloading');
  process.exit(1);
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(' USGS 3DEP DEM Fetcher');
  console.log('═══════════════════════════════════════════════\n');

  // Check GDAL availability
  if (!DRY_RUN) {
    const gdal = await checkGDAL();
    if (!gdal.available) {
      console.error('  GDAL not found on PATH.');
      console.error('  Install with: brew install gdal');
      console.error('  GDAL is required to process DEM data into Unreal heightmaps.');
      process.exit(1);
    }
    console.log(`  GDAL: ${gdal.version}`);
  }

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
    } catch (e) {
      console.error(`  Geocode failed: ${e.message}`);
      process.exit(1);
    }
  }

  const slug = locationArg ? slugify(locationArg) : `${lat.toFixed(2)}_${lon.toFixed(2)}`;
  const outputDir = path.join('terrain-data', slug);

  console.log(`\n  Radius: ${RADIUS}m`);
  console.log(`  Resolution: ${RESOLUTION}m/px`);
  console.log(`  Format: ${FORMAT}`);
  console.log(`  Output: ${outputDir}/`);

  if (DRY_RUN) {
    console.log('\n  [DRY RUN] Would fetch DEM and process heightmap.');
    console.log('═══════════════════════════════════════════════');
    return;
  }

  // Fetch DEM
  console.log('\n  Downloading elevation data from USGS 3DEP...');
  const { demPath, bbox, metadata } = await fetchDEM(lat, lon, RADIUS, {
    resolution: RESOLUTION,
    outputDir,
    slug
  });

  // Save initial metadata (processDEM reads it for scale calculations)
  const metadataPath = path.join(outputDir, 'metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify({
    name, lat, lon, slug,
    radiusMeters: RADIUS,
    resolution: RESOLUTION,
    bbox,
    ...metadata
  }, null, 2));

  // Process DEM into heightmap
  console.log('\n  Processing DEM into heightmap...');
  const result = await processDEM(demPath, outputDir, {
    format: FORMAT
  });

  // Update metadata with processing results
  const fullMetadata = {
    name, lat, lon, slug,
    radiusMeters: RADIUS,
    resolution: RESOLUTION,
    bbox,
    ...metadata,
    heightmap: {
      path: result.heightmapPath,
      format: FORMAT,
      dimensions: result.dimensions,
      elevation: result.elevation,
      unrealScale: result.scale
    },
    processedAt: new Date().toISOString()
  };
  fs.writeFileSync(metadataPath, JSON.stringify(fullMetadata, null, 2));

  // Print summary
  console.log('\n  ─── Summary ───────────────────────────────');
  console.log(`  Location:    ${name}`);
  console.log(`  Heightmap:   ${result.heightmapPath}`);
  console.log(`  Dimensions:  ${result.dimensions.w} x ${result.dimensions.h}`);
  console.log(`  Elevation:   ${result.elevation.min.toFixed(1)}m – ${result.elevation.max.toFixed(1)}m`);
  console.log(`  Unreal Scale:`);
  console.log(`    X/Y: ${result.scale.x.toFixed(2)}`);
  console.log(`    Z:   ${result.scale.z.toFixed(2)}`);
  console.log(`  Metadata:    ${metadataPath}`);

  console.log('\n  Import into Unreal:');
  console.log(`    1. Open Landscape Mode → Import`);
  console.log(`    2. Heightmap File: ${path.resolve(result.heightmapPath)}`);
  console.log(`    3. Set Scale X: ${result.scale.x.toFixed(2)}, Y: ${result.scale.x.toFixed(2)}, Z: ${result.scale.z.toFixed(2)}`);
  console.log(`    4. Or run: node tools/import-terrain.js ${outputDir}/`);

  console.log('\n═══════════════════════════════════════════════');
}

main().catch(e => { console.error(`\n  Error: ${e.message}`); process.exit(1); });
