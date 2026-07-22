import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ionToken,
  createAsset,
  completeUpload,
  getAsset,
  pollAsset,
  uploadFileToS3,
  createSplatAsset,
  sigv4PutHeaders,
  ION_API_BASE,
  TERMINAL_STATUSES,
  SPLAT_ASSET_TYPE,
  SPLAT_SOURCE_OPTIONS,
  SPLAT_OUTPUT_TYPE,
  findSplatAsset,
  splatAssetId,
  derivedAssets,
  identifySplatOutput,
  buildSplatOutputs,
  OUTPUT_TAG,
  mergeSourceOptions,
  parseExtraOptions,
  createAssetHint,
} from '../lib/cesiumIon.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const CREATE_RESPONSE = {
  assetMetadata: { id: 12345, type: '3DTILES', name: 'trinity', status: 'AWAITING_FILES', percentComplete: 0 },
  uploadLocation: {
    endpoint: 'https://s3.us-east-1.amazonaws.com',
    bucket: 'assets.cesium.com',
    prefix: 'sources/12345/',
    accessKey: 'AKIDEXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    sessionToken: 'SESSIONTOKEN123',
  },
  onComplete: { method: 'POST', url: 'https://api.cesium.com/v1/assets/12345/uploadComplete', fields: { foo: 'bar' } },
};

let originalFetch;
let originalToken;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalToken = process.env.CESIUM_ION_TOKEN;
  process.env.CESIUM_ION_TOKEN = 'test-ion-token';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalToken !== undefined) process.env.CESIUM_ION_TOKEN = originalToken;
  else delete process.env.CESIUM_ION_TOKEN;
});

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------

describe('ionToken', () => {
  it('returns the env token', () => {
    assert.equal(ionToken(), 'test-ion-token');
  });
  it('throws when unset', () => {
    delete process.env.CESIUM_ION_TOKEN;
    assert.throws(() => ionToken(), /CESIUM_ION_TOKEN/);
  });
});

// ---------------------------------------------------------------------------
// createAsset
// ---------------------------------------------------------------------------

describe('createAsset', () => {
  it('POSTs to the ion assets endpoint with bearer auth and parsed body', async () => {
    let url, opts;
    globalThis.fetch = async (u, o) => { url = u; opts = o; return { ok: true, json: async () => CREATE_RESPONSE }; };

    const res = await createAsset({ name: 'trinity', description: 'd', type: '3DTILES', options: { sourceType: 'RASTER_IMAGERY' } });

    assert.equal(url, `${ION_API_BASE}/v1/assets`);
    assert.equal(opts.method, 'POST');
    assert.equal(opts.headers.Authorization, 'Bearer test-ion-token');
    assert.equal(opts.headers['Content-Type'], 'application/json');
    const body = JSON.parse(opts.body);
    assert.equal(body.name, 'trinity');
    assert.equal(body.type, '3DTILES');
    assert.equal(body.options.sourceType, 'RASTER_IMAGERY');
    assert.equal(res.assetMetadata.id, 12345);
    assert.ok(res.uploadLocation.accessKey);
  });

  it('throws on non-ok response with status detail', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 403, text: async () => 'forbidden' });
    await assert.rejects(() => createAsset({ name: 'x' }), /403/);
  });

  it('throws when token missing', async () => {
    delete process.env.CESIUM_ION_TOKEN;
    await assert.rejects(() => createAsset({ name: 'x' }), /CESIUM_ION_TOKEN/);
  });
});

// ---------------------------------------------------------------------------
// completeUpload
// ---------------------------------------------------------------------------

describe('completeUpload', () => {
  it('POSTs to the onComplete url with its fields', async () => {
    let url, opts;
    globalThis.fetch = async (u, o) => { url = u; opts = o; return { ok: true }; };
    await completeUpload(CREATE_RESPONSE.onComplete);
    assert.equal(url, CREATE_RESPONSE.onComplete.url);
    assert.equal(opts.method, 'POST');
    assert.deepEqual(JSON.parse(opts.body), { foo: 'bar' });
  });

  it('throws on failure', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => 'err' });
    await assert.rejects(() => completeUpload(CREATE_RESPONSE.onComplete), /500/);
  });
});

// ---------------------------------------------------------------------------
// getAsset / pollAsset
// ---------------------------------------------------------------------------

