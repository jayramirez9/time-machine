#!/usr/bin/env node
/**
 * fetch-photos.js — Download historical photographs from Library of Congress
 *
 * Fetches photos from the LOC Prints & Photographs catalog for a location + year.
 * Downloads via IIIF Image API and writes a PHOTO_MANIFEST.json index.
 *
 * Usage:
 *   node tools/fetch-photos.js "Manhattan, NY" --year 1884
 *   node tools/fetch-photos.js "Manhattan, NY" --year 1884 --query "Broadway street scene"
 *   node tools/fetch-photos.js terrain-data/manhattan-ny/ --year 1884
 *   node tools/fetch-photos.js "Manhattan, NY" --year 1884 --dry-run
 *   node tools/fetch-photos.js "Manhattan, NY" --year 1884 --collection det
 *   node tools/fetch-photos.js "Manhattan, NY" --year 1884 --max 5
 */

import { geocode } from '../lib/openmeteo.js';
import { slugify } from '../lib/demFetcher.js';
import { searchAndDownload, buildSearchQuery } from '../lib/photoArchiveFetch.js';
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

const YEAR = parseInt(getFlag('--year', '0'));
const YEAR_RANGE = parseInt(getFlag('--range', '5'));
const COLLECTION = getFlag('--collection', null);
const MAX_PHOTOS = parseInt(getFlag('--max', '10'));
const IIIF_SCALE = parseInt(getFlag('--scale', '50'));
const QUERY = getFlag('--query', null);
const DRY_RUN = hasFlag('--dry-run');
const FORCE = hasFlag('--force');

// First positional arg: either a terrain-data dir or a location string
const positionalArg = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));

if (!positionalArg || !YEAR) {
  console.error('Usage: node tools/fetch-photos.js <location or terrain-data dir> --year YYYY [options]');
  console.error('');
  console.error('Options:');
  console.error('  --year YYYY         Target year (required)');
  console.error('  --query "..."       Additional search terms');
  console.error('  --range N           Year range for date filter (default: 5)');
  console.error('  --collection ID     LOC sub-collection (e.g. "det" for Detroit Publishing)');
  console.error('  --max N             Max photos to download (default: 10)');
  console.error('  --scale N           IIIF scale percentage (default: 50)');
  console.error('  --dry-run           Show what would be fetched without downloading');
  console.error('  --force             Re-download existing photos');
  process.exit(1);
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(' LOC Photo Fetcher');
  console.log('═══════════════════════════════════════════════\n');

  let locationName, slug, outputDir;

  // Check if positional arg is an existing terrain-data directory
  const isTerrainDir = positionalArg && fs.existsSync(path.join(positionalArg, 'metadata.json'));

  if (isTerrainDir) {
    const metadataPath = path.join(positionalArg, 'metadata.json');
    const meta = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    locationName = meta.name;
    slug = meta.slug;
    console.log(`  Reading from: ${metadataPath}`);
    console.log(`  Location:     ${locationName}`);
  } else {
    console.log(`  Geocoding: "${positionalArg}"`);
    try {
      const geo = await geocode(positionalArg);
      locationName = geo.name;
      slug = slugify(positionalArg);
      console.log(`  Resolved:    ${locationName}`);
    } catch (e) {
      console.error(`  Geocode failed: ${e.message}`);
      process.exit(1);
    }
  }

  outputDir = path.join('photos', slug);

  // Build search query
  const searchQuery = QUERY
    ? `${locationName} ${QUERY}`
    : buildSearchQuery(locationName, YEAR);

  console.log(`  Target year:  ${YEAR}`);
  console.log(`  Year range:   ±${YEAR_RANGE}`);
  console.log(`  Search query: "${searchQuery}"`);
  if (COLLECTION) console.log(`  Collection:   ${COLLECTION}`);
  console.log(`  Max photos:   ${MAX_PHOTOS}`);
  console.log(`  IIIF scale:   pct:${IIIF_SCALE}`);
  console.log(`  Output:       ${outputDir}/`);
  if (DRY_RUN) console.log('  Mode:         DRY RUN');
  if (FORCE) console.log('  Mode:         FORCE (re-download)');

  console.log('');

  // Run search and download
  const manifest = await searchAndDownload(searchQuery, outputDir, {
    year: YEAR,
    yearRange: YEAR_RANGE,
    maxPhotos: MAX_PHOTOS,
    scale: IIIF_SCALE,
    dryRun: DRY_RUN,
    force: FORCE,
    collection: COLLECTION,
    onProgress(stage, message) {
      const prefix = {
        'search': '  [search]',
        'metadata': '  [meta]',
        'download': '  [dl]',
        'skip': '  [skip]',
        'dry-run': '  [dry]',
        'warn': '  [warn]',
        'done': '  [done]'
      }[stage] || `  [${stage}]`;
      console.log(`${prefix}  ${message}`);
    }
  });

  // ─── Summary ───────────────────────────────────────────────

  const downloaded = manifest.photos.filter(p => p.downloaded).length;
  const totalBytes = manifest.photos.reduce((sum, p) => sum + (p.bytes || 0), 0);
  const totalMB = (totalBytes / 1024 / 1024).toFixed(1);

  console.log('\n  ─── Summary ───────────────────────────────');
  console.log(`  Location:     ${locationName}`);
  console.log(`  Target year:  ${YEAR}`);
  console.log(`  Query:        "${searchQuery}"`);
  console.log(`  Photos found: ${manifest.photos.length}`);
  if (!DRY_RUN) {
    console.log(`  Downloaded:   ${downloaded}`);
    if (totalBytes > 0) console.log(`  Total size:   ${totalMB} MB`);
    console.log(`  Manifest:     ${path.join(outputDir, 'PHOTO_MANIFEST.json')}`);
  }
  if (manifest.skippedNoIiif > 0) {
    console.log(`  Skipped:      ${manifest.skippedNoIiif} (no IIIF URL)`);
  }
  console.log(`  Output dir:   ${outputDir}/`);

  if (manifest.photos.length > 0) {
    console.log('\n  Photos:');
    for (const photo of manifest.photos) {
      const status = DRY_RUN ? '[would fetch]' : (photo.downloaded ? '[ok]' : '[skip]');
      const date = photo.date ? ` (${photo.date})` : '';
      console.log(`    ${status} ${photo.title.slice(0, 70)}${date}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════');
}

main().catch(e => { console.error(`\n  Error: ${e.message}`); process.exit(1); });
