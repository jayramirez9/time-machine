#!/usr/bin/env node

/**
 * Batch 3D building texture generator.
 *
 * Reads buildings.geojson, classifies each building via architecture styles,
 * generates Meshy API prompts via texturePromptBuilder, and calls Meshy to
 * produce textured 3D models. Downloads results to mesh-data/{slug}/.
 *
 * Usage:
 *   node tools/texture-buildings.js terrain-data/manhattan-ny/ --era nyc_1884
 *   node tools/texture-buildings.js terrain-data/manhattan-ny/ --era nyc_1884 --index 9
 *   node tools/texture-buildings.js terrain-data/manhattan-ny/ --era nyc_1884 --quality hero
 *   node tools/texture-buildings.js terrain-data/manhattan-ny/ --era nyc_1884 --dry-run
 *   node tools/texture-buildings.js terrain-data/manhattan-ny/ --era nyc_1884 --only-preview
 *   node tools/texture-buildings.js terrain-data/manhattan-ny/ --era nyc_1884 --force
 */

import fs from 'node:fs';
import path from 'node:path';
import { previewAllPrompts, QUALITY_TIERS } from '../lib/texturePromptBuilder.js';
import {
  createTextTo3D,
  pollTask,
  downloadModel,
  getBalance,
} from '../lib/meshyClient.js';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getFlag(name, defaultValue = null) {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultValue;
  return args[idx + 1] || defaultValue;
}
const hasFlag = (name) => args.includes(name);

const terrainDir = args.find(a => !a.startsWith('-'));
const era = getFlag('--era');
const year = getFlag('--year');
const quality = getFlag('--quality', 'background');
const indexFilter = getFlag('--index');
const dryRun = hasFlag('--dry-run');
const onlyPreview = hasFlag('--only-preview');
const force = hasFlag('--force');
const format = getFlag('--format', 'fbx');

if (!terrainDir) {
  console.error('Usage: texture-buildings.js <terrain-data-dir/> --era <era>');
  console.error('  Required: --era <era> or --year <year>');
  console.error('  Optional: --quality hero|foreground|background|distant (default: background)');
  console.error('            --index <N>  Generate only building N');
  console.error('            --format fbx|glb (default: fbx)');
  console.error('            --dry-run    Preview prompts, no API calls');
  console.error('            --only-preview  Same as --dry-run (alias)');
  console.error('            --force      Overwrite existing mesh-data');
  process.exit(1);
}