describe('getAsset', () => {
  it('GETs the asset by id with bearer auth', async () => {
    let url, opts;
    globalThis.fetch = async (u, o) => { url = u; opts = o; return { ok: true, json: async () => ({ id: 12345, status: 'IN_PROGRESS', percentComplete: 42 }) }; };
    const a = await getAsset(12345);
    assert.equal(url, `${ION_API_BASE}/v1/assets/12345`);
    assert.equal(opts.headers.Authorization, 'Bearer test-ion-token');
    assert.equal(a.percentComplete, 42);
  });
});

describe('pollAsset', () => {
  it('polls until COMPLETE, reporting progress', async () => {
    const seq = [
      { id: 1, status: 'IN_PROGRESS', percentComplete: 20 },
      { id: 1, status: 'IN_PROGRESS', percentComplete: 80 },
      { id: 1, status: 'COMPLETE', percentComplete: 100 },
    ];
    let i = 0;
    globalThis.fetch = async () => ({ ok: true, json: async () => seq[i++] });
    const progress = [];
    const final = await pollAsset(1, { intervalMs: 0, sleep: async () => {}, onProgress: (p) => progress.push(p) });
    assert.equal(final.status, 'COMPLETE');
    assert.deepEqual(progress, [20, 80, 100]);
  });

  it('throws when the asset reaches ERROR/DATA_ERROR', async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ id: 1, status: 'DATA_ERROR', percentComplete: 0 }) });
    await assert.rejects(() => pollAsset(1, { intervalMs: 0, sleep: async () => {} }), /DATA_ERROR/);
  });

  it('throws on timeout', async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ id: 1, status: 'IN_PROGRESS', percentComplete: 10 }) });
    await assert.rejects(
      () => pollAsset(1, { intervalMs: 0, sleep: async () => {}, timeoutMs: -1 }),
      /timed out/,
    );
  });
});

// ---------------------------------------------------------------------------
// SigV4 signer
// ---------------------------------------------------------------------------

describe('sigv4PutHeaders', () => {
  const base = {
    host: 's3.us-east-1.amazonaws.com',
    canonicalUri: '/assets.cesium.com/sources/12345/photo.jpg',
    region: 'us-east-1',
    service: 's3',
    accessKey: 'AKIDEXAMPLE',
    secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    sessionToken: 'SESSIONTOKEN123',
    payloadHash: 'a'.repeat(64),
    amzDate: '20260615T000000Z',
    dateStamp: '20260615',
  };

  it('produces a well-formed Authorization header', () => {
    const h = sigv4PutHeaders(base);
    assert.match(h.Authorization, /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20260615\/us-east-1\/s3\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]{64}$/);
    assert.equal(h['x-amz-content-sha256'], base.payloadHash);
    assert.equal(h['x-amz-date'], base.amzDate);
    assert.equal(h['x-amz-security-token'], base.sessionToken);
  });

  it('is deterministic for identical inputs', () => {
    assert.deepEqual(sigv4PutHeaders(base), sigv4PutHeaders(base));
  });

  it('changes the signature when the payload changes', () => {
    const a = sigv4PutHeaders(base);
    const b = sigv4PutHeaders({ ...base, payloadHash: 'b'.repeat(64) });
    assert.notEqual(a.Authorization, b.Authorization);
  });

  // Golden vector: pins the exact signature for a fully-fixed input whose path
  // contains an encoded space. Locks the canonical-request construction and
  // guards against the path double-encoding regression (signed path must equal
  // wire path). If the signer changes, this fails loudly rather than silently
  // producing 403s only on real uploads.
  it('matches the golden signature for a fixed input (incl. encoded space)', () => {
    const h = sigv4PutHeaders({
      host: 's3.us-east-1.amazonaws.com',
      canonicalUri: '/assets.cesium.com/sources/12345/my%20photo.jpg',
      region: 'us-east-1', service: 's3',
      accessKey: 'AKIDEXAMPLE',
      secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      sessionToken: 'SESSIONTOKEN123',
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      amzDate: '20260615T120000Z', dateStamp: '20260615',
    });
    assert.match(h.Authorization, /Signature=e0e48de04b6fe8362268a62bb65439c59f72b0e8ab20d50a103cef8a060a97b9$/);
  });

  it('signs the canonicalUri verbatim (does not re-encode an encoded path)', () => {
    const enc = sigv4PutHeaders({ ...base, canonicalUri: '/b/my%20photo.jpg' });
    const dbl = sigv4PutHeaders({ ...base, canonicalUri: '/b/my%2520photo.jpg' });
    // If the signer re-encoded, these two would collide. They must differ.
    assert.notEqual(enc.Authorization, dbl.Authorization);
  });
});

