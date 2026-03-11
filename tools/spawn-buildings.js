#!/usr/bin/env node
/**
 * spawn-buildings.js — Spawn 3D building massing from GeoJSON footprints
 *
 * Reads building footprints from terrain-data/{slug}/buildings.geojson,
 * converts them to Unreal spawn data (scaled cubes at correct positions),
 * and either spawns via Python script (RC API) or prints a summary.
 *
 * Usage:
 *   node tools/spawn-buildings.js terrain-data/manhattan-ny/
 *   node tools/spawn-buildings.js terrain-data/manhattan-ny/ --dry-run
 *   node tools/spawn-buildings.js terrain-data/manhattan-ny/ --clear
 *   node tools/spawn-buildings.js terrain-data/manhattan-ny/ --host http://localhost:30010
 *   node tools/spawn-buildings.js terrain-data/manhattan-ny/ --origin-lat 40.704 --origin-lon -74.013
 */

import fs from 'fs';
import path from 'path';
import { loadBuildingFootprints } from '../lib/sanborn.js';
import { buildingsToSpawnList, buildSpawnScript, ACTOR_PREFIX, FLOOR_HEIGHT_CM } from '../lib/buildingMassing.js';

// ─── Argument parsing ────────────────────────────────────────────

const args = process.argv.slice(2);

function getFlag(name, defaultValue) {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultValue;
  return args[idx + 1];
}

const hasFlag = (name) => args.includes(name);

const HOST = getFlag('--host', 'http://localhost:30010');
const DRY_RUN = hasFlag('--dry-run');
const CLEAR = hasFlag('--clear');
const originLat = getFlag('--origin-lat', null);
const originLon = getFlag('--origin-lon', null);

// First positional arg: terrain-data directory
const positionalArg = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));

if (!positionalArg) {
  console.error('Usage: node tools/spawn-buildings.js terrain-data/<slug>/  [options]');
  console.error('');
  console.error('Options:');
  console.error('  --host URL          Unreal RC API host (default: http://localhost:30010)');
  console.error('  --dry-run           Show spawn data without touching Unreal');
  console.error('  --clear             Remove all TM_Building_* actors from the level');
  console.error('  --origin-lat N      Override georeference latitude');
  console.error('  --origin-lon N      Override georeference longitude');
  process.exit(1);
}

// ─── RC API helpers ──────────────────────────────────────────────

