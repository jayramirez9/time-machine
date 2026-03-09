#!/usr/bin/env node
/**
 * fetch-vectors.js — Download OpenStreetMap vector data (roads, water, land-use)
 *
 * Fetches vector data from the Overpass API, converts to categorized GeoJSON,
 * rasterizes water/landuse polygons to landscape masks, and extracts road
 * spline data for Unreal import.
 *
 * Usage:
 *   node tools/fetch-vectors.js terrain-data/manhattan-ny/
 *   node tools/fetch-vectors.js "Manhattan, NY" --radius 500
 *   node tools/fetch-vectors.js --lat 40.78 --lon -73.97 --radius 500
 *   node tools/fetch-vectors.js terrain-data/manhattan-ny/ --dry-run
 */

import { geocode } from '../lib/openmeteo.js';
import { computeBoundingBox, slugify } from '../lib/demFetcher.js';
import { fetchOSMData, toGeoJSON, simplifyGeoJSON, roadsToSplineData, rasterizeMask, encodePNG } from '../lib/osmVectors.js';
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
const DRY_RUN = hasFlag('--dry-run');
const MASK_SIZE = parseInt(getFlag('--mask-size', '1009'));
const directLat = getFlag('--lat', null);
const directLon = getFlag('--lon', null);

// First positional arg: either a terrain-data dir or a location string
const positionalArg = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));

