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
 * Request shape follows ion's OpenAPI spec: type 3DTILES + sourceType
 * RASTER_IMAGERY + an explicit `outputs` array including SPLATS_3DTILES.
 * Override with --source-type, or add/replace any ion option with repeatable
 * --option key=value (values are JSON-parsed; quote to force a string, e.g.
 * --option 'targetVersion="1.1"'). Use --dry-run to print the exact request
 * body without spending a reconstruction job.
 *
 * The reconstruction outputs arrive on the CREATE response, so the id to
 * stream into Unreal is recorded as `splatAssetId` in CAPTURE_MANIFEST.json
 * at submit time — it is not retrievable later from GET /v1/assets/{id}.
 *
 * Requires: CESIUM_ION_TOKEN (assets:read + assets:write + assets:list).
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  createSplatAsset,
  pollAsset,
  getAsset,
  ionToken,
  parseExtraOptions,
  mergeSourceOptions,
  buildSplatOutputs,
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
// `|| default` not `getFlag(name, default)`: a trailing `--source-type` with no
// value yields undefined, which would blank the default instead of keeping it.
const SOURCE_TYPE = getFlag('--source-type') || SPLAT_SOURCE_OPTIONS.sourceType;
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

  // Parsed here, not at module scope, so a malformed --option still gets the
  // banner and the usage line rather than a bare error.
  const EXTRA_OPTIONS = parseExtraOptions(args, (m) => console.log(`  ⚠️ ${m}`));
  // Tag the generated output names so the splat can be identified by an exact
  // string we chose, rather than inferred from whatever ion names them.
  const SOURCE_OPTIONS = mergeSourceOptions({
    sourceType: SOURCE_TYPE,
    ...(NAME ? { outputs: buildSplatOutputs(NAME) } : {}),
    ...EXTRA_OPTIONS,
  });

  // Status-only mode
  if (STATUS_ID) {
    ionToken();
    const asset = await getAsset(STATUS_ID);
    console.log(`  Asset ${STATUS_ID}: ${asset.status} (${asset.percentComplete ?? 0}%)`);
    // GET /v1/assets/{id} carries no derived-output list — the splat id is only
    // on the create response, recorded in CAPTURE_MANIFEST.json at submit time.
    console.log('  (Splat asset id: see splatAssetId in CAPTURE_MANIFEST.json — not available from this endpoint.)');
    return;
  }

  if (!PHOTOS_DIR || !NAME) {
    console.error('Usage: node tools/cesium-capture.js --photos <dir> --name <name> [--description ..] [--source-type ..] [--option k=v ...] [--dry-run] [--no-wait]');
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
  console.log(`  Source type: ${SOURCE_TYPE}  ⚠️ tech preview — verify for splat output`);
  if (Object.keys(EXTRA_OPTIONS).length) {
    console.log(`  Extra opts:  ${JSON.stringify(EXTRA_OPTIONS)}`);
  }
  for (const f of files) console.log(`    - ${path.basename(f)}`);

  if (files.length === 0) {
    console.error('  No images found — nothing to submit.');
    process.exit(1);
  }
  if (files.length < 4) {
    console.log('  ⚠️ Fewer than 4 images — splat reconstruction may be poor (see spike findings).');
  }

  if (DRY_RUN) {
    // Print the exact body that would go on the wire — iterating on the request
    // shape should cost nothing, not a live 400 and a reconstruction job.
    console.log('\n  Request body that would be POSTed to /v1/assets:');
    console.log(JSON.stringify({ name: NAME, description: DESCRIPTION, type: SPLAT_ASSET_TYPE, options: SOURCE_OPTIONS }, null, 2)
      .split('\n').map((l) => `    ${l}`).join('\n'));
    console.log('\n  DRY RUN — no upload performed.');
    rule();
    return;
  }

  ionToken(); // fail fast if missing
  console.log('\n  [ion] Creating asset + uploading…');
  const { assetId, derivedAssets: derived, splatAssetId: splatId, splatMatchMethod } = await createSplatAsset(
    { name: NAME, description: DESCRIPTION, files, options: SOURCE_OPTIONS },
    { onUpload: (i, n, f) => console.log(`  [upload] ${i}/${n}  ${path.basename(f)}`) },
  );
  console.log(`  [ion] Asset created: ${assetId}`);
  if (derived.length) {
    console.log(`  [ion] Reconstruction outputs: ${derived.map((a) => `${a.id}:${a.name ?? a.type}`).join(', ')}`);
  }

  const manifest = {
    assetId,
    name: NAME,
    sourceType: SOURCE_TYPE,
    sourceOptions: SOURCE_OPTIONS,
    assetType: SPLAT_ASSET_TYPE,
    photos: files.map((f) => path.basename(f)),
    submittedAt: new Date().toISOString(),
    status: 'IN_PROGRESS',
    // Captured at create time — these are unreachable once we start polling.
    splatAssetId: splatId,
    splatMatchMethod,
    derivedAssets: derived.map((a) => ({ id: a.id, type: a.type, name: a.name })),
  };
  const manifestPath = path.join(PHOTOS_DIR, 'CAPTURE_MANIFEST.json');

  // Write BEFORE polling. pollAsset throws on ERROR/DATA_ERROR and on the
  // 30-minute timeout, which a real photo set will routinely exceed — and the
  // create-only fields above cannot be recovered from any later API call.
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`  Manifest: ${manifestPath}`);
  reportSplat(splatId, splatMatchMethod, derived, assetId);

  if (NO_WAIT) {
    console.log(`  [ion] Submitted. Poll later: --status ${assetId}`);
    rule();
    return;
  }

  console.log('  [ion] Reconstructing (this can take many minutes)…');
  const final = await pollAsset(assetId, { onProgress: (p) => process.stdout.write(`\r  [ion] ${p}%   `) });
  console.log(`\n  [ion] Done: ${final.status}`);

  manifest.status = final.status;
  // Record what ion actually produced, not just what we requested.
  manifest.ionReportedType = final.type ?? null;
  if (final.options) manifest.ionReportedOptions = final.options;
  manifest.completedAt = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`  Manifest updated: ${manifestPath}`);
  rule();
}

