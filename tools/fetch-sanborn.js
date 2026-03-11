#!/usr/bin/env node
/**
 * fetch-sanborn.js — Download Sanborn fire insurance maps from Library of Congress
 *
 * Fetches Sanborn map metadata and sheet images for a location + year.
 * Produces a sheet index and optional seed template for building footprint
 * tracing. Building footprints (GeoJSON) are the input for Phase 6.2
 * block massing generation.
 *
 * Usage:
 *   node tools/fetch-sanborn.js terrain-data/manhattan-ny/
 *   node tools/fetch-sanborn.js "Manhattan, NY" --year 1884
 *   node tools/fetch-sanborn.js terrain-data/manhattan-ny/ --year 1884 --dry-run
 *   node tools/fetch-sanborn.js terrain-data/manhattan-ny/ --seed-template
 *   node tools/fetch-sanborn.js terrain-data/manhattan-ny/ --only-index
 */

import { geocode } from '../lib/openmeteo.js';
import { computeBoundingBox, slugify } from '../lib/demFetcher.js';
import {
  searchSanbornMaps, fetchSheetMetadata, downloadSheet, fetchSanbornIndex,
  createSeedTemplate, loadBuildingFootprints, sheetFilename, extractItemId
} from '../lib/sanborn.js';
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

const YEAR = parseInt(getFlag('--year', '1884'));
const YEAR_RANGE = parseInt(getFlag('--range', '5'));     // ±N years
const RADIUS = parseInt(getFlag('--radius', '500'));
const IIIF_SCALE = parseInt(getFlag('--scale', '25'));     // pct:N
const DRY_RUN = hasFlag('--dry-run');
const FORCE = hasFlag('--force');
const SEED_TEMPLATE = hasFlag('--seed-template');
const ONLY_INDEX = hasFlag('--only-index');
const MAX_ITEMS = parseInt(getFlag('--max-items', '20'));  // Max LOC items to process
const MAX_SHEETS = parseInt(getFlag('--max-sheets', '50')); // Max total sheets to download

// First positional arg: either a terrain-data dir or a location string
const positionalArg = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));

