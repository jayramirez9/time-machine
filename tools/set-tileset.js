#!/usr/bin/env node
/**
 * set-tileset.js — Configure Cesium 3D Tileset source in Unreal
 *
 * Sets the URL on a Cesium3DTileset actor via the Remote Control API.
 * Primary use: Google Photorealistic 3D Tiles for location scouting/preview.
 *
 * Usage:
 *   node tools/set-tileset.js google                          # Google 3D Tiles (needs GOOGLE_3D_TILES_API_KEY)
 *   node tools/set-tileset.js --url https://example.com/t.json  # Custom tileset URL
 *   node tools/set-tileset.js --clear                         # Disable tileset
 *   node tools/set-tileset.js --status                        # Check current tileset state
 *
 * Note: Google 3D Tiles are for scouting/preview only — ToS restricts production use.
 */

import { setTilesetUrl, clearTileset, getTilesetStatus, googleTilesUrl } from '../lib/cesiumTileset.js';

// ─── Argument parsing ────────────────────────────────────────────

const args = process.argv.slice(2);

function getFlag(name, defaultValue) {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultValue;
  return args[idx + 1];
}

function hasFlag(name) {
  return args.includes(name);
}

const HOST = getFlag('--host', 'http://localhost:30010');
const customUrl = getFlag('--url', null);
const wantsClear = hasFlag('--clear');
const wantsStatus = hasFlag('--status');
const wantsGoogle = args[0] === 'google';

if (!wantsGoogle && !customUrl && !wantsClear && !wantsStatus) {
  console.error('Usage: node tools/set-tileset.js google              # Google 3D Tiles');
  console.error('       node tools/set-tileset.js --url <tileset-url> # Custom URL');
  console.error('       node tools/set-tileset.js --clear             # Disable tileset');
  console.error('       node tools/set-tileset.js --status            # Check current state');
  console.error('\nSet GOOGLE_3D_TILES_API_KEY env var for Google 3D Tiles.');
  process.exit(1);
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(' Cesium 3D Tileset Manager');
  console.log(`  Host: ${HOST}`);
  console.log('═══════════════════════════════════════════════\n');

  // Status check
  if (wantsStatus) {
    const status = await getTilesetStatus(HOST);
    if (!status.ok) {
      console.error(`  Error: ${status.error}`);
      process.exit(1);
    }
    if (!status.found) {
      console.log('  No Cesium3DTileset actor found in scene.');
      console.log('  Add one via the Cesium panel in Unreal (Quick Add > Blank 3D Tiles Tileset).');
    } else {
      console.log(`  Actor: ${status.objectPath}`);
      console.log(`  URL:   ${status.url || '(empty)'}`);
    }
    console.log('\n═══════════════════════════════════════════════');
    return;
  }

  // Clear
  if (wantsClear) {
    console.log('  Clearing tileset URL...');
    const result = await clearTileset(HOST);
    if (result.ok) {
      console.log(`  Tileset disabled on ${result.objectPath}`);
    } else {
      console.error(`  Failed: ${result.error}`);
      process.exit(1);
    }
    console.log('\n═══════════════════════════════════════════════');
    return;
  }

  // Determine URL
  let url;
  if (wantsGoogle) {
    const apiKey = process.env.GOOGLE_3D_TILES_API_KEY;
    if (!apiKey) {
      console.error('  GOOGLE_3D_TILES_API_KEY env var not set.');
      console.error('  Get a key at: https://console.cloud.google.com/apis/credentials');
      console.error('  Enable the "Map Tiles API" in your Google Cloud project.');
      process.exit(1);
    }
    url = googleTilesUrl(apiKey);
    console.log('  Source: Google Photorealistic 3D Tiles');
    console.log('  Note:   Scouting/preview only — not licensed for production use.\n');
  } else {
    url = customUrl;
    console.log(`  Source: Custom URL\n`);
  }

  // Set URL
  console.log('  Setting Cesium3DTileset URL...');
  const result = await setTilesetUrl(HOST, url);

  if (result.ok) {
    console.log(`  Actor: ${result.objectPath}`);
    console.log(`  URL:   ${wantsGoogle ? 'Google 3D Tiles (key redacted)' : url}`);
    console.log('\n  Tileset configured. Tiles will begin streaming in the Unreal viewport.');
  } else {
    console.error(`  Failed: ${result.error}`);
    process.exit(1);
  }

  console.log('\n═══════════════════════════════════════════════');
}

main().catch(e => { console.error(e); process.exit(1); });
