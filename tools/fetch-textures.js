#!/usr/bin/env node
/**
 * fetch-textures.js — Download tileable PBR textures from ambientCG (CC0)
 *
 * Downloads base_color, normal, and roughness maps for all material types
 * defined in materialCatalog.js. Files are placed in material-assets/{key}/
 * following the convention expected by the auto-MI spawn pipeline.
 *
 * Source: ambientCG.com (CC0 1.0 Universal license — free for any use)
 *
 * Usage:
 *   node tools/fetch-textures.js                  # Download all
 *   node tools/fetch-textures.js --only brownstone,brick_red
 *   node tools/fetch-textures.js --force           # Re-download even if files exist
 *   node tools/fetch-textures.js --dry-run          # Show what would be downloaded
 *   node tools/fetch-textures.js --resolution 2K    # 2K instead of default 1K
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import https from 'https';
import http from 'http';

const args = process.argv.slice(2);
function getFlag(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : def;
}
function hasFlag(name) { return args.includes(name); }

const DRY_RUN = hasFlag('--dry-run');
const FORCE = hasFlag('--force');
const RESOLUTION = getFlag('--resolution', '1K');
const ONLY = getFlag('--only', null);
const ASSETS_DIR = path.resolve(import.meta.dirname, '..', 'material-assets');

// ─── Texture source mapping ─────────────────────────────────────

const TEXTURE_SOURCES = {
  brownstone:    'Bricks102',
  brick_red:     'Bricks059',
  stone_grey:    'Rock030',
  limestone:     'Bricks075A',
  granite:       'Granite002A',
  cast_iron:     'PaintedMetal004',
  wood_clapboard:'WoodSiding008',
  concrete:      'Concrete034',
  stucco:        'Plaster001',
  terra_cotta:   'Tiles027',
  steel_frame:   'Metal038',
  belgian_block: 'PavingStones128',
  cobblestone:   'PavingStones046',
  granite_flag:  'PavingStones142',
  dirt_packed:   'Ground054',
  macadam:       'Gravel023',
  brick_paving:  'Bricks094'
};

// ambientCG file naming convention inside zip
const MAP_SUFFIXES = {
  base_color: '_Color.png',
  normal:     '_NormalGL.png',
  roughness:  '_Roughness.png'
};

// ─── Download helper ────────────────────────────────────────────

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = url.startsWith('https') ? https.get : http.get;
    get(url, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  const keys = ONLY
    ? ONLY.split(',').map(k => k.trim())
    : Object.keys(TEXTURE_SOURCES);

  console.log(`\nfetch-textures — ambientCG CC0 PBR texture downloader`);
  console.log(`  Resolution: ${RESOLUTION}`);
  console.log(`  Targets:    ${keys.length} material types`);
  console.log(`  Output:     ${ASSETS_DIR}`);
  if (DRY_RUN) console.log(`  Mode:       DRY RUN`);
  console.log('');

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const key of keys) {
    const assetId = TEXTURE_SOURCES[key];
    if (!assetId) {
      console.error(`  ✗ Unknown material key: ${key}`);
      failed++;
      continue;
    }

    const outDir = path.join(ASSETS_DIR, key);
    const bcPath = path.join(outDir, 'base_color.png');

    // Skip if already has real textures (>1KB = not a placeholder)
    if (!FORCE && fs.existsSync(bcPath)) {
      const stat = fs.statSync(bcPath);
      if (stat.size > 1024) {
        console.log(`  ○ ${key} — already has textures (${(stat.size / 1024).toFixed(0)}KB), skipping`);
        skipped++;
        continue;
      }
    }

    const zipUrl = `https://ambientcg.com/get?file=${assetId}_${RESOLUTION}-PNG.zip`;
    console.log(`  ↓ ${key} ← ${assetId} (${RESOLUTION})`);

    if (DRY_RUN) {
      console.log(`    ${zipUrl}`);
      downloaded++;
      continue;
    }

    // Download zip to temp
    const tmpDir = fs.mkdtempSync(path.join(import.meta.dirname, '.tmp-tex-'));
    const zipPath = path.join(tmpDir, `${assetId}.zip`);

    try {
      await download(zipUrl, zipPath);

      // Extract zip
      execSync(`unzip -o -q "${zipPath}" -d "${tmpDir}"`);

      // Find and copy texture files
      fs.mkdirSync(outDir, { recursive: true });
      let found = 0;
      for (const [mapName, suffix] of Object.entries(MAP_SUFFIXES)) {
        const srcName = `${assetId}_${RESOLUTION}-PNG${suffix}`;
        const srcPath = path.join(tmpDir, srcName);
        const destPath = path.join(outDir, `${mapName}.png`);

        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, destPath);
          const size = (fs.statSync(destPath).size / 1024).toFixed(0);
          console.log(`    ✓ ${mapName}.png (${size}KB)`);
          found++;
        } else {
          // Some assets don't have all maps — that's OK
          if (mapName !== 'roughness') {
            console.log(`    ⚠ ${mapName}.png not found in archive`);
          }
        }
      }

      if (found > 0) downloaded++;
      else failed++;

    } catch (err) {
      console.error(`    ✗ Failed: ${err.message}`);
      failed++;
    } finally {
      // Cleanup temp
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  console.log(`\nDone: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
