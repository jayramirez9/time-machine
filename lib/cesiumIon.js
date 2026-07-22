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
 * Photo→Gaussian-splat reconstruction IS documented, in ion's OpenAPI spec
 * (https://ion.cesium.com/openapi.yaml) — it is simply absent from the prose
 * guides, which is what led two earlier passes of this file to guess:
 *   - `type: '3DTILES'` + `options.sourceType: 'RASTER_IMAGERY'` → the
 *     ImageryRasterOptions schema, which *is* the reconstruction job.
 *   - `options.outputs` is **required** ("At least one 3DTILES mesh output is
 *     required"); `SPLATS_3DTILES` is the Gaussian-splat output type, and only
 *     one is allowed per job.
 *   - The generated outputs come back on the **POST /v1/assets** response
 *     (`assets`, "only returned when running reconstruction jobs"). They are
 *     NOT on `GET /v1/assets/{id}` — so they must be captured at create time.
 *
 * What the spec does NOT show is a per-derived-asset field naming the output
 * type — though its create-response example includes a derived asset with
 * `"type": "LAS"` (a ReconstructionOutputType, not an AssetType), which
 * suggests `type` carries it. Unconfirmed against a live account, so we also
 * tag output names ourselves (buildSplatOutputs) and refuse to guess when
 * nothing is conclusive. See identifySplatOutput.
 *
 * Requires: CESIUM_ION_TOKEN (assets:read + assets:write + assets:list).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const ION_API_BASE = 'https://api.cesium.com';
export const TERMINAL_STATUSES = ['COMPLETE', 'ERROR', 'DATA_ERROR'];

// Output asset type for a reconstructed splat tileset.
export const SPLAT_ASSET_TYPE = '3DTILES';

// The ReconstructionOutputType enum value for Gaussian splats.
export const SPLAT_OUTPUT_TYPE = 'SPLATS_3DTILES';

// Source options for photo → reconstruction, per ion's OpenAPI spec
// (https://ion.cesium.com/openapi.yaml).
//
//   sourceType RASTER_IMAGERY → ImageryRasterOptions, i.e. the *reconstruction*
//   schema: "Multiple different outputs can be generated ... for a
//   reconstruction job. Only one SPLATS_3DTILES output is allowed."
//
// Two traps worth naming, because this file has been wrong about both:
//   - `RASTER_IMAGERY` is a **sourceType** (describes the input: raster photos).
//     `IMAGERY` is an **AssetType** (a 2D overlay output). Conflating them led
//     to a previous "fix" that read RASTER_IMAGERY as 2D-only. It is not.
//   - `3D_CAPTURE` is for "an OBJ, COLLADA, or glTF model created through
//     photogrammetry processes" — an *already reconstructed* model. Wrong for
//     a directory of JPEGs.
//
// `outputs` is required, not optional decoration: "At least one 3DTILES mesh
// output is required." Omit it and the job cannot emit a splat at all.
export const SPLAT_SOURCE_OPTIONS = {
  sourceType: 'RASTER_IMAGERY',
  outputs: [
    { outputType: '3DTILES' },          // required mesh output
    { outputType: SPLAT_OUTPUT_TYPE },  // the one we actually want
  ],
};

/**
 * Build `outputs` with explicit, tagged names.
 *
 * Each output item accepts `name` — "specifies the name of the asset to be
 * generated. If provided, this overrides the name in the main options object."
 * Setting it turns identifying the splat afterwards from *guessing* (which
 * derived asset is the splat?) into an exact match on a string we chose. That
 * matters because the spec does not show a per-derived-asset output-type
 * field, so without this we would be inferring from names ion picked.
 *
 * Costs nothing, so always prefer this over the bare SPLAT_SOURCE_OPTIONS.
 */
export function buildSplatOutputs(jobName) {
  const base = String(jobName ?? '').trim() || 'capture';
  return [
    { outputType: '3DTILES', name: `${base} ${OUTPUT_TAG['3DTILES']}` },
    { outputType: SPLAT_OUTPUT_TYPE, name: `${base} ${OUTPUT_TAG[SPLAT_OUTPUT_TYPE]}` },
  ];
}

export const OUTPUT_TAG = {
  '3DTILES': '[3DTILES]',
  [SPLAT_OUTPUT_TYPE]: `[${SPLAT_OUTPUT_TYPE}]`,
};

// Last-resort name hints, used only when neither the output type nor our own
// tag identifies the splat. Deliberately weak — see identifySplatOutput.
const SPLAT_NAME_HINTS = ['splat', 'gaussian', '3dgs'];

// Names that mark a derived asset as definitely NOT the splat. Matched on word
// boundaries — a bare 'las' substring would exclude Dallas, Las Vegas, Atlas.
const NON_SPLAT_PATTERNS = [/\bmesh\b/i, /\bpoint\s*cloud\b/i, /\blas\b/i];

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
    throw new Error(`Cesium ion createAsset failed (${res.status}): ${text}${createAssetHint(res.status, text)}`);
  }
  return res.json();
}

