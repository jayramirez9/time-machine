# Scope: Phase 7d.2 — Capture Pipeline Integration

**Status:** Scoped (contract-first, Forge v0.2)
**Depends on:** 7d.1 spike verdict (how far to push capture), Cesium ion account, Unreal 5.8 + Cesium for Unreal (3DGS tileset support)
**Goal:** Make 3D Gaussian Splatting a first-class, per-feature geometry source — selectable by evidence — without disturbing the procedural+archival pipeline.

Three deliverables, each a `lib/` contract + tool + tests, mirroring existing patterns (`meshyClient.js`/`meshy-generate.js`, `cesiumTileset.js`, `geminiImageGen.test.js` mocked-fetch style).

---

## Build order (deliberate)

Two of the three need **no hardware** and can be built now with mocked tests; the third needs the box. Sequence:

1. **C — Representation selector** (pure logic, no deps) — build first, fully unit-tested.
2. **B — Cesium ion capture client** (needs ion token; test with mocked fetch) — build second.
3. **A — 3DGS tileset streaming** (needs live Unreal) — build last; unit-test the RC payload offline, integration-test live.

---

## C — Representation selector — `lib/representationSelector.js` ✅ BUILT (2026-06-15)

**Done:** `lib/representationSelector.js` + `test/representationSelector.test.js` (18 tests, green). Pure function, no I/O. Exports `selectRepresentation()`, `summarizeRegimes()`, `DEFAULT_THRESHOLDS`, `REGIMES`, `METHODS`. The Trinity spike case (5 photos @ 640px) correctly routes to `mesh_meshy` — the resolution gate working as designed. **Remaining for full 7d.2 item:** wire the tag into `buildingMassing.js`/`spawn-buildings.js` (skip procedural spawn for `capture` features) and record the decision + `summarizeRegimes()` into the accuracy manifest (`environmentProfile.js`). That integration is deferred until B/A exist so there's something for `capture` features to point at.

Pure function implementing the PRD §17 regime decision. No I/O → trivially testable. **Do this first** (it encodes the decision the whole phase serves, and needs nothing external).

**Contract:**
```js
selectRepresentation(feature, opts = {}) → {
  regime: 'capture' | 'procedural',
  method: 'splat_modern' | 'splat_archival' | 'mesh_meshy' | 'massing_procedural',
  reason: string,            // human-readable, for the accuracy manifest
  confidence: number         // 0..1, carries into the layer envelope
}
```

`feature` fields (sourced from existing agents — see joins below):
- `survivesToday: boolean` — derived from buildingDateAgent `yearDemolished` (null/future ⇒ survives)
- `isHero: boolean` — landmark vs. background
- `photoCount: number`, `photoMaxResolutionPx: number` — from `photoArchiveFetch` (`findBestPhoto`)
- `evidenceConfidence: number` — from the urbanForm/buildingDate layer

**Decision table (from PRD §17):**
```
survivesToday && modern capture available           → capture / splat_modern
isHero && photoCount >= 4 && maxRes >= 1000px        → capture / splat_archival   (attempt)
isHero                                                → capture? else mesh_meshy   (fallback)
demolished / sparse / low-res                         → procedural / massing_procedural
evidenceConfidence < floor everywhere                → procedural + reduce detail (Law 5.5)
```
Thresholds (`opts`, with defaults) are tunable from the 7d.1 spike findings. **Note:** the spike already shows Trinity's archival set is ~4–5 images at ≤640px → falls *below* the `splat_archival` resolution gate → routes to `mesh_meshy`. That is the model working as intended.

**Integration:** spawners (`buildingMassing.js`/`spawn-buildings.js`) consult the tag — `capture` features are skipped by procedural spawn (handled by the tileset) and the choice + reason is recorded in the accuracy manifest (`environmentProfile.js`).

**Tests** (`test/representationSelector.test.js`, write first): full rule table, boundary cases (exactly-at-threshold), low-confidence fallback, manifest field shape.

---

## B — Cesium ion capture client — `lib/cesiumIon.js` + `tools/cesium-capture.js` ✅ BUILT (2026-06-15)

