/**
 * cesiumIon.js — Cesium ion REST client for capture-based reconstruction.
 *
 * Submits source imagery to Cesium ion, which reconstructs it (via iTwin
 * Capture) into a streamable 3D Tiles asset — mesh, point cloud, or
 * **3D Gaussian splat**. Returns the ion asset ID, which the Unreal side
 * (lib/cesiumTileset.js, deliverable A) streams via Cesium for Unreal.
 *
 * Flow (Cesium ion REST API):
 *   1. POST /v1/assets                  → { assetMetadata, uploadLocation, onComplete }
 *   2. PUT each file to S3              (uploadLocation temp credentials, SigV4)
 *   3. POST onComplete.url             → finalize, ion begins tiling
 *   4. GET /v1/assets/{id}             → poll status until COMPLETE
 *
 * Zero external dependencies: S3 upload is signed with node:crypto (SigV4).
 *
 * ⚠️ Gaussian-splat output via REST is new (2026) and not yet publicly
 * documented. `SPLAT_SOURCE_OPTIONS` below is a best-guess default — confirm
 * the exact `options.sourceType` against your ion account / current API docs
 * before relying on automated splat reconstruction. The create→upload→
 * complete→poll flow itself is stable and documented.
 *
 * Requires: CESIUM_ION_TOKEN (assets:read + assets:write).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const ION_API_BASE = 'https://api.cesium.com';
export const TERMINAL_STATUSES = ['COMPLETE', 'ERROR', 'DATA_ERROR'];

// Output asset type for a reconstructed splat tileset.
export const SPLAT_ASSET_TYPE = '3DTILES';

// Best-guess source options for photo → Gaussian-splat reconstruction.
// UNVERIFIED against the live API — see the file header warning.
export const SPLAT_SOURCE_OPTIONS = { sourceType: 'RAW_IMAGERY' };

const POLL_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = 30 * 60 * 1000; // reconstruction can take many minutes

/** Read the ion token from the environment, or throw. */
export function ionToken() {
  const token = process.env.CESIUM_ION_TOKEN;
  if (!token) throw new Error('CESIUM_ION_TOKEN environment variable is not set');
  return token;
}

function authHeaders(token = ionToken()) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

/**
 * Create an asset record. Returns { assetMetadata, uploadLocation, onComplete }.
 */
export async function createAsset({ name, description = '', type = SPLAT_ASSET_TYPE, options = SPLAT_SOURCE_OPTIONS } = {}, { token } = {}) {
  const res = await fetch(`${ION_API_BASE}/v1/assets`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ name, description, type, options }),
  });
  if (!res.ok) {
    const text = await safeText(res);
    throw new Error(`Cesium ion createAsset failed (${res.status}): ${text}`);
  }
  return res.json();
}

/** Notify ion that upload is complete, using the onComplete descriptor. */
export async function completeUpload(onComplete, { token } = {}) {
  const res = await fetch(onComplete.url, {
    method: onComplete.method || 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(onComplete.fields || {}),
  });
  if (!res.ok) {
    const text = await safeText(res);
    throw new Error(`Cesium ion uploadComplete failed (${res.status}): ${text}`);
  }
  return true;
}

/** Get an asset's current metadata (includes status, percentComplete). */
export async function getAsset(assetId, { token } = {}) {
  const res = await fetch(`${ION_API_BASE}/v1/assets/${assetId}`, {
    method: 'GET',
    headers: authHeaders(token),
  });
  if (!res.ok) {
    const text = await safeText(res);
    throw new Error(`Cesium ion getAsset failed (${res.status}): ${text}`);
  }
  return res.json();
}

/**
 * Poll an asset until it reaches a terminal status.
 * @returns the final asset metadata (status COMPLETE), or throws on error/timeout.
 */
export async function pollAsset(assetId, {
  token,
  intervalMs = POLL_INTERVAL_MS,
  timeoutMs = POLL_TIMEOUT_MS,
  onProgress,
  sleep = defaultSleep,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const asset = await getAsset(assetId, { token });
    if (typeof onProgress === 'function') onProgress(asset.percentComplete ?? 0);
    if (asset.status === 'COMPLETE') return asset;
    if (asset.status === 'ERROR' || asset.status === 'DATA_ERROR') {
      throw new Error(`Cesium ion asset ${assetId} failed with status ${asset.status}`);
    }
    if (Date.now() >= deadline) {
      throw new Error(`Cesium ion asset ${assetId} timed out after ${Math.round(timeoutMs / 1000)}s (status ${asset.status})`);
    }
    await sleep(intervalMs);
  }
}

/**
 * Upload a single file to the S3 location from createAsset, signed with SigV4.
 * Single PUT (archival photos are small); files >5GB would need multipart.
 */