/**
 * Turn ion's less-obvious create failures into actionable advice.
 *
 * The 404 case is the expensive one: ion answers a token that lacks
 * `assets:write` with a ResourceNotFound on /v1/assets rather than a 403, so
 * it reads as a broken endpoint or a bad base URL instead of a scope problem.
 */
export function createAssetHint(status, body = '') {
  if (status === 404) {
    return '\n  → A 404 here usually means the token lacks `assets:write`, NOT that the endpoint is wrong.'
      + '\n    Create a token at ion.cesium.com/tokens with assets:read + assets:write + assets:list'
      + '\n    and asset-access = ALL, then set CESIUM_ION_TOKEN.';
  }
  if (status === 400 && /sourceType/i.test(body)) {
    return '\n  → ion rejected the sourceType. Its message above should enumerate the values it accepts.'
      + '\n    Note `outputs` is only valid with sourceType RASTER_IMAGERY + type 3DTILES, so if you'
      + '\n    override --source-type you likely need --option outputs=null too, or you will trade this'
      + '\n    400 for a differently-worded one.';
  }
  if (status === 400 && /outputs?/i.test(body)) {
    return '\n  → ion rejected the outputs array. Preview the exact body with --dry-run, and note the'
      + '\n    spec requires at least one 3DTILES mesh output and allows at most one SPLATS_3DTILES.';
  }
  return '';
}

/**
 * Collect the derived assets a reconstruction job produced.
 *
 * ⚠️ These arrive on the **POST /v1/assets** response (spec field: `assets`,
 * "only returned when running reconstruction jobs"). `GET /v1/assets/{id}`
 * returns a single AssetMetadata with no derived list — so polling is the
 * wrong place to look for them, and an earlier version of this file made
 * exactly that mistake and reported "no splat" on every run.
 *
 * Cesium's own REST example uses `additionalAssets` for the same field, so
 * both spellings are attested. Merge every known spelling rather than picking
 * the first non-nullish one: a response carrying `additionalAssets: []`
 * alongside a populated `assets` would otherwise resolve to empty.
 */
export function derivedAssets(response) {
  const seen = new Map();
  for (const key of ['assets', 'additionalAssets', 'additional_assets', 'derivedAssets']) {
    const list = response?.[key];
    if (!Array.isArray(list)) continue;
    for (const a of list) {
      if (!a || a.id == null) continue;
      // Key on the stringified id so `2` and `"2"` across two spellings don't
      // become two candidates (which would read as an ambiguous match and
      // report "no splat" for a perfectly good response). Merge rather than
      // first-wins so a sparse record in one spelling can't hide a marker
      // present in the other.
      const key2 = String(a.id);
      seen.set(key2, { ...seen.get(key2), ...a });
    }
  }
  return [...seen.values()];
}

/**
 * Identify the Gaussian-splat output among a create response's derived assets,
 * reporting *how* it was identified so callers can qualify their confidence.
 *
 * Three probes, strongest first:
 *   1. `type === 'SPLATS_3DTILES'`. The spec's own create-response example
 *      shows a derived asset with `"type": "LAS"` — a ReconstructionOutputType,
 *      not an AssetType — so derived assets do appear to carry the output type
 *      here. Best-supported probe, still unconfirmed against a live account.
 *   2. Our own `[SPLATS_3DTILES]` name tag, when the request was built with
 *      buildSplatOutputs(). Deterministic, because we chose the string.
 *   3. Weak name hints ('splat', 'gaussian', …) — a genuine guess, and only
 *      accepted when unambiguous AND the hint is not inherited from the parent
 *      job name (a job called "Trinity splat test" propagates 'splat' to every
 *      output, which would otherwise make the mesh look like the splat).
 *
 * Returns null rather than guessing when nothing is conclusive: handing Unreal
 * a mesh id surfaces two layers away as "splats don't render", which is far
 * more expensive to diagnose than an honest "couldn't tell".
 *
 * @returns {{asset: object, method: 'type'|'tag'|'name'}|null}
 */
