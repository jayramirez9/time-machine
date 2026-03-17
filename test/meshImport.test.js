import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  manifestToSpawnData,
  buildMeshImportScript,
  buildMeshClearScript,
  ACTOR_PREFIX,
} from '../lib/meshImport.js';

// Minimal test building feature (Bowling Green area, Manhattan)
const testFeature = {
  type: 'Feature',
  properties: {
    material: 'stone',
    use: 'commercial',
    stories: 5,
    address: '56 Broad St',
  },
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [-74.0113, 40.7042],
      [-74.0111, 40.7042],
      [-74.0111, 40.7044],
      [-74.0113, 40.7044],
      [-74.0113, 40.7042],
    ]],
  },
};

const testOrigin = { lat: 40.7043, lon: -74.0112 };

const testManifest = {
  name: '56-broad-st',
  address: '56 Broad St',
  buildingIndex: 0,
  generatedAt: '2026-03-16T00:00:00Z',
  pipeline: 'gemini-reference-image-to-3d',
  styleName: 'second_empire',
  quality: 'foreground',
  polycount: 150000,
  formats: ['fbx', 'glb'],
  pbr: true,
};

describe('Mesh Import', () => {
  describe('manifestToSpawnData', () => {
    it('produces spawn entry with correct label', () => {
      const entry = manifestToSpawnData(testManifest, testFeature, testOrigin, 'mesh-data/56-broad-st');
      assert.ok(entry.label.startsWith(ACTOR_PREFIX));
      assert.ok(entry.label.includes('56-broad-st'));
    });

    it('computes position from building footprint', () => {
      const entry = manifestToSpawnData(testManifest, testFeature, testOrigin, 'mesh-data/56-broad-st');
      // Position should be near origin (small offsets)
      assert.ok(Math.abs(entry.location[0]) < 5000, 'X should be within 5km of origin');
      assert.ok(Math.abs(entry.location[1]) < 5000, 'Y should be within 5km of origin');
      assert.equal(entry.location[2], 0, 'Z should be 0 (mesh sits on ground)');
    });

    it('computes yaw rotation from longest edge', () => {
      const entry = manifestToSpawnData(testManifest, testFeature, testOrigin, 'mesh-data/56-broad-st');
      assert.equal(typeof entry.rotation[1], 'number');
      // Our test polygon is axis-aligned, so yaw should be ~0 or ~90
      assert.ok(
        Math.abs(entry.rotation[1]) < 5 || Math.abs(Math.abs(entry.rotation[1]) - 90) < 5,
        `Yaw should be near 0° or 90° for axis-aligned polygon, got ${entry.rotation[1]}`,
      );
    });

    it('preserves manifest metadata', () => {
      const entry = manifestToSpawnData(testManifest, testFeature, testOrigin, 'mesh-data/56-broad-st');
      assert.equal(entry.styleName, 'second_empire');
      assert.equal(entry.quality, 'foreground');
      assert.equal(entry.pipeline, 'gemini-reference-image-to-3d');
      assert.equal(entry.format, 'fbx');
      assert.equal(entry.hasPbr, true);
      assert.equal(entry.address, '56 Broad St');
    });

    it('generates asset name from slug', () => {
      const entry = manifestToSpawnData(testManifest, testFeature, testOrigin, 'mesh-data/56-broad-st');
      assert.equal(entry.assetName, 'SM_56_broad_st');
    });

    it('handles null feature gracefully', () => {
      const entry = manifestToSpawnData(testManifest, null, testOrigin, 'mesh-data/56-broad-st');
      assert.deepEqual(entry.location, [0, 0, 0]);
      assert.deepEqual(entry.rotation, [0, 0, 0]);
      assert.ok(entry.label);
    });

    it('uses buildingIndex for label numbering', () => {
      const manifest = { ...testManifest, buildingIndex: 15 };
      const entry = manifestToSpawnData(manifest, testFeature, testOrigin, 'mesh-data/56-broad-st');
      assert.ok(entry.label.includes('015'), `Label should have padded index, got ${entry.label}`);
    });
  });

  describe('buildMeshImportScript', () => {
    it('generates a Python script with import and spawn blocks', () => {
      const entry = manifestToSpawnData(testManifest, testFeature, testOrigin, 'mesh-data/56-broad-st');
      const script = buildMeshImportScript([entry], { daemonUrl: 'http://192.168.1.10:3000' });

      assert.ok(script.includes('import unreal'));
      assert.ok(script.includes('import urllib.request'));
      assert.ok(script.includes('AssetImportTask'));
      assert.ok(script.includes('SM_56_broad_st'));
      assert.ok(script.includes('http://192.168.1.10:3000'));
      assert.ok(script.includes('spawn_actor_from_class'));
      assert.ok(script.includes('set_static_mesh'));
    });

    it('includes PBR texture imports when hasPbr is true', () => {
      const entry = manifestToSpawnData(testManifest, testFeature, testOrigin, 'mesh-data/56-broad-st');
      const script = buildMeshImportScript([entry], { daemonUrl: 'http://localhost:3000' });

      assert.ok(script.includes('base_color'), 'Should import base_color texture');
      assert.ok(script.includes('metallic'), 'Should import metallic texture');
      assert.ok(script.includes('roughness'), 'Should import roughness texture');
      assert.ok(script.includes('normal'), 'Should import normal texture');
    });

    it('clears existing actors by default', () => {
      const entry = manifestToSpawnData(testManifest, testFeature, testOrigin, 'mesh-data/56-broad-st');
      const script = buildMeshImportScript([entry], { daemonUrl: 'http://localhost:3000' });

      assert.ok(script.includes(`startswith("${ACTOR_PREFIX}")`));
      assert.ok(script.includes('destroy()'));
    });

    it('skips clear when clearExisting is false', () => {
      const entry = manifestToSpawnData(testManifest, testFeature, testOrigin, 'mesh-data/56-broad-st');
      const script = buildMeshImportScript([entry], { daemonUrl: 'http://localhost:3000', clearExisting: false });

      assert.ok(!script.includes('destroy()'));
    });

    it('throws without daemonUrl', () => {
      const entry = manifestToSpawnData(testManifest, testFeature, testOrigin, 'mesh-data/56-broad-st');
      assert.throws(
        () => buildMeshImportScript([entry], {}),
        /daemonUrl/,
      );
    });

    it('handles multiple meshes', () => {
      const entries = [
        manifestToSpawnData(testManifest, testFeature, testOrigin, 'mesh-data/56-broad-st'),
        manifestToSpawnData(
          { ...testManifest, name: 'building-01', buildingIndex: 1 },
          testFeature,
          testOrigin,
          'mesh-data/building-01',
        ),
      ];
      const script = buildMeshImportScript(entries, { daemonUrl: 'http://localhost:3000' });

      assert.ok(script.includes('SM_56_broad_st'));
      assert.ok(script.includes('SM_building_01'));
      assert.ok(script.includes('2 meshes'));
    });
  });

  describe('buildMeshClearScript', () => {
    it('generates a clear-only script', () => {
      const script = buildMeshClearScript();
      assert.ok(script.includes('import unreal'));
      assert.ok(script.includes(ACTOR_PREFIX));
      assert.ok(script.includes('destroy()'));
    });
  });

  describe('ACTOR_PREFIX', () => {
    it('is TM_Mesh', () => {
      assert.equal(ACTOR_PREFIX, 'TM_Mesh');
    });
  });
});
