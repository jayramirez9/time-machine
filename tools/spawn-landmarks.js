#!/usr/bin/env node
/**
 * spawn-landmarks.js — Spawn hero building landmarks from multi-primitive compositions
 *
 * Reads landmark definitions from terrain-data/{slug}/landmarks.json,
 * converts them to Unreal spawn data (multiple basic shapes per landmark),
 * and either spawns via Python script (RC API) or prints a summary.
 *
 * Usage:
 *   node tools/spawn-landmarks.js terrain-data/manhattan-ny/
 *   node tools/spawn-landmarks.js terrain-data/manhattan-ny/ --dry-run
 *   node tools/spawn-landmarks.js terrain-data/manhattan-ny/ --clear
 *   node tools/spawn-landmarks.js terrain-data/manhattan-ny/ --dry-run --year 1870
 *   node tools/spawn-landmarks.js terrain-data/manhattan-ny/ --host http://localhost:30010
 */

import fs from 'fs';
import path from 'path';
import {
  loadLandmarks, filterByYear, landmarksToSpawnList,
  buildLandmarkSpawnScript, LANDMARK_PREFIX
} from '../lib/landmarks.js';

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
const YEAR_FLAG = getFlag('--year', null);

// First positional arg: terrain-data directory
const positionalArg = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));