**Done:** `lib/cesiumIon.js` + `tools/cesium-capture.js` + `test/cesiumIon.test.js` (19 tests, green). Implements the documented ion REST flow (create → S3 upload → onComplete → poll) with a **zero-dependency SigV4 S3 signer** (`node:crypto`). Exports `createSplatAsset`, `createAsset`, `completeUpload`, `getAsset`, `pollAsset`, `uploadFileToS3`, `sigv4PutHeaders`, `ionToken`, constants. CLI: `--photos`, `--name`, `--source-type`, `--status <id>`, `--dry-run`, `--no-wait`; writes `CAPTURE_MANIFEST.json`. Dry-run verified against `photos/spike-trinity/`. `CESIUM_ION_TOKEN` added to `.env` + CLAUDE.md.

**⚠️ Carried open question (unchanged):** Gaussian-splat `options.sourceType` via REST is undocumented (2026). Defaults to a best-guess (`RAW_IMAGERY`), overridable via `--source-type`, with explicit warnings in both the lib header and tool output. The create/upload/complete/poll flow itself is stable. **Verify against a live ion account before relying on automated splat output** — until then the tool still works for the documented mesh/point-cloud reconstruction, and the asset ID it returns feeds deliverable A regardless of output type.

Submit imagery to Cesium ion, get back a 3DGS tileset **asset ID**. Mirrors `meshyClient.js` + `meshy-generate.js`.

**Contract (`lib/cesiumIon.js`):**
```js
createSplatAsset({ name, description, files, options }, { token, onUpload })
  → { assetId, assetType, derivedAssets, splatAssetId, splatMatchMethod }
  // derivedAssets/splatAssetId come off the CREATE response — reconstruction
  // outputs are not retrievable from GET /v1/assets/{id}.
pollAsset({ token, assetId }) → { status, percentComplete }   // status: AWAITING_FILES|NOT_STARTED|IN_PROGRESS|COMPLETE|ERROR
getAsset({ token, assetId }) → { ... }
ionToken() → string   // reads CESIUM_ION_TOKEN from env
```

**ion REST flow** (verify against current API at build time):
1. `POST /v1/assets` with `type: '3DTILES'` + source options requesting **Gaussian splat** output (iTwin Capture). Returns `assetMetadata.id` + S3 `uploadLocation` creds.
2. Upload `files` to the returned S3 location.
3. `POST /v1/assets/{id}/uploadComplete`.
4. Poll `GET /v1/assets/{id}` until `status === 'COMPLETE'`.

**Tool:** `node tools/cesium-capture.js --photos photos/spike-trinity/ --name trinity-church-splat`
→ submits, polls, writes `CAPTURE_MANIFEST.json` (assetId, source photos, status). `--dry-run`, `--balance`-style status flags like other tools.

**Open question to verify:** does the ion REST API expose **Gaussian-splat output** as an asset type, or is it web-UI-only today? If web-UI-only → degrade gracefully: tool just records a manually-created asset ID, and deliverable A (streaming) still works end-to-end. Flag in the tool output; don't fail silently.

**New env var:** `CESIUM_ION_TOKEN` (assets:write + assets:read). Add to `.env` placeholders and CLAUDE.md env table.

**Tests** (`test/cesiumIon.test.js`, mocked fetch like `geminiImageGen.test.js`): asset-creation request shape, poll status parsing, token-from-env, error paths. No network.

---

## A — 3DGS tileset streaming — extend `lib/cesiumTileset.js` ✅ BUILT (2026-06-29, code-complete)

**Done:** Added `buildSplatTilesetScript()` + `buildClearSplatScript()` (pure Python-RC payload builders, offline-tested), `setSplatTileset(host, {assetId, token, actorLabel})`, `clearSplatTileset(host)`, `getSplatTilesetStatus(host)`, and `DEFAULT_SPLAT_LABEL`. Find-or-spawns a **dedicated** `TM_SplatTileset` Cesium3DTileset actor (distinct from OSM Buildings / World Terrain / Google scouting tileset) via the Python RC path, configures `ion_asset_id` + `ion_access_token`, and sets `tileset_source` to ion with a **version-fallback** over the renamed source enum (`CesiumDataSource` vs `TilesetSource` — verify against the installed Cesium for Unreal on 5.8), then `refresh_tileset()`. Wired into `runtimeEngine.js` engine start alongside the Google tileset block, gated on `CESIUM_SPLAT_ASSET_ID` + `CESIUM_ION_TOKEN`; `engine.splatTileset` exposed. Removed the dead `rcProp()`. `test/cesiumTileset.test.js`: 20 offline tests (RC payload assertions in the `renderingConfig.test.js` style + mocked-fetch wrappers).

