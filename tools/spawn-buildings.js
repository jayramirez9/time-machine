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
import { buildingsToSpawnList, buildSpawnScript, filterBuildingsByYear, ACTOR_PREFIX } from '../lib/buildingMassing.js';
import { classifyBuilding, listEras, getEraInfo, resolveEra } from '../lib/architectureStyles.js';
import { createRcClient, parseSpawnArgs } from '../lib/rcHelpers.js';

// ─── Argument parsing ────────────────────────────────────────────

const { getFlag, hasFlag, positionalArg } = parseSpawnArgs(process.argv.slice(2));

const HOST = getFlag('--host', 'http://localhost:30010');
const DAEMON_URL = getFlag('--daemon-url', 'http://localhost:3000');
const DRY_RUN = hasFlag('--dry-run');
const CLEAR = hasFlag('--clear');
const ERA_FLAG = getFlag('--era', null);
const YEAR_FLAG = getFlag('--year', null);
const originLat = getFlag('--origin-lat', null);
const originLon = getFlag('--origin-lon', null);

// Resolve era: explicit --era > --year > current year
const ERA = ERA_FLAG || (YEAR_FLAG ? resolveEra(parseInt(YEAR_FLAG, 10)) : null);
const CLASSIFY_OPTS = ERA_FLAG ? { era: ERA_FLAG }
  : YEAR_FLAG ? { year: parseInt(YEAR_FLAG, 10) }
  : { year: new Date().getFullYear() };

if (!positionalArg) {
  console.error('Usage: node tools/spawn-buildings.js terrain-data/<slug>/  [options]');
  console.error('');
  console.error('Options:');
  console.error('  --host URL          Unreal RC API host (default: http://localhost:30010)');
  console.error('  --daemon-url URL    Mac daemon URL reachable from PC (default: http://localhost:3000)');
  console.error('  --dry-run           Show spawn data without touching Unreal');
  console.error('  --clear             Remove all TM_Building_* actors from the level');
  console.error('  --origin-lat N      Override georeference latitude');
  console.error('  --origin-lon N      Override georeference longitude');
  console.error(`  --era KEY           Architectural era. Available: ${listEras().join(', ')}`);
  console.error('  --year N            Year for automatic era resolution (default: current year)');
  process.exit(1);
}

const { runPython, isUnrealReachable } = createRcClient(HOST);

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

  let geojson = JSON.parse(fs.readFileSync(buildingsPath, 'utf8'));

  // Filter buildings by year if --year is specified
  const targetYear = YEAR_FLAG ? parseInt(YEAR_FLAG, 10) : null;
  if (targetYear) {
    const result = filterBuildingsByYear(geojson, targetYear);
    geojson = result.filtered;
    console.log(`  Year filter: ${targetYear} → ${result.included} included, ${result.excluded} excluded, ${result.undated} undated (pass-through)`);
  }

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

  // Classify and convert to spawn data
  const resolvedEra = ERA || resolveEra(new Date().getFullYear());
  const eraInfo = getEraInfo(resolvedEra);
  const eraSource = ERA_FLAG ? '(from --era)' : YEAR_FLAG ? `(year ${YEAR_FLAG})` : '(current year)';
  console.log(`  Era:        ${resolvedEra}${eraInfo ? ` (${eraInfo.label})` : ''} ${eraSource}`);

  const classifyFn = (feature) => {
    const props = feature.properties || {};
    // Manual style override in GeoJSON properties trumps classifier
    if (props.style) {
      const { classifyBuilding: _ , ...rest } = classifyBuilding(props.material || 'brick', props.use || 'unknown', props.stories || 3, CLASSIFY_OPTS);
      // Still classify to get params, but override styleName
      return { ...rest, styleName: props.style };
    }
    const result = classifyBuilding(props.material || 'brick', props.use || 'unknown', props.stories || 3, CLASSIFY_OPTS);
    return result;
  };

  const spawnList = buildingsToSpawnList(geojson, origin, { classifyFn });

  // Compute stats
  const materials = {};
  const uses = {};
  const styles = {};
  let minStories = Infinity, maxStories = 0, totalStories = 0;
  for (const b of spawnList) {
    materials[b.material] = (materials[b.material] || 0) + 1;
    uses[b.use] = (uses[b.use] || 0) + 1;
    if (b.styleName) styles[b.styleName] = (styles[b.styleName] || 0) + 1;
    if (b.stories < minStories) minStories = b.stories;
    if (b.stories > maxStories) maxStories = b.stories;
    totalStories += b.stories;
  }

  console.log(`\n  ─── Spawn Summary ─────────────────────────`);
  console.log(`  Buildings:   ${spawnList.length}`);
  console.log(`  Stories:     ${minStories}–${maxStories} (avg ${(totalStories / spawnList.length).toFixed(1)})`);
  console.log(`  Materials:   ${Object.entries(materials).map(([k, v]) => `${k}:${v}`).join(', ')}`);
  console.log(`  Uses:        ${Object.entries(uses).map(([k, v]) => `${k}:${v}`).join(', ')}`);
  console.log(`  Styles:      ${Object.entries(styles).map(([k, v]) => `${k}:${v}`).join(', ') || '(none classified)'}`);

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

    const result = await runPython(buildSpawnScript([], { clearExisting: true }));
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
  const script = buildSpawnScript(spawnList, { clearExisting: true, era: resolvedEra, daemonUrl: DAEMON_URL });

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
