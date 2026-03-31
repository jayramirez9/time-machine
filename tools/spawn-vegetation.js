#!/usr/bin/env node
/**
 * spawn-vegetation.js — Spawn era-appropriate vegetation in Unreal
 *
 * Reads road splines from terrain-data, places street trees along sidewalks
 * and ground cover via grid scatter, filtered by era and region. Spawns via
 * Python RC API.
 *
 * Usage:
 *   node tools/spawn-vegetation.js terrain-data/manhattan-ny/ --year 1884 --region northeast_us
 *   node tools/spawn-vegetation.js terrain-data/manhattan-ny/ --year 1884 --dry-run
 *   node tools/spawn-vegetation.js terrain-data/manhattan-ny/ --year 1884 --only street_tree_american_elm
 *   node tools/spawn-vegetation.js terrain-data/manhattan-ny/ --year 1884 --exclude ground_cover_dandelion
 *   node tools/spawn-vegetation.js terrain-data/manhattan-ny/ --year 1978 --no-ground
 *   node tools/spawn-vegetation.js terrain-data/manhattan-ny/ --year 1884 --clear
 *   node tools/spawn-vegetation.js terrain-data/manhattan-ny/ --year 1884 --host http://192.168.68.50:30010
 */

import fs from 'node:fs';
import path from 'node:path';
import { placeStreetTrees, placeGroundCover, buildFoliageSpawnScript, TREE_PREFIX, FOLIAGE_PREFIX } from '../lib/foliagePlacement.js';
import { summarizeFoliageForYear } from '../lib/foliageCatalog.js';
import { createRcClient, parseSpawnArgs } from '../lib/rcHelpers.js';

// ─── Argument parsing ────────────────────────────────────────────

const { getFlag, hasFlag, positionalArg } = parseSpawnArgs(process.argv.slice(2));

const HOST = getFlag('--host', 'http://localhost:30010');
const DRY_RUN = hasFlag('--dry-run');
const CLEAR = hasFlag('--clear');
const NO_GROUND = hasFlag('--no-ground');
const YEAR = getFlag('--year', null);
const REGION = getFlag('--region', 'northeast_us');
const MONTH = getFlag('--month', '6');
const DENSITY = getFlag('--density', '0.5');
const ERA = getFlag('--era', null);
const ONLY = getFlag('--only', null);
const EXCLUDE = getFlag('--exclude', null);

if (!positionalArg || !YEAR) {
  console.error('Usage: node tools/spawn-vegetation.js terrain-data/<slug>/ --year <N> [options]');
  console.error('');
  console.error('Options:');
  console.error('  --year N            Target year (required)');
  console.error('  --region KEY        Region for species filtering (default: northeast_us)');
  console.error('  --month N           Month 1-12 for seasonal weighting (default: 6)');
  console.error('  --density N         Density multiplier 0-1 (default: 0.5)');
  console.error('  --era KEY           Street classification era override');
  console.error('  --host URL          Unreal RC API host (default: http://localhost:30010)');
  console.error('  --dry-run           Show placement stats without touching Unreal');
  console.error('  --clear             Remove all TM_Tree_* and TM_Foliage_* actors');
  console.error('  --no-ground         Skip ground cover placement');
  console.error('  --only <types>      Comma-separated list of foliage types to place');
  console.error('  --exclude <types>   Comma-separated list of foliage types to skip');
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
  console.log(' Vegetation Spawner');
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
  console.log(`  Region:     ${REGION}`);
  console.log(`  Month:      ${month}`);
  console.log(`  Density:    ${density}`);
  if (ERA) console.log(`  Era:        ${ERA}`);

  // Show available foliage for this year + region
  const summary = summarizeFoliageForYear(year, REGION);
  console.log(`  Foliage:    ${summary.total} types available for ${year} in ${REGION}`);
  console.log(`  Types:      ${summary.types.join(', ')}`);
  console.log(`  Categories: ${Object.entries(summary.byCategory).map(([k, v]) => `${k}:${v}`).join(', ')}`);
  if (only) console.log(`  Only:       ${only.join(', ')}`);
  if (exclude) console.log(`  Exclude:    ${exclude.join(', ')}`);
  if (NO_GROUND) console.log(`  Ground:     SKIPPED (--no-ground)`);
  console.log();

  const placementOpts = { year, region: REGION, month, density, era: ERA || undefined, only, exclude };

  // Place street trees
  const trees = placeStreetTrees(splines, placementOpts);

  // Place ground cover (unless --no-ground)
  let groundCover = [];
  if (!NO_GROUND) {
    // Derive bounds from spline extents
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const spline of splines) {
      for (const pt of spline.points) {
        if (pt[0] < minX) minX = pt[0];
        if (pt[1] < minY) minY = pt[1];
        if (pt[0] > maxX) maxX = pt[0];
        if (pt[1] > maxY) maxY = pt[1];
      }
    }
    // Pad bounds by 500cm (5m)
    const bounds = { minX: minX - 500, minY: minY - 500, maxX: maxX + 500, maxY: maxY + 500 };
    groundCover = placeGroundCover(bounds, placementOpts);
  }

  const allFoliage = [...trees, ...groundCover];

  // Stats
  const byType = {};
  for (const f of allFoliage) {
    byType[f.type] = (byType[f.type] || 0) + 1;
  }

  console.log(`  ─── Placement Summary ─────────────────────`);
  console.log(`  Street trees:   ${trees.length}`);
  console.log(`  Ground cover:   ${groundCover.length}`);
  console.log(`  Total:          ${allFoliage.length}`);
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${type}: ${count}`);
  }

  // Dry run
  if (DRY_RUN) {
    const spawnDataPath = path.join(terrainDir, 'vegetation-spawn.json');
    const exportData = allFoliage.map(({ label, location, scale, rotation, type, foliageLabel }) =>
      ({ label, location, scale, rotation, type, foliageLabel }));
    fs.writeFileSync(spawnDataPath, JSON.stringify(exportData, null, 2));
    console.log(`\n  Wrote ${spawnDataPath}`);
    console.log(`\n  [DRY RUN] ${allFoliage.length} vegetation items. No Unreal interaction.`);
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
    console.log('\n  Clearing existing vegetation actors...');
    const script = buildFoliageSpawnScript([], { clearExisting: true });
    const result = await runPython(script);
    console.log(`  ${result.ok ? '✓' : '✗'} Clear command sent`);
    console.log('═══════════════════════════════════════════════');
    return;
  }

  // Spawn
  console.log(`\n  Spawning ${allFoliage.length} vegetation items via Python script...`);
  const script = buildFoliageSpawnScript(allFoliage, { clearExisting: true });

  // Save script for debugging
  const scriptPath = path.join(terrainDir, 'vegetation-spawn.py');
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
  console.log(`  Spawned ${allFoliage.length} vegetation items (${TREE_PREFIX}_* / ${FOLIAGE_PREFIX}_*)`);
  console.log(`  To remove: node tools/spawn-vegetation.js ${terrainDir} --year ${year} --clear`);
  console.log('═══════════════════════════════════════════════');
}

main().catch(e => { console.error(`\n  Error: ${e.message}`); process.exit(1); });
