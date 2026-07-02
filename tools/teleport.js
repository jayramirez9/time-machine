#!/usr/bin/env node
/**
 * teleport.js — Jump the Cesium scene to a lat/lon or named landmark.
 *
 * Usage:
 *   node tools/teleport.js 40.708 -74.012
 *   node tools/teleport.js trinity
 *   node tools/teleport.js trinity --height 50
 *   node tools/teleport.js --list
 *   node tools/teleport.js 40.708 -74.012 --host http://other:30010
 *
 * Host defaults to endpoints.unreal.host in routes.json.
 * Height defaults to USGS ground + 2m eye offset.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { setGeoreference, estimateHeight } from '../lib/cesiumGeoreference.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);

function getFlag(name, defaultValue = null) {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultValue;
  const val = args[idx + 1];
  args.splice(idx, val && !val.startsWith('--') ? 2 : 1);
  return val ?? true;
}

const listIdx = args.indexOf('--list');
const wantList = listIdx !== -1;
if (wantList) args.splice(listIdx, 1);
const hostOverride = getFlag('--host');
const heightArg = getFlag('--height');

function loadLandmarks() {
  try {
    const path = resolve(ROOT, 'terrain-data/manhattan-ny/landmarks.json');
    return JSON.parse(readFileSync(path, 'utf-8')).landmarks ?? [];
  } catch {
    return [];
  }
}

function defaultHost() {
  if (hostOverride) return hostOverride;
  try {
    const routes = JSON.parse(readFileSync(resolve(ROOT, 'routes.json'), 'utf-8'));
    return routes?.endpoints?.unreal?.host ?? 'http://localhost:30010';
  } catch {
    return 'http://localhost:30010';
  }
}

const landmarks = loadLandmarks();

if (wantList) {
  console.log('Available landmarks:');
  for (const l of landmarks) {
    console.log(`  ${l.id.padEnd(34)} ${l.anchor.lat.toFixed(5)}, ${l.anchor.lon.toFixed(5)}  (${l.name})`);
  }
  process.exit(0);
}

// Resolve positional args → { lat, lon, label }
const positional = args.filter(a => !a.startsWith('--'));

let lat, lon, label;

if (positional.length === 0) {
  console.error('Usage:');
  console.error('  node tools/teleport.js LAT LON [--height M]');
  console.error('  node tools/teleport.js LANDMARK_ID [--height M]');
  console.error('  node tools/teleport.js --list');
  process.exit(1);
}

if (positional.length >= 2 && !isNaN(parseFloat(positional[0]))) {
  lat = parseFloat(positional[0]);
  lon = parseFloat(positional[1]);
  label = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
} else {
  const slug = positional[0].toLowerCase();
  const match = landmarks.find(l => l.id.toLowerCase() === slug)
    || landmarks.find(l => l.id.toLowerCase().includes(slug));
  if (!match) {
    console.error(`No landmark matching "${positional[0]}". Try --list.`);
    process.exit(1);
  }
  lat = match.anchor.lat;
  lon = match.anchor.lon;
  label = `${match.name} (${match.id})`;
}

const host = defaultHost();

async function main() {
  let height;
  if (heightArg) {
    height = parseFloat(heightArg);
  } else {
    try {
      height = await estimateHeight(lat, lon);
    } catch {
      height = 37;
    }
  }

  console.log(`Teleporting → ${label}`);
  console.log(`  ${lat.toFixed(5)}, ${lon.toFixed(5)} @ ${height.toFixed(1)}m`);
  console.log(`  Host: ${host}`);

  const result = await setGeoreference(host, lat, lon, height);
  if (result.ok) {
    console.log('  Done.');
  } else {
    console.error(`  Failed: ${result.error}`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
