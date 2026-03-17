#!/usr/bin/env node

/**
 * Reference image → 3D building generator.
 *
 * Two-stage pipeline: Gemini generates an architectural reference image
 * from building metadata, then Meshy Image-to-3D converts it to a
 * textured 3D mesh. Tier 2 in the asset pipeline hierarchy — used when
 * no historical photo exists but you want better fidelity than text-only.
 *
 * Usage:
 *   # Full pipeline: Gemini reference image → Meshy Image-to-3D
 *   node tools/generate-building-refs.js terrain-data/manhattan-ny/ --era nyc_1884
 *   node tools/generate-building-refs.js terrain-data/manhattan-ny/ --era nyc_1884 --index 9
 *
 *   # Just generate reference images (no Meshy, no credits spent)
 *   node tools/generate-building-refs.js terrain-data/manhattan-ny/ --era nyc_1884 --image-only
 *
 *   # Preview prompts without any API calls
 *   node tools/generate-building-refs.js terrain-data/manhattan-ny/ --era nyc_1884 --dry-run
 *
 *   # Control quality tier (affects Meshy polycount)
 *   node tools/generate-building-refs.js terrain-data/manhattan-ny/ --era nyc_1884 --quality hero
 *
 * Requires: GOOGLE_AI_API_KEY (Gemini), MESHY_API_KEY (Meshy, unless --image-only)
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildReferenceImageForBuilding, QUALITY_TIERS } from '../lib/texturePromptBuilder.js';
import { generateImage, saveImage, toDataUri } from '../lib/geminiImageGen.js';
import {
  createImageTo3D,
  pollTask,
  downloadModel,
  getBalance,
} from '../lib/meshyClient.js';
import { parseSpawnArgs } from '../lib/rcHelpers.js';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const { getFlag, hasFlag, positionalArg: terrainDir } = parseSpawnArgs(process.argv.slice(2));
const era = getFlag('--era');
const year = getFlag('--year');
const quality = getFlag('--quality', 'foreground');
const indexFilter = getFlag('--index');
const dryRun = hasFlag('--dry-run');
const imageOnly = hasFlag('--image-only');
const force = hasFlag('--force');
const format = getFlag('--format', 'fbx');
const geminiModel = getFlag('--model');

if (!terrainDir) {
  console.error('Usage: generate-building-refs.js <terrain-data-dir/> --era <era>');
  console.error('');
  console.error('  Pipeline: building metadata → Gemini reference image → Meshy Image-to-3D');
  console.error('');
  console.error('  Required: --era <era> or --year <year>');
  console.error('  Optional: --quality hero|foreground|background|distant (default: foreground)');
  console.error('            --index <N>       Single building only');
  console.error('            --format fbx|glb  Output format (default: fbx)');
  console.error('            --model <id>      Gemini model override');
  console.error('            --image-only      Generate reference images, skip Meshy');
  console.error('            --dry-run         Preview prompts, no API calls');
  console.error('            --force           Overwrite existing output');
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
const features = geojson.features || [];

// Build opts
const opts = {};
if (era) opts.era = era;
if (year) opts.year = parseInt(year, 10);
if (!era && !year) {
  const targetYear = geojson._meta?.targetYear;
  if (targetYear) opts.year = targetYear;
}

// Filter features and build prompts
const allBuildings = features.map((feature, index) => {
  const props = feature.properties || {};
  const result = buildReferenceImageForBuilding(props, opts);
  return {
    index,
    address: props.address || `building-${index}`,
    styleName: result.style.styleName,
    prompt: result.prompt,
    style: result.style,
    building: result.building,
  };
});

const buildings = indexFilter != null
  ? allBuildings.filter(b => b.index === parseInt(indexFilter, 10))
  : allBuildings;

if (buildings.length === 0) {
  console.error(`No buildings found${indexFilter != null ? ` at index ${indexFilter}` : ''}`);
  process.exit(1);
}

const tier = QUALITY_TIERS[quality];
const meshyCreditsEach = 30; // Image-to-3D with texture
const totalMeshyCredits = imageOnly ? 0 : buildings.length * meshyCreditsEach;

console.log(`Buildings:    ${buildings.length} of ${allBuildings.length}`);
console.log(`Quality:      ${quality} (${tier.polycount.toLocaleString()} polys)`);
console.log(`Mode:         ${imageOnly ? 'image-only (Gemini only)' : 'full pipeline (Gemini → Meshy)'}`);
if (!imageOnly) console.log(`Meshy cost:   ~${totalMeshyCredits} credits`);
console.log(`Era:          ${opts.era || 'auto'} (year ${opts.year || 'auto'})`);
console.log();

// ---------------------------------------------------------------------------
// Dry run — just print prompts
// ---------------------------------------------------------------------------

if (dryRun) {
  for (const b of buildings) {
    console.log(`━━━ ${b.index}: ${b.address} (${b.styleName}) ━━━`);
    console.log(`  ${b.prompt}`);
    console.log();
  }
  console.log(`[DRY RUN] ${buildings.length} buildings. No API calls.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

// Output directory for reference images
const refsDir = path.join(terrainDir, 'reference-images');

async function processBuilding(b) {
  const slug = (b.address || `building-${b.index}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const imagePath = path.join(refsDir, `${slug}.png`);
  const meshDir = path.join('mesh-data', `${slug}-ref`);

  // Check existing output
  if (!force) {
    if (imageOnly && fs.existsSync(imagePath)) {
      console.log(`  SKIP image (exists: ${imagePath}). Use --force to overwrite.`);
      return { index: b.index, status: 'skipped', slug };
    }
    if (!imageOnly && fs.existsSync(meshDir)) {
      console.log(`  SKIP mesh (exists: ${meshDir}). Use --force to overwrite.`);
      return { index: b.index, status: 'skipped', slug };
    }
  }

  // Stage 1: Generate reference image via Gemini
  process.stdout.write('  Generating reference image...');
  const imageResult = await generateImage(b.prompt, {
    model: geminiModel || undefined,
  });
  saveImage(imageResult, imagePath);
  const sizeKb = Math.round(imageResult.image.length / 1024);
  process.stdout.write(`\r  Reference image: ${imagePath} (${sizeKb}KB)\n`);

  if (imageOnly) {
    return { index: b.index, status: 'image-only', slug, imagePath };
  }

  // Stage 2: Feed reference image into Meshy Image-to-3D
  const dataUri = toDataUri(imageResult);

  const taskId = await createImageTo3D({
    imageUrl: dataUri,
    targetPolycount: tier.polycount,
    shouldRemesh: true,
    shouldTexture: true,
    enablePbr: true,
  });

  process.stdout.write(`  Meshy ${taskId.slice(0, 8)}...`);
  const task = await pollTask(taskId, 'image-to-3d', (p) => {
    process.stdout.write(`\r  Meshy ${taskId.slice(0, 8)}... ${p}%`);
  });
  process.stdout.write(`\r  Meshy complete.                \n`);

  // Download model
  const files = await downloadModel(task, meshDir, format);

  // Write manifest
  const manifest = {
    name: slug,
    address: b.address,
    buildingIndex: b.index,
    generatedAt: new Date().toISOString(),
    pipeline: 'gemini-reference-image-to-3d',
    geminiModel: geminiModel || 'gemini-2.0-flash-exp',
    aiModel: 'meshy-6',
    styleName: b.styleName,
    quality,
    polycount: tier.polycount,
    referenceImagePrompt: b.prompt,
    referenceImagePath: imagePath,
    meshyTaskId: taskId,
    formats: [format, ...(format !== 'glb' ? ['glb'] : [])],
    pbr: true,
  };
  fs.writeFileSync(
    path.join(meshDir, 'GENERATION_MANIFEST.json'),
    JSON.stringify(manifest, null, 2),
  );

  return { index: b.index, status: 'ok', slug, imagePath, meshDir, files };
}

async function main() {
  // Check Meshy balance (only if doing full pipeline)
  let balance;
  if (!imageOnly) {
    try {
      balance = await getBalance();
      console.log(`Meshy balance: ${balance} credits`);
      if (balance < totalMeshyCredits) {
        console.warn(`Warning: may not have enough credits (need ~${totalMeshyCredits}, have ${balance})`);
      }
    } catch (e) {
      console.warn(`Could not check Meshy balance: ${e.message}`);
    }
  }
  console.log();

  const results = [];
  let generated = 0;
  let imageOnlyCount = 0;
  let skipped = 0;
  let failed = 0;

  for (let bi = 0; bi < buildings.length; bi++) {
    const b = buildings[bi];
    console.log(`━━━ Building ${b.index}: ${b.address} (${b.styleName}) ━━━`);

    try {
      const result = await processBuilding(b);
      results.push(result);

      if (result.status === 'skipped') {
        skipped++;
      } else if (result.status === 'image-only') {
        imageOnlyCount++;
      } else {
        generated++;
        console.log(`  → ${result.meshDir}/`);
      }
    } catch (e) {
      console.error(`  FAILED: ${e.message}`);
      results.push({ index: b.index, status: 'failed', error: e.message });
      failed++;
    }

    // Brief pause between buildings to avoid rate limits
    if (bi < buildings.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Summary
  console.log('\n━━━ Summary ━━━');
  if (imageOnly) {
    console.log(`Reference images: ${imageOnlyCount}`);
  } else {
    console.log(`3D models:        ${generated}`);
  }
  console.log(`Skipped:          ${skipped}`);
  console.log(`Failed:           ${failed}`);

  if (!imageOnly) {
    let balanceAfter;
    try { balanceAfter = await getBalance(); } catch { /* ok */ }
    if (balance != null && balanceAfter != null) {
      console.log(`Meshy credits:    ${balance} → ${balanceAfter} (used ${balance - balanceAfter})`);
    }
  }

  if (imageOnly && imageOnlyCount > 0) {
    console.log(`\nReference images saved to: ${refsDir}/`);
    console.log('Run without --image-only to generate 3D models from these images.');
  }
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
