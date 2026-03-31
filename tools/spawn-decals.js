#!/usr/bin/env node
/**
 * spawn-decals.js — Spawn procedural weathering decals in Unreal
 *
 * Places facade decals (water stains, soot, dirt, cracks, moss) on building
 * surfaces and ground grime (puddle stains, horse waste, oil spots, mud) along
 * streets. Decal density scales with building age and material type.
 *
 * Usage:
 *   node tools/spawn-decals.js terrain-data/manhattan-ny/ --year 1884
 *   node tools/spawn-decals.js terrain-data/manhattan-ny/ --year 1884 --density 0.8
 *   node tools/spawn-decals.js terrain-data/manhattan-ny/ --year 1884 --only water_stain,soot_smoke
 *   node tools/spawn-decals.js terrain-data/manhattan-ny/ --year 1884 --no-ground --dry-run
 *   node tools/spawn-decals.js terrain-data/manhattan-ny/ --year 1884 --clear
 */

import fs from 'node:fs';
import path from 'node:path';
import { placeDecals, placeGroundGrime, buildDecalSpawnScript, DECAL_PREFIX, GRIME_PREFIX } from '../lib/decalPlacement.js';
import { buildingsToSpawnList } from '../lib/buildingMassing.js';
import { classifyBuilding, resolveEra } from '../lib/architectureStyles.js';
import { summarizeDecalsForYear } from '../lib/decalCatalog.js';
import { createRcClient, parseSpawnArgs } from '../lib/rcHelpers.js';

// ─── Argument parsing ────────────────────────────────────────────

const { getFlag, hasFlag, positionalArg } = parseSpawnArgs(process.argv.slice(2));

const HOST = getFlag('--host', 'http://localhost:30010');
const DRY_RUN = hasFlag('--dry-run');
const CLEAR = hasFlag('--clear');
const NO_GROUND = hasFlag('--no-ground');
const YEAR = getFlag('--year', null);
const DENSITY = parseFloat(getFlag('--density', '0.5'));
const ONLY = getFlag('--only', null);
const EXCLUDE = getFlag('--exclude', null);

if (!positionalArg || !YEAR) {
  console.error('Usage: node tools/spawn-decals.js terrain-data/<slug>/ --year <N> [options]');
  console.error('');
  console.error('Options:');
  console.error('  --year N            Target year (required)');
  console.error('  --density N         Density multiplier 0-1 (default: 0.5)');
  console.error('  --host URL          Unreal RC API host (default: http://localhost:30010)');
  console.error('  --dry-run           Show placement stats without touching Unreal');
  console.error('  --clear             Remove all TM_Decal_* and TM_Grime_* actors');
  console.error('  --no-ground         Skip ground grime, facade decals only');
  console.error('  --only <types>      Comma-separated list of decal types to place');
  console.error('  --exclude <types>   Comma-separated list of decal types to skip');
  process.exit(1);
}

const year = parseInt(YEAR, 10);
const terrainDir = positionalArg;
const onlyList = ONLY ? ONLY.split(',') : null;
const excludeList = EXCLUDE ? EXCLUDE.split(',') : null;

// ─── Main ───────────────────────────────────────────────────────

console.log('═══════════════════════════════════════════════');
console.log(`  Decal Spawner — ${terrainDir}`);
console.log(`  Year: ${year}  |  Density: ${DENSITY}`);
console.log('═══════════════════════════════════════════════');

// Summary of available decals for this year
const summary = summarizeDecalsForYear(year);
console.log(`\n  Available decal types for ${year}:`);
console.log(`    Facade: ${summary.facadeTypes.join(', ') || 'none'}`);
console.log(`    Ground: ${summary.groundTypes.join(', ') || 'none'}`);

const { rc, runPython } = createRcClient(HOST);

// Handle --clear
if (CLEAR) {
  if (DRY_RUN) {
    console.log(`\n  [dry-run] Would clear ${DECAL_PREFIX}_* and ${GRIME_PREFIX}_* actors`);
    process.exit(0);
  }
  const script = buildDecalSpawnScript([], { clearExisting: true });
  const result = await runPython(script);
  console.log(`  ${result.ok ? '✓' : '✗'} Clear command sent`);
  console.log('═══════════════════════════════════════════════');
  process.exit(result.ok ? 0 : 1);
}

// Load building footprints
const buildingsPath = path.join(terrainDir, 'buildings.geojson');
let facadeDecals = [];

if (fs.existsSync(buildingsPath)) {
  const geojson = JSON.parse(fs.readFileSync(buildingsPath, 'utf-8'));
  const resolvedEra = resolveEra(year);

  // Build spawn list with style classification
  const origin = geojson.origin || { lat: 40.7043, lon: -74.0112 };
  const spawnList = buildingsToSpawnList(geojson, origin, {
    classifyFn: (f, i) => {
      const style = classifyBuilding(f, { year });
      return style || {};
    }
  });

  console.log(`\n  Buildings loaded: ${spawnList.length}`);
  const withYear = spawnList.filter(b => b.yearBuilt != null);
  if (withYear.length > 0) {
    const ages = withYear.map(b => year - b.yearBuilt);
    console.log(`  Buildings with yearBuilt: ${withYear.length} (age ${Math.min(...ages)}-${Math.max(...ages)} years)`);
  }

  // Place facade decals
  facadeDecals = placeDecals(spawnList, {
    year,
    density: DENSITY,
    only: onlyList,
    exclude: excludeList,
  });

  console.log(`\n  Facade decals placed: ${facadeDecals.length}`);
  const byType = {};
  for (const d of facadeDecals) {
    byType[d.type] = (byType[d.type] || 0) + 1;
  }
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${type}: ${count}`);
  }
} else {
  console.log(`\n  No buildings.geojson found — skipping facade decals`);
}

// Load road splines for ground grime
let grimeDecals = [];

if (!NO_GROUND) {
  const splinesPath = path.join(terrainDir, 'roads-splines.json');
  if (fs.existsSync(splinesPath)) {
    const splines = JSON.parse(fs.readFileSync(splinesPath, 'utf-8'));

    grimeDecals = placeGroundGrime(splines, {
      year,
      density: DENSITY,
      only: onlyList,
      exclude: excludeList,
    });

    console.log(`\n  Ground grime placed: ${grimeDecals.length}`);
    const byType = {};
    for (const d of grimeDecals) {
      byType[d.type] = (byType[d.type] || 0) + 1;
    }
    for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${type}: ${count}`);
    }
  } else {
    console.log(`\n  No roads-splines.json found — skipping ground grime`);
  }
}

const allDecals = [...facadeDecals, ...grimeDecals];
console.log(`\n  Total decals: ${allDecals.length}`);

if (DRY_RUN || allDecals.length === 0) {
  console.log('═══════════════════════════════════════════════');
  process.exit(0);
}

// Generate and execute Python script
console.log(`\n  Spawning ${allDecals.length} decals via Python script...`);
const script = buildDecalSpawnScript(allDecals, { clearExisting: true });

// Write script for debugging
const scriptPath = path.join(terrainDir, 'decals-spawn.py');
fs.writeFileSync(scriptPath, script);
console.log(`  Script saved: ${scriptPath}`);

const result = await runPython(script);
console.log(`  ${result.ok ? '✓' : '✗'} Spawn complete`);
console.log('═══════════════════════════════════════════════');
process.exit(result.ok ? 0 : 1);
