#!/usr/bin/env node
/**
 * cesium-capture.js — Submit imagery to Cesium ion for capture-based
 * reconstruction (mesh / point cloud / 3D Gaussian splat) and record the
 * resulting ion asset ID for the Unreal streaming side (Phase 7d.2).
 *
 * Usage:
 *   # Submit a folder of photos for splat reconstruction
 *   CESIUM_ION_TOKEN=xxx node tools/cesium-capture.js \
 *     --photos photos/spike-trinity/ --name "Trinity Church 1903 (archival)"
 *
 *   # Preview without uploading
 *   node tools/cesium-capture.js --photos photos/spike-trinity/ --name trinity --dry-run
 *
 *   # Check status of an existing asset
 *   CESIUM_ION_TOKEN=xxx node tools/cesium-capture.js --status 12345
 *
 * Output: CAPTURE_MANIFEST.json (assetId, source files, status) in the photos dir.
 *
 * ⚠️ Gaussian-splat output via the ion REST API is new (2026) and not yet
 * publicly documented. Use --source-type to override the (best-guess) default
 * if your account expects a different value. The upload/tiling flow itself is
 * the documented, stable ion REST flow.
 *
 * Requires: CESIUM_ION_TOKEN (assets:read + assets:write).
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  createSplatAsset,
  pollAsset,
  getAsset,
  ionToken,
  SPLAT_ASSET_TYPE,
  SPLAT_SOURCE_OPTIONS,
} from '../lib/cesiumIon.js';

const args = process.argv.slice(2);
const getFlag = (name, def = null) => {
  const i = args.indexOf(name);
  return i === -1 ? def : args[i + 1];
};
const hasFlag = (name) => args.includes(name);

const PHOTOS_DIR = getFlag('--photos');
const NAME = getFlag('--name');
const DESCRIPTION = getFlag('--description', '');
const SOURCE_TYPE = getFlag('--source-type', SPLAT_SOURCE_OPTIONS.sourceType);
const STATUS_ID = getFlag('--status');
const DRY_RUN = hasFlag('--dry-run');
const NO_WAIT = hasFlag('--no-wait');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp']);

function listImages(dir) {
  return fs.readdirSync(dir)
    .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .map((f) => path.join(dir, f))
    .sort();
}

function rule() { console.log('═'.repeat(49)); }

async function main() {
  rule();
  console.log(' Cesium ion Capture');
  rule();

  // Status-only mode
  if (STATUS_ID) {
    ionToken();
    const asset = await getAsset(STATUS_ID);
    console.log(`  Asset ${STATUS_ID}: ${asset.status} (${asset.percentComplete ?? 0}%)`);
    return;
  }

  if (!PHOTOS_DIR || !NAME) {
    console.error('Usage: node tools/cesium-capture.js --photos <dir> --name <name> [--description ..] [--source-type ..] [--dry-run] [--no-wait]');
    console.error('       node tools/cesium-capture.js --status <assetId>');
    process.exit(1);
  }
  if (!fs.existsSync(PHOTOS_DIR)) {
    console.error(`  Photos dir not found: ${PHOTOS_DIR}`);
    process.exit(1);
  }

  const files = listImages(PHOTOS_DIR);
  console.log(`  Name:        ${NAME}`);
  console.log(`  Photos dir:  ${PHOTOS_DIR}`);
  console.log(`  Images:      ${files.length}`);
  console.log(`  Asset type:  ${SPLAT_ASSET_TYPE}`);
  console.log(`  Source type: ${SOURCE_TYPE}  ⚠️ verify for splat output`);
  for (const f of files) console.log(`    - ${path.basename(f)}`);

  if (files.length === 0) {
    console.error('  No images found — nothing to submit.');
    process.exit(1);
  }
  if (files.length < 4) {
    console.log('  ⚠️ Fewer than 4 images — splat reconstruction may be poor (see spike findings).');
  }

  if (DRY_RUN) {
    console.log('\n  DRY RUN — no upload performed.');
    rule();
    return;
  }

  ionToken(); // fail fast if missing
  console.log('\n  [ion] Creating asset + uploading…');
  const { assetId } = await createSplatAsset(
    { name: NAME, description: DESCRIPTION, files, options: { sourceType: SOURCE_TYPE } },
    { onUpload: (i, n, f) => console.log(`  [upload] ${i}/${n}  ${path.basename(f)}`) },
  );
  console.log(`  [ion] Asset created: ${assetId}`);

  const manifest = {
    assetId,
    name: NAME,
    sourceType: SOURCE_TYPE,
    assetType: SPLAT_ASSET_TYPE,
    photos: files.map((f) => path.basename(f)),
    submittedAt: new Date().toISOString(),
    status: 'IN_PROGRESS',
  };
  const manifestPath = path.join(PHOTOS_DIR, 'CAPTURE_MANIFEST.json');

  if (NO_WAIT) {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`  [ion] Submitted. Poll later: --status ${assetId}`);
    console.log(`  Manifest: ${manifestPath}`);
    rule();
    return;
  }

  console.log('  [ion] Reconstructing (this can take many minutes)…');
  const final = await pollAsset(assetId, { onProgress: (p) => process.stdout.write(`\r  [ion] ${p}%   `) });
  console.log(`\n  [ion] Done: ${final.status}`);

  manifest.status = final.status;
  // Record what ion actually produced, not just what we requested — lets the
  // operator confirm a splat (vs. mesh) came out, since the source-type is a guess.
  manifest.ionReportedType = final.type ?? null;
  if (final.options) manifest.ionReportedOptions = final.options;
  manifest.completedAt = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`  Manifest: ${manifestPath}`);
  console.log(`\n  Next: stream asset ${assetId} into Unreal via setSplatTileset() (7d.2 deliverable A).`);
  rule();
}

main().catch((e) => {
  console.error(`\n  ✗ ${e.message}`);
  process.exit(1);
});
