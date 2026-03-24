#!/usr/bin/env node

/**
 * Confidence Scan — sweep a location across a year range and show
 * per-layer confidence scores at each time slice.
 *
 * Runs agents in offline mode (no API calls) — typically <1s total.
 *
 * Usage:
 *   node tools/confidence-scan.js "New York, NY" --from 1800 --to 2000
 *   node tools/confidence-scan.js "New York, NY" --from 1800 --to 2000 --step 5
 *   node tools/confidence-scan.js "Baton Rouge, LA" --from 1850 --to 1990 --step 10
 *   node tools/confidence-scan.js "NYC" --from 1860 --to 1920 --step 5 --json
 */

import { assembleProfile, findTerrainData } from '../lib/agents/profileAssembler.js';
import { geocode } from '../lib/openmeteo.js';
import { LAYER_NAMES } from '../lib/environmentProfile.js';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getFlag(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return null;
  return args[idx + 1] || null;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

const location = args.find(a => !a.startsWith('--'));
const from = parseInt(getFlag('from'), 10);
const to = parseInt(getFlag('to'), 10);
const step = parseInt(getFlag('step'), 10) || 10;
const jsonOutput = hasFlag('json');

if (!location || !from || !to || isNaN(from) || isNaN(to) || from > to) {
  console.error(`Usage: node tools/confidence-scan.js "<location>" --from <year> --to <year> [options]

Options:
  --from <year>    Start year (required)
  --to <year>      End year (required)
  --step <years>   Year increment (default: 10)
  --json           Output raw JSON instead of table

Examples:
  node tools/confidence-scan.js "New York, NY" --from 1800 --to 2000
  node tools/confidence-scan.js "Baton Rouge, LA" --from 1850 --to 1990 --step 5
  node tools/confidence-scan.js "NYC" --from 1860 --to 1920 --step 5 --json`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Geocode once
  const geo = await geocode(location);
  console.error(`  Location: ${geo.name} (${geo.lat.toFixed(4)}, ${geo.lon.toFixed(4)})`);

  // Check for auto-detected terrain data
  const terrainMatch = findTerrainData(geo.lat, geo.lon);
  if (terrainMatch) {
    console.error(`  Terrain:  ${terrainMatch.slug} (${terrainMatch.distanceKm}km)`);
  }

  // Build year list
  const years = [];
  for (let y = from; y <= to; y += step) {
    years.push(y);
  }

  console.error(`  Scanning ${years.length} time slices (${from}–${to}, step ${step})...\n`);

  // Run assembler for each year (sequentially — each is <10ms)
  const results = [];
  for (const year of years) {
    const profile = await assembleProfile({
      location,
      year,
      geo,
      probeStation: false,
      terrainDataPath: terrainMatch?.path || null
    });

    const manifest = profile.accuracyManifest;
    const row = {
      year,
      overall: manifest.overallConfidence,
      layers: {}
    };
    for (const name of LAYER_NAMES) {
      row.layers[name] = manifest.layerSummary[name]?.confidence ?? 0;
    }
    results.push(row);
  }

  if (jsonOutput) {
    console.log(JSON.stringify({ location: geo.name, from, to, step, results }, null, 2));
    return;
  }

  // Print table
  // Short layer names for the header
  const SHORT = {
    terrain: 'terr', weather: 'wthr', soundscape: 'snd',
    urbanForm: 'urbn', ecology: 'ecol', culture: 'cult',
    music: 'musc', materials: 'matl', infrastructure: 'infr'
  };

  // Header
  const hdr = '  Year  Overall  ' + LAYER_NAMES.map(n => SHORT[n].padStart(4)).join(' ');
  console.log(hdr);
  console.log('  ' + '─'.repeat(hdr.length - 2));

  // Rows
  for (const r of results) {
    const overall = (r.overall * 100).toFixed(0).padStart(3);
    const bar = confidenceBar(r.overall);
    const cells = LAYER_NAMES.map(n => {
      const v = r.layers[n];
      return v === 0 ? '  ──' : (v * 100).toFixed(0).padStart(4);
    }).join(' ');
    console.log(`  ${r.year}  ${bar} ${overall}%  ${cells}`);
  }

  // Legend
  console.log();
  console.log('  Legend: ── = missing layer');
  console.log('  Columns: ' + LAYER_NAMES.map(n => `${SHORT[n]}=${n}`).join(', '));

  // Find sweet spots and weak spots
  const sorted = [...results].sort((a, b) => b.overall - a.overall);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  console.log();
  console.log(`  Strongest: ${best.year} (${(best.overall * 100).toFixed(0)}%)`);
  console.log(`  Weakest:   ${worst.year} (${(worst.overall * 100).toFixed(0)}%)`);

  // Find layers that are consistently weak
  const layerAvgs = {};
  for (const name of LAYER_NAMES) {
    const vals = results.map(r => r.layers[name]);
    layerAvgs[name] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  const weakLayers = LAYER_NAMES
    .filter(n => layerAvgs[n] < 0.1)
    .map(n => n);
  if (weakLayers.length > 0) {
    console.log(`  Always weak: ${weakLayers.join(', ')}`);
  }
}

function confidenceBar(conf) {
  const filled = Math.round(conf * 8);
  return '█'.repeat(filled) + '░'.repeat(8 - filled);
}

main().catch(err => {
  console.error(`\n  Error: ${err.message}\n`);
  process.exit(1);
});
