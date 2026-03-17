#!/usr/bin/env node
/**
 * spawn-meshes.js — Import Meshy-generated 3D meshes into Unreal
 *
 * Reads GENERATION_MANIFEST.json files from mesh-data/, matches each mesh
 * to its building footprint in buildings.geojson, and spawns textured
 * StaticMeshActors in Unreal at correct geo positions via RC API.
 *
 * FBX files are transferred from Mac to PC via the daemon's HTTP server
 * (same pattern as terrain import). The daemon must be running.
 *
 * Usage:
 *   node tools/spawn-meshes.js terrain-data/manhattan-ny/
 *   node tools/spawn-meshes.js terrain-data/manhattan-ny/ --dry-run
 *   node tools/spawn-meshes.js terrain-data/manhattan-ny/ --clear
 *   node tools/spawn-meshes.js terrain-data/manhattan-ny/ --host http://100.96.244.16:30010
 *   node tools/spawn-meshes.js terrain-data/manhattan-ny/ --daemon-url http://100.68.243.96:3000
 */

import fs from 'node:fs';
import path from 'node:path';
import { manifestToSpawnData, buildMeshImportScript, buildMeshClearScript, ACTOR_PREFIX } from '../lib/meshImport.js';
import { createRcClient, parseSpawnArgs } from '../lib/rcHelpers.js';

// ─── Argument parsing ────────────────────────────────────────────

const { getFlag, hasFlag, positionalArg } = parseSpawnArgs(process.argv.slice(2));

const HOST = getFlag('--host', 'http://localhost:30010');
const DAEMON_URL = getFlag('--daemon-url', 'http://localhost:3000');
const DRY_RUN = hasFlag('--dry-run');
const CLEAR = hasFlag('--clear');
const INDEX_FILTER = getFlag('--index', null);

if (!positionalArg) {
  console.error('Usage: node tools/spawn-meshes.js terrain-data/<slug>/ [options]');
  console.error('');
  console.error('Options:');
  console.error('  --host URL          Unreal RC API host (default: http://localhost:30010)');
  console.error('  --daemon-url URL    Mac daemon URL reachable from PC (default: http://localhost:3000)');
  console.error('  --dry-run           Show what would be imported without touching Unreal');
  console.error('  --clear             Remove all TM_Mesh_* actors from the level');
  console.error('  --index N           Import only the mesh for building index N');
  process.exit(1);
}

