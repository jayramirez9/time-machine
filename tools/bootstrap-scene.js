#!/usr/bin/env node

/**
 * bootstrap-scene.js — One-command scene setup for any Place×Time.
 *
 * Chains the existing tool pipeline: terrain fetch → vectors → audio profile →
 * audio assets → photos → environment profile. Runs steps in parallel where
 * dependencies allow, skips steps whose output already exists, and adapts to
 * available API keys.
 *
 * Usage:
 *   node tools/bootstrap-scene.js "Manhattan, NY" --year 1884
 *   node tools/bootstrap-scene.js "Baton Rouge, LA" --year 1978 --radius 1000
 *   node tools/bootstrap-scene.js "Manhattan, NY" --year 1884 --skip audio-assets
 *   node tools/bootstrap-scene.js "Manhattan, NY" --year 1884 --dry-run
 *
 * Does NOT include (separate workflows):
 *   - spawn-*.js (requires Unreal running)
 *   - generate-building-refs.js (expensive Meshy credits, opt-in)
 *   - fetch-sanborn.js (slow, used for manual tracing)
 */

import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geocode } from '../lib/openmeteo.js';
import { slugify } from '../lib/demFetcher.js';
import { buildAudioProfileId } from '../lib/profileGenerator.js';
import { parseSpawnArgs } from '../lib/rcHelpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

// ─── Subprocess runner ──────────────────────────────────────────

function printPrefixed(stream, label, text) {
  if (!text) return;
  for (const line of text.trim().split('\n')) {
    stream(`  [${label}] ${line}`);
  }
}

/**
 * Run a tool as a subprocess with prefixed output.
 * @param {string} label - Short label for log prefix
 * @param {string} script - Tool filename (relative to tools/)
 * @param {string[]} toolArgs - Arguments to pass
 * @returns {Promise<{ok: boolean, duration: number, error?: string}>}
 */
function runTool(label, script, toolArgs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const scriptPath = path.join(PROJECT_ROOT, 'tools', script);
    execFile('node', [scriptPath, ...toolArgs], {
      cwd: PROJECT_ROOT,
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      const duration = parseFloat(((Date.now() - start) / 1000).toFixed(1));
      printPrefixed(console.log, label, stdout);
      if (error) {
        printPrefixed(console.error, label, stderr);
        resolve({ ok: false, duration, error: error.message });
      } else {
        resolve({ ok: true, duration });
      }
    });
  });
}

// ─── Skip detection ─────────────────────────────────────────────

/**
 * Check if a phase should be skipped.
 * @param {string} phase - Phase name
 * @param {string} outputPath - File or dir to check
 * @param {object} opts
 * @param {boolean} [opts.isDir] - Check for non-empty directory
 * @param {string[]} opts.skipList - Phases the user asked to skip
 * @param {boolean} opts.force - Force rerun
 * @returns {{ skip: boolean, reason: string }}
 */
export function shouldSkip(phase, outputPath, opts) {
  if (opts.skipList.includes(phase)) {
    return { skip: true, reason: 'user --skip' };
  }
  if (opts.force) {
    return { skip: false, reason: '' };
  }
  if (opts.isDir) {
    if (existsSync(outputPath)) {
      try {
        const entries = readdirSync(outputPath);
        if (entries.length > 0) {
          return { skip: true, reason: `exists: ${outputPath}/` };
        }
      } catch { /* not a dir */ }
    }
    return { skip: false, reason: '' };
  }
  if (existsSync(outputPath)) {
    return { skip: true, reason: `exists: ${outputPath}` };
  }
  return { skip: false, reason: '' };
}

