#!/usr/bin/env node
/**
 * spawn-clutter.js — Spawn detail props and environmental clutter in Unreal
 *
 * Reads road splines and building footprints from terrain-data, scatters
 * ground-level clutter (newspapers, leaves, manure), cloth sim items
 * (awnings, laundry), and animated props (signs, weathervanes) filtered
 * by era and season. Spawns via Python RC API.
 *
 * Usage:
 *   node tools/spawn-clutter.js terrain-data/manhattan-ny/ --year 1884
 *   node tools/spawn-clutter.js terrain-data/manhattan-ny/ --year 1884 --month 10 --dry-run
 *   node tools/spawn-clutter.js terrain-data/manhattan-ny/ --year 1884 --only newspaper,leaves
 *   node tools/spawn-clutter.js terrain-data/manhattan-ny/ --year 1884 --exclude horse_manure
 *   node tools/spawn-clutter.js terrain-data/manhattan-ny/ --year 1884 --no-cloth --no-animated
 *   node tools/spawn-clutter.js terrain-data/manhattan-ny/ --year 1978 --clear
 *   node tools/spawn-clutter.js terrain-data/manhattan-ny/ --year 1884 --host http://192.168.68.50:30010
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  placeAllClutter,
  buildClutterSpawnScript,
  CLUTTER_PREFIX,
} from '../lib/clutterPlacement.js';
import { summarizeClutterForYear } from '../lib/clutterCatalog.js';
import { createRcClient, parseSpawnArgs } from '../lib/rcHelpers.js';

// ─── Argument parsing ────────────────────────────────────────────

const { getFlag, hasFlag, positionalArg } = parseSpawnArgs(process.argv.slice(2));

const HOST = getFlag('--host', 'http://localhost:30010');
const DRY_RUN = hasFlag('--dry-run');
const CLEAR = hasFlag('--clear');
const YEAR = getFlag('--year', null);
const MONTH = getFlag('--month', '6');
const DENSITY = getFlag('--density', '0.5');
const ONLY = getFlag('--only', null);
const EXCLUDE = getFlag('--exclude', null);
const NO_CLOTH = hasFlag('--no-cloth');
const NO_ANIMATED = hasFlag('--no-animated');

if (!positionalArg || !YEAR) {
  console.error('Usage: node tools/spawn-clutter.js terrain-data/<slug>/ --year <N> [options]');
  console.error('');
  console.error('Options:');
  console.error('  --year N            Target year (required)');
  console.error('  --month N           Month 1-12 for seasonal density (default: 6)');
  console.error('  --density N         Global density multiplier 0-1 (default: 0.5)');
  console.error('  --host URL          Unreal RC API host (default: http://localhost:30010)');
  console.error('  --dry-run           Show placement stats without touching Unreal');
  console.error('  --clear             Remove all TM_Clutter_* actors from the level');
  console.error('  --only <types>      Comma-separated list of clutter types to place');
  console.error('  --exclude <types>   Comma-separated list of clutter types to skip');
  console.error('  --no-cloth          Skip cloth simulation items');
  console.error('  --no-animated       Skip animated props');
  process.exit(1);
}

const year = parseInt(YEAR, 10);
const month = parseInt(MONTH, 10);
const density = parseFloat(DENSITY);
const only = ONLY ? ONLY.split(',').map(s => s.trim()) : null;
const exclude = EXCLUDE ? EXCLUDE.split(',').map(s => s.trim()) : null;

const { runPython, isUnrealReachable } = createRcClient(HOST);

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(' Detail Clutter Spawner');
  console.log('═══════════════════════════════════════════════\n');

  const terrainDir = positionalArg.replace(/\/$/, '');

  // Read road splines
  const splinesPath = path.join(terrainDir, 'roads-splines.json');
  if (!fs.existsSync(splinesPath)) {
    console.error(`  Error: No roads-splines.json found in ${terrainDir}/`);
    console.error('  Run fetch-vectors.js first to generate road spline data.');
    process.exit(1);
  }

  const splines = JSON.parse(fs.readFileSync(splinesPath, 'utf8'));

  // Read building footprints (optional — needed for cloth/animated)
  const buildingsPath = path.join(terrainDir, 'buildings.geojson');
  let buildings = [];
  if (fs.existsSync(buildingsPath)) {
    const geojson = JSON.parse(fs.readFileSync(buildingsPath, 'utf8'));
    buildings = geojson.features || [];
  } else if (!NO_CLOTH || !NO_ANIMATED) {
    console.warn('  Warning: No buildings.geojson found — cloth/animated placement skipped.');
  }

  console.log(`  Terrain:    ${terrainDir}`);
  console.log(`  Splines:    ${splines.length} road segments`);
  console.log(`  Buildings:  ${buildings.length} footprints`);
  console.log(`  Year:       ${year}`);
  console.log(`  Month:      ${month}`);
  console.log(`  Density:    ${density}`);

  // Show available clutter for this year
  const summary = summarizeClutterForYear(year);
  console.log(`  Clutter:    ${summary.total} types available for ${year}`);
  console.log(`  Types:      ${summary.types.join(', ')}`);
  console.log(`  Categories: ${Object.entries(summary.byCategory).map(([k, v]) => `${k}:${v}`).join(', ')}`);
  if (only) console.log(`  Only:       ${only.join(', ')}`);
  if (exclude) console.log(`  Exclude:    ${exclude.join(', ')}`);
  if (NO_CLOTH) console.log('  Cloth:      DISABLED');
  if (NO_ANIMATED) console.log('  Animated:   DISABLED');
  console.log();

  // Place clutter
  const clutterList = placeAllClutter(splines, buildings, {
    year,
    month,
    density,
    only,
    exclude,
    noCloth: NO_CLOTH || buildings.length === 0,
    noAnimated: NO_ANIMATED || buildings.length === 0,
  });

  // Stats
  const byType = {};
  for (const c of clutterList) {
    byType[c.type] = (byType[c.type] || 0) + 1;
  }

  console.log('  ─── Placement Summary ─────────────────────');
  console.log(`  Total items:  ${clutterList.length}`);
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${type}: ${count}`);
  }

  // Dry run
  if (DRY_RUN) {
    const spawnDataPath = path.join(terrainDir, 'clutter-spawn.json');
    const exportData = clutterList.map(({ label, location, scale, rotation, type, clutterLabel, animationType }) =>
      ({ label, location, scale, rotation, type, clutterLabel, animationType }));
    fs.writeFileSync(spawnDataPath, JSON.stringify(exportData, null, 2));
    console.log(`\n  Wrote ${spawnDataPath}`);
    console.log(`\n  [DRY RUN] ${clutterList.length} clutter items. No Unreal interaction.`);
    console.log('═══════════════════════════════════════════════');
    return;
  }

  // Check Unreal connectivity
  console.log('\n  Checking Unreal connectivity...');
  const reachable = await isUnrealReachable();
  if (!reachable) {
    console.error(`  ✗ Cannot reach Unreal at ${HOST}`);
    console.error('  Use --dry-run to preview placement without Unreal.');
    process.exit(1);
  }
  console.log('  ✓ Unreal Remote Control API reachable');

  // Clear mode
  if (CLEAR) {
    console.log('\n  Clearing existing clutter actors...');
    const script = buildClutterSpawnScript([], { clearExisting: true });
    const result = await runPython(script);
    console.log(`  ${result.ok ? '✓' : '✗'} Clear command sent`);
    console.log('═══════════════════════════════════════════════');
    return;
  }

  // Spawn
  console.log(`\n  Spawning ${clutterList.length} clutter items via Python script...`);
  const script = buildClutterSpawnScript(clutterList, { clearExisting: true });

  // Save script for debugging
  const scriptPath = path.join(terrainDir, 'clutter-spawn.py');
  fs.writeFileSync(scriptPath, script);
  console.log(`  Wrote ${scriptPath}`);

  const result = await runPython(script);
  if (result.ok) {
    console.log('  ✓ Python script executed');
  } else {
    console.error(`  ✗ Python execution failed: ${result.data?.error || 'unknown error'}`);
    console.error('  The generated script has been saved — try running it manually in UE Python console.');
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Spawned ${clutterList.length} clutter items (${CLUTTER_PREFIX}_*)`);
  console.log(`  To remove: node tools/spawn-clutter.js ${terrainDir} --year ${year} --clear`);
  console.log('═══════════════════════════════════════════════');
}

main().catch(e => { console.error(`\n  Error: ${e.message}`); process.exit(1); });
