#!/usr/bin/env node

/**
 * Reference image → 3D building generator.
 *
 * Three-tier pipeline for 3D building generation:
 *   Tier 1 (best): Historical photo from LOC/NYPL → Meshy Image-to-3D
 *   Tier 2 (good): Gemini-generated reference image → Meshy Image-to-3D
 *   Tier 3 (fallback): Text prompt → Meshy Text-to-3D (separate tool)
 *
 * When --photos or --auto-fetch is used, real historical photographs are
 * preferred over AI-generated reference images. Photos are matched to
 * buildings by street name; unmatched buildings fall back to Gemini.
 *
 * Usage:
 *   # Full pipeline with auto-fetched LOC photos (best quality)
 *   node tools/generate-building-refs.js terrain-data/manhattan-ny/ --era nyc_1884 --auto-fetch
 *
 *   # Use previously downloaded photos (from fetch-photos.js)
 *   node tools/generate-building-refs.js terrain-data/manhattan-ny/ --era nyc_1884 --photos photos/manhattan-ny/
 *
 *   # Gemini-only (no photo archive, original behavior)
 *   node tools/generate-building-refs.js terrain-data/manhattan-ny/ --era nyc_1884
 *
 *   # Preview which buildings get photos vs Gemini (no API calls)
 *   node tools/generate-building-refs.js terrain-data/manhattan-ny/ --era nyc_1884 --dry-run --photos photos/manhattan-ny/
 *
 *   # Just reference images, skip Meshy
 *   node tools/generate-building-refs.js terrain-data/manhattan-ny/ --era nyc_1884 --image-only --auto-fetch
 *
 * Requires: GOOGLE_AI_API_KEY (Gemini, for fallback), MESHY_API_KEY (Meshy, unless --image-only)
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
import {
  loadPhotoManifest,
  findBestPhoto,
  searchAndDownload,
  buildSearchQuery,
} from '../lib/photoArchiveFetch.js';

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
const photosDir = getFlag('--photos');
const autoFetch = hasFlag('--auto-fetch');

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
  console.error('            --photos <dir>    Use downloaded photos as reference (from fetch-photos.js)');
  console.error('            --auto-fetch      Auto-download LOC photos if none exist');
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

// ---------------------------------------------------------------------------
// Photo archive discovery
// ---------------------------------------------------------------------------

// Resolve photos directory: explicit flag, or auto-discover from terrain slug
const terrainSlug = path.basename(terrainDir);
const resolvedPhotosDir = photosDir || path.join('photos', terrainSlug);
let photoManifest = loadPhotoManifest(resolvedPhotosDir);

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

const photoCount = photoManifest
  ? photoManifest.photos.filter(p => p.downloaded).length
  : 0;

console.log(`Buildings:    ${buildings.length} of ${allBuildings.length}`);
console.log(`Quality:      ${quality} (${tier.polycount.toLocaleString()} polys)`);
console.log(`Mode:         ${imageOnly ? 'image-only' : 'full pipeline (reference → Meshy)'}`);
if (photoCount > 0) {
  console.log(`Photos:       ${photoCount} available in ${resolvedPhotosDir}/`);
  console.log(`Strategy:     LOC photo preferred → Gemini fallback`);
} else {
  console.log(`Photos:       none${autoFetch ? ' (will auto-fetch)' : ''}`);
  console.log(`Strategy:     Gemini reference images only`);
}
if (!imageOnly) console.log(`Meshy cost:   ~${totalMeshyCredits} credits`);
console.log(`Era:          ${opts.era || 'auto'} (year ${opts.year || 'auto'})`);
console.log();

// ---------------------------------------------------------------------------
// Dry run — just print prompts
// ---------------------------------------------------------------------------

if (dryRun) {
  for (const b of buildings) {
    console.log(`━━━ ${b.index}: ${b.address} (${b.styleName}) ━━━`);
    if (photoManifest) {
      const match = findBestPhoto(photoManifest, b);
      if (match) {
        console.log(`  [PHOTO] ${match.title.slice(0, 70)} (${match.date || 'n/d'})`);
      } else {
        console.log(`  [GEMINI] ${b.prompt}`);
      }
    } else {
      console.log(`  [GEMINI] ${b.prompt}`);
    }
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

  // Stage 1: Resolve reference image — prefer historical photo, fall back to Gemini
  let dataUri;
  let referenceSource = 'gemini';
  let matchedPhoto = null;

  // Try to use a real historical photo
  if (photoManifest) {
    const candidate = findBestPhoto(photoManifest, b);
    if (candidate) {
      const photoPath = path.join(resolvedPhotosDir, candidate.filename);
      if (fs.existsSync(photoPath)) {
        const photoBuffer = fs.readFileSync(photoPath);
        const sizeKb = Math.round(photoBuffer.length / 1024);
        console.log(`  [PHOTO] ${candidate.title.slice(0, 60)} (${sizeKb}KB)`);
        dataUri = `data:image/jpeg;base64,${photoBuffer.toString('base64')}`;
        referenceSource = 'loc-photo';
        matchedPhoto = candidate;
      } else {
        console.log(`  [WARN] Photo file missing: ${photoPath}, falling back to Gemini`);
      }
    }
  }

  // Fall back to Gemini-generated reference image
  if (!dataUri) {
    process.stdout.write('  Generating reference image...');
    const imageResult = await generateImage(b.prompt, {
      model: geminiModel || undefined,
    });
    saveImage(imageResult, imagePath);
    const sizeKb = Math.round(imageResult.image.length / 1024);
    process.stdout.write(`\r  Reference image: ${imagePath} (${sizeKb}KB)\n`);
    dataUri = toDataUri(imageResult);
  }

  if (imageOnly) {
    return { index: b.index, status: 'image-only', slug, referenceSource,
      ...(matchedPhoto ? { photo: matchedPhoto.title } : { imagePath }) };
  }

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
    pipeline: referenceSource === 'loc-photo'
      ? 'historical-photo-to-3d'
      : 'gemini-reference-image-to-3d',
    referenceSource,
    ...(referenceSource === 'loc-photo'
      ? { photoTitle: matchedPhoto.title, photoItemUrl: matchedPhoto.itemUrl }
      : { geminiModel: geminiModel || 'gemini-2.0-flash-exp', referenceImagePrompt: b.prompt, referenceImagePath: imagePath }),
    aiModel: 'meshy-6',
    styleName: b.styleName,
    quality,
    polycount: tier.polycount,
    meshyTaskId: taskId,
    formats: [format, ...(format !== 'glb' ? ['glb'] : [])],
    pbr: true,
  };
  fs.writeFileSync(
    path.join(meshDir, 'GENERATION_MANIFEST.json'),
    JSON.stringify(manifest, null, 2),
  );

  return { index: b.index, status: 'ok', slug, imagePath, meshDir, files, referenceSource };
}

async function main() {
  // Auto-fetch photos if requested and none exist yet
  if (autoFetch && !photoManifest) {
    const targetYear = opts.year || parseInt(year, 10);
    if (!targetYear) {
      console.warn('Cannot auto-fetch photos without --year or --era that resolves to a year.');
    } else {
      // Read location from terrain metadata if available
      let locationName = terrainSlug.replace(/-/g, ' ');
      const metaPath = path.join(terrainDir, 'metadata.json');
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          if (meta.name) locationName = meta.name;
        } catch { /* use slug fallback */ }
      }

      console.log(`Auto-fetching photos for "${locationName}" ~${targetYear}...`);
      const query = buildSearchQuery(locationName, targetYear);
      try {
        const manifest = await searchAndDownload(query, resolvedPhotosDir, {
          year: targetYear,
          maxPhotos: 10,
          onProgress: (stage, msg) => console.log(`  [${stage}] ${msg}`),
        });
        photoManifest = manifest;
        const dlCount = manifest.photos.filter(p => p.downloaded).length;
        console.log(`  Fetched ${dlCount} photos → ${resolvedPhotosDir}/\n`);
      } catch (e) {
        console.warn(`  Auto-fetch failed: ${e.message}. Continuing with Gemini.\n`);
      }
    }
  }

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
  let fromPhoto = 0;
  let fromGemini = 0;

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
        if (result.referenceSource === 'loc-photo') fromPhoto++;
        else fromGemini++;
      } else {
        generated++;
        if (result.referenceSource === 'loc-photo') fromPhoto++;
        else fromGemini++;
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
  if (fromPhoto > 0 || fromGemini > 0) {
    console.log(`  from LOC photo: ${fromPhoto}`);
    console.log(`  from Gemini:    ${fromGemini}`);
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
