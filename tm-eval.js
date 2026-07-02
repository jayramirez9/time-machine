#!/usr/bin/env node

/**
 * Time Machine Eval Runner
 * Unified CLI that orchestrates all quality evals and reports pass/fail.
 *
 * Usage:
 *   ./tm-eval.js              # Run all suites
 *   ./tm-eval.js --only unit   # Run one suite
 *   ./tm-eval.js --json        # Structured JSON output
 *
 * Exit codes: 0 = all pass, 1 = any failure
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { compileWorldState } from './lib/worldStateCompiler.js';
import { getMockWeather } from './lib/weather.js';
import { validateWorldState } from './lib/worldStateContract.js';
import { validateAudioProfile } from './lib/audioProfileValidator.js';
import { validateConfig, evaluateRoutes } from './lib/environmentRouter.js';

// ── Arg parsing ──────────────────────────────────────────────────────────────

function parseArgs(args) {
  const parsed = { only: null, json: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--only' && args[i + 1]) parsed.only = args[++i];
    if (args[i] === '--json') parsed.json = true;
  }
  return parsed;
}

// ── Suite runners ────────────────────────────────────────────────────────────

async function runUnit() {
  try {
    // Suite is 1,500+ tests and takes several minutes; 30s here silently failed every run
    const output = execSync('npm test 2>&1', { encoding: 'utf8', timeout: 600000, maxBuffer: 32 * 1024 * 1024 });
    const testsMatch = output.match(/ℹ tests (\d+)/);
    const failMatch = output.match(/ℹ fail (\d+)/);
    const tests = testsMatch ? parseInt(testsMatch[1]) : 0;
    const fails = failMatch ? parseInt(failMatch[1]) : 0;
    return { pass: fails === 0, tests, fails, detail: fails > 0 ? output.slice(-500) : null };
  } catch (err) {
    return { pass: false, tests: 0, fails: -1, detail: (err.stdout || err.message).slice(-500) };
  }
}

function runContract() {
  // Local-component dates (not UTC strings) — the mock provider reads machine-
  // local getHours(), so wall-clock anchoring keeps evals deterministic across
  // machine timezones (see runGolden).
  const scenarios = [
    { location: 'Baton Rouge, LA', date: new Date(1978, 6, 4, 15, 0, 0), locale: { audioBaseDb: 24, activity: 0.15, hazeBias: 0.03 } },
    { location: 'Baton Rouge, LA', date: new Date(1978, 6, 4, 2, 0, 0), locale: { audioBaseDb: 24, activity: 0.15, hazeBias: 0.03 } },
    { location: 'Baton Rouge, LA', date: new Date(1978, 0, 15, 12, 0, 0), locale: { audioBaseDb: 24, activity: 0.15, hazeBias: 0.03 } },
    { location: 'New York, NY', date: new Date(1884, 5, 15, 13, 0, 0), locale: { audioBaseDb: 40, activity: 0.65, hazeBias: 0.1 } },
    { location: 'London, UK', date: new Date(1950, 11, 1, 12, 0, 0), locale: { audioBaseDb: 30, activity: 0.3, hazeBias: 0.15 } }
  ];

  const errors = [];
  for (const s of scenarios) {
    const weather = getMockWeather({ location: s.location, date: s.date });
    const state = compileWorldState({ timeline: [weather], locale: s.locale, now: s.date });
    const result = validateWorldState(state);
    if (!result.valid) {
      errors.push(`${s.location} @ ${s.date.toISOString()}: ${result.errors.join('; ')}`);
    }
  }
  return { pass: errors.length === 0, checks: scenarios.length, errors };
}

function runRoutes() {
  const errors = [];
  let routeCount = 0;
  try {
    const config = JSON.parse(fs.readFileSync('routes.json', 'utf8'));
    validateConfig(config);
    routeCount = config.routes.length;

    // Verify all sources resolve (local wall-clock anchoring — see runGolden)
    const date = new Date(1978, 6, 4, 15, 0, 0);
    const weather = getMockWeather({ location: 'Baton Rouge, LA', date });
    const state = compileWorldState({
      timeline: [weather],
      locale: { audioBaseDb: 24, activity: 0.15, hazeBias: 0.03 },
      now: date
    });

    for (let i = 0; i < config.routes.length; i++) {
      const route = config.routes[i];
      const value = resolvePath(state, route.source);
      if (value === undefined) {
        errors.push(`Route ${i}: source "${route.source}" does not resolve`);
      }
      if (route.rateLimit) {
        if (route.rateLimit.maxDelta !== undefined && route.rateLimit.maxDelta <= 0) {
          errors.push(`Route ${i}: maxDelta must be positive`);
        }
        if (route.rateLimit.ema !== undefined && (route.rateLimit.ema <= 0 || route.rateLimit.ema > 1)) {
          errors.push(`Route ${i}: ema must be in (0, 1]`);
        }
      }
    }

    // Verify evaluateRoutes produces finite numbers
    const routed = evaluateRoutes(state, config);
    for (const [ep, params] of Object.entries(routed)) {
      for (const [param, value] of Object.entries(params)) {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          errors.push(`evaluateRoutes: ${ep}.${param} = ${value} (not a finite number)`);
        }
      }
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      errors.push('routes.json not found (skipped)');
    } else {
      errors.push(`validateConfig failed: ${err.message}`);
    }
  }
  return { pass: errors.length === 0, routes: routeCount, errors };
}

function runProfiles() {
  const profileDir = 'audio-profiles';
  const errors = [];
  const allWarnings = [];
  let profileCount = 0;

  try {
    const files = fs.readdirSync(profileDir).filter(f => f.endsWith('.json'));
    profileCount = files.length;

    for (const file of files) {
      const profile = JSON.parse(fs.readFileSync(path.join(profileDir, file), 'utf8'));
      const result = validateAudioProfile(profile);
      if (!result.valid) {
        errors.push(`${file}: ${result.errors.join('; ')}`);
      }
      if (result.warnings.length > 0) {
        allWarnings.push(`${file}: ${result.warnings.join('; ')}`);
      }
    }
  } catch (err) {
    errors.push(`Profile scan failed: ${err.message}`);
  }

  return { pass: errors.length === 0, profiles: profileCount, warnings: allWarnings.length, errors };
}

function runEra() {
  const profileDir = 'audio-profiles';
  const errors = [];
  let profileCount = 0;

  try {
    const files = fs.readdirSync(profileDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const profile = JSON.parse(fs.readFileSync(path.join(profileDir, file), 'utf8'));
      if (!profile.era) continue;
      profileCount++;
      try {
        execSync(`node tools/era-audit.js ${path.join(profileDir, file)} 2>&1`, {
          encoding: 'utf8', timeout: 10000
        });
      } catch (err) {
        // era-audit exits 1 on errors
        errors.push(`${file}: era audit failed`);
      }
    }
  } catch (err) {
    errors.push(`Era scan failed: ${err.message}`);
  }

  return { pass: errors.length === 0, profiles: profileCount, errors };
}

function runGolden() {
  const errors = [];
  const checks = [];

  // Scenario: Baton Rouge July 1978 daytime.
  // The mock provider reads machine-local hours (weather.js getHours() — TZ
  // derivation is a known TODO), so anchor scenarios in local wall-clock
  // components, not UTC instants: hour 15 is 3pm on every machine/runner.
  const date = new Date(1978, 6, 4, 15, 0, 0);
  const weather = getMockWeather({ location: 'Baton Rouge, LA', date });
  const state = compileWorldState({
    timeline: [weather],
    locale: { audioBaseDb: 24, activity: 0.15, hazeBias: 0.03 },
    now: date
  });

  // Contract validation
  const valid = validateWorldState(state);
  checks.push('contract');
  if (!valid.valid) errors.push(`Contract: ${valid.errors.join('; ')}`);

  // Mock provider
  checks.push('provider');
  if (state.metadata.provider !== 'mock') errors.push(`Expected mock provider, got ${state.metadata.provider}`);

  // Determinism
  checks.push('determinism');
  const weather2 = getMockWeather({ location: 'Baton Rouge, LA', date });
  const state2 = compileWorldState({ timeline: [weather2], locale: { audioBaseDb: 24, activity: 0.15, hazeBias: 0.03 }, now: date });
  if (JSON.stringify(state.controls) !== JSON.stringify(state2.controls)) {
    errors.push('Determinism failed: same inputs produced different outputs');
  }

  // Daytime assertions
  checks.push('daytime_luminance');
  if (state.controls.lighting.exteriorLuminance < 0.1) {
    errors.push(`Daytime luminance too low: ${state.controls.lighting.exteriorLuminance}`);
  }

  checks.push('daytime_distortion');
  // Could be nonzero depending on temp — just verify it's in bounds
  if (state.controls.visual.heatDistortion < 0 || state.controls.visual.heatDistortion > 1) {
    errors.push(`Heat distortion out of bounds: ${state.controls.visual.heatDistortion}`);
  }

  // Night scenario
  checks.push('night_luminance');
  const nightDate = new Date(1978, 6, 4, 2, 0, 0); // 2am local wall-clock everywhere
  const nightWeather = getMockWeather({ location: 'Baton Rouge, LA', date: nightDate });
  const nightState = compileWorldState({
    timeline: [nightWeather],
    locale: { audioBaseDb: 24, activity: 0.15, hazeBias: 0.03 },
    now: nightDate
  });
  if (nightState.controls.lighting.exteriorLuminance > 0.1) {
    errors.push(`Night luminance too high: ${nightState.controls.lighting.exteriorLuminance}`);
  }

  checks.push('night_contrast');
  if (nightState.controls.lighting.contrast !== 0.15) {
    errors.push(`Night contrast should be 0.15, got: ${nightState.controls.lighting.contrast}`);
  }

  return { pass: errors.length === 0, checks: checks.length, errors };
}

// ── Utilities ────────────────────────────────────────────────────────────────

function resolvePath(obj, dotPath) {
  let current = obj;
  for (const key of dotPath.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const SUITES = {
  unit:     { name: 'Unit Tests',        run: runUnit },
  contract: { name: 'WorldState Contract', run: runContract },
  routes:   { name: 'Route Config',       run: runRoutes },
  profiles: { name: 'Audio Profiles',     run: runProfiles },
  era:      { name: 'Era Audit',          run: runEra },
  golden:   { name: 'Golden State',       run: runGolden }
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const suitesToRun = args.only ? { [args.only]: SUITES[args.only] } : SUITES;

  if (args.only && !SUITES[args.only]) {
    console.error(`Unknown suite: ${args.only}`);
    console.error(`Available: ${Object.keys(SUITES).join(', ')}`);
    process.exit(1);
  }

  const results = {};
  let allPass = true;
  const startTotal = Date.now();

  for (const [key, suite] of Object.entries(suitesToRun)) {
    const start = Date.now();
    if (!args.json) process.stdout.write(`  ${suite.name}... `);

    try {
      const result = await suite.run();
      result.duration = Date.now() - start;
      results[key] = result;

      if (!result.pass) allPass = false;

      if (!args.json) {
        console.log(result.pass ? '✓' : '✗');
        if (!result.pass && result.errors) {
          for (const err of result.errors) {
            console.log(`    → ${err}`);
          }
        }
        if (result.detail) {
          console.log(`    ${result.detail.split('\n').slice(-3).join('\n    ')}`);
        }
      }
    } catch (err) {
      results[key] = { pass: false, duration: Date.now() - start, errors: [err.message] };
      allPass = false;
      if (!args.json) {
        console.log('✗');
        console.log(`    → ${err.message}`);
      }
    }
  }

  const totalDuration = Date.now() - startTotal;

  if (args.json) {
    console.log(JSON.stringify({ suites: results, pass: allPass, duration: totalDuration }, null, 2));
  } else {
    console.log('');
    console.log(`  ${allPass ? '✓ All evals passed' : '✗ Some evals failed'} (${totalDuration}ms)`);
  }

  process.exit(allPass ? 0 : 1);
}

main();
