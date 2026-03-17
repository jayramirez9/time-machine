#!/usr/bin/env node

/**
 * Meshy 3D asset generator CLI.
 *
 * Three modes:
 *   --text "prompt"           Text-to-3D (preview + optional refine)
 *   --image path | --image-url url   Image-to-3D
 *   --retexture path          Re-skin existing mesh
 *
 * Outputs to mesh-data/{name}/ with GENERATION_MANIFEST.json.
 * Follows the pattern of tools/elevenlabs-fetch.js.
 *
 * Usage:
 *   MESHY_API_KEY=xxx node tools/meshy-generate.js --text "1880s brownstone..." --name brownstone-01
 *   MESHY_API_KEY=xxx node tools/meshy-generate.js --image ./ref/photo.jpg --name trinity-church
 *   MESHY_API_KEY=xxx node tools/meshy-generate.js --image-url "https://..." --name harlem-row
 *   MESHY_API_KEY=xxx node tools/meshy-generate.js --retexture ./mesh.glb --style-text "weathered brick" --name block-01
 *   MESHY_API_KEY=xxx node tools/meshy-generate.js --balance
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  createTextTo3D,
  createImageTo3D,
  createRetexture,
  pollTask,
  downloadModel,
  getBalance,
} from '../lib/meshyClient.js';

// ---------------------------------------------------------------------------
// Arg parsing (same pattern as elevenlabs-fetch.js / fetch-dem.js)
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getFlag(name, defaultValue = null) {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultValue;
  return args[idx + 1] || defaultValue;
}
const hasFlag = (name) => args.includes(name);

const VALID_FORMATS = ['fbx', 'glb', 'obj', 'usdz'];
const MAX_FILE_SIZE_MB = 50;

const textPrompt = getFlag('--text');
const imagePath = getFlag('--image');
const imageUrl = getFlag('--image-url');
const retexturePath = getFlag('--retexture');
const styleText = getFlag('--style-text');
const styleImage = getFlag('--style-image');
const name = getFlag('--name');
const polycount = parseInt(getFlag('--polycount', '30000'), 10);
const format = getFlag('--format', 'fbx');
const artStyle = getFlag('--style', 'realistic');
const negativePrompt = getFlag('--negative', 'modern, glass, steel, low quality');
const dryRun = hasFlag('--dry-run');
const force = hasFlag('--force');
const noTexture = hasFlag('--no-texture');
const noPbr = hasFlag('--no-pbr');
const checkBalance = hasFlag('--balance');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MIME_OVERRIDES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  glb: 'model/gltf-binary',
  fbx: 'application/octet-stream',
  obj: 'text/plain',
};

function fileToDataUri(filePath) {
  const abs = path.resolve(filePath);
  const stat = fs.statSync(abs); // throws if not found
  const sizeMB = stat.size / (1024 * 1024);
  if (sizeMB > MAX_FILE_SIZE_MB) {
    console.warn(`Warning: ${path.basename(abs)} is ${sizeMB.toFixed(1)}MB — base64 encoding will use ~${(sizeMB * 1.33).toFixed(0)}MB of memory`);
  }
  const ext = path.extname(abs).slice(1).toLowerCase();
  const mime = MIME_OVERRIDES[ext] || `application/${ext}`;
  const buf = fs.readFileSync(abs);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function printProgress(pct) {
  process.stdout.write(`\r  Generating... ${pct}%`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // --balance: just print credits and exit
  if (checkBalance) {
    const credits = await getBalance();
    console.log(`Credits remaining: ${credits}`);
    process.exit(0);
  }

  // Determine mode
  const mode = textPrompt ? 'text-to-3d'
    : (imagePath || imageUrl) ? 'image-to-3d'
    : retexturePath ? 'retexture'
    : null;

  if (!mode) {
    console.error('Usage: meshy-generate.js --text <prompt> | --image <path> | --image-url <url> | --retexture <path> | --balance');
    console.error('  Required: --name <slug>');
    console.error('  Optional: --polycount <n> --format <fbx|glb|obj|usdz> --style <realistic|sculpture>');
    console.error('            --no-texture --no-pbr --dry-run --force --negative <prompt>');
    console.error('  Retexture: --style-text <prompt> or --style-image <path>');
    process.exit(1);
  }

  if (!name) {
    console.error('Error: --name is required');
    process.exit(1);
  }

  if (!VALID_FORMATS.includes(format)) {
    console.error(`Error: --format must be one of: ${VALID_FORMATS.join(', ')} (got "${format}")`);
    process.exit(1);
  }

  const outputDir = path.join('mesh-data', name);

  if (fs.existsSync(outputDir) && !force) {
    console.error(`Output directory already exists: ${outputDir}`);
    console.error('Use --force to overwrite');
    process.exit(1);
  }

  // Credit cost estimate
  const creditEstimate = mode === 'text-to-3d'
    ? (noTexture ? 20 : 30) // preview 20 + refine 10
    : mode === 'image-to-3d'
    ? (noTexture ? 20 : 30)
    : 10; // retexture

  console.log(`Mode:       ${mode}`);
  console.log(`Name:       ${name}`);
  console.log(`Output:     ${outputDir}/`);
  console.log(`Polycount:  ${polycount}`);
  console.log(`Format:     ${format}`);
  console.log(`PBR:        ${!noPbr}`);
  console.log(`Est. cost:  ~${creditEstimate} credits`);

  if (mode === 'text-to-3d') {
    console.log(`Prompt:     ${textPrompt}`);
    console.log(`Negative:   ${negativePrompt}`);
  } else if (mode === 'image-to-3d') {
    console.log(`Image:      ${imagePath || imageUrl}`);
  } else if (mode === 'retexture') {
    console.log(`Model:      ${retexturePath}`);
    console.log(`Style:      ${styleText || styleImage}`);
  }

  if (dryRun) {
    console.log('\n[DRY RUN] Would generate with the above parameters. No API calls made.');
    process.exit(0);
  }

  // Check balance before generating
  let balanceBefore;
  try {
    balanceBefore = await getBalance();
    console.log(`\nBalance:    ${balanceBefore} credits`);
    if (balanceBefore < creditEstimate) {
      console.error(`Insufficient credits (need ~${creditEstimate}, have ${balanceBefore})`);
      process.exit(1);
    }
  } catch (e) {
    console.warn(`Could not check balance: ${e.message}`);
  }

  let completedTask;
  let previewTaskId;
  let refineTaskId;

  // -------------------------------------------------------------------------
  // Text-to-3D
  // -------------------------------------------------------------------------
  if (mode === 'text-to-3d') {
    // Stage 1: Preview (geometry)
    console.log('\nStage 1/2: Generating geometry preview...');
    previewTaskId = await createTextTo3D({
      mode: 'preview',
      prompt: textPrompt,
      negativePrompt,
      artStyle,
      targetPolycount: polycount,
    });
    console.log(`  Task ID: ${previewTaskId}`);

    const previewTask = await pollTask(previewTaskId, 'text-to-3d', printProgress);
    console.log('\r  Preview complete.          ');

    if (noTexture) {
      completedTask = previewTask;
    } else {
      // Stage 2: Refine (texture)
      console.log('Stage 2/2: Generating PBR textures...');
      refineTaskId = await createTextTo3D({
        mode: 'refine',
        previewTaskId,
        enablePbr: !noPbr,
      });
      console.log(`  Task ID: ${refineTaskId}`);

      completedTask = await pollTask(refineTaskId, 'text-to-3d', printProgress);
      console.log('\r  Texturing complete.        ');
    }
  }

  // -------------------------------------------------------------------------
  // Image-to-3D
  // -------------------------------------------------------------------------
  if (mode === 'image-to-3d') {
    const imgUrl = imageUrl || fileToDataUri(imagePath);

    console.log('\nGenerating 3D model from image...');
    const taskId = await createImageTo3D({
      imageUrl: imgUrl,
      targetPolycount: polycount,
      shouldTexture: !noTexture,
      enablePbr: !noPbr,
    });
    console.log(`  Task ID: ${taskId}`);

    completedTask = await pollTask(taskId, 'image-to-3d', printProgress);
    console.log('\r  Generation complete.       ');
  }

  // -------------------------------------------------------------------------
  // Retexture
  // -------------------------------------------------------------------------
  if (mode === 'retexture') {
    if (!styleText && !styleImage) {
      console.error('Error: --style-text or --style-image is required for retexture');
      process.exit(1);
    }

    const modelDataUri = fileToDataUri(retexturePath);
    const styleImageUri = styleImage ? fileToDataUri(styleImage) : undefined;

    console.log('\nRetexturing model...');
    const taskId = await createRetexture({
      modelUrl: modelDataUri,
      textStylePrompt: styleText,
      imageStyleUrl: styleImageUri,
      enablePbr: !noPbr,
    });
    console.log(`  Task ID: ${taskId}`);

    completedTask = await pollTask(taskId, 'retexture', printProgress);
    console.log('\r  Retexture complete.        ');
  }

  // -------------------------------------------------------------------------
  // Download results
  // -------------------------------------------------------------------------
  console.log(`\nDownloading to ${outputDir}/...`);
  const files = await downloadModel(completedTask, outputDir, format);

  if (files.model) console.log(`  Model:   ${files.model}`);
  if (files.glbBackup) console.log(`  GLB:     ${files.glbBackup}`);
  for (const [mapName, mapPath] of Object.entries(files.textures)) {
    console.log(`  Texture: ${mapPath} (${mapName})`);
  }

  // -------------------------------------------------------------------------
  // Write manifest
  // -------------------------------------------------------------------------
  let balanceAfter;
  try { balanceAfter = await getBalance(); } catch { /* non-critical */ }

  const manifest = {
    name,
    generatedAt: new Date().toISOString(),
    mode,
    aiModel: 'meshy-6',
    polycount,
    topology: 'triangle',
    creditsUsed: (balanceBefore != null && balanceAfter != null)
      ? balanceBefore - balanceAfter
      : creditEstimate,
    formats: [format, ...(format !== 'glb' ? ['glb'] : [])],
    pbr: !noPbr,
  };

  if (mode === 'text-to-3d') {
    manifest.prompt = textPrompt;
    manifest.negativePrompt = negativePrompt;
    manifest.artStyle = artStyle;
    manifest.previewTaskId = previewTaskId;
    manifest.refineTaskId = refineTaskId || null;
  } else if (mode === 'image-to-3d') {
    manifest.imageSource = imagePath || imageUrl;
    manifest.taskId = completedTask.id;
  } else if (mode === 'retexture') {
    manifest.modelSource = retexturePath;
    manifest.styleText = styleText || null;
    manifest.styleImage = styleImage || null;
    manifest.taskId = completedTask.id;
  }

  // Record texture URLs from completed task
  if (completedTask.texture_urls?.length) {
    manifest.textureUrls = {};
    const tex = completedTask.texture_urls[0];
    for (const [key, url] of Object.entries(tex)) {
      if (url && typeof url === 'string') manifest.textureUrls[key] = url;
    }
  }

  const manifestPath = path.join(outputDir, 'GENERATION_MANIFEST.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`  Manifest: ${manifestPath}`);

  if (balanceBefore != null && balanceAfter != null) {
    console.log(`\nBalance: ${balanceBefore} → ${balanceAfter} credits (used ${balanceBefore - balanceAfter})`);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
