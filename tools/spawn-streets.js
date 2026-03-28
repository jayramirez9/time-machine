#!/usr/bin/env node
/**
 * spawn-streets.js — Spawn era-appropriate street layout in Unreal
 *
 * Reads road spline data from terrain-data/{slug}/roads-splines.json,
 * classifies each road for the target era (surface, width, lamps),
 * and spawns street slabs, sidewalks, and gas lamp PointLights via
 * Python script (RC API).
 *
 * Usage:
 *   node tools/spawn-streets.js terrain-data/manhattan-ny/
 *   node tools/spawn-streets.js terrain-data/manhattan-ny/ --dry-run
 *   node tools/spawn-streets.js terrain-data/manhattan-ny/ --clear
 *   node tools/spawn-streets.js terrain-data/manhattan-ny/ --no-lamps
 *   node tools/spawn-streets.js terrain-data/manhattan-ny/ --no-sidewalks
 *   node tools/spawn-streets.js terrain-data/manhattan-ny/ --era nyc_1884
 *   node tools/spawn-streets.js terrain-data/manhattan-ny/ --host http://localhost:30010
 */

import fs from 'fs';
import path from 'path';
import { streetsToSpawnList, buildStreetSpawnScript, STREET_PREFIX, SIDEWALK_PREFIX } from '../lib/streetMeshing.js';
import { placeLamps, buildLampSpawnScript, LAMP_PREFIX } from '../lib/lampPlacement.js';
import { SURFACE_TYPES } from '../lib/streetLayout.js';
import { createRcClient, parseSpawnArgs } from '../lib/rcHelpers.js';

// ─── Argument parsing ────────────────────────────────────────────

const { getFlag, hasFlag, positionalArg } = parseSpawnArgs(process.argv.slice(2));

const HOST = getFlag('--host', 'http://localhost:30010');
const DAEMON_URL = getFlag('--daemon-url', 'http://localhost:3000');
const DRY_RUN = hasFlag('--dry-run');
const CLEAR = hasFlag('--clear');
const NO_LAMPS = hasFlag('--no-lamps');
const NO_SIDEWALKS = hasFlag('--no-sidewalks');
const ERA = getFlag('--era', 'nyc_1884');
const originLat = getFlag('--origin-lat', null);
const originLon = getFlag('--origin-lon', null);

if (!positionalArg) {
  console.error('Usage: node tools/spawn-streets.js terrain-data/<slug>/  [options]');
  console.error('');
  console.error('Options:');
  console.error('  --host URL          Unreal RC API host (default: http://localhost:30010)');
  console.error('  --daemon-url URL    Mac daemon URL reachable from PC (default: http://localhost:3000)');
  console.error('  --dry-run           Show spawn data without touching Unreal');
  console.error('  --clear             Remove all TM_Street_*/TM_Sidewalk_*/TM_Lamp_* actors');
  console.error('  --no-lamps          Skip gas lamp spawning');
  console.error('  --no-sidewalks      Skip sidewalk spawning');
  console.error('  --era ID            Era rule set (default: nyc_1884)');
  console.error('  --origin-lat N      Override georeference latitude');
  console.error('  --origin-lon N      Override georeference longitude');
  process.exit(1);
}