if (!QUALITY_TIERS[quality]) {
  console.error(`Unknown quality tier: "${quality}". Available: ${Object.keys(QUALITY_TIERS).join(', ')}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load buildings
// ---------------------------------------------------------------------------

const geojsonPath = path.join(terrainDir, 'buildings.geojson');
if (!fs.existsSync(geojsonPath)) {
  console.error(`Not found: ${geojsonPath}`);
  process.exit(1);
}

const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf-8'));

// Build opts
const opts = { mode: 'text-to-3d', quality };
if (era) opts.era = era;
if (year) opts.year = parseInt(year, 10);
if (!era && !year) {
  const targetYear = geojson._meta?.targetYear;
  if (targetYear) opts.year = targetYear;
}

// Generate all previews
const allPreviews = previewAllPrompts(geojson, opts);
const previews = indexFilter != null
  ? allPreviews.filter(p => p.index === parseInt(indexFilter, 10))
  : allPreviews;

if (previews.length === 0) {
  console.error(`No buildings found${indexFilter != null ? ` at index ${indexFilter}` : ''}`);
  process.exit(1);
}

const totalCredits = previews.reduce((s, p) => s + p.creditEstimate, 0);
const tier = QUALITY_TIERS[quality];

console.log(`Buildings:  ${previews.length} of ${allPreviews.length}`);
console.log(`Quality:    ${quality} (${tier.polycount.toLocaleString()} polys)`);
console.log(`Est. cost:  ~${totalCredits} credits`);
console.log(`Era:        ${opts.era || 'auto'} (year ${opts.year || 'auto'})`);
console.log();

// ---------------------------------------------------------------------------
// Dry run — just print prompts
// ---------------------------------------------------------------------------

if (dryRun || onlyPreview) {
  for (const p of previews) {
    console.log(`━━━ ${p.index}: ${p.address} (${p.styleName}) ━━━`);
    console.log(`  ${p.prompt.slice(0, 120)}...`);
  }
  console.log(`\n[DRY RUN] ${previews.length} buildings, ~${totalCredits} credits. No API calls.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

async function generateBuilding(preview) {
  const slug = (preview.address || `building-${preview.index}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const outputDir = path.join('mesh-data', slug);

  if (fs.existsSync(outputDir) && !force) {
    console.log(`  SKIP (exists: ${outputDir}). Use --force to overwrite.`);
    return { index: preview.index, status: 'skipped', slug };
  }

  // Stage 1: Preview (geometry)
  const previewId = await createTextTo3D({
    mode: 'preview',
    prompt: preview.prompt,
    negativePrompt: preview.negative,
    targetPolycount: preview.polycount,
  });

  process.stdout.write(`  Preview ${previewId.slice(0, 8)}...`);
  const previewTask = await pollTask(previewId, 'text-to-3d', (p) => {
    process.stdout.write(`\r  Preview ${previewId.slice(0, 8)}... ${p}%`);
  });
  process.stdout.write(`\r  Preview complete.              \n`);

  // Stage 2: Refine (texture)
  const refineId = await createTextTo3D({
    mode: 'refine',
    previewTaskId: previewId,
    enablePbr: true,
  });

  process.stdout.write(`  Refine ${refineId.slice(0, 8)}...`);
  const refineTask = await pollTask(refineId, 'text-to-3d', (p) => {
    process.stdout.write(`\r  Refine ${refineId.slice(0, 8)}... ${p}%`);
  });
  process.stdout.write(`\r  Refine complete.               \n`);

  // Download
  const files = await downloadModel(refineTask, outputDir, format);

  // Write manifest
  const manifest = {
    name: slug,
    address: preview.address,
    buildingIndex: preview.index,
    generatedAt: new Date().toISOString(),
    mode: 'text-to-3d',
    aiModel: 'meshy-6',
    styleName: preview.styleName,
    quality,
    polycount: preview.polycount,
    prompt: preview.prompt,
    negativePrompt: preview.negative,
    previewTaskId: previewId,
    refineTaskId: refineId,
    formats: [format, ...(format !== 'glb' ? ['glb'] : [])],
    pbr: true,
  };
  fs.writeFileSync(
    path.join(outputDir, 'GENERATION_MANIFEST.json'),
    JSON.stringify(manifest, null, 2)
  );

  return { index: preview.index, status: 'ok', slug, files };
}

async function main() {
  // Check balance
  let balance;
  try {
    balance = await getBalance();
    console.log(`Balance:    ${balance} credits`);
    if (balance < totalCredits) {
      console.warn(`Warning: may not have enough credits (need ~${totalCredits}, have ${balance})`);
    }
  } catch (e) {
    console.warn(`Could not check balance: ${e.message}`);
  }
  console.log();

  const results = [];
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const preview of previews) {
    console.log(`━━━ Building ${preview.index}: ${preview.address} (${preview.styleName}) ━━━`);

    try {
      const result = await generateBuilding(preview);
      results.push(result);

      if (result.status === 'skipped') {
        skipped++;
      } else {
        generated++;
        console.log(`  → ${result.slug}/`);
      }
    } catch (e) {
      console.error(`  FAILED: ${e.message}`);
      results.push({ index: preview.index, status: 'failed', error: e.message });
      failed++;
    }

    // Brief pause between buildings to avoid rate limits
    if (previews.indexOf(preview) < previews.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Final balance
  let balanceAfter;
  try { balanceAfter = await getBalance(); } catch { /* ok */ }

  console.log('\n━━━ Summary ━━━');
  console.log(`Generated: ${generated}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(`Failed:    ${failed}`);
  if (balance != null && balanceAfter != null) {
    console.log(`Credits:   ${balance} → ${balanceAfter} (used ${balance - balanceAfter})`);
  }
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
