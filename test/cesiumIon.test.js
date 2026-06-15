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

    const res = await createAsset({ name: 'trinity', description: 'd', type: '3DTILES', options: { sourceType: 'RAW_IMAGERY' } });

    assert.equal(url, `${ION_API_BASE}/v1/assets`);
    assert.equal(opts.method, 'POST');
    assert.equal(opts.headers.Authorization, 'Bearer test-ion-token');
    assert.equal(opts.headers['Content-Type'], 'application/json');
    const body = JSON.parse(opts.body);
    assert.equal(body.name, 'trinity');
    assert.equal(body.type, '3DTILES');
    assert.equal(body.options.sourceType, 'RAW_IMAGERY');
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

  it('defaults the asset type to the splat asset type', () => {
    assert.equal(SPLAT_ASSET_TYPE, '3DTILES');
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
