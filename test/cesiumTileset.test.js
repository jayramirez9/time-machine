import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSplatTilesetScript,
  buildClearSplatScript,
  setSplatTileset,
  clearSplatTileset,
  getSplatTilesetStatus,
  DEFAULT_SPLAT_LABEL,
} from '../lib/cesiumTileset.js';

const HOST = 'http://localhost:30010';

// ── Offline RC payload (pure script builders, no network) ──────────────────

describe('buildSplatTilesetScript', () => {
  const script = buildSplatTilesetScript({ assetId: 2333904, token: 'eyJabc.def-ghi', actorLabel: 'TM_SplatTileset' });

  it('embeds the ion asset id as an integer literal', () => {
    assert.ok(script.includes('ASSET_ID = 2333904'));
  });

  it('embeds the token as a quoted python string', () => {
    assert.ok(script.includes('TOKEN = "eyJabc.def-ghi"'));
  });

  it('embeds the actor label', () => {
    assert.ok(script.includes('LABEL = "TM_SplatTileset"'));
  });

  it('find-or-spawns a Cesium3DTileset actor', () => {
    assert.ok(script.includes('Cesium3DTileset'));
    assert.ok(script.includes('spawn_actor_from_class'));
    assert.ok(script.includes('/Script/CesiumRuntime.Cesium3DTileset'));
  });

  it('sets ion asset id and access token editor properties', () => {
    assert.ok(script.includes("set_editor_property('ion_asset_id', ASSET_ID)"));
    assert.ok(script.includes("set_editor_property('ion_access_token', TOKEN)"));
  });

  it('configures the ion source enum with a version fallback', () => {
    assert.ok(script.includes('tileset_source'));
    assert.ok(script.includes('FROM_CESIUM_ION'));
    assert.ok(script.includes('CesiumDataSource'));
    assert.ok(script.includes('TilesetSource'));
  });

  it('refreshes the tileset after configuration', () => {
    assert.ok(script.includes('refresh_tileset'));
  });

  it('defaults the actor label when omitted', () => {
    const s = buildSplatTilesetScript({ assetId: 7, token: 't' });
    assert.ok(s.includes(`LABEL = "${DEFAULT_SPLAT_LABEL}"`));
  });

  it('safely escapes a token containing quotes', () => {
    const s = buildSplatTilesetScript({ assetId: 7, token: 'a"b' });
    assert.ok(s.includes('TOKEN = "a\\"b"'));
  });

  it('rejects a non-integer asset id', () => {
    assert.throws(() => buildSplatTilesetScript({ assetId: 1.5, token: 't' }), /positive integer/);
    assert.throws(() => buildSplatTilesetScript({ assetId: 0, token: 't' }), /positive integer/);
    assert.throws(() => buildSplatTilesetScript({ assetId: -3, token: 't' }), /positive integer/);
  });

  it('rejects an empty token', () => {
    assert.throws(() => buildSplatTilesetScript({ assetId: 7, token: '' }), /non-empty string/);
  });
});

describe('buildClearSplatScript', () => {
  it('destroys actors matching the label', () => {
    const s = buildClearSplatScript('TM_SplatTileset');
    assert.ok(s.includes('LABEL = "TM_SplatTileset"'));
    assert.ok(s.includes('destroy_actor'));
    assert.ok(s.includes('Cesium3DTileset'));
  });

  it('defaults the label', () => {
    const s = buildClearSplatScript();
    assert.ok(s.includes(`LABEL = "${DEFAULT_SPLAT_LABEL}"`));
  });
});

// ── Network wrappers (mocked fetch) ────────────────────────────────────────

describe('setSplatTileset / clearSplatTileset / getSplatTilesetStatus', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('posts the python script to ExecutePythonScript and reports ok', async () => {
    let captured;
    globalThis.fetch = async (url, opts) => {
      captured = { url, body: JSON.parse(opts.body) };
      return { ok: true, status: 200 };
    };
    const res = await setSplatTileset(HOST, { assetId: 42, token: 'tok' });
    assert.equal(res.ok, true);
    assert.equal(res.assetId, 42);
    assert.equal(res.actorLabel, DEFAULT_SPLAT_LABEL);
    assert.equal(captured.url, `${HOST}/remote/object/call`);
    assert.equal(captured.body.functionName, 'ExecutePythonScript');
    assert.ok(captured.body.parameters.PythonScript.includes('ASSET_ID = 42'));
  });

  it('returns an error without calling fetch on invalid input', async () => {
    let called = false;
    globalThis.fetch = async () => { called = true; return { ok: true, status: 200 }; };
    const res = await setSplatTileset(HOST, { assetId: 0, token: 'tok' });
    assert.equal(res.ok, false);
    assert.match(res.error, /positive integer/);
    assert.equal(called, false);
  });

  it('surfaces an HTTP failure', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 500 });
    const res = await setSplatTileset(HOST, { assetId: 42, token: 'tok' });
    assert.equal(res.ok, false);
    assert.match(res.error, /500/);
  });

  it('treats a 200 with ReturnValue=false as failure (script raised)', async () => {
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ReturnValue: false }) });
    const res = await setSplatTileset(HOST, { assetId: 42, token: 'tok' });
    assert.equal(res.ok, false);
    assert.match(res.error, /ReturnValue/);
  });

  it('treats a 200 with ReturnValue=true as success', async () => {
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ReturnValue: true }) });
    const res = await setSplatTileset(HOST, { assetId: 42, token: 'tok' });
    assert.equal(res.ok, true);
  });

  it('clears via destroy script', async () => {
    let captured;
    globalThis.fetch = async (url, opts) => {
      captured = JSON.parse(opts.body);
      return { ok: true, status: 200 };
    };
    const res = await clearSplatTileset(HOST);
    assert.equal(res.ok, true);
    assert.ok(captured.parameters.PythonScript.includes('destroy_actor'));
  });

  it('reports not-found when no labelled tileset exists', async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ Assets: [] }) });
    const res = await getSplatTilesetStatus(HOST);
    assert.equal(res.ok, true);
    assert.equal(res.found, false);
  });

  it('reports found + asset id when the labelled tileset exists', async () => {
    globalThis.fetch = async (url) => {
      if (url.includes('/remote/search/assets')) {
        return {
          ok: true,
          json: async () => ({
            Assets: [{
              Class: '/Script/CesiumRuntime.Cesium3DTileset',
              Path: '/Game/Map.Map:PersistentLevel.TM_SplatTileset_1',
              Metadata: { ActorLabel: DEFAULT_SPLAT_LABEL },
            }],
          }),
        };
      }
      // property read for IonAssetID
      return { ok: true, json: async () => ({ IonAssetID: 2333904 }) };
    };
    const res = await getSplatTilesetStatus(HOST);
    assert.equal(res.found, true);
    assert.equal(res.assetId, 2333904);
    assert.match(res.objectPath, /TM_SplatTileset/);
  });

  it('ignores a same-class tileset with a different label', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        Assets: [{
          Class: '/Script/CesiumRuntime.Cesium3DTileset',
          Path: '/Game/Map.Map:PersistentLevel.Cesium_OSM_Buildings',
          Metadata: { ActorLabel: 'Cesium OSM Buildings' },
        }],
      }),
    });
    const res = await getSplatTilesetStatus(HOST);
    assert.equal(res.found, false);
  });
});
