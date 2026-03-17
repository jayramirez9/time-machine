#!/usr/bin/env node
/**
 * spawn-props.js — Spawn era-appropriate street props in Unreal
 *
 * Reads road splines from terrain-data, places street furniture (hitching
 * posts, fire hydrants, awnings, mailboxes, etc.) along sidewalks and at
 * intersections, filtered by era. Spawns via Python RC API.
 *
 * Usage:
 *   node tools/spawn-props.js terrain-data/manhattan-ny/ --year 1884
 *   node tools/spawn-props.js terrain-data/manhattan-ny/ --year 1884 --dry-run
 *   node tools/spawn-props.js terrain-data/manhattan-ny/ --year 1884 --only hitching_post,horse_trough
 *   node tools/spawn-props.js terrain-data/manhattan-ny/ --year 1884 --exclude parking_meter
 *   node tools/spawn-props.js terrain-data/manhattan-ny/ --year 1978 --clear
 *   node tools/spawn-props.js terrain-data/manhattan-ny/ --year 1884 --host http://100.96.244.16:30010
 */

import fs from 'node:fs';
import path from 'node:path';
import { placeProps, buildPropSpawnScript, PROP_PREFIX } from '../lib/propPlacement.js';
import { summarizePropsForYear } from '../lib/propCatalog.js';
import { createRcClient, parseSpawnArgs } from '../lib/rcHelpers.js';

// ─── Argument parsing ────────────────────────────────────────────

const { getFlag, hasFlag, positionalArg } = parseSpawnArgs(process.argv.slice(2));

const HOST = getFlag('--host', 'http://localhost:30010');
const DRY_RUN = hasFlag('--dry-run');
const CLEAR = hasFlag('--clear');
const YEAR = getFlag('--year', null);
const ERA = getFlag('--era', null);
const ONLY = getFlag('--only', null);
const EXCLUDE = getFlag('--exclude', null);

if (!positionalArg || !YEAR) {
  console.error('Usage: node tools/spawn-props.js terrain-data/<slug>/ --year <N> [options]');
  console.error('');
  console.error('Options:');
  console.error('  --year N            Target year (required)');
  console.error('  --era KEY           Street classification era override');
  console.error('  --host URL          Unreal RC API host (default: http://localhost:30010)');
  console.error('  --dry-run           Show placement stats without touching Unreal');
  console.error('  --clear             Remove all TM_Prop_* actors from the level');
  console.error('  --only <types>      Comma-separated list of prop types to place');
  console.error('  --exclude <types>   Comma-separated list of prop types to skip');
  process.exit(1);
}

const year = parseInt(YEAR, 10);
const only = ONLY ? ONLY.split(',').map(s => s.trim()) : null;
const exclude = EXCLUDE ? EXCLUDE.split(',').map(s => s.trim()) : null;

const { runPython, isUnrealReachable } = createRcClient(HOST);

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(' Street Prop Spawner');
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
  console.log(`  Terrain:    ${terrainDir}`);
  console.log(`  Splines:    ${splines.length} road segments`);
  console.log(`  Year:       ${year}`);
  if (ERA) console.log(`  Era:        ${ERA}`);

  // Show available props for this year
  const summary = summarizePropsForYear(year);
  console.log(`  Props:      ${summary.total} types available for ${year}`);
  console.log(`  Types:      ${summary.types.join(', ')}`);
  console.log(`  Placement:  ${Object.entries(summary.byPlacement).map(([k, v]) => `${k}:${v}`).join(', ')}`);
  if (only) console.log(`  Only:       ${only.join(', ')}`);
  if (exclude) console.log(`  Exclude:    ${exclude.join(', ')}`);
  console.log();

  // Place props
  const propList = placeProps(splines, { year, era: ERA || undefined, only, exclude });

  // Stats
  const byType = {};
  for (const p of propList) {
    byType[p.type] = (byType[p.type] || 0) + 1;
  }

  console.log(`  ─── Placement Summary ─────────────────────`);
  console.log(`  Total props:  ${propList.length}`);
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${type}: ${count}`);
  }

  // Dry run
  if (DRY_RUN) {
    // Write spawn data for reference
    const spawnDataPath = path.join(terrainDir, 'props-spawn.json');
    const exportData = propList.map(({ label, location, scale, rotation, type, propLabel }) =>
      ({ label, location, scale, rotation, type, propLabel }));
    fs.writeFileSync(spawnDataPath, JSON.stringify(exportData, null, 2));
    console.log(`\n  Wrote ${spawnDataPath}`);
    console.log(`\n  [DRY RUN] ${propList.length} props. No Unreal interaction.`);
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
    console.log('\n  Clearing existing prop actors...');
    const script = buildPropSpawnScript([], { clearExisting: true });
    const result = await runPython(script);
    console.log(`  ${result.ok ? '✓' : '✗'} Clear command sent`);
    console.log('═══════════════════════════════════════════════');
    return;
  }

  // Spawn
  console.log(`\n  Spawning ${propList.length} props via Python script...`);
  const script = buildPropSpawnScript(propList, { clearExisting: true });

  // Save script for debugging
  const scriptPath = path.join(terrainDir, 'props-spawn.py');
  fs.writeFileSync(scriptPath, script);
  console.log(`  Wrote ${scriptPath}`);

  const result = await runPython(script);
  if (result.ok) {
    console.log(`  ✓ Python script executed`);
  } else {
    console.error(`  ✗ Python execution failed: ${result.data?.error || 'unknown error'}`);
    console.error('  The generated script has been saved — try running it manually in UE Python console.');
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Spawned ${propList.length} props (${PROP_PREFIX}_*)`);
  console.log(`  To remove: node tools/spawn-props.js ${terrainDir} --year ${year} --clear`);
  console.log('═══════════════════════════════════════════════');
}

main().catch(e => { console.error(`\n  Error: ${e.message}`); process.exit(1); });
