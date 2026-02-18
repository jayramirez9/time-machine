#!/usr/bin/env node

/**
 * Time Machine Replay
 * Replays a JSONL state log through the rate limiter to detect snaps/violations.
 *
 * Usage:
 *   ./tm-replay.js logs/worldstate-2026-02-17.jsonl
 *   ./tm-replay.js logs/worldstate-2026-02-17.jsonl --routes routes.example.json --duration 30
 */

import fs from 'fs';
import { createRateLimiter } from './lib/rateLimiter.js';

function parseArgs(args) {
  const parsed = {
    logFile: null,
    routesConfigPath: null,
    duration: 60
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--routes' || arg === '-r') {
      parsed.routesConfigPath = args[++i];
    } else if (arg === '--duration') {
      parsed.duration = parseFloat(args[++i]);
    } else if (!arg.startsWith('-')) {
      parsed.logFile = arg;
    }
  }

  return parsed;
}

function loadEntries(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return content
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.logFile) {
    console.error('Usage: tm-replay.js <logfile.jsonl> [--routes config.json] [--duration 60]');
    process.exit(2);
  }

  if (!fs.existsSync(args.logFile)) {
    console.error(`File not found: ${args.logFile}`);
    process.exit(2);
  }

  const entries = loadEntries(args.logFile);
  console.log(`[Replay] Loaded ${entries.length} entries from ${args.logFile}`);

  // Load routes config for rate limiting
  let limiter = null;
  if (args.routesConfigPath) {
    const raw = fs.readFileSync(args.routesConfigPath, 'utf8');
    const config = JSON.parse(raw);
    limiter = createRateLimiter(config.routes);
    console.log(`[Replay] Rate limiter loaded from ${args.routesConfigPath}`);
  } else {
    // Without routes, scan for raw control deltas
    console.log(`[Replay] No routes config — scanning raw control deltas`);
  }

  if (entries.length === 0) {
    console.log('[Replay] No entries to replay.');
    process.exit(0);
  }

  const intervalMs = (args.duration * 1000) / entries.length;
  const dtSeconds = args.duration / entries.length;

  console.log(`[Replay] Replaying over ${args.duration}s (${(intervalMs).toFixed(0)}ms per entry)`);
  console.log('');

  // Stats
  let totalViolations = 0;
  const maxDeltaSeen = {};
  const allViolations = [];

  // Raw delta tracking (when no routes)
  let prevControls = null;
  const rawMaxDeltas = {};

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    if (limiter && entry.routed) {
      const { clamped, violations } = limiter.limit(entry.routed, dtSeconds);

      if (violations.length > 0) {
        totalViolations += violations.length;
        for (const v of violations) {
          const key = `${v.endpoint}::${v.param}`;
          const absDelta = Math.abs(v.delta);
          if (!maxDeltaSeen[key] || absDelta > maxDeltaSeen[key]) {
            maxDeltaSeen[key] = absDelta;
          }
          allViolations.push({ entry: i, simTime: entry.simTime, ...v });
          console.log(
            `  [SNAP] #${i} ${entry.simTime || ''} ${key} ` +
            `delta=${v.delta} max=${v.maxDelta} clamped→${v.clamped}`
          );
        }
      }
    }

    // Track raw control deltas regardless
    if (entry.controls && prevControls) {
      trackRawDeltas(prevControls, entry.controls, '', rawMaxDeltas);
    }
    prevControls = entry.controls;

    // Pace the replay
    if (intervalMs > 1) {
      await sleep(intervalMs);
    }

    // Progress
    if ((i + 1) % Math.max(1, Math.floor(entries.length / 10)) === 0) {
      const pct = Math.round(((i + 1) / entries.length) * 100);
      process.stdout.write(`\r  [${pct}%] ${i + 1}/${entries.length}`);
    }
  }

  console.log('\n');

  // Summary
  console.log('═══════════════════════════════════════════');
  console.log('  REPLAY SUMMARY');
  console.log('═══════════════════════════════════════════');
  console.log(`  Entries:     ${entries.length}`);
  console.log(`  Duration:    ${args.duration}s`);
  console.log(`  Violations:  ${totalViolations}`);
  console.log('');

  if (Object.keys(maxDeltaSeen).length > 0) {
    console.log('  Worst deltas (rate-limited params):');
    for (const [key, delta] of Object.entries(maxDeltaSeen).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${key}: ${delta}`);
    }
    console.log('');
  }

  // Top raw deltas
  const sortedRaw = Object.entries(rawMaxDeltas).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (sortedRaw.length > 0) {
    console.log('  Largest raw control deltas:');
    for (const [key, delta] of sortedRaw) {
      console.log(`    ${key}: ${delta.toFixed(4)}`);
    }
    console.log('');
  }

  if (totalViolations > 0) {
    console.log(`  Result: FAIL (${totalViolations} snap${totalViolations > 1 ? 's' : ''} detected)`);
    process.exit(1);
  } else {
    console.log('  Result: PASS');
    process.exit(0);
  }
}

function trackRawDeltas(prev, curr, prefix, out) {
  for (const [key, val] of Object.entries(curr)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof val === 'number' && typeof prev[key] === 'number') {
      const delta = Math.abs(val - prev[key]);
      if (!out[path] || delta > out[path]) {
        out[path] = delta;
      }
    } else if (val && typeof val === 'object' && prev[key] && typeof prev[key] === 'object') {
      trackRawDeltas(prev[key], val, path, out);
    }
  }
}

main().catch(console.error);
