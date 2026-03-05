#!/usr/bin/env node
/**
 * fetch-imagery.js — Download satellite imagery for terrain overlay
 *
 * Fetches aerial/satellite imagery from USGS NAIP (1m resolution, US coverage,
 * public domain) for a given location bounding box. The imagery matches the
 * extent of a previously fetched DEM for seamless Landscape draping.
 *
 * Requires: A terrain-data directory with metadata.json (from fetch-dem.js),
 * or explicit lat/lon + radius.
 *
 * Usage:
 *   node tools/fetch-imagery.js terrain-data/baton-rouge-la/
 *   node tools/fetch-imagery.js "Manhattan, NY" --radius 500
 *   node tools/fetch-imagery.js --lat 40.71 --lon -74.00 --radius 1000
 *   node tools/fetch-imagery.js terrain-data/manhattan-ny/ --source naip
 *   node tools/fetch-imagery.js terrain-data/manhattan-ny/ --dry-run
 */

import fs from 'fs';
import path from 'path';
import { geocode } from '../lib/openmeteo.js';
import { computeBoundingBox, slugify } from '../lib/demFetcher.js';

// ─── Argument parsing ────────────────────────────────────────────

const args = process.argv.slice(2);

function getFlag(name, defaultValue) {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultValue;
  return args[idx + 1];
}

const hasFlag = (name) => args.includes(name);

const RADIUS = parseInt(getFlag('--radius', '500'));
const SOURCE = getFlag('--source', 'naip');
const SIZE = parseInt(getFlag('--size', '2048'));
const DRY_RUN = hasFlag('--dry-run');
const directLat = getFlag('--lat', null);
const directLon = getFlag('--lon', null);

// First positional arg: terrain-data directory or location string
const positionalArg = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));

if (!positionalArg && !directLat) {
  console.error('Usage: node tools/fetch-imagery.js <terrain-data-dir/> [options]');
  console.error('       node tools/fetch-imagery.js "Location Name" [options]');
  console.error('       node tools/fetch-imagery.js --lat 40.71 --lon -74.00 [options]');
  console.error('');
  console.error('Options:');
  console.error('  --radius N     Radius in meters (default: 500, ignored if terrain dir has metadata)');
  console.error('  --source naip  Imagery source: naip (default)');
  console.error('  --size N       Output image size in pixels (default: 2048)');
  console.error('  --dry-run      Show what would be fetched without downloading');
  process.exit(1);
}

// ─── Imagery sources ─────────────────────────────────────────────

/**
 * Fetch imagery from USGS NAIP (National Agriculture Imagery Program)
 * 1m resolution, US coverage, public domain
 */