export function identifySplatOutput(response) {
  const candidates = derivedAssets(response);
  if (candidates.length === 0) return null;

  const byType = candidates.filter((a) => a?.type === SPLAT_OUTPUT_TYPE);
  if (byType.length === 1) return { asset: byType[0], method: 'type' };
  if (byType.length > 1) return null; // spec allows one splat; >1 means we've misread the shape

  const tag = OUTPUT_TAG[SPLAT_OUTPUT_TYPE];
  const byTag = candidates.filter((a) => String(a?.name ?? '').includes(tag));
  if (byTag.length === 1) return { asset: byTag[0], method: 'tag' };
  if (byTag.length > 1) return null;

  // Weak fallback. If the parent job name already contains a hint, every
  // derived asset inherits it and the signal carries no information.
  const parentName = String(response?.assetMetadata?.name ?? '').toLowerCase();
  const inheritedHint = SPLAT_NAME_HINTS.some((h) => parentName.includes(h));
  if (inheritedHint) return null;

  const byName = candidates.filter((a) => {
    const name = String(a?.name ?? '');
    if (NON_SPLAT_PATTERNS.some((re) => re.test(name))) return false;
    return SPLAT_NAME_HINTS.some((h) => name.toLowerCase().includes(h));
  });
  return byName.length === 1 ? { asset: byName[0], method: 'name' } : null;
}

/** The splat asset itself, or null when absent/ambiguous. */
export function findSplatAsset(response) {
  return identifySplatOutput(response)?.asset ?? null;
}

/**
 * The ion asset ID to stream into Unreal: the splat output when reconstruction
 * produced one, otherwise null (caller decides whether the mesh is acceptable).
 */
export function splatAssetId(response) {
  return identifySplatOutput(response)?.asset?.id ?? null;
}

/**
 * Merge caller overrides onto the default source options without letting an
 * absent flag delete a default. `{...defaults, sourceType: undefined}` would
 * blank the sourceType entirely (JSON.stringify drops undefined keys, so ion
 * receives `options: {}`), which is how a missing `--source-type` value turns
 * into a confusing 400.
 */
export function mergeSourceOptions(overrides = {}, defaults = SPLAT_SOURCE_OPTIONS) {
  const out = { ...defaults };
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
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

  // The derived-output list is on the CREATE response and nowhere else, so it
  // must be captured here — by the time we poll, it's unreachable.
  const derived = derivedAssets(created);
  const identified = identifySplatOutput(created);
  return {
    assetId,
    assetType: created.assetMetadata.type,
    derivedAssets: derived,
    splatAssetId: identified?.asset?.id ?? null,
    // How the splat was identified ('type' | 'tag' | 'name' | null) so callers
    // can distinguish a certain answer from a name-based guess.
    splatMatchMethod: identified?.method ?? null,
  };
}

/**
 * Parse repeatable `--option key=value` CLI pairs into an options object.
 *
 * Lives here rather than in the CLI so the merge behaviour is testable — the
 * bug this guards against (rebuilding `options` from `sourceType` alone and
 * silently dropping every other default) is exactly the kind that regresses.
 *
 * Values are JSON-parsed when possible so booleans/numbers/arrays arrive as
 * the right type. Quote to force a string: `targetVersion="1.1"` (bare 1.1
 * would become the number 1.1, which ion's string enum rejects).
 *
 * @param {string[]} argv
 * @param {(msg: string) => void} [onWarn]
 */
export function parseExtraOptions(argv = [], onWarn) {
  const out = Object.create(null);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== '--option') continue;
    const pair = argv[i + 1];
    if (pair === undefined) throw new Error('--option requires key=value (got nothing)');
    const eq = pair.indexOf('=');
    if (eq < 1) throw new Error(`Bad --option "${pair}" — expected key=value`);
    const key = pair.slice(0, eq);
    const raw = pair.slice(eq + 1);
    if (key in out && typeof onWarn === 'function') {
      onWarn(`--option ${key} given more than once; using the last value`);
    }
    try { out[key] = JSON.parse(raw); } catch { out[key] = raw; }
  }
  return { ...out };
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
