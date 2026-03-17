/**
 * Meshy AI API client — shared module for 3D asset generation.
 *
 * Three modes: Text-to-3D (two-stage preview+refine), Image-to-3D,
 * and Retexture (re-skin existing geometry).
 *
 * Follows the pattern of lib/cesiumGeoreference.js (shared external API client).
 */

import { mkdirSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const BASE = 'https://api.meshy.ai/openapi';
const POLL_INITIAL_MS = 5000;
const POLL_MAX_MS = 30000;
const POLL_TIMEOUT_MS = 600000; // 10 minutes

const ENDPOINT_VERSIONS = {
  'text-to-3d': 'v2',
  'image-to-3d': 'v1',
  'retexture': 'v1',
};

function apiKey() {
  const key = process.env.MESHY_API_KEY;
  if (!key) throw new Error('MESHY_API_KEY environment variable is not set');
  return key;
}

function headers() {
  return {
    Authorization: `Bearer ${apiKey()}`,
    'Content-Type': 'application/json',
  };
}

/**
 * POST to a Meshy endpoint and return the task ID.
 */
async function postTask(path, body) {
  const res = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meshy POST ${path} failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.result; // task ID
}

// ---------------------------------------------------------------------------
// Text-to-3D
// ---------------------------------------------------------------------------

/**
 * Create a Text-to-3D task (preview or refine).
 *
 * Preview (geometry only):
 *   createTextTo3D({ mode: 'preview', prompt, ... })
 *
 * Refine (texture an existing preview):
 *   createTextTo3D({ mode: 'refine', previewTaskId, enablePbr: true })
 */
export async function createTextTo3D({
  mode = 'preview',
  prompt,
  negativePrompt,
  previewTaskId,
  aiModel = 'meshy-6',
  artStyle = 'realistic',
  topology = 'triangle',
  targetPolycount = 30000,
  shouldRemesh = true,
  enablePbr = true,
} = {}) {
  const body = { mode, ai_model: aiModel };

  if (mode === 'preview') {
    if (!prompt) throw new Error('prompt is required for preview mode');
    body.prompt = prompt;
    if (negativePrompt) body.negative_prompt = negativePrompt;
    body.art_style = artStyle;
    body.topology = topology;
    body.target_polycount = targetPolycount;
    body.should_remesh = shouldRemesh;
  } else if (mode === 'refine') {
    if (!previewTaskId) throw new Error('previewTaskId is required for refine mode');
    body.preview_task_id = previewTaskId;
    body.enable_pbr = enablePbr;
  }

  return postTask('v2/text-to-3d', body);
}

// ---------------------------------------------------------------------------
// Image-to-3D
// ---------------------------------------------------------------------------

/**
 * Create an Image-to-3D task.
 * imageUrl can be a public URL or a base64 data URI.
 */
export async function createImageTo3D({
  imageUrl,
  aiModel = 'meshy-6',
  topology = 'triangle',
  targetPolycount = 30000,
  shouldRemesh = true,
  shouldTexture = true,
  enablePbr = true,
} = {}) {
  if (!imageUrl) throw new Error('imageUrl is required');

  return postTask('v1/image-to-3d', {
    image_url: imageUrl,
    ai_model: aiModel,
    topology,
    target_polycount: targetPolycount,
    should_remesh: shouldRemesh,
    should_texture: shouldTexture,
    enable_pbr: enablePbr,
  });
}

// ---------------------------------------------------------------------------
// Retexture
// ---------------------------------------------------------------------------

/**
 * Re-texture an existing mesh with a text prompt or reference image.
 * Provide either inputTaskId (from a previous Meshy task) or modelUrl
 * (public URL or base64 data URI to a GLB/FBX).
 */
export async function createRetexture({
  inputTaskId,
  modelUrl,
  textStylePrompt,
  imageStyleUrl,
  enablePbr = true,
} = {}) {
  if (!inputTaskId && !modelUrl) {
    throw new Error('Either inputTaskId or modelUrl is required');
  }
  if (!textStylePrompt && !imageStyleUrl) {
    throw new Error('Either textStylePrompt or imageStyleUrl is required');
  }

  const body = { enable_pbr: enablePbr };
  if (inputTaskId) body.input_task_id = inputTaskId;
  if (modelUrl) body.model_url = modelUrl;
  if (textStylePrompt) body.text_style_prompt = textStylePrompt;
  if (imageStyleUrl) body.image_style_url = imageStyleUrl;

  return postTask('v1/retexture', body);
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

/**
 * Poll a task until it reaches SUCCEEDED or FAILED.
 * Uses exponential backoff (5s → 30s cap) with a 10-minute timeout.
 * @param {string} taskId
 * @param {'text-to-3d'|'image-to-3d'|'retexture'} endpoint
 * @param {function} [onProgress] - optional callback(progress: number)
 * @returns {object} completed task object
 */
export async function pollTask(taskId, endpoint, onProgress) {
  const version = ENDPOINT_VERSIONS[endpoint] || 'v1';
  const url = `${BASE}/${version}/${endpoint}/${taskId}`;
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let interval = POLL_INITIAL_MS;

  while (Date.now() < deadline) {
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Meshy poll failed (${res.status}): ${text}`);
    }

    const task = await res.json();

    if (task.status === 'SUCCEEDED') return task;

    if (task.status === 'FAILED') {
      const msg = task.task_error?.message || 'Unknown error';
      throw new Error(`Meshy task ${taskId} failed: ${msg}`);
    }

    if (onProgress && typeof task.progress === 'number') {
      onProgress(task.progress);
    }

    await new Promise((r) => setTimeout(r, interval));
    interval = Math.min(interval * 1.5, POLL_MAX_MS);
  }

  throw new Error(`Meshy task ${taskId} timed out after ${POLL_TIMEOUT_MS / 1000}s`);
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

/**
 * Download model file(s) and PBR textures from a completed task.
 * @param {object} task - completed task object from pollTask()
 * @param {string} outputDir - directory to write files into
 * @param {string} [primaryFormat='fbx'] - primary format to download
 * @returns {object} { model, textures } with file paths
 */
export async function downloadModel(task, outputDir, primaryFormat = 'fbx') {
  mkdirSync(outputDir, { recursive: true });

  const files = { model: null, glbBackup: null, textures: {} };

  // Download primary model format
  const modelUrls = task.model_urls || {};
  const primaryUrl = modelUrls[primaryFormat];
  if (primaryUrl) {
    const modelPath = join(outputDir, `model.${primaryFormat}`);
    await downloadFile(primaryUrl, modelPath);
    files.model = modelPath;
  }

  // Always download GLB as backup (unless primary is already GLB)
  if (primaryFormat !== 'glb' && modelUrls.glb) {
    const glbPath = join(outputDir, 'model.glb');
    await downloadFile(modelUrls.glb, glbPath);
    files.glbBackup = glbPath;
  }

  // Download PBR texture maps (take first set, download in parallel)
  const textureUrls = task.texture_urls || [];
  if (textureUrls.length > 0) {
    const tex = textureUrls[0];
    const textureDir = join(outputDir, 'textures');
    mkdirSync(textureDir, { recursive: true });

    const downloads = [];
    for (const [mapName, url] of Object.entries(tex)) {
      if (url && typeof url === 'string') {
        const p = join(textureDir, `${mapName}.png`);
        downloads.push(downloadFile(url, p).then(() => { files.textures[mapName] = p; }));
      }
    }
    await Promise.all(downloads);
  }

  return files;
}

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
  await pipeline(res.body, createWriteStream(destPath));
}

// ---------------------------------------------------------------------------
// Balance
// ---------------------------------------------------------------------------

/**
 * Get remaining credit balance.
 * @returns {number} credits remaining
 */
export async function getBalance() {
  const res = await fetch(`${BASE}/v1/balance`, { headers: headers() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meshy balance check failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.credits ?? data.balance ?? data;
}