/** Report the streamable splat id, or say precisely why we don't have one. */
function reportSplat(splatId, method, derived, primaryAssetId) {
  if (splatId) {
    if (method === 'name') {
      console.log(`\n  ⚠️ Splat identified by NAME only (asset ${splatId}) — unverified.`);
      console.log("     ion did not mark the output type and our name tag was absent. Confirm in");
      console.log("     ion's UI that this is the Gaussian-splat asset before streaming it.");
    } else {
      console.log(`\n  Next: CESIUM_SPLAT_ASSET_ID=${splatId} — stream via setSplatTileset() (7d.2-A).`);
      console.log(`        (identified by ${method === 'type' ? 'output type' : 'our output-name tag'})`);
    }
    return;
  }
  console.log('  [ion] ⚠️ No Gaussian-splat output identified.');
  if (derived.length === 0) {
    console.log('        ion returned no derived assets — the job may not have requested a splat output.');
    console.log(`        Check options.outputs includes {"outputType":"SPLATS_3DTILES"} (see --dry-run).`);
  } else {
    console.log(`        Outputs returned: ${derived.map((a) => `${a.id}:${a.name ?? a.type}`).join(', ')}`);
    console.log('        None carried a SPLATS_3DTILES marker, or the name match was ambiguous');
    console.log("        (a job name containing 'splat' propagates to every output). Identify it in");
    console.log('        ion\'s UI and set CESIUM_SPLAT_ASSET_ID by hand, then pin the marker field here.');
  }
  console.log(`\n  Primary (mesh) asset: ${primaryAssetId}`);
}

main().catch((e) => {
  console.error(`\n  ✗ ${e.message}`);
  process.exit(1);
});