const { runPython, isUnrealReachable } = createRcClient(HOST);

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(' Street Layout Spawner');
  console.log('═══════════════════════════════════════════════\n');

  const terrainDir = positionalArg.replace(/\/$/, '');
  const metadataPath = path.join(terrainDir, 'metadata.json');
  const splinesPath = path.join(terrainDir, 'roads-splines.json');

  // Validate inputs
  if (!fs.existsSync(metadataPath)) {
    console.error(`  Error: No metadata.json found in ${terrainDir}/`);
    console.error('  Run fetch-dem.js first to create the terrain data directory.');
    process.exit(1);
  }

  if (!fs.existsSync(splinesPath)) {
    console.error(`  Error: No roads-splines.json found in ${terrainDir}/`);
    console.error('  Run fetch-vectors.js first to fetch road data.');
    process.exit(1);
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  const splines = JSON.parse(fs.readFileSync(splinesPath, 'utf8'));

  console.log(`  Terrain:    ${metadata.name}`);
  console.log(`  Directory:  ${terrainDir}/`);
  console.log(`  Era:        ${ERA}`);
  console.log(`  Splines:    ${splines.length} road paths`);

  // ── Clear mode ──
  if (CLEAR) {
    console.log('\n  Clearing existing street actors...');
    const reachable = await isUnrealReachable();
    if (!reachable) {
      console.error(`  ✗ Cannot reach Unreal at ${HOST}`);
      process.exit(1);
    }

    // Clear streets + sidewalks via street script, lamps via lamp script
    const streetClear = buildStreetSpawnScript([], { clearExisting: true });
    const lampClear = buildLampSpawnScript([], { clearExisting: true });
    const r1 = await runPython(streetClear);
    const r2 = await runPython(lampClear);
    console.log(`  ${r1.ok && r2.ok ? '✓' : '✗'} Clear command sent`);
    console.log('═══════════════════════════════════════════════');
    return;
  }

  // ── Generate spawn data ──
  const streetOpts = { era: ERA, includeSidewalks: !NO_SIDEWALKS };
  const streetSpawnList = streetsToSpawnList(splines, streetOpts);

  // Compute surface stats
  const surfaceCounts = {};
  let streetCount = 0, sidewalkCount = 0;
  for (const s of streetSpawnList) {
    if (s.type === 'street') {
      streetCount++;
      surfaceCounts[s.surface] = (surfaceCounts[s.surface] || 0) + 1;
    } else {
      sidewalkCount++;
    }
  }

  console.log(`\n  ─── Street Summary ────────────────────────`);
  console.log(`  Streets:     ${streetCount} segments`);
  console.log(`  Sidewalks:   ${sidewalkCount} segments`);
  console.log(`  Surfaces:    ${Object.entries(surfaceCounts).map(([k, v]) => `${k}:${v}`).join(', ')}`);

  // Verify no asphalt
  if (surfaceCounts.asphalt) {
    console.error('  ✗ ERROR: Asphalt surface detected — anachronistic for this era');
    process.exit(1);
  }

  // Lamps
  let lampList = [];
  if (!NO_LAMPS) {
    lampList = placeLamps(splines, { era: ERA });

    const lampCategories = {};
    for (const l of lampList) {
      lampCategories[l.category] = (lampCategories[l.category] || 0) + 1;
    }

    console.log(`  Gas lamps:   ${lampList.length} lights`);
    console.log(`  Lamp roads:  ${Object.entries(lampCategories).map(([k, v]) => `${k}:${v}`).join(', ')}`);
  } else {
    console.log(`  Gas lamps:   skipped (--no-lamps)`);
  }

  console.log(`  Total:       ${streetSpawnList.length + lampList.length} actors`);

  if (DRY_RUN) {
    console.log('\n  [DRY RUN] Sample street segments:\n');

    // Show first 10 streets
    const sample = streetSpawnList.filter(s => s.type === 'street').slice(0, 10);
    for (const s of sample) {
      const [x, y, z] = s.location.map(v => v.toFixed(0));
      console.log(`  ${s.label}  [${x}, ${y}, ${z}]  ${s.surface}  ${s.widthM}m`);
    }
    if (streetCount > 10) console.log(`  ... and ${streetCount - 10} more street segments`);

    if (lampList.length > 0) {
      console.log('\n  Sample lamps:\n');
      const lampSample = lampList.slice(0, 10);
      for (const l of lampSample) {
        const [x, y, z] = l.location.map(v => v.toFixed(0));
        console.log(`  ${l.label}  [${x}, ${y}, ${z}]`);
      }
      if (lampList.length > 10) console.log(`  ... and ${lampList.length - 10} more lamps`);
    }

    // Write spawn data JSON
    const spawnDataPath = path.join(terrainDir, 'streets-spawn.json');
    const output = {
      era: ERA,
      streets: streetSpawnList,
      lamps: lampList,
      summary: {
        streetSegments: streetCount,
        sidewalkSegments: sidewalkCount,
        lamps: lampList.length,
        surfaces: surfaceCounts
      }
    };
    fs.writeFileSync(spawnDataPath, JSON.stringify(output, null, 2));
    console.log(`\n  Wrote ${spawnDataPath}`);
    console.log('═══════════════════════════════════════════════');
    return;
  }

  // ── Spawn mode ──
  console.log('\n  Checking Unreal connectivity...');
  const reachable = await isUnrealReachable();
  if (!reachable) {
    console.error(`  ✗ Cannot reach Unreal at ${HOST}`);
    console.error('  Use --dry-run to preview spawn data without Unreal.');
    process.exit(1);
  }
  console.log('  ✓ Unreal Remote Control API reachable');

  // Generate and execute street spawn script
  console.log(`\n  Spawning ${streetSpawnList.length} street elements...`);
  const streetScript = buildStreetSpawnScript(streetSpawnList, { clearExisting: true, era: ERA, daemonUrl: DAEMON_URL });

  const streetScriptPath = path.join(terrainDir, 'streets-spawn.py');
  fs.writeFileSync(streetScriptPath, streetScript);
  console.log(`  Wrote ${streetScriptPath}`);

  const streetResult = await runPython(streetScript);
  console.log(`  ${streetResult.ok ? '✓' : '✗'} Street script executed`);

  // Generate and execute lamp spawn script
  if (lampList.length > 0) {
    console.log(`\n  Spawning ${lampList.length} gas lamps...`);
    const lampScript = buildLampSpawnScript(lampList, { clearExisting: true });

    const lampScriptPath = path.join(terrainDir, 'lamps-spawn.py');
    fs.writeFileSync(lampScriptPath, lampScript);
    console.log(`  Wrote ${lampScriptPath}`);

    const lampResult = await runPython(lampScript);
    console.log(`  ${lampResult.ok ? '✓' : '✗'} Lamp script executed`);
  }

  // Write spawn data JSON
  const spawnDataPath = path.join(terrainDir, 'streets-spawn.json');
  const output = {
    era: ERA,
    streets: streetSpawnList,
    lamps: lampList,
    summary: {
      streetSegments: streetCount,
      sidewalkSegments: sidewalkCount,
      lamps: lampList.length,
      surfaces: surfaceCounts
    }
  };
  fs.writeFileSync(spawnDataPath, JSON.stringify(output, null, 2));
  console.log(`  Wrote ${spawnDataPath}`);

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Spawned ${streetSpawnList.length} street elements + ${lampList.length} gas lamps`);
  console.log(`  To remove: node tools/spawn-streets.js ${terrainDir} --clear`);
  console.log('═══════════════════════════════════════════════');
}

main().catch(e => { console.error(`\n  Error: ${e.message}`); process.exit(1); });