if (!positionalArg) {
  console.error('Usage: node tools/spawn-landmarks.js terrain-data/<slug>/  [options]');
  console.error('');
  console.error('Options:');
  console.error('  --host URL      Unreal RC API host (default: http://localhost:30010)');
  console.error('  --dry-run       Show spawn data without touching Unreal');
  console.error('  --clear         Remove all TM_Landmark_* actors from the level');
  console.error('  --year N        Era filter year (default: from landmarks.json era)');
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

// ─── Era year extraction ─────────────────────────────────────────

function eraToYear(era) {
  const match = era && era.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(' Landmark Spawner');
  console.log('═══════════════════════════════════════════════\n');

  const terrainDir = positionalArg.replace(/\/$/, '');
  const landmarksPath = path.join(terrainDir, 'landmarks.json');

  if (!fs.existsSync(landmarksPath)) {
    console.error(`  Error: No landmarks.json found in ${terrainDir}/`);
    console.error('  Create a landmarks.json with hero building definitions.');
    process.exit(1);
  }

  // Load and validate
  const { landmarks, origin, era, valid, invalid, warnings } = loadLandmarks(landmarksPath);
  console.log(`  Directory:  ${terrainDir}/`);
  console.log(`  Era:        ${era}`);
  console.log(`  Origin:     ${origin.lat}, ${origin.lon}`);
  console.log(`  Landmarks:  ${landmarks.length} total (${valid} valid, ${invalid} invalid)`);

  if (invalid > 0) {
    console.error('\n  Validation warnings:');
    for (const w of warnings) {
      console.error(`    - ${w}`);
    }
    if (valid === 0) {
      console.error('\n  No valid landmarks to spawn. Fix landmarks.json and retry.');
      process.exit(1);
    }
  }

  // Era filtering
  const year = YEAR_FLAG ? parseInt(YEAR_FLAG, 10) : eraToYear(era);
  let filtered = landmarks;
  if (year) {
    filtered = filterByYear(landmarks, year);
    console.log(`  Year filter: ${year} → ${filtered.length} landmarks visible`);
    if (filtered.length < landmarks.length) {
      const removed = landmarks.filter(lm => !filtered.includes(lm));
      for (const lm of removed) {
        console.log(`    - ${lm.name || lm.id} (built ${lm.yearBuilt}${lm.yearDemolished ? `, demolished ${lm.yearDemolished}` : ''})`);
      }
    }
  }

  // Convert to spawn data
  const spawnList = landmarksToSpawnList(filtered, origin);

  // Stats
  const shapes = {};
  for (const s of spawnList) {
    shapes[s.shape] = (shapes[s.shape] || 0) + 1;
  }

  console.log(`\n  ─── Spawn Summary ─────────────────────────`);
  console.log(`  Landmarks:   ${filtered.length}`);
  console.log(`  Primitives:  ${spawnList.length}`);
  console.log(`  Shapes:      ${Object.entries(shapes).map(([k, v]) => `${k}:${v}`).join(', ')}`);

  if (DRY_RUN) {
    console.log('\n  [DRY RUN] Spawn data for each landmark:\n');

    let currentLandmark = null;
    for (const s of spawnList) {
      if (s.landmarkId !== currentLandmark) {
        currentLandmark = s.landmarkId;
        console.log(`  ── ${s.landmarkName} ──`);
      }
      const [x, y, z] = s.location.map(v => v.toFixed(1));
      const [sx, sy, sz] = s.scale.map(v => v.toFixed(2));
      console.log(`    ${s.label} (${s.shape})`);
      console.log(`      Location: [${x}, ${y}, ${z}]`);
      console.log(`      Scale:    [${sx}, ${sy}, ${sz}]`);
      console.log(`      Part:     ${s.part || '-'}`);
    }

    // Write spawn data JSON
    const spawnDataPath = path.join(terrainDir, 'landmarks-spawn.json');
    fs.writeFileSync(spawnDataPath, JSON.stringify(spawnList, null, 2));
    console.log(`\n  Wrote ${spawnDataPath}`);
    console.log('═══════════════════════════════════════════════');
    return;
  }

  // ── Clear mode ──
  if (CLEAR) {
    console.log('\n  Clearing existing landmark actors...');
    const reachable = await isUnrealReachable();
    if (!reachable) {
      console.error(`  Cannot reach Unreal at ${HOST}`);
      process.exit(1);
    }

    const clearScript = [
      'import unreal',
      'all_actors = unreal.EditorLevelLibrary.get_all_level_actors()',
      'count = 0',
      'for actor in all_actors:',
      `    if actor.get_actor_label().startswith("${LANDMARK_PREFIX}"):`,
      '        actor.destroy()',
      '        count += 1',
      'unreal.log(f"Cleared {count} landmark actors")'
    ].join('\n');

    const result = await runPython(clearScript);
    console.log(`  ${result.ok ? 'Done' : 'Failed'} — clear command sent`);
    console.log('═══════════════════════════════════════════════');
    return;
  }

  // ── Spawn mode ──
  console.log('\n  Checking Unreal connectivity...');
  const reachable = await isUnrealReachable();
  if (!reachable) {
    console.error(`  Cannot reach Unreal at ${HOST}`);
    console.error('  Use --dry-run to preview spawn data without Unreal.');
    process.exit(1);
  }
  console.log('  Unreal Remote Control API reachable');

  // Generate and execute Python script
  console.log(`\n  Spawning ${spawnList.length} primitives across ${filtered.length} landmarks...`);
  const script = buildLandmarkSpawnScript(spawnList, { clearExisting: true });

  // Write script for debugging
  const scriptPath = path.join(terrainDir, 'landmarks-spawn.py');
  fs.writeFileSync(scriptPath, script);
  console.log(`  Wrote ${scriptPath}`);

  const result = await runPython(script);
  if (result.ok) {
    console.log('  Python script executed');
  } else {
    console.error(`  Python execution failed: ${result.data?.error || 'unknown error'}`);
    console.error('  The generated script has been saved — try running it manually in UE Python console.');
  }

  // Write spawn data JSON
  const spawnDataPath = path.join(terrainDir, 'landmarks-spawn.json');
  fs.writeFileSync(spawnDataPath, JSON.stringify(spawnList, null, 2));
  console.log(`  Wrote ${spawnDataPath}`);

  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Spawned ${spawnList.length} primitives across ${filtered.length} landmarks (${LANDMARK_PREFIX}_*)`);
  console.log(`  To remove: node tools/spawn-landmarks.js ${terrainDir} --clear`);
  console.log('═══════════════════════════════════════════════');
}

main().catch(e => { console.error(`\n  Error: ${e.message}`); process.exit(1); });
