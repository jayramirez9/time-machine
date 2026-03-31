#!/usr/bin/env node
/**
 * spawn-particles.js — Spawn atmospheric particles and lighting effects in Unreal
 *
 * Reads road splines, building data, and lamp positions from terrain-data,
 * places chimney smoke, street dust, lamp glow, rain splashes, and window
 * lights filtered by era and weather conditions. Spawns via Python RC API.
 *
 * Usage:
 *   node tools/spawn-particles.js terrain-data/manhattan-ny/ --year 1884
 *   node tools/spawn-particles.js terrain-data/manhattan-ny/ --year 1884 --dry-run
 *   node tools/spawn-particles.js terrain-data/manhattan-ny/ --year 1884 --only chimney_smoke,lamp_glow
 *   node tools/spawn-particles.js terrain-data/manhattan-ny/ --year 1884 --exclude window_glow
 *   node tools/spawn-particles.js terrain-data/manhattan-ny/ --year 1884 --clear
 *   node tools/spawn-particles.js terrain-data/manhattan-ny/ --year 1884 --host http://192.168.68.50:30010
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  placeAllParticles, buildParticleSpawnScript, PARTICLE_PREFIX,
} from '../lib/particlePlacement.js';
import { summarizeParticlesForYear } from '../lib/particleCatalog.js';
import { placeLamps } from '../lib/lampPlacement.js';
import { buildingsToSpawnList } from '../lib/buildingMassing.js';
import { createRcClient, parseSpawnArgs } from '../lib/rcHelpers.js';

// ─── Argument parsing ───────────────────────────────────────────

const { getFlag, hasFlag, positionalArg } = parseSpawnArgs(process.argv.slice(2));

const HOST = getFlag('--host', 'http://localhost:30010');
const DRY_RUN = hasFlag('--dry-run');
const CLEAR = hasFlag('--clear');
const YEAR = getFlag('--year', null);
const MONTH = getFlag('--month', '6');
const DENSITY = getFlag('--density', '0.5');
const ONLY = getFlag('--only', null);
const EXCLUDE = getFlag('--exclude', null);

if (!positionalArg || !YEAR) {
  console.error('Usage: node tools/spawn-particles.js terrain-data/<slug>/ --year <N> [options]');
  console.error('');
  console.error('Options:');
  console.error('  --year N            Target year (required)');
  console.error('  --month N           Month 1-12 (default: 6)');
  console.error('  --density N         Density multiplier 0-1 (default: 0.5)');
  console.error('  --host URL          Unreal RC API host (default: http://localhost:30010)');
  console.error('  --dry-run           Show placement stats without touching Unreal');
  console.error('  --clear             Remove all TM_Particle_* actors from the level');
  console.error('  --only <types>      Comma-separated list of particle types to place');
  console.error('  --exclude <types>   Comma-separated list of particle types to skip');
  process.exit(1);
}

const year = parseInt(YEAR, 10);
const month = parseInt(MONTH, 10);
const density = parseFloat(DENSITY);
const only = ONLY ? ONLY.split(',').map(s => s.trim()) : null;
const exclude = EXCLUDE ? EXCLUDE.split(',').map(s => s.trim()) : null;

const { runPython, isUnrealReachable } = createRcClient(HOST);

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Load building spawn data — prefer pre-built spawn JSON, else convert from GeoJSON.
 */