async function rc(endpoint, body) {
  const res = await fetch(`${HOST}/remote/${endpoint}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : {} };
}

async function runPython(script) {
  return rc('object/call', {
    objectPath: '/Script/PythonScriptPlugin.Default__PythonScriptLibrary',
    functionName: 'ExecutePythonScript',
    parameters: { PythonScript: script }
  });
}

async function isUnrealReachable() {
  try {
    const res = await fetch(`${HOST}/remote/info`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch { return false; }
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(' Building Massing Spawner');
  console.log('═══════════════════════════════════════════════\n');

  // Read terrain metadata
  const terrainDir = positionalArg.replace(/\/$/, '');
  const metadataPath = path.join(terrainDir, 'metadata.json');

  if (!fs.existsSync(metadataPath)) {
    console.error(`  Error: No metadata.json found in ${terrainDir}/`);
    console.error('  Run fetch-dem.js first to create the terrain data directory.');
    process.exit(1);
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  console.log(`  Terrain:    ${metadata.name}`);
  console.log(`  Directory:  ${terrainDir}/`);

  // Read buildings GeoJSON
  const buildingsPath = path.join(terrainDir, 'buildings.geojson');
  if (!fs.existsSync(buildingsPath)) {
    console.error(`\n  Error: No buildings.geojson found in ${terrainDir}/`);
    console.error('  Create building footprints first (trace from Sanborn maps or import).');
    process.exit(1);
  }

  const validation = loadBuildingFootprints(buildingsPath);
  console.log(`  Buildings:  ${validation.features.length} features (${validation.valid} valid, ${validation.invalid} invalid)`);

  if (validation.invalid > 0) {
    console.error('\n  Validation warnings:');
    for (const w of validation.warnings) {
      console.error(`    ⚠ ${w}`);
    }
    if (validation.valid === 0) {
      console.error('\n  No valid buildings to spawn. Fix the GeoJSON and retry.');
      process.exit(1);
    }
  }

  const geojson = JSON.parse(fs.readFileSync(buildingsPath, 'utf8'));

  // Determine georeference origin
  let origin;
  if (originLat && originLon) {
    origin = { lat: parseFloat(originLat), lon: parseFloat(originLon) };
    console.log(`  Origin:     ${origin.lat}, ${origin.lon} (from flags)`);
  } else {
    // Use the center of the building footprints (not the terrain center,
    // since terrain may be centered elsewhere like Upper West Side)
    const lats = [];
    const lons = [];
    for (const f of geojson.features) {
      for (const [lon, lat] of f.geometry.coordinates[0]) {
        lats.push(lat);
        lons.push(lon);
      }
    }
    origin = {
      lat: lats.reduce((a, b) => a + b) / lats.length,
      lon: lons.reduce((a, b) => a + b) / lons.length
    };
    console.log(`  Origin:     ${origin.lat.toFixed(5)}, ${origin.lon.toFixed(5)} (centroid of footprints)`);
  }

  // Convert to spawn data
  const spawnList = buildingsToSpawnList(geojson, origin);

  // Compute stats
  const materials = {};
  const uses = {};
  let minStories = Infinity, maxStories = 0, totalHeight = 0;
  for (const b of spawnList) {
    materials[b.material] = (materials[b.material] || 0) + 1;
    uses[b.use] = (uses[b.use] || 0) + 1;
    if (b.stories < minStories) minStories = b.stories;
    if (b.stories > maxStories) maxStories = b.stories;
    totalHeight += b.stories * FLOOR_HEIGHT_CM;
  }

  console.log(`\n  ─── Spawn Summary ─────────────────────────`);
  console.log(`  Buildings:   ${spawnList.length}`);
  console.log(`  Stories:     ${minStories}–${maxStories} (avg ${(totalHeight / spawnList.length / FLOOR_HEIGHT_CM).toFixed(1)})`);
  console.log(`  Materials:   ${Object.entries(materials).map(([k, v]) => `${k}:${v}`).join(', ')}`);
  console.log(`  Uses:        ${Object.entries(uses).map(([k, v]) => `${k}:${v}`).join(', ')}`);
  console.log(`  Floor ht:    ${FLOOR_HEIGHT_CM}cm (${FLOOR_HEIGHT_CM / 100}m)`);

  if (DRY_RUN) {
    console.log('\n  [DRY RUN] Spawn data for each building:\n');
    for (const b of spawnList) {
      const [x, y, z] = b.location.map(v => v.toFixed(1));
      const [sx, sy, sz] = b.scale.map(v => v.toFixed(2));
      console.log(`  ${b.label}`);
      console.log(`    Location: [${x}, ${y}, ${z}]`);
      console.log(`    Scale:    [${sx}, ${sy}, ${sz}]`);
      console.log(`    Yaw:      ${b.rotation[1].toFixed(1)}°`);
      console.log(`    ${b.address ? `Address: ${b.address}` : ''}`);
    }

    // Write spawn data JSON for reference
    const spawnDataPath = path.join(terrainDir, 'buildings-spawn.json');
    fs.writeFileSync(spawnDataPath, JSON.stringify(spawnList, null, 2));
    console.log(`\n  Wrote ${spawnDataPath}`);
    console.log('═══════════════════════════════════════════════');
    return;
  }

  // ── Clear mode ──
  if (CLEAR) {
    console.log('\n  Clearing existing building actors...');
    const reachable = await isUnrealReachable();
    if (!reachable) {
      console.error(`  ✗ Cannot reach Unreal at ${HOST}`);
      process.exit(1);
    }

    const clearScript = [
      'import unreal',
      'all_actors = unreal.EditorLevelLibrary.get_all_level_actors()',
      'count = 0',
      'for actor in all_actors:',
      `    if actor.get_actor_label().startswith("${ACTOR_PREFIX}"):`,
      '        actor.destroy()',
      '        count += 1',
      'unreal.log(f"Cleared {count} building actors")'
    ].join('\n');

    const result = await runPython(clearScript);
    console.log(`  ${result.ok ? '✓' : '✗'} Clear command sent`);
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

  // Generate and execute Python script
  console.log(`\n  Spawning ${spawnList.length} buildings via Python script...`);
  const script = buildSpawnScript(spawnList, { clearExisting: true });

  // Write script for debugging
  const scriptPath = path.join(terrainDir, 'buildings-spawn.py');
  fs.writeFileSync(scriptPath, script);
  console.log(`  Wrote ${scriptPath}`);

  const result = await runPython(script);
  if (result.ok) {
    console.log(`  ✓ Python script executed`);
  } else {
    console.error(`  ✗ Python execution failed: ${result.data?.error || 'unknown error'}`);
    console.error('  The generated script has been saved — try running it manually in UE Python console.');
  }

  // Write spawn data JSON
  const spawnDataPath = path.join(terrainDir, 'buildings-spawn.json');
  fs.writeFileSync(spawnDataPath, JSON.stringify(spawnList, null, 2));
  console.log(`  Wrote ${spawnDataPath}`);

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Spawned ${spawnList.length} buildings (${ACTOR_PREFIX}_*)`);
  console.log(`  To remove: node tools/spawn-buildings.js ${terrainDir} --clear`);
  console.log('═══════════════════════════════════════════════');
}

main().catch(e => { console.error(`\n  Error: ${e.message}`); process.exit(1); });