// ---------------------------------------------------------------------------
// uploadFileToS3
// ---------------------------------------------------------------------------

describe('uploadFileToS3', () => {
  it('PUTs the file bytes to the signed S3 URL', async () => {
    const tmp = path.join(os.tmpdir(), `tm-ion-${Date.now()}.txt`);
    fs.writeFileSync(tmp, 'hello-trinity');
    let url, opts;
    globalThis.fetch = async (u, o) => { url = u; opts = o; return { ok: true }; };
    try {
      await uploadFileToS3(CREATE_RESPONSE.uploadLocation, tmp);
      assert.match(url, /^https:\/\/s3\.us-east-1\.amazonaws\.com\/assets\.cesium\.com\/sources\/12345\/.*\.txt$/);
      assert.equal(opts.method, 'PUT');
      assert.match(opts.headers.Authorization, /^AWS4-HMAC-SHA256 /);
      assert.ok(opts.headers['x-amz-security-token']);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('single-encodes filenames with spaces (signed path == wire path)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-ion-'));
    const tmp = path.join(dir, 'my photo (1).jpg');
    fs.writeFileSync(tmp, 'x');
    let url;
    globalThis.fetch = async (u) => { url = u; return { ok: true }; };
    try {
      await uploadFileToS3(CREATE_RESPONSE.uploadLocation, tmp);
      assert.match(url, /my%20photo%20%281%29\.jpg$/, 'spaces/parens encoded exactly once');
      assert.ok(!url.includes('%2520'), 'no double-encoding');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// createSplatAsset orchestration
// ---------------------------------------------------------------------------

describe('createSplatAsset', () => {
  it('creates → uploads each file → completes, returning the asset id', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-ion-'));
    const f1 = path.join(tmpDir, 'a.jpg');
    const f2 = path.join(tmpDir, 'b.jpg');
    fs.writeFileSync(f1, 'aaa');
    fs.writeFileSync(f2, 'bbb');

    const calls = { create: 0, put: 0, complete: 0 };
    globalThis.fetch = async (u, o) => {
      if (u === `${ION_API_BASE}/v1/assets`) { calls.create++; return { ok: true, json: async () => CREATE_RESPONSE }; }
      if (o?.method === 'PUT') { calls.put++; return { ok: true }; }
      if (u === CREATE_RESPONSE.onComplete.url) { calls.complete++; return { ok: true }; }
      throw new Error(`unexpected fetch ${u}`);
    };

    try {
      const res = await createSplatAsset({ name: 'trinity', files: [f1, f2] });
      assert.equal(res.assetId, 12345);
      assert.equal(calls.create, 1);
      assert.equal(calls.put, 2);
      assert.equal(calls.complete, 1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });


  it('throws on empty file list', async () => {
    await assert.rejects(() => createSplatAsset({ name: 'x', files: [] }), /no files|files/i);
  });
});

describe('constants', () => {
  it('terminal statuses include COMPLETE and both error states', () => {
    assert.ok(TERMINAL_STATUSES.includes('COMPLETE'));
    assert.ok(TERMINAL_STATUSES.includes('ERROR'));
    assert.ok(TERMINAL_STATUSES.includes('DATA_ERROR'));
  });
});

// ---------------------------------------------------------------------------
// Splat source options — pinned against ion's OpenAPI spec
// (https://ion.cesium.com/openapi.yaml)
// ---------------------------------------------------------------------------

describe('SPLAT_SOURCE_OPTIONS', () => {
  it('uses RASTER_IMAGERY — the sourceType whose schema IS the reconstruction job', () => {
    // spec: sourceType RASTER_IMAGERY -> ImageryRasterOptions, "Multiple different
    // outputs can be generated ... for a reconstruction job."
    assert.equal(SPLAT_SOURCE_OPTIONS.sourceType, 'RASTER_IMAGERY');
  });

  it('does not use 3D_CAPTURE, which expects an already-reconstructed model', () => {
    // spec: "An OBJ, COLLADA, or glTF model created through photogrammetry
    // processes" — wrong for a directory of JPEGs.
    assert.notEqual(SPLAT_SOURCE_OPTIONS.sourceType, '3D_CAPTURE');
  });

  it('requests a splat output — without it the job cannot emit one', () => {
    const types = SPLAT_SOURCE_OPTIONS.outputs.map((o) => o.outputType);
    assert.ok(types.includes(SPLAT_OUTPUT_TYPE), 'must request SPLATS_3DTILES');
  });

  it('includes the required mesh output', () => {
    // spec: "At least one 3DTILES mesh output is required."
    const types = SPLAT_SOURCE_OPTIONS.outputs.map((o) => o.outputType);
    assert.ok(types.includes('3DTILES'));
  });

  it('requests at most one splat output', () => {
    // spec: "Only one SPLATS_3DTILES output is allowed."
    const splats = SPLAT_SOURCE_OPTIONS.outputs.filter((o) => o.outputType === SPLAT_OUTPUT_TYPE);
    assert.equal(splats.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Derived-asset resolution
// ---------------------------------------------------------------------------

describe('derivedAssets', () => {
  const splat = { id: 2, type: 'SPLATS_3DTILES', name: 'Trinity' };
  const mesh = { id: 1, type: '3DTILES', name: 'Trinity' };

  it("reads the spec's `assets` field", () => {
    assert.deepEqual(derivedAssets({ assets: [mesh, splat] }), [mesh, splat]);
  });

  it("reads the official example's `additionalAssets` spelling", () => {
    assert.deepEqual(derivedAssets({ additionalAssets: [splat] }), [splat]);
  });

  it('merges spellings instead of short-circuiting on an empty array', () => {
    // A nullish-coalescing chain would return [] here and report "no splat".
    assert.deepEqual(derivedAssets({ additionalAssets: [], assets: [splat] }), [splat]);
  });

  it('dedupes by id across spellings', () => {
    assert.deepEqual(derivedAssets({ assets: [splat], additionalAssets: [splat] }), [splat]);
  });

  it('is defensive about missing / non-array fields', () => {
    for (const input of [undefined, null, {}, { assets: null }, { assets: 'nope' }]) {
      assert.deepEqual(derivedAssets(input), []);
    }
  });
});

describe('findSplatAsset / splatAssetId', () => {
  const mesh = { id: 1, type: '3DTILES', name: 'Trinity Church' };
  const splat = { id: 2, type: 'SPLATS_3DTILES', name: 'Trinity Church' };

  it('identifies the splat by its output type', () => {
    assert.equal(splatAssetId({ assets: [mesh, splat] }), 2);
    assert.equal(identifySplatOutput({ assets: [mesh, splat] }).method, 'type');
  });

  it('does not mistake a same-typed sibling for the splat', () => {
    assert.equal(splatAssetId({ assets: [mesh, { id: 3, type: '3DTILES', name: 'Trinity Church' }] }), null);
  });

  it('REFUSES an ambiguous name match rather than guessing', () => {
    // The parent job name propagates to every derived asset, so a job called
    // "Trinity splat test" makes all of them match. Returning [0] here would
    // stream a mesh into TM_SplatTileset and fail two layers away.
    const a = { id: 1, type: '3DTILES', name: 'Trinity splat test' };
    const b = { id: 2, type: '3DTILES', name: 'Trinity splat test' };
    assert.equal(findSplatAsset({ assets: [a, b] }), null);
  });

  it('falls back to an unambiguous name hint', () => {
    const named = { id: 4, type: '3DTILES', name: 'Trinity Gaussian Splats' };
    assert.equal(splatAssetId({ assets: [{ id: 1, type: '3DTILES', name: 'Trinity mesh' }, named] }), 4);
  });

  it('excludes outputs that self-identify as mesh or point cloud', () => {
    const meshy = { id: 1, type: '3DTILES', name: 'splat job — mesh' };
    const las = { id: 2, type: '3DTILES', name: 'splat job — point cloud' };
    assert.equal(findSplatAsset({ assets: [meshy, las] }), null);
  });

  it('returns null with no derived assets at all', () => {
    assert.equal(splatAssetId({ assetMetadata: { id: 1 } }), null);
  });
});

// ---------------------------------------------------------------------------
// Option merging + CLI option parsing
// ---------------------------------------------------------------------------

describe('mergeSourceOptions', () => {
  it('preserves defaults that the caller did not override', () => {
    // The bug this guards: rebuilding options from sourceType alone dropped
    // `outputs`, making a splat impossible.
    const merged = mergeSourceOptions({ sourceType: 'OTHER' });
    assert.equal(merged.sourceType, 'OTHER');
    assert.deepEqual(merged.outputs, SPLAT_SOURCE_OPTIONS.outputs);
  });

  it('ignores undefined overrides instead of deleting the default', () => {
    // A trailing `--source-type` with no value yields undefined.
    assert.equal(mergeSourceOptions({ sourceType: undefined }).sourceType, 'RASTER_IMAGERY');
  });

  it('lets a caller replace outputs entirely', () => {
    const merged = mergeSourceOptions({ outputs: [{ outputType: 'LAS' }] });
    assert.deepEqual(merged.outputs, [{ outputType: 'LAS' }]);
  });
});

describe('parseExtraOptions', () => {
  it('parses key=value pairs, JSON-decoding values', () => {
    const out = parseExtraOptions(['--option', 'targetVersion="1.1"', '--option', 'enabled=true']);
    assert.equal(out.targetVersion, '1.1');
    assert.equal(out.enabled, true);
  });

  it('keeps unparseable values as raw strings', () => {
    assert.equal(parseExtraOptions(['--option', 'sourceType=RASTER_IMAGERY']).sourceType, 'RASTER_IMAGERY');
  });

  it('preserves = inside the value', () => {
    assert.equal(parseExtraOptions(['--option', 'k=a=b']).k, 'a=b');
  });

  it('throws on a malformed pair or a missing value', () => {
    assert.throws(() => parseExtraOptions(['--option', 'nope']), /expected key=value/);
    assert.throws(() => parseExtraOptions(['--option']), /requires key=value/);
  });

  it('warns on a repeated key and takes the last', () => {
    const warnings = [];
    const out = parseExtraOptions(['--option', 'k=1', '--option', 'k=2'], (m) => warnings.push(m));
    assert.equal(out.k, 2);
    assert.equal(warnings.length, 1);
  });

  it('does not let __proto__ vanish into the prototype', () => {
    const out = parseExtraOptions(['--option', '__proto__={"a":1}']);
    assert.ok(Object.prototype.hasOwnProperty.call(out, '__proto__'));
  });

  it('returns an empty object when no options are given', () => {
    assert.deepEqual(parseExtraOptions(['--photos', 'x']), {});
  });
});

// ---------------------------------------------------------------------------
// createAsset error hints
// ---------------------------------------------------------------------------

describe('createAssetHint', () => {
  it('explains that ion 404s a token missing assets:write', () => {
    const hint = createAssetHint(404, 'ResourceNotFound');
    assert.match(hint, /assets:write/);
    assert.match(hint, /NOT that the endpoint is wrong/);
  });

  it('points at --source-type when ion rejects the sourceType', () => {
    assert.match(createAssetHint(400, 'Invalid Parameter: sourceType'), /--source-type/);
  });

  it('stays quiet for unrelated failures', () => {
    assert.equal(createAssetHint(500, 'boom'), '');
    assert.equal(createAssetHint(400, 'something else'), '');
  });
});

describe('createAsset error reporting', () => {
  it("preserves ion's original body alongside the hint", async () => {
    globalThis.fetch = async () => ({ ok: false, status: 404, text: async () => 'ResourceNotFound /v1/assets' });
    await assert.rejects(() => createAsset({ name: 'x' }), (e) => {
      assert.match(e.message, /ResourceNotFound \/v1\/assets/); // ion's own words survive
      assert.match(e.message, /assets:write/);                  // plus our hint
      return true;
    });
  });
});

describe('createSplatAsset derived-asset capture', () => {
  it('returns derived assets and the splat id from the CREATE response', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ion-'));
    const file = path.join(tmp, 'a.jpg');
    fs.writeFileSync(file, 'x');
    const created = {
      ...CREATE_RESPONSE,
      assets: [
        { id: 1, type: '3DTILES', name: 'Trinity' },
        { id: 2, type: 'SPLATS_3DTILES', name: 'Trinity' },
      ],
    };
    globalThis.fetch = async (u) => (String(u).includes('uploadComplete')
      ? { ok: true }
      : String(u).startsWith('https://s3.')
        ? { ok: true }
        : { ok: true, json: async () => created });

    const res = await createSplatAsset({ name: 'trinity', files: [file] });
    assert.equal(res.assetId, 12345);
    assert.equal(res.splatAssetId, 2, 'splat id must be captured at create time');
    assert.equal(res.derivedAssets.length, 2);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// Tagged outputs — making identification deterministic
// ---------------------------------------------------------------------------

describe('buildSplatOutputs', () => {
  it('names each output with its type tag, so the splat is an exact match later', () => {
    // spec: outputs[].name "specifies the name of the asset to be generated".
    const outputs = buildSplatOutputs('Trinity Church');
    const splat = outputs.find((o) => o.outputType === 'SPLATS_3DTILES');
    assert.equal(splat.name, `Trinity Church ${OUTPUT_TAG.SPLATS_3DTILES}`);
  });

  it('still requests the mandatory mesh output', () => {
    assert.ok(buildSplatOutputs('x').some((o) => o.outputType === '3DTILES'));
  });

  it('falls back to a placeholder rather than emitting a blank name', () => {
    for (const bad of [undefined, null, '', '   ']) {
      assert.ok(buildSplatOutputs(bad).every((o) => o.name.trim().length > 0));
    }
  });
});

describe('identifySplatOutput — precedence and honesty', () => {
  it('matches our own name tag when ion does not mark the type', () => {
    const res = { assets: [
      { id: 1, type: '3DTILES', name: `Trinity ${OUTPUT_TAG['3DTILES']}` },
      { id: 2, type: '3DTILES', name: `Trinity ${OUTPUT_TAG.SPLATS_3DTILES}` },
    ] };
    const hit = identifySplatOutput(res);
    assert.equal(hit.asset.id, 2);
    assert.equal(hit.method, 'tag');
  });

  it('prefers the output type over the name tag', () => {
    const res = { assets: [
      { id: 1, type: 'SPLATS_3DTILES', name: 'untagged' },
      { id: 2, type: '3DTILES', name: `x ${OUTPUT_TAG.SPLATS_3DTILES}` },
    ] };
    assert.equal(identifySplatOutput(res).method, 'type');
    assert.equal(identifySplatOutput(res).asset.id, 1);
  });

  it('refuses when a hint is inherited from the parent job name', () => {
    // "Trinity splat test" propagates 'splat' to every output, so a lone
    // derived asset (the mesh) would otherwise look like the splat.
    const res = {
      assetMetadata: { id: 9, name: 'Trinity splat test' },
      assets: [{ id: 1, type: '3DTILES', name: 'Trinity splat test' }],
    };
    assert.equal(identifySplatOutput(res), null);
    assert.equal(splatAssetId(res), null);
  });

  it('flags a name-only match as the weak guess it is', () => {
    const res = {
      assetMetadata: { id: 9, name: 'Trinity Church' },
      assets: [
        { id: 1, type: '3DTILES', name: 'Trinity mesh' },
        { id: 2, type: '3DTILES', name: 'Trinity Gaussian' },
      ],
    };
    assert.equal(identifySplatOutput(res).method, 'name');
  });

  it("does not exclude place names containing 'las' as point-cloud outputs", () => {
    const res = {
      assetMetadata: { id: 9, name: 'Dallas' },
      assets: [{ id: 1, type: '3DTILES', name: 'Dallas Gaussian' }],
    };
    assert.equal(splatAssetId(res), 1);
  });

  it('still excludes a genuine LAS point-cloud output', () => {
    const res = {
      assetMetadata: { id: 9, name: 'Trinity' },
      assets: [{ id: 1, type: '3DTILES', name: 'Trinity gaussian LAS' }],
    };
    assert.equal(splatAssetId(res), null);
  });
});

describe('derivedAssets — merge semantics', () => {
  it('merges records for the same id instead of first-wins', () => {
    // A sparse record in one spelling must not hide a marker in the other.
    const merged = derivedAssets({
      assets: [{ id: 2, name: 'Trinity' }],
      additionalAssets: [{ id: 2, type: 'SPLATS_3DTILES' }],
    });
    assert.equal(merged.length, 1);
    assert.equal(merged[0].type, 'SPLATS_3DTILES');
    assert.equal(merged[0].name, 'Trinity');
  });

  it('treats numeric and string ids as the same asset', () => {
    const merged = derivedAssets({ assets: [{ id: 2, type: 'SPLATS_3DTILES' }], additionalAssets: [{ id: '2' }] });
    assert.equal(merged.length, 1);
  });
});