const { rc, runPython, isUnrealReachable } = createRcClient(HOST);

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(' Mesh Import Spawner');
  console.log('═══════════════════════════════════════════════\n');

  const terrainDir = positionalArg.replace(/\/$/, '');

  // Read buildings.geojson for position data
  const buildingsPath = path.join(terrainDir, 'buildings.geojson');
  if (!fs.existsSync(buildingsPath)) {
    console.error(`  Error: No buildings.geojson found in ${terrainDir}/`);
    process.exit(1);
  }

  const geojson = JSON.parse(fs.readFileSync(buildingsPath, 'utf8'));
  const features = geojson.features || [];
  console.log(`  Buildings:  ${features.length} footprints in GeoJSON`);

  // Compute georeference origin from footprint centroid
  const lats = [];
  const lons = [];
  for (const f of features) {
    for (const [lon, lat] of f.geometry.coordinates[0]) {
      lats.push(lat);
      lons.push(lon);
    }
  }
  const origin = {
    lat: lats.reduce((a, b) => a + b) / lats.length,
    lon: lons.reduce((a, b) => a + b) / lons.length,
  };
  console.log(`  Origin:     ${origin.lat.toFixed(5)}, ${origin.lon.toFixed(5)}`);

  // Scan mesh-data/ for GENERATION_MANIFEST.json files
  const meshDataDir = 'mesh-data';
  if (!fs.existsSync(meshDataDir)) {
    console.error(`  Error: No mesh-data/ directory found.`);
    console.error('  Generate meshes first with texture-buildings.js or generate-building-refs.js.');
    process.exit(1);
  }

  const meshDirs = fs.readdirSync(meshDataDir)
    .map(name => path.join(meshDataDir, name))
    .filter(p => fs.statSync(p).isDirectory())
    .filter(p => fs.existsSync(path.join(p, 'GENERATION_MANIFEST.json')));

  if (meshDirs.length === 0) {
    console.error('  Error: No meshes found (no GENERATION_MANIFEST.json files in mesh-data/).');
    process.exit(1);
  }

  console.log(`  Meshes:     ${meshDirs.length} generated models found`);

  // Build spawn entries by matching manifests to building footprints
  const spawnList = [];
  const unmatched = [];

  for (const meshDir of meshDirs) {
    const manifest = JSON.parse(fs.readFileSync(path.join(meshDir, 'GENERATION_MANIFEST.json'), 'utf8'));
    const buildingIndex = manifest.buildingIndex;

    // Match to building feature by index
    const feature = (buildingIndex != null && buildingIndex < features.length)
      ? features[buildingIndex]
      : null;

    if (!feature) {
      unmatched.push({ meshDir, manifest });
      continue;
    }

    const entry = manifestToSpawnData(manifest, feature, origin, meshDir);
    spawnList.push(entry);
  }

  // Apply index filter
  const filtered = INDEX_FILTER != null
    ? spawnList.filter(e => e.buildingIndex === parseInt(INDEX_FILTER, 10))
    : spawnList;

  if (unmatched.length > 0) {
    console.log(`  Unmatched:  ${unmatched.length} meshes (no matching building footprint)`);
    for (const u of unmatched) {
      console.log(`    ⚠ ${path.basename(u.meshDir)} — buildingIndex ${u.manifest.buildingIndex ?? 'missing'}`);
    }
  }

  // Summary
  console.log(`\n  ─── Import Summary ─────────────────────────`);
  console.log(`  To import:  ${filtered.length} meshes`);

  const pipelines = {};
  const qualities = {};
  for (const e of filtered) {
    pipelines[e.pipeline] = (pipelines[e.pipeline] || 0) + 1;
    qualities[e.quality] = (qualities[e.quality] || 0) + 1;
  }
  console.log(`  Pipelines:  ${Object.entries(pipelines).map(([k, v]) => `${k}:${v}`).join(', ')}`);
  console.log(`  Quality:    ${Object.entries(qualities).map(([k, v]) => `${k}:${v}`).join(', ')}`);
  console.log(`  PBR:        ${filtered.filter(e => e.hasPbr).length} with PBR textures`);

  // Dry run
  if (DRY_RUN) {
    console.log('\n  [DRY RUN] Mesh import plan:\n');
    for (const e of filtered) {
      const [x, y, z] = e.location.map(v => v.toFixed(1));
      console.log(`  ${e.label}`);
      console.log(`    Mesh:     ${e.meshDir}/model.${e.format}`);
      console.log(`    Asset:    ${ACTOR_PREFIX}/${e.assetName}`);
      console.log(`    Location: [${x}, ${y}, ${z}]`);
      console.log(`    Yaw:      ${e.rotation[1].toFixed(1)}°`);
      console.log(`    Style:    ${e.styleName || 'unknown'}`);
      console.log(`    Pipeline: ${e.pipeline}`);
      console.log(`    PBR:      ${e.hasPbr}`);
    }

    // Write spawn data for reference
    const spawnDataPath = path.join(terrainDir, 'meshes-spawn.json');
    fs.writeFileSync(spawnDataPath, JSON.stringify(filtered, (key, value) => {
      if (key === 'feature') return undefined; // skip GeoJSON blob
      return value;
    }, 2));
    console.log(`\n  Wrote ${spawnDataPath}`);
    console.log('═══════════════════════════════════════════════');
    return;
  }

  // Check Unreal connectivity
  console.log('\n  Checking Unreal connectivity...');
  const reachable = await isUnrealReachable();
  if (!reachable) {
    console.error(`  ✗ Cannot reach Unreal at ${HOST}`);
    console.error('  Use --dry-run to preview import plan without Unreal.');
    process.exit(1);
  }
  console.log('  ✓ Unreal Remote Control API reachable');

  // Clear mode
  if (CLEAR) {
    console.log('\n  Clearing existing mesh actors...');
    const result = await runPython(buildMeshClearScript());
    console.log(`  ${result.ok ? '✓' : '✗'} Clear command sent`);
    console.log('═══════════════════════════════════════════════');
    return;
  }

  // Generate and execute import script
  console.log(`  Daemon URL: ${DAEMON_URL}`);
  console.log(`\n  Importing ${filtered.length} meshes via Python script...`);

  const script = buildMeshImportScript(filtered, {
    daemonUrl: DAEMON_URL,
    clearExisting: true,
  });

  // Save script for debugging
  const scriptPath = path.join(terrainDir, 'meshes-import.py');
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
  console.log(`  Imported ${filtered.length} meshes (${ACTOR_PREFIX}_*)`);
  console.log(`  To remove: node tools/spawn-meshes.js ${terrainDir} --clear`);
  console.log('═══════════════════════════════════════════════');
}

main().catch(e => { console.error(`\n  Error: ${e.message}`); process.exit(1); });