if (!positionalArg) {
  console.error('Usage: node tools/fetch-sanborn.js terrain-data/<slug>/  [options]');
  console.error('       node tools/fetch-sanborn.js "Location Name"       [options]');
  console.error('');
  console.error('Options:');
  console.error('  --year YYYY       Target year (default: 1884)');
  console.error('  --range N         Search ±N years around target (default: 5)');
  console.error('  --radius N        Search radius in meters (default: 500)');
  console.error('  --scale N         IIIF download scale percentage (default: 25)');
  console.error('  --max-items N     Max LOC items to fetch details for (default: 20)');
  console.error('  --max-sheets N    Max total sheets to download (default: 50)');
  console.error('  --dry-run         Show what would be fetched without downloading');
  console.error('  --force           Re-download existing sheets');
  console.error('  --seed-template   Generate blank GeoJSON template for manual tracing');
  console.error('  --only-index      Build sheet index only, skip image downloads');
  process.exit(1);
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(' Sanborn Map Fetcher');
  console.log('═══════════════════════════════════════════════\n');

  let lat, lon, name, slug, bbox, outputDir;

  // Check if positional arg is an existing terrain-data directory
  const isTerrainDir = positionalArg && fs.existsSync(path.join(positionalArg, 'metadata.json'));

  if (isTerrainDir) {
    const metadataPath = path.join(positionalArg, 'metadata.json');
    const meta = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    lat = meta.lat;
    lon = meta.lon;
    name = meta.name;
    slug = meta.slug;
    bbox = meta.bbox;
    outputDir = positionalArg.replace(/\/$/, '');
    console.log(`  Reading from: ${metadataPath}`);
    console.log(`  Location:     ${name}`);
    console.log(`  Coordinates:  ${lat}, ${lon}`);
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
      console.log(`  Resolved:    ${name}`);
      console.log(`  Coordinates: ${lat}, ${lon}`);
    } catch (e) {
      console.error(`  Geocode failed: ${e.message}`);
      process.exit(1);
    }
  }

  const dateRange = { start: YEAR - YEAR_RANGE, end: YEAR + YEAR_RANGE };

  console.log(`  Target year:  ${YEAR}`);
  console.log(`  Search range: ${dateRange.start}–${dateRange.end}`);
  console.log(`  Output:       ${outputDir}/`);

  // ─── Step 1: Search LOC ─────────────────────────────────────

  // Derive search location from the name — LOC uses state + city facets
  const { state: searchState, city: searchCity } = deriveSearchLocation(name);
  const cityLabel = searchCity ? ` (city: ${searchCity})` : '';
  console.log(`\n  Searching LOC Sanborn collection for state="${searchState}"${cityLabel}...`);

  const { items, totalSearchResults } = await fetchSanbornIndex(searchState, dateRange, { maxResults: MAX_ITEMS, city: searchCity });

  console.log(`  Found ${totalSearchResults} total results, ${items.length} digitized items`);

  if (items.length === 0) {
    console.log('\n  No digitized Sanborn maps found for this location/date range.');
    console.log('  Try widening --range or using a different location name.');
    console.log('═══════════════════════════════════════════════');
    return;
  }

  // Show items found
  console.log('\n  Items:');
  for (const item of items.slice(0, 10)) {
    const sheets = item.sheetCount > 0 ? ` (${item.sheetCount} sheets)` : '';
    const cities = item.locationCity?.length ? ` [${item.locationCity.join(', ')}]` : '';
    console.log(`    ${item.date || '????'}  ${item.title.substring(0, 60)}${cities}${sheets}`);
  }
  if (items.length > 10) {
    console.log(`    ... and ${items.length - 10} more`);
  }

  if (DRY_RUN) {
    console.log('\n  [DRY RUN] Would produce:');
    console.log(`    ${outputDir}/sanborn/sheet-index.json`);
    console.log(`    ${outputDir}/sanborn/sheets/*.jpg`);
    if (SEED_TEMPLATE) {
      console.log(`    ${outputDir}/buildings-template.geojson`);
    }
    console.log('═══════════════════════════════════════════════');
    return;
  }

  // Ensure output directories
  const sanbornDir = path.join(outputDir, 'sanborn');
  const sheetsDir = path.join(sanbornDir, 'sheets');
  fs.mkdirSync(sheetsDir, { recursive: true });

  // ─── Step 2: Fetch sheet metadata for each item ─────────────

  console.log('\n  Fetching sheet metadata...');
  const sheetIndex = [];
  let totalSheets = 0;

  for (const item of items) {
    if (totalSheets >= MAX_SHEETS) break;

    const itemId = extractItemId(item.url) || extractItemId(item.id);
    if (!itemId) {
      console.log(`  ✗ Could not extract item ID from: ${item.url}`);
      continue;
    }

    try {
      await sleep(500); // Rate limit
      const meta = await fetchSheetMetadata(item.url || item.id);

      for (const sheet of meta.sheets) {
        if (totalSheets >= MAX_SHEETS) break;
        if (!sheet.iiifBase) continue; // Skip sheets without IIIF URLs

        const filename = sheetFilename(itemId, sheet.pageIndex);
        sheetIndex.push({
          itemId,
          itemTitle: item.title,
          itemDate: item.date,
          itemUrl: item.url,
          pageIndex: sheet.pageIndex,
          filename,
          iiifBase: sheet.iiifBase,
          width: sheet.width,
          height: sheet.height,
          thumbnailUrl: sheet.thumbnailUrl
        });
        totalSheets++;
      }
      console.log(`  ✓ ${itemId}: ${meta.sheets.filter(s => s.iiifBase).length} sheets`);
    } catch (e) {
      console.log(`  ✗ ${itemId}: ${e.message}`);
    }
  }

  // Write sheet index
  const indexPath = path.join(sanbornDir, 'sheet-index.json');
  const indexData = {
    location: name,
    targetYear: YEAR,
    searchRange: dateRange,
    fetchedAt: new Date().toISOString(),
    sheets: sheetIndex
  };
  fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
  console.log(`\n  Wrote ${indexPath} (${sheetIndex.length} sheets indexed)`);

  // ─── Step 3: Download sheet images ──────────────────────────

  if (!ONLY_INDEX && sheetIndex.length > 0) {
    console.log(`\n  Downloading sheets at pct:${IIIF_SCALE}...`);
    let downloaded = 0;
    let skipped = 0;
    let failed = 0;
    let totalBytes = 0;

    for (const sheet of sheetIndex) {
      const outPath = path.join(sheetsDir, sheet.filename);

      if (fs.existsSync(outPath) && !FORCE) {
        skipped++;
        continue;
      }

      try {
        await sleep(500); // Rate limit
        const bytes = await downloadSheet(sheet.iiifBase, outPath, { scale: IIIF_SCALE });
        totalBytes += bytes;
        downloaded++;
        const sizeMB = (bytes / 1024 / 1024).toFixed(1);
        console.log(`  ✓ ${sheet.filename}  (${sizeMB} MB)`);
      } catch (e) {
        failed++;
        console.log(`  ✗ ${sheet.filename}: ${e.message}`);
      }
    }

    const totalMB = (totalBytes / 1024 / 1024).toFixed(1);
    console.log(`\n  Downloaded: ${downloaded}  Skipped: ${skipped}  Failed: ${failed}  Total: ${totalMB} MB`);
  } else if (ONLY_INDEX) {
    console.log('\n  [--only-index] Skipping image downloads');
  }

  // ─── Step 4: Seed template ─────────────────────────────────

  if (SEED_TEMPLATE) {
    const templatePath = path.join(outputDir, 'buildings-template.geojson');
    const template = createSeedTemplate(bbox, YEAR, sheetIndex);
    fs.writeFileSync(templatePath, JSON.stringify(template, null, 2));
    console.log(`\n  Wrote seed template: ${templatePath}`);
    console.log('  → Open Sanborn sheets in sanborn/sheets/ alongside a GIS tool');
    console.log('  → Trace building footprints as Polygons in WGS84 coordinates');
    console.log('  → Fill in properties: stories, material, use, confidence');
    console.log('  → Save as buildings.geojson in the same directory');
  }

  // ─── Step 5: Validate existing buildings if present ─────────

  const buildingsPath = path.join(outputDir, 'buildings.geojson');
  let buildingCount = 0;
  if (fs.existsSync(buildingsPath)) {
    console.log(`\n  Validating existing buildings: ${buildingsPath}`);
    const result = loadBuildingFootprints(buildingsPath);
    buildingCount = result.features.length;
    console.log(`  ${result.valid} valid, ${result.invalid} invalid of ${buildingCount} features`);
    if (result.warnings.length > 0) {
      for (const w of result.warnings.slice(0, 5)) {
        console.log(`    ⚠ ${w}`);
      }
      if (result.warnings.length > 5) {
        console.log(`    ... and ${result.warnings.length - 5} more warnings`);
      }
    }
  }

  // ─── Step 6: Update metadata ───────────────────────────────

  const metadataPath = path.join(outputDir, 'metadata.json');
  let metadata = {};
  if (fs.existsSync(metadataPath)) {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } else {
    metadata = { name, lat, lon, slug, radiusMeters: RADIUS, bbox };
  }
  metadata.sanborn = {
    sheetIndexPath: path.relative(outputDir, indexPath),
    sheetsDir: path.relative(outputDir, sheetsDir),
    sheetCount: sheetIndex.length,
    targetYear: YEAR,
    searchRange: [dateRange.start, dateRange.end],
    buildingsPath: fs.existsSync(buildingsPath) ? 'buildings.geojson' : null,
    buildingCount,
    fetchedAt: new Date().toISOString(),
    source: 'LOC Sanborn Maps Collection (https://www.loc.gov/collections/sanborn-maps/)'
  };
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  // ─── Summary ───────────────────────────────────────────────

  console.log('\n  ─── Summary ───────────────────────────────');
  console.log(`  Location:       ${name}`);
  console.log(`  Target year:    ${YEAR}`);
  console.log(`  LOC items:      ${items.length} digitized`);
  console.log(`  Sheets indexed: ${sheetIndex.length}`);
  if (!ONLY_INDEX) {
    const existingFiles = sheetIndex.filter(s => fs.existsSync(path.join(sheetsDir, s.filename)));
    console.log(`  Sheets on disk: ${existingFiles.length}`);
  }
  if (buildingCount > 0) {
    console.log(`  Buildings:      ${buildingCount} footprints`);
  } else {
    console.log('  Buildings:      none yet — use --seed-template to start tracing');
  }
  console.log(`  Sheet index:    ${indexPath}`);
  console.log(`  Metadata:       ${metadataPath}`);
  console.log('\n═══════════════════════════════════════════════');
}

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Derive LOC search facets from a geocoded name.
 * Returns { state, city } for LOC's location_state and location_city facets.
 * LOC city names for NYC boroughs are "new york" (Manhattan, Bronx, etc. all filed under "new york").
 */