**⚠️ Live-verify on the box:** (1) the `tileset_source` enum name on the installed plugin; (2) that `ion_asset_id`/`ion_access_token` accept `set_editor_property` (vs. needing a function-call setter); (3) the plugin renders `KHR_gaussian_splatting`; (4) any required feature flag / console var. Full live integration test (spawn → set ion asset → confirm streaming) pending Unreal 5.8 + Cesium for Unreal.

Today the module points an existing `Cesium3DTileset` actor at a **URL** (Google scouting tiles). 3DGS from ion is referenced by **ion asset ID**, and we want a **dedicated** splat tileset actor distinct from OSM Buildings / World Terrain / the Google scouting tileset.

**New contract:**
```js
setSplatTileset(host, { assetId, token, actorLabel = 'TM_SplatTileset' }) →
  { ok, objectPath, assetId, error? }
clearSplatTileset(host) → { ok, error? }
getSplatTilesetStatus(host) → { ok, found, assetId?, error? }
```

**Implementation notes:**
- **Find-or-create** the dedicated actor. Existing `findCesium3DTileset()` returns the *first/blank* tileset — extend to match by `ActorLabel === actorLabel`. If absent, **spawn** a `Cesium3DTileset` via the Python RC path (same mechanism as `disableIonImagery()`), label it, then configure.
- Configure for ion: `SetTilesetSource('From Cesium Ion')`, set `IonAssetID` + `IonAccessToken`. **Risk:** direct property writes are blocked by a getter/setter check (see existing `SetUrl` workaround comment) — `IonAssetID`/`IonAccessToken` may need a function-call setter or the Python path. Resolve during build; prefer Python for parity with engine-start automation.
- **Wire into engine start** (`runtimeEngine.js`) alongside the existing tileset config, gated on a 3DGS asset being configured for the scene (present-day / recent-era branch, or per-feature hero splats).
- **Verify against 5.8 / Cesium for Unreal:** confirm the plugin version renders `KHR_gaussian_splatting`; check for a required feature flag / console var. Capture in a `verify` checklist.
- Clean up dead code while here: `rcProp()` in `cesiumTileset.js` is currently unused.

**Tests:** unit-test the RC/Python payload builders **offline** (assert request bodies — the pattern `renderingConfig.test.js` uses for "offline RC API"). Live integration test when the box is up: spawn → set ion asset → confirm streaming.

---

## Definition of done (7d.2)

- [ ] `selectRepresentation()` tags every feature `capture`|`procedural` with reason → accuracy manifest; spawners honor the tag.
- [ ] `cesius-capture.js` submits `photos/spike-trinity/` and returns/records an ion asset ID (or cleanly reports web-UI-only fallback).
- [ ] `setSplatTileset()` streams that asset into Unreal as a dedicated `TM_SplatTileset` actor, wired into engine start.
- [ ] One end-to-end proof: a single hero (or present-day block) rendered from a 3DGS tileset while the procedural pipeline renders the rest of the scene — the two regimes coexisting, exactly as PRD §17 describes.
- [ ] New env (`CESIUM_ION_TOKEN`) documented; tests green; CLAUDE.md updated.

## Risks / open questions

1. **ion API splat output** — REST vs. web-UI-only (deliverable B). Verify first; affects automation depth.
2. **RC property-setter restrictions** on `IonAssetID` (deliverable A) — may force the Python path.
3. **Splat relighting** (carried from 7d.1) — if the spike confirms splats don't obey the WorldState sun/weather, capture is constrained to present-day/static-backdrop use, and the selector's `capture` branch narrows accordingly. The architecture doesn't change; the thresholds do.
4. **ion cost/quota** — reconstruction + streaming both consume ion credits; track like Meshy credits.
