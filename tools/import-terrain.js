#!/usr/bin/env node
/**
 * import-terrain.js — Automated terrain import into Unreal via RC API
 *
 * Reads a processed heightmap (and optional imagery) from a terrain-data directory,
 * validates the files, and imports them into Unreal as a Landscape actor via
 * Python scripting through the Remote Control API.
 *
 * Falls back to printing manual instructions when Unreal is not reachable or --manual.
 *
 * Usage:
 *   node tools/import-terrain.js terrain-data/manhattan-ny/
 *   node tools/import-terrain.js terrain-data/manhattan-ny/ --host http://100.96.244.16:30010
 *   node tools/import-terrain.js terrain-data/manhattan-ny/ --daemon-url http://100.68.243.96:3000
 *   node tools/import-terrain.js terrain-data/manhattan-ny/ --manual
 *   node tools/import-terrain.js terrain-data/manhattan-ny/ --dry-run
 */

import fs from 'fs';
import path from 'path';
import { isUnrealReachable } from '../lib/cesiumGeoreference.js';
import { importLandscape } from '../lib/landscapeImport.js';

// ─── Argument parsing ────────────────────────────────────────────

const args = process.argv.slice(2);

function getFlag(name, defaultValue) {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultValue;
  return args[idx + 1];
}

const hasFlag = (name) => args.includes(name);

const HOST = getFlag('--host', 'http://localhost:30010');
const DAEMON_URL = getFlag('--daemon-url', null);
const DRY_RUN = hasFlag('--dry-run');
const MANUAL = hasFlag('--manual');

// Terrain data directory is the first positional arg
const terrainDir = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));

if (!terrainDir) {
  console.error('Usage: node tools/import-terrain.js <terrain-data-dir/> [options]');
  console.error('');
  console.error('Options:');
  console.error('  --host URL         Unreal RC API host (default: http://localhost:30010)');
  console.error('  --daemon-url URL   Mac daemon URL reachable from PC (for automated import)');
  console.error('  --manual           Force manual instructions (skip automated import)');
  console.error('  --dry-run          Show what would be imported without sending to Unreal');
  process.exit(1);
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(' Unreal Terrain Importer');
  console.log(`  Host: ${HOST}`);
  console.log('═══════════════════════════════════════════════\n');

  // Read metadata
  const metadataPath = path.join(terrainDir, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    console.error(`  No metadata.json found in ${terrainDir}`);
    console.error('  Run fetch-dem.js first to generate terrain data.');
    process.exit(1);
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  console.log(`  Location:   ${metadata.name || 'Unknown'}`);
  console.log(`  Coordinates: ${metadata.lat?.toFixed(4)}, ${metadata.lon?.toFixed(4)}`);

  // Find heightmap
  const heightmapInfo = metadata.heightmap;
  let heightmapPath = null;

  if (heightmapInfo?.path && fs.existsSync(heightmapInfo.path)) {
    heightmapPath = path.resolve(heightmapInfo.path);
  } else {
    for (const ext of ['heightmap.r16', 'heightmap.png']) {
      const p = path.join(terrainDir, ext);
      if (fs.existsSync(p)) { heightmapPath = path.resolve(p); break; }
    }
  }

  if (!heightmapPath) {
    console.error('  No heightmap file found. Run fetch-dem.js first.');
    process.exit(1);
  }

  console.log(`  Heightmap:  ${heightmapPath}`);
  console.log(`  Dimensions: ${heightmapInfo?.dimensions?.w || '?'} x ${heightmapInfo?.dimensions?.h || '?'}`);
  console.log(`  Elevation:  ${heightmapInfo?.elevation?.min?.toFixed(1) || '?'}m – ${heightmapInfo?.elevation?.max?.toFixed(1) || '?'}m`);

  // Check for imagery
  const imageryPath = path.join(terrainDir, 'imagery.png');
  const hasImagery = fs.existsSync(imageryPath);
  if (hasImagery) {
    console.log(`  Imagery:    ${path.resolve(imageryPath)}`);
  }

  // Check for PNG16 (needed for automated import)
  const png16Path = path.join(terrainDir, 'heightmap_16bit.png');
  const hasPng16 = fs.existsSync(png16Path);
  if (hasPng16) {
    console.log(`  PNG16:      ${path.resolve(png16Path)}`);
  }

  // Unreal scale factors
  const scale = heightmapInfo?.unrealScale || { x: 100, y: 100, z: 100 };
  console.log(`  Scale:      X=${scale.x?.toFixed(2)}, Y=${scale.y?.toFixed(2)}, Z=${scale.z?.toFixed(2)}`);

  if (DRY_RUN) {
    console.log('\n  [Dry run] Would import the above terrain data.');
    return;
  }

  // Try automated import (unless --manual)
  if (!MANUAL) {
    console.log('\n  Checking Unreal connectivity...');
    const reachable = await isUnrealReachable(HOST);

    if (reachable && DAEMON_URL && hasPng16) {
      console.log('  Unreal connected. Starting automated import...\n');
      const slug = metadata.slug || path.basename(terrainDir);

      const result = await importLandscape({
        host: HOST,
        daemonUrl: DAEMON_URL,
        lat: metadata.lat,
        lon: metadata.lon,
        slug,
        location: metadata.name,
        radius: metadata.radiusMeters || 500
      });

      if (result.ok) {
        console.log(`\n  Import successful! Landscape: ${result.landscape}`);
        console.log('═══════════════════════════════════════════════');
        return;
      } else {
        console.warn(`\n  Automated import failed: ${result.error}`);
        console.log('  Falling back to manual instructions...\n');
      }
    } else if (reachable && !DAEMON_URL) {
      console.log('  Unreal connected, but --daemon-url not provided.');
      console.log('  Provide --daemon-url for automated import, or use manual instructions.\n');
    } else if (reachable && !hasPng16) {
      console.log('  Unreal connected, but no PNG16 heightmap found.');
      console.log('  Re-run fetch-dem.js to regenerate terrain data with PNG16 output.\n');
    } else {
      console.log('  Unreal not reachable. Showing manual instructions.\n');
    }
  }

  // Manual instructions fallback
  printManualInstructions(heightmapPath, heightmapInfo, scale, hasImagery ? path.resolve(imageryPath) : null);
  console.log('\n═══════════════════════════════════════════════');
}

function printManualInstructions(heightmapPath, heightmapInfo, scale, imageryPath) {
  const w = heightmapInfo?.dimensions?.w || '?';
  const h = heightmapInfo?.dimensions?.h || '?';
  console.log(`  ─── Manual Import Instructions ──────────────`);
  console.log(`\n  Unreal Landscape Import:`);
  console.log(`    1. Open Landscape Mode (Shift+3 or Modes panel)`);
  console.log(`    2. Select "Import from File" tab`);
  console.log(`    3. Heightmap File: ${heightmapPath}`);
  console.log(`    4. Dimensions: ${w} x ${h}`);
  console.log(`    5. Scale X: ${scale.x?.toFixed(2)}, Y: ${scale.y?.toFixed(2)}, Z: ${scale.z?.toFixed(2)}`);
  console.log(`    6. Click "Import"`);
  if (imageryPath) {
    console.log(`\n  Satellite Imagery:`);
    console.log(`    7. Drag ${imageryPath} into Content Browser`);
    console.log(`    8. Create a Landscape material with this texture as Base Color`);
    console.log(`    9. Assign material to the Landscape actor`);
  }
}

main().catch(e => { console.error(`\n  Error: ${e.message}`); process.exit(1); });