if (!positionalArg && !directLat) {
  console.error('Usage: node tools/fetch-vectors.js terrain-data/<slug>/  [options]');
  console.error('       node tools/fetch-vectors.js "Location Name"       [options]');
  console.error('       node tools/fetch-vectors.js --lat 40.78 --lon -73.97 [options]');
  console.error('');
  console.error('Options:');
  console.error('  --radius N       Radius in meters (default: 500)');
  console.error('  --mask-size N    Mask dimensions in pixels (default: 1009)');
  console.error('  --dry-run        Show what would be fetched without downloading');
  process.exit(1);
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(' OSM Vector Data Fetcher');
  console.log('═══════════════════════════════════════════════\n');

  let lat, lon, name, slug, bbox, outputDir, maskDimensions;

  // Check if positional arg is an existing terrain-data directory
  const isTerrainDir = positionalArg && fs.existsSync(path.join(positionalArg, 'metadata.json'));

  if (isTerrainDir) {
    // Read from existing metadata
    const metadataPath = path.join(positionalArg, 'metadata.json');
    const meta = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    lat = meta.lat;
    lon = meta.lon;
    name = meta.name;
    slug = meta.slug;
    bbox = meta.bbox;
    outputDir = positionalArg.replace(/\/$/, '');
    maskDimensions = meta.heightmap?.dimensions?.w || MASK_SIZE;
    console.log(`  Reading from: ${metadataPath}`);
    console.log(`  Location:     ${name}`);
    console.log(`  Coordinates:  ${lat}, ${lon}`);
    console.log(`  Bbox:         ${bbox.minLat.toFixed(5)}, ${bbox.minLon.toFixed(5)} → ${bbox.maxLat.toFixed(5)}, ${bbox.maxLon.toFixed(5)}`);
  } else if (directLat && directLon) {
    lat = parseFloat(directLat);
    lon = parseFloat(directLon);
    name = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    slug = `${lat.toFixed(2)}_${lon.toFixed(2)}`;
    bbox = computeBoundingBox(lat, lon, RADIUS);
    outputDir = path.join('terrain-data', slug);
    maskDimensions = MASK_SIZE;
    console.log(`  Coordinates: ${lat}, ${lon}`);
  } else {
    console.log(`  Geocoding: "${positionalArg}"`);
    try {
      const geo = await geocode(positionalArg);
      lat = geo.lat;
      lon = geo.lon;
      name = geo.name;
      slug = slugify(positionalArg);
      bbox = computeBoundingBox(lat, lon, RADIUS);
      outputDir = path.join('terrain-data', slug);
      maskDimensions = MASK_SIZE;
      console.log(`  Resolved:    ${name}`);
      console.log(`  Coordinates: ${lat}, ${lon}`);
    } catch (e) {
      console.error(`  Geocode failed: ${e.message}`);
      process.exit(1);
    }
  }

  console.log(`  Radius:      ${RADIUS}m`);
  console.log(`  Mask size:   ${maskDimensions}x${maskDimensions}`);
  console.log(`  Output:      ${outputDir}/`);

  if (DRY_RUN) {
    console.log('\n  [DRY RUN] Would fetch OSM data and produce:');
    console.log(`    ${outputDir}/vectors.geojson`);
    console.log(`    ${outputDir}/mask-water.png`);
    console.log(`    ${outputDir}/mask-landuse.png`);
    console.log(`    ${outputDir}/roads-splines.json`);
    console.log('═══════════════════════════════════════════════');
    return;
  }

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  // Fetch OSM data
  console.log('\n  Fetching from Overpass API...');
  const overpassData = await fetchOSMData(bbox);
  const elementCount = (overpassData.elements || []).length;
  console.log(`  Received ${elementCount} elements`);

  // Convert to GeoJSON
  console.log('  Converting to GeoJSON...');
  const rawGeoJSON = toGeoJSON(overpassData);
  console.log(`  ${rawGeoJSON.features.length} features extracted`);

  // Simplify
  console.log('  Simplifying geometries...');
  const geojson = simplifyGeoJSON(rawGeoJSON);

  // Categorize
  const roads = geojson.features.filter(f => f.properties.category === 'road');
  const water = geojson.features.filter(f => f.properties.category === 'water');
  const landuse = geojson.features.filter(f => f.properties.category === 'landuse');

  console.log(`  Roads:   ${roads.length} features`);
  console.log(`  Water:   ${water.length} features`);
  console.log(`  Landuse: ${landuse.length} features`);

  // Write GeoJSON
  const geojsonPath = path.join(outputDir, 'vectors.geojson');
  fs.writeFileSync(geojsonPath, JSON.stringify(geojson, null, 2));
  console.log(`\n  Wrote ${geojsonPath}`);

  // Rasterize water mask
  const waterPolygons = water.filter(f => f.geometry.type === 'Polygon');
  if (waterPolygons.length) {
    console.log(`  Rasterizing water mask (${maskDimensions}x${maskDimensions})...`);
    const waterPixels = rasterizeMask(waterPolygons, bbox, maskDimensions, maskDimensions);
    const waterPng = encodePNG(waterPixels, maskDimensions, maskDimensions);
    const waterPath = path.join(outputDir, 'mask-water.png');
    fs.writeFileSync(waterPath, waterPng);
    const filledPx = waterPixels.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
    console.log(`  Wrote ${waterPath} (${(filledPx / (maskDimensions * maskDimensions) * 100).toFixed(1)}% coverage)`);
  } else {
    console.log('  No water polygons to rasterize');
  }

  // Rasterize landuse mask
  const landusePolygons = landuse.filter(f => f.geometry.type === 'Polygon');
  if (landusePolygons.length) {
    console.log(`  Rasterizing landuse mask (${maskDimensions}x${maskDimensions})...`);
    const landusePixels = rasterizeMask(landusePolygons, bbox, maskDimensions, maskDimensions);
    const landusePng = encodePNG(landusePixels, maskDimensions, maskDimensions);
    const landusePath = path.join(outputDir, 'mask-landuse.png');
    fs.writeFileSync(landusePath, landusePng);
    const filledPx = landusePixels.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
    console.log(`  Wrote ${landusePath} (${(filledPx / (maskDimensions * maskDimensions) * 100).toFixed(1)}% coverage)`);
  } else {
    console.log('  No landuse polygons to rasterize');
  }

  // Extract road splines
  const origin = { lat, lon };
  const splines = roadsToSplineData(roads, origin);
  const splinesPath = path.join(outputDir, 'roads-splines.json');
  fs.writeFileSync(splinesPath, JSON.stringify(splines, null, 2));
  const totalPoints = splines.reduce((n, s) => n + s.points.length, 0);
  console.log(`  Wrote ${splinesPath} (${splines.length} splines, ${totalPoints} control points)`);

  // Update metadata
  const metadataPath = path.join(outputDir, 'metadata.json');
  let metadata = {};
  if (fs.existsSync(metadataPath)) {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } else {
    metadata = { name, lat, lon, slug, radiusMeters: RADIUS, bbox };
  }
  metadata.vectors = {
    geojsonPath: path.join(outputDir, 'vectors.geojson'),
    waterMaskPath: waterPolygons.length ? path.join(outputDir, 'mask-water.png') : null,
    landuseMaskPath: landusePolygons.length ? path.join(outputDir, 'mask-landuse.png') : null,
    roadsSplinePath: path.join(outputDir, 'roads-splines.json'),
    maskDimensions,
    featureCounts: { roads: roads.length, water: water.length, landuse: landuse.length },
    splineCount: splines.length,
    totalControlPoints: totalPoints,
    fetchedAt: new Date().toISOString()
  };
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  // Print summary
  console.log('\n  ─── Summary ───────────────────────────────');
  console.log(`  Location:      ${name}`);
  console.log(`  Roads:         ${roads.length} features → ${splines.length} splines (${totalPoints} pts)`);
  console.log(`  Water:         ${water.length} features (${waterPolygons.length} polygons)`);
  console.log(`  Landuse:       ${landuse.length} features (${landusePolygons.length} polygons)`);
  console.log(`  Mask size:     ${maskDimensions}x${maskDimensions}`);
  console.log(`  GeoJSON:       ${geojsonPath}`);
  console.log(`  Metadata:      ${metadataPath}`);

  // Road category breakdown
  const roadCats = new Map();
  for (const r of roads) {
    const cat = r.properties.subcategory;
    roadCats.set(cat, (roadCats.get(cat) || 0) + 1);
  }
  if (roadCats.size) {
    console.log('  Road types:');
    for (const [cat, count] of [...roadCats].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${cat}: ${count}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════');
}

main().catch(e => { console.error(`\n  Error: ${e.message}`); process.exit(1); });