// Re-export for tests
export { buildAudioProfileId as audioProfileId };

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  const { getFlag, hasFlag, positionalArg: location } = parseSpawnArgs(process.argv.slice(2));
  const year = parseInt(getFlag('--year', '0'), 10);
  const month = getFlag('--month');
  const day = getFlag('--day');
  const radius = getFlag('--radius', '500');
  const skipList = (getFlag('--skip', '') || '').split(',').filter(Boolean);
  const force = hasFlag('--force');
  const dryRun = hasFlag('--dry-run');

  if (!location || !year) {
    console.error('Usage: bootstrap-scene.js <location> --year YYYY [options]');
    console.error('');
    console.error('  Options:');
    console.error('    --year YYYY          Target year (required)');
    console.error('    --month N            Month (1-12, for environment profile)');
    console.error('    --day N              Day (1-31, for environment profile)');
    console.error('    --radius N           DEM radius in meters (default: 500)');
    console.error('    --skip <phases>      Comma-separated phases to skip:');
    console.error('                         terrain,imagery,vectors,audio-profile,');
    console.error('                         audio-assets,photos,env-profile');
    console.error('    --force              Rerun even if output exists');
    console.error('    --dry-run            Show what would run, no actions');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════');
  console.log(' Bootstrap Scene');
  console.log('═══════════════════════════════════════════════\n');

  console.log(`  Location:  ${location}`);
  console.log(`  Year:      ${year}`);

  let geo;
  try {
    geo = await geocode(location);
  } catch (e) {
    console.error(`  Geocode failed: ${e.message}`);
    process.exit(1);
  }

  const slug = slugify(location);
  const terrainDir = path.join('terrain-data', slug);
  const audioId = buildAudioProfileId(location, year);
  const audioProfilePath = path.join('audio-profiles', `${audioId}.json`);
  const audioAssetsDir = path.join('audio-assets', audioId);
  const photosDir = path.join('photos', slug);

  console.log(`  Resolved:  ${geo.name} (${geo.lat.toFixed(4)}, ${geo.lon.toFixed(4)})`);
  console.log(`  Slug:      ${slug}`);
  console.log(`  Terrain:   ${terrainDir}/`);
  console.log(`  Audio:     ${audioProfilePath}`);
  console.log(`  Photos:    ${photosDir}/`);

  const hasElevenLabs = !!process.env.ELEVENLABS_API_KEY;
  const hasNOAA = !!process.env.NOAA_API_TOKEN;
  console.log('');
  console.log('  API keys:');
  console.log(`    ELEVENLABS_API_KEY:  ${hasElevenLabs ? 'set' : 'not set (audio assets will be skipped)'}`);
  console.log(`    NOAA_API_TOKEN:      ${hasNOAA ? 'set' : 'not set (Open-Meteo fallback for weather)'}`);
  console.log('');

  // ─── Phase plan ─────────────────────────────────────────────

  const steps = [
    {
      name: 'terrain', label: 'DEM', script: 'fetch-dem.js',
      args: [location, '--radius', radius],
      output: path.join(terrainDir, 'heightmap.r16'), phase: 1,
    },
    {
      name: 'audio-profile', label: 'AudioProfile', script: 'generate-profile.js',
      args: [location, '--year', String(year)],
      output: audioProfilePath, phase: 1,
    },
    {
      name: 'imagery', label: 'Imagery', script: 'fetch-imagery.js',
      args: [terrainDir],
      output: path.join(terrainDir, 'imagery.png'), phase: 2, requires: 'terrain',
    },
    {
      name: 'vectors', label: 'Vectors', script: 'fetch-vectors.js',
      args: [terrainDir],
      output: path.join(terrainDir, 'roads-splines.json'), phase: 2, requires: 'terrain',
    },
    {
      name: 'photos', label: 'Photos', script: 'fetch-photos.js',
      args: [location, '--year', String(year), '--max', '10'],
      output: path.join(photosDir, 'PHOTO_MANIFEST.json'), phase: 2,
    },
    {
      name: 'env-profile', label: 'EnvProfile', script: 'generate-environment-profile.js',
      args: [location, '--year', String(year), '--terrain', terrainDir,
        ...(month ? ['--month', month] : []),
        ...(day ? ['--day', day] : [])],
      output: null, phase: 3, requires: 'terrain',
    },
    {
      name: 'audio-assets', label: 'AudioAssets', script: 'elevenlabs-fetch.js',
      args: [audioProfilePath],
      output: audioAssetsDir, outputIsDir: true, phase: 3,
      requires: 'audio-profile', needsKey: 'ELEVENLABS_API_KEY',
    },
    {
      name: 'voice-assets', label: 'VoiceAssets', script: 'elevenlabs-voice-fetch.js',
      args: [audioProfilePath],
      output: audioAssetsDir, outputIsDir: true, phase: 3,
      requires: 'audio-assets', needsKey: 'ELEVENLABS_API_KEY',
    },
  ];

  // ─── Evaluate skip status ─────────────────────────────────

  const results = {};
  const plan = [];
  const skipOpts = { skipList, force };

  for (const step of steps) {
    if (step.needsKey && !process.env[step.needsKey]) {
      plan.push({ ...step, action: 'skip', reason: `${step.needsKey} not set` });
      continue;
    }

    if (step.output) {
      const { skip, reason } = shouldSkip(step.name, step.output, { ...skipOpts, isDir: step.outputIsDir });
      if (skip) {
        plan.push({ ...step, action: 'skip', reason });
        continue;
      }
    } else if (skipList.includes(step.name)) {
      plan.push({ ...step, action: 'skip', reason: 'user --skip' });
      continue;
    }

    plan.push({ ...step, action: 'run' });
  }

  console.log('  ─── Plan ─────────────────────────────────────');
  for (const step of plan) {
    const status = step.action === 'skip' ? `SKIP (${step.reason})` : 'RUN';
    console.log(`    Phase ${step.phase}  ${step.label.padEnd(14)} ${status}`);
  }
  console.log('');

  if (dryRun) {
    const runCount = plan.filter(s => s.action === 'run').length;
    const skipCount = plan.filter(s => s.action === 'skip').length;
    console.log(`  [DRY RUN] ${runCount} steps to run, ${skipCount} to skip. No actions taken.`);
    console.log('═══════════════════════════════════════════════');
    return;
  }

  // ─── Execute phases ───────────────────────────────────────

  const phaseNumbers = [...new Set(plan.filter(s => s.action === 'run').map(s => s.phase))].sort();

  for (const phaseNum of phaseNumbers) {
    const stepsInPhase = plan.filter(s => s.phase === phaseNum && s.action === 'run');
    if (stepsInPhase.length === 0) continue;

    const blocked = stepsInPhase.filter(s => s.requires && results[s.requires]?.ok === false);
    for (const b of blocked) {
      console.log(`  [${b.label}] SKIP — dependency "${b.requires}" failed`);
      results[b.name] = { ok: false, error: 'dependency failed' };
    }

    const runnable = stepsInPhase.filter(s => !s.requires || results[s.requires]?.ok !== false);
    if (runnable.length === 0) continue;

    console.log(`  ─── Phase ${phaseNum} (${runnable.map(s => s.label).join(' + ')}) ───`);

    const phaseResults = await Promise.allSettled(
      runnable.map(async (step) => {
        const result = await runTool(step.label, step.script, step.args);
        results[step.name] = result;
        return { step, result };
      })
    );

    for (const settled of phaseResults) {
      if (settled.status === 'rejected') {
        console.error(`  [unknown] FAILED: ${settled.reason}`);
      } else {
        const { step, result } = settled.value;
        if (result.ok) {
          console.log(`  [${step.label}] Done (${result.duration}s)`);
        } else {
          console.error(`  [${step.label}] FAILED (${result.duration}s): ${result.error}`);
        }
      }
    }
    console.log('');
  }

  // ─── Summary ──────────────────────────────────────────────

  console.log('  ─── Summary ──────────────────────────────────');
  const ran = plan.filter(s => s.action === 'run');
  const skipped = plan.filter(s => s.action === 'skip');
  const succeeded = ran.filter(s => results[s.name]?.ok);
  const failed = ran.filter(s => results[s.name] && !results[s.name].ok);

  console.log(`    Ran:     ${ran.length} steps`);
  console.log(`    OK:      ${succeeded.length}`);
  if (failed.length > 0) {
    console.log(`    Failed:  ${failed.length} (${failed.map(s => s.label).join(', ')})`);
  }
  console.log(`    Skipped: ${skipped.length}`);

  console.log('');
  console.log('  Output:');
  console.log(`    Terrain:     ${terrainDir}/`);
  console.log(`    Audio:       ${audioProfilePath}`);
  if (hasElevenLabs) console.log(`    Assets:      ${audioAssetsDir}/`);
  console.log(`    Photos:      ${photosDir}/`);
  console.log(`    Env Profile: profiles/`);

  if (failed.length === 0 && succeeded.length > 0) {
    console.log('');
    console.log('  Next steps:');
    console.log(`    # Start the engine:`);
    console.log(`    ./tm-engine.js -l "${location}" -d "01-01-${year}" --timescale 60`);
    console.log('');
    console.log(`    # Spawn into Unreal (if running):`);
    console.log(`    node tools/spawn-buildings.js ${terrainDir}/ --year ${year}`);
    console.log(`    node tools/spawn-streets.js ${terrainDir}/ --year ${year}`);
    console.log(`    node tools/spawn-props.js ${terrainDir}/ --year ${year}`);
  }

  console.log('\n═══════════════════════════════════════════════');

  if (failed.length > 0) process.exit(1);
}

if (isMainModule) {
  main().catch((err) => {
    console.error(`\n  Error: ${err.message}`);
    process.exit(1);
  });
}