export async function uploadFileToS3(uploadLocation, filePath) {
  const { endpoint, bucket, prefix, accessKey, secretAccessKey, sessionToken } = uploadLocation;
  const body = fs.readFileSync(filePath);
  const host = new URL(endpoint).host;
  const region = inferRegion(host);

  // Encode each path segment exactly once (RFC 3986). This same string is used
  // both to sign and to send, guaranteeing the signed path == the wire path.
  const rawKey = `${prefix}${path.basename(filePath)}`;
  const canonicalUri = '/' + [bucket, ...rawKey.split('/')].map((s) => uriEncode(s, true)).join('/');
  const url = `${endpoint.replace(/\/+$/, '')}${canonicalUri}`;

  const payloadHash = crypto.createHash('sha256').update(body).digest('hex');
  const { amzDate, dateStamp } = timestamps();

  const headers = sigv4PutHeaders({
    host,
    canonicalUri,
    region,
    service: 's3',
    accessKey,
    secretKey: secretAccessKey,
    sessionToken,
    payloadHash,
    amzDate,
    dateStamp,
  });

  const res = await fetch(url, { method: 'PUT', headers, body });
  if (!res.ok) {
    // S3 error bodies can echo the credential + StringToSign (which contains the
    // session token) — redact the temp secrets before they reach logs/stderr.
    const text = redactSecrets(await safeText(res), [secretAccessKey, sessionToken]);
    throw new Error(`S3 upload failed for ${path.basename(filePath)} (${res.status}): ${text}`);
  }
  return true;
}

/**
 * Full orchestration: create asset → upload all files → finalize.
 * @returns { assetId, status }
 */
export async function createSplatAsset({ name, description = '', files = [], type = SPLAT_ASSET_TYPE, options = SPLAT_SOURCE_OPTIONS } = {}, { token, onUpload } = {}) {
  if (!files || files.length === 0) throw new Error('createSplatAsset: no files to upload');

  const created = await createAsset({ name, description, type, options }, { token });
  const assetId = created.assetMetadata.id;

  let i = 0;
  for (const file of files) {
    try {
      await uploadFileToS3(created.uploadLocation, file);
    } catch (e) {
      // Surface the orphaned asset id so the operator can delete/resume it
      // instead of blindly re-running (which would create a duplicate asset).
      throw new Error(`Upload failed after ${i}/${files.length} files for ion asset ${assetId} (delete or resume it): ${e.message}`);
    }
    if (typeof onUpload === 'function') onUpload(++i, files.length, file);
  }

  await completeUpload(created.onComplete, { token });
  // assetType is the requested type echoed back; the real output type is only
  // known after reconstruction (poll the asset) — see tools/cesium-capture.js.
  return { assetId, assetType: created.assetMetadata.type };
}

// ---------------------------------------------------------------------------
// AWS Signature Version 4 (S3 PUT) — zero-dependency, via node:crypto
// ---------------------------------------------------------------------------

/**
 * Build the signed headers for an S3 PUT object request (SigV4).
 * Pure function of its inputs → deterministic and unit-testable.
 */
export function sigv4PutHeaders({
  host, canonicalUri, region, service = 's3',
  accessKey, secretKey, sessionToken,
  payloadHash, amzDate, dateStamp,
}) {
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  // Canonical headers must be sorted by lowercased name.
  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-security-token:${sessionToken}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date;x-amz-security-token';

  // canonicalUri must already be RFC 3986 segment-encoded by the caller, and
  // must be byte-identical to the path put on the wire. Do NOT re-encode here
  // (re-encoding an already-encoded path double-escapes '%' → SignatureDoesNotMatch).
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '', // canonical query string (none)
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = getSignatureKey(secretKey, dateStamp, region, service);
  const signature = hmac(signingKey, stringToSign).toString('hex');

  return {
    Authorization: `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    'x-amz-security-token': sessionToken,
  };
}

function getSignatureKey(secretKey, dateStamp, region, service) {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

// RFC 3986 URI encoding. encodeSlash=false preserves path separators.
function uriEncode(str, encodeSlash = true) {
  return str.split('').map((c) => {
    if (/[A-Za-z0-9_.~-]/.test(c)) return c;
    if (c === '/' && !encodeSlash) return c;
    return '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
  }).join('');
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function timestamps() {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  return { amzDate, dateStamp };
}

function inferRegion(host) {
  // s3.us-east-1.amazonaws.com → us-east-1 ; default us-east-1
  const m = host.match(/s3[.-]([a-z0-9-]+)\.amazonaws\.com/);
  return m ? m[1] : 'us-east-1';
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeText(res) {
  try { return await res.text(); } catch { return '<no body>'; }
}

function redactSecrets(text, secrets) {
  let out = text;
  for (const s of secrets) {
    if (s) out = out.split(s).join('***');
  }
  return out;
}