async function fetchNAIP(bbox, widthPx, heightPx) {
  const url = `https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage?`
    + `bbox=${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`
    + `&bboxSR=4326`
    + `&imageSR=4326`
    + `&size=${widthPx},${heightPx}`
    + `&format=png`
    + `&interpolation=RSP_BilinearInterpolation`
    + `&f=image`;

  console.log(`  Fetching NAIP imagery: ${widthPx}x${heightPx}px`);

  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) {
    throw new Error(`USGS NAIP returned ${res.status}: ${res.statusText}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('json') || contentType.includes('html')) {
    const text = await res.text();
    throw new Error(`USGS NAIP returned error: ${text.slice(0, 200)}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 1000) {
    throw new Error(`Imagery response too small (${buffer.length} bytes) — may be an error or no coverage`);
  }

  return buffer;
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(' Satellite Imagery Fetcher');
  console.log('═══════════════════════════════════════════════\n');

  let lat, lon, radiusMeters, name, outputDir, bbox;

  // Check if positional arg is a terrain-data directory (has metadata.json)
  const metadataPath = positionalArg ? path.join(positionalArg, 'metadata.json') : null;

  if (metadataPath && fs.existsSync(metadataPath)) {
    // Read from existing terrain data
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    lat = metadata.lat;
    lon = metadata.lon;
    radiusMeters = metadata.radiusMeters || RADIUS;
    name = metadata.name || 'Unknown';
    outputDir = positionalArg;
    bbox = metadata.bbox || computeBoundingBox(lat, lon, radiusMeters);
    console.log(`  Using terrain metadata: ${metadataPath}`);
    console.log(`  Location:  ${name}`);
    console.log(`  Coords:    ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
    console.log(`  Radius:    ${radiusMeters}m`);
  } else if (directLat && directLon) {
    lat = parseFloat(directLat);
    lon = parseFloat(directLon);
    radiusMeters = RADIUS;
    name = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    const slug = `${lat.toFixed(2)}_${lon.toFixed(2)}`;
    outputDir = path.join('terrain-data', slug);
    bbox = computeBoundingBox(lat, lon, radiusMeters);
    console.log(`  Coordinates: ${lat}, ${lon}`);
    console.log(`  Radius:    ${radiusMeters}m`);
  } else {
    // Treat positional arg as location string
    console.log(`  Geocoding: "${positionalArg}"`);
    try {
      const geo = await geocode(positionalArg);
      lat = geo.lat;
      lon = geo.lon;
      name = geo.name;
      radiusMeters = RADIUS;
      const slug = slugify(positionalArg);
      outputDir = path.join('terrain-data', slug);
      bbox = computeBoundingBox(lat, lon, radiusMeters);
      console.log(`  Resolved: ${name}`);
      console.log(`  Coords:   ${lat}, ${lon}`);
    } catch (e) {
      console.error(`  Geocode failed: ${e.message}`);
      process.exit(1);
    }
  }

  console.log(`  BBox:      ${bbox.minLon.toFixed(6)}, ${bbox.minLat.toFixed(6)} → ${bbox.maxLon.toFixed(6)}, ${bbox.maxLat.toFixed(6)}`);
  console.log(`  Source:    ${SOURCE.toUpperCase()}`);
  console.log(`  Size:      ${SIZE}x${SIZE}px`);
  console.log(`  Output:    ${outputDir}/imagery.png`);

  if (DRY_RUN) {
    console.log('\n  [DRY RUN] Would fetch imagery.');
    console.log('═══════════════════════════════════════════════');
    return;
  }

  // Ensure output directory
  fs.mkdirSync(outputDir, { recursive: true });

  // Fetch imagery
  console.log(`\n  Downloading ${SOURCE.toUpperCase()} imagery...`);
  let buffer;

  if (SOURCE === 'naip') {
    buffer = await fetchNAIP(bbox, SIZE, SIZE);
  } else {
    throw new Error(`Unknown imagery source: ${SOURCE}. Supported: naip`);
  }

  const imageryPath = path.join(outputDir, 'imagery.png');
  fs.writeFileSync(imageryPath, buffer);

  console.log(`  Saved: ${imageryPath} (${(buffer.length / 1024).toFixed(0)} KB)`);

  // Update metadata if it exists
  const existingMetadataPath = path.join(outputDir, 'metadata.json');
  if (fs.existsSync(existingMetadataPath)) {
    const metadata = JSON.parse(fs.readFileSync(existingMetadataPath, 'utf8'));
    metadata.imagery = {
      path: imageryPath,
      source: SOURCE.toUpperCase(),
      dimensions: { w: SIZE, h: SIZE },
      fetchedAt: new Date().toISOString()
    };
    fs.writeFileSync(existingMetadataPath, JSON.stringify(metadata, null, 2));
    console.log('  Updated metadata.json with imagery info');
  }

  console.log('\n  ─── Summary ───────────────────────────────');
  console.log(`  Location:  ${name}`);
  console.log(`  Imagery:   ${imageryPath}`);
  console.log(`  Size:      ${SIZE}x${SIZE}px`);
  console.log(`  Source:    USGS NAIP (public domain, ~1m resolution)`);
  console.log(`\n  Import into Unreal:`);
  console.log(`    node tools/import-terrain.js ${outputDir}/`);
  console.log('═══════════════════════════════════════════════');
}

main().catch(e => { console.error(`\n  Error: ${e.message}`); process.exit(1); });