function loadBuildings(terrainDir) {
  // Try pre-built spawn data first
  const spawnPath = path.join(terrainDir, 'buildings-spawn.json');
  if (fs.existsSync(spawnPath)) {
    return JSON.parse(fs.readFileSync(spawnPath, 'utf8'));
  }

  // Fall back to GeoJSON with centroid origin
  const geojsonPath = path.join(terrainDir, 'buildings.geojson');
  if (!fs.existsSync(geojsonPath)) return [];

  const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
  const features = geojson.features || [];
  if (features.length === 0) return [];

  // Compute centroid for origin
  let sumLat = 0, sumLon = 0, count = 0;
  for (const f of features) {
    const coords = f.geometry?.coordinates?.[0];
    if (!coords) continue;
    for (const [lon, lat] of coords) {
      sumLat += lat;
      sumLon += lon;
      count++;
    }
  }
  const origin = count > 0
    ? { lat: sumLat / count, lon: sumLon / count }
    : { lat: 0, lon: 0 };

  return buildingsToSpawnList(geojson, origin);
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  console.log('===============================================');
  console.log(' Atmospheric Particle Spawner');
  console.log('===============================================\n');

  const terrainDir = positionalArg.replace(/\/$/, '');

  // Read road splines
  const splinesPath = path.join(terrainDir, 'roads-splines.json');
  if (!fs.existsSync(splinesPath)) {
    console.error(`  Error: No roads-splines.json found in ${terrainDir}/`);
    console.error('  Run fetch-vectors.js first to generate road spline data.');
    process.exit(1);
  }

  const splines = JSON.parse(fs.readFileSync(splinesPath, 'utf8'));

  // Load buildings
  const buildings = loadBuildings(terrainDir);

  // Generate lamp positions
  const lampPositions = placeLamps(splines);

  console.log(`  Terrain:    ${terrainDir}`);
  console.log(`  Splines:    ${splines.length} road segments`);
  console.log(`  Buildings:  ${buildings.length}`);
  console.log(`  Lamps:      ${lampPositions.length}`);
  console.log(`  Year:       ${year}`);
  console.log(`  Month:      ${month}`);
  console.log(`  Density:    ${density}`);

  // Show available particles for this year
  const summary = summarizeParticlesForYear(year);
  console.log(`  Particles:  ${summary.total} types available for ${year}`);
  console.log(`  Types:      ${summary.types.join(', ')}`);
  console.log(`  Categories: ${Object.entries(summary.byCategory).map(([k, v]) => `${k}:${v}`).join(', ')}`);
  if (only) console.log(`  Only:       ${only.join(', ')}`);
  if (exclude) console.log(`  Exclude:    ${exclude.join(', ')}`);
  console.log();

  // Place particles
  const particleList = placeAllParticles({
    buildings,
    splines,
    lampPositions,
    year,
    month,
    density,
    only,
    exclude,
  });

  // Stats
  const byType = {};
  for (const p of particleList) {
    byType[p.type] = (byType[p.type] || 0) + 1;
  }

  console.log('  --- Placement Summary ---------------------');
  console.log(`  Total particles:  ${particleList.length}`);
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    const spawnKind = particleList.find(p => p.type === type)?.spawnType || 'niagara';
    console.log(`    ${type}: ${count} (${spawnKind})`);
  }

  // Dry run
  if (DRY_RUN) {
    const spawnDataPath = path.join(terrainDir, 'particles-spawn.json');
    const exportData = particleList.map(({ label, location, rotation, type, spawnType }) =>
      ({ label, location, rotation, type, spawnType }));
    fs.writeFileSync(spawnDataPath, JSON.stringify(exportData, null, 2));
    console.log(`\n  Wrote ${spawnDataPath}`);
    console.log(`\n  [DRY RUN] ${particleList.length} particles. No Unreal interaction.`);
    console.log('===============================================');
    return;
  }

  // Check Unreal connectivity
  console.log('\n  Checking Unreal connectivity...');
  const reachable = await isUnrealReachable();
  if (!reachable) {
    console.error(`  Cannot reach Unreal at ${HOST}`);
    console.error('  Use --dry-run to preview placement without Unreal.');
    process.exit(1);
  }
  console.log('  Unreal Remote Control API reachable');

  // Clear mode
  if (CLEAR) {
    console.log('\n  Clearing existing particle actors...');
    const script = buildParticleSpawnScript([], { clearExisting: true });
    const result = await runPython(script);
    console.log(`  ${result.ok ? 'Done' : 'Failed'} — Clear command sent`);
    console.log('===============================================');
    return;
  }

  // Spawn
  console.log(`\n  Spawning ${particleList.length} particles via Python script...`);
  const script = buildParticleSpawnScript(particleList, { clearExisting: true });

  // Save script for debugging
  const scriptPath = path.join(terrainDir, 'particles-spawn.py');
  fs.writeFileSync(scriptPath, script);
  console.log(`  Wrote ${scriptPath}`);

  const result = await runPython(script);
  if (result.ok) {
    console.log('  Python script executed');
  } else {
    console.error(`  Python execution failed: ${result.data?.error || 'unknown error'}`);
    console.error('  The generated script has been saved — try running it manually in UE Python console.');
  }

  console.log('\n===============================================');
  console.log(`  Spawned ${particleList.length} particles (${PARTICLE_PREFIX}_*)`);
  console.log(`  To remove: node tools/spawn-particles.js ${terrainDir} --year ${year} --clear`);
  console.log('===============================================');
}

main().catch(e => { console.error(`\n  Error: ${e.message}`); process.exit(1); });
