#!/usr/bin/env node

/**
 * Generate Environment Profile — CLI tool (Phase 7)
 *
 * Invokes the profile assembler agent pipeline to research and produce
 * a complete Environment Profile for any Place×Time.
 *
 * Usage:
 *   node tools/generate-environment-profile.js "New York, NY" --year 1884
 *   node tools/generate-environment-profile.js "Baton Rouge, LA" --year 1978 --month 7
 *   node tools/generate-environment-profile.js "Manhattan, NY" --year 1884 --terrain terrain-data/manhattan-ny/
 *   node tools/generate-environment-profile.js "NYC" --year 1884 --dry-run
 *   node tools/generate-environment-profile.js "NYC" --year 1884 --skip ecology,culture
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { assembleProfile } from '../lib/agents/profileAssembler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const PROFILES_DIR = resolve(PROJECT_ROOT, 'profiles');

// ---------------------------------------------------------------------------
// CLI argument parsing
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
const year = parseInt(getFlag('year'), 10);
const month = getFlag('month') ? parseInt(getFlag('month'), 10) : null;
const day = getFlag('day') ? parseInt(getFlag('day'), 10) : null;
const terrainDataPath = getFlag('terrain') || null;
const dryRun = hasFlag('dry-run');
const skipStr = getFlag('skip');
const skipLayers = skipStr ? skipStr.split(',').map(s => s.trim()) : [];
const jsonOutput = hasFlag('json');

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

if (!location || !year || isNaN(year)) {
  console.error(`Usage: node tools/generate-environment-profile.js "<location>" --year <year> [options]

Options:
  --year <number>       Target year (required)
  --month <number>      Target month (1-12, optional)
  --day <number>        Target day (1-31, optional)
  --terrain <path>      Path to terrain-data directory
  --skip <layers>       Comma-separated layers to skip (e.g., ecology,culture)
  --dry-run             Show what would be generated without writing
  --json                Output profile JSON to stdout

Examples:
  node tools/generate-environment-profile.js "New York, NY" --year 1884
  node tools/generate-environment-profile.js "Baton Rouge, LA" --year 1978 --month 7
  node tools/generate-environment-profile.js "NYC" --year 1884 --terrain terrain-data/manhattan-ny/
  node tools/generate-environment-profile.js "NYC" --year 1884 --dry-run`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n  Assembling Environment Profile`);
  console.log(`  Location: ${location}`);
  console.log(`  Year:     ${year}${month ? ` / Month: ${month}` : ''}${day ? ` / Day: ${day}` : ''}`);
  if (terrainDataPath) console.log(`  Terrain:  ${terrainDataPath}`);
  if (skipLayers.length) console.log(`  Skip:     ${skipLayers.join(', ')}`);
  if (dryRun) console.log(`  Mode:     DRY RUN (no files written)`);
  console.log();

  const profile = await assembleProfile({
    location,
    year,
    month,
    day,
    terrainDataPath: terrainDataPath ? resolve(PROJECT_ROOT, terrainDataPath) : null,
    probeStation: !dryRun, // skip station probe in dry-run
    skipLayers,
    onProgress: (layer, status) => {
      if (status === 'started') process.stdout.write(`  [${layer}] researching...`);
      else if (status === 'done') process.stdout.write(' done\n');
      else if (status === 'error') process.stdout.write(' ERROR\n');
    }
  });

  // Summary
  const manifest = profile.accuracyManifest;
  console.log(`\n  ── Profile Summary ──`);
  console.log(`  ID:         ${profile.id}`);
  console.log(`  Name:       ${profile.name}`);
  console.log(`  Location:   ${profile.location.name} (${profile.location.lat.toFixed(4)}, ${profile.location.lon.toFixed(4)})`);
  console.log(`  Confidence: ${(manifest.overallConfidence * 100).toFixed(0)}%`);
  console.log();

  // Layer summary
  console.log(`  ── Layers ──`);
  for (const [layer, summary] of Object.entries(manifest.layerSummary)) {
    const conf = summary.confidence;
    const bar = '█'.repeat(Math.round(conf * 10)) + '░'.repeat(10 - Math.round(conf * 10));
    const pct = (conf * 100).toFixed(0).padStart(3);
    console.log(`  ${layer.padEnd(16)} ${bar} ${pct}%  ${summary.status}`);
  }

  // Gaps
  if (manifest.gaps.length > 0) {
    console.log(`\n  ── Gaps (${manifest.gaps.length}) ──`);
    for (const gap of manifest.gaps.slice(0, 10)) {
      console.log(`  • ${gap}`);
    }
    if (manifest.gaps.length > 10) {
      console.log(`  ... and ${manifest.gaps.length - 10} more`);
    }
  }

  // Review checklist
  if (manifest.reviewChecklist?.length > 0) {
    console.log(`\n  ── Review Checklist ──`);
    for (const item of manifest.reviewChecklist) {
      console.log(`  □ ${item}`);
    }
  }

  // Write or dry-run
  if (jsonOutput) {
    console.log();
    console.log(JSON.stringify(profile, null, 2));
  } else if (dryRun) {
    console.log(`\n  Dry run — no files written.`);
    console.log(`  Would write to: profiles/${profile.id}.json`);
  } else {
    if (!existsSync(PROFILES_DIR)) {
      mkdirSync(PROFILES_DIR, { recursive: true });
    }
    const outPath = resolve(PROFILES_DIR, `${profile.id}.json`);
    writeFileSync(outPath, JSON.stringify(profile, null, 2) + '\n');
    console.log(`\n  Written to: ${outPath}`);
  }

  console.log();
}

main().catch(err => {
  console.error(`\n  Error: ${err.message}\n`);
  process.exit(1);
});