function deriveSearchLocation(name) {
  // Known city → { state, locCity } mappings
  // locCity is what LOC uses in location_city facet (may differ from common name)
  const knownCities = {
    'manhattan':      { state: 'new york', city: 'new york' },
    'new york':       { state: 'new york', city: 'new york' },
    'brooklyn':       { state: 'new york', city: 'new york' },
    'bronx':          { state: 'new york', city: 'new york' },
    'queens':         { state: 'new york', city: 'new york' },
    'baton rouge':    { state: 'louisiana', city: 'baton rouge' },
    'boston':          { state: 'massachusetts', city: 'boston' },
    'chicago':        { state: 'illinois', city: 'chicago' },
    'san francisco':  { state: 'california', city: 'san francisco' },
    'los angeles':    { state: 'california', city: 'los angeles' },
    'philadelphia':   { state: 'pennsylvania', city: 'philadelphia' },
    'baltimore':      { state: 'maryland', city: 'baltimore' },
    'washington':     { state: 'district of columbia', city: 'washington' },
    'new orleans':    { state: 'louisiana', city: 'new orleans' },
    'st. louis':      { state: 'missouri', city: 'st. louis' },
    'detroit':        { state: 'michigan', city: 'detroit' },
    'pittsburgh':     { state: 'pennsylvania', city: 'pittsburgh' },
    'cincinnati':     { state: 'ohio', city: 'cincinnati' },
    'cleveland':      { state: 'ohio', city: 'cleveland' },
    'milwaukee':      { state: 'wisconsin', city: 'milwaukee' },
    'minneapolis':    { state: 'minnesota', city: 'minneapolis' },
    'seattle':        { state: 'washington', city: 'seattle' },
    'portland':       { state: 'oregon', city: 'portland' },
    'denver':         { state: 'colorado', city: 'denver' },
    'atlanta':        { state: 'georgia', city: 'atlanta' },
    'richmond':       { state: 'virginia', city: 'richmond' },
    'cambridge':      { state: 'massachusetts', city: 'cambridge' },
    'harvard square': { state: 'massachusetts', city: 'cambridge' }
  };

  const lower = name.toLowerCase();

  // Check known city mappings
  for (const [key, val] of Object.entries(knownCities)) {
    if (lower.includes(key)) return val;
  }

  // Try to extract from "City, State" or "City, State, Country" format
  const parts = name.split(',').map(s => s.trim().toLowerCase());
  if (parts.length >= 2) {
    // Last meaningful part is likely state (skip "United States" etc.)
    const statePart = parts.length >= 3 ? parts[parts.length - 2] : parts[parts.length - 1];
    const cityPart = parts[0];
    return { state: statePart, city: cityPart };
  }

  // Fallback: state only
  return { state: lower, city: null };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(e => { console.error(`\n  Error: ${e.message}`); process.exit(1); });
