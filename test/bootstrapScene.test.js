import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { audioProfileId, shouldSkip } from '../tools/bootstrap-scene.js';

// ---------------------------------------------------------------------------
// audioProfileId — re-exported from lib/profileGenerator.js
// ---------------------------------------------------------------------------

describe('bootstrap-scene — audioProfileId', () => {
  it('generates gen_{slug}_{year} for simple location', () => {
    assert.equal(audioProfileId('Manhattan, NY', 1884), 'gen_manhattan_ny_1884');
  });

  it('generates gen_{slug}_{year} for multi-word location', () => {
    assert.equal(audioProfileId('Baton Rouge, LA', 1978), 'gen_baton_rouge_la_1978');
  });

  it('handles location with no state', () => {
    assert.equal(audioProfileId('London', 1888), 'gen_london_1888');
  });

  it('strips special characters', () => {
    assert.equal(audioProfileId('New York, NY (USA)', 1920), 'gen_new_york_ny_usa_1920');
  });

  it('strips leading/trailing underscores', () => {
    assert.equal(audioProfileId('  Manhattan  ', 1884), 'gen_manhattan_1884');
  });
});

// ---------------------------------------------------------------------------
// shouldSkip
// ---------------------------------------------------------------------------

describe('bootstrap-scene — shouldSkip', () => {
  const defaults = { skipList: [], force: false };

  it('skips when phase is in skipList', () => {
    const result = shouldSkip('terrain', '/nonexistent', { ...defaults, skipList: ['terrain', 'photos'] });
    assert.equal(result.skip, true);
    assert.ok(result.reason.includes('--skip'));
  });

  it('does not skip when phase is not in skipList', () => {
    const result = shouldSkip('terrain', '/nonexistent-path-xyz', { ...defaults, skipList: ['photos'] });
    assert.equal(result.skip, false);
  });

  it('does not skip when force is true even if file exists', () => {
    const result = shouldSkip('terrain', 'package.json', { skipList: [], force: true });
    assert.equal(result.skip, false);
  });

  it('skips when output file exists', () => {
    const result = shouldSkip('terrain', 'package.json', defaults);
    assert.equal(result.skip, true);
    assert.ok(result.reason.includes('exists'));
  });

  it('does not skip when output file does not exist', () => {
    const result = shouldSkip('terrain', '/tmp/nonexistent-file-xyz-123', defaults);
    assert.equal(result.skip, false);
  });

  it('skips when output dir exists and is non-empty', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-test-'));
    fs.writeFileSync(path.join(tmpDir, 'test.txt'), 'data');

    const result = shouldSkip('audio-assets', tmpDir, { ...defaults, isDir: true });
    assert.equal(result.skip, true);
    assert.ok(result.reason.includes('exists'));

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('does not skip when output dir exists but is empty', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-test-'));

    const result = shouldSkip('audio-assets', tmpDir, { ...defaults, isDir: true });
    assert.equal(result.skip, false);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('does not skip when output dir does not exist', () => {
    const result = shouldSkip('audio-assets', '/tmp/nonexistent-dir-xyz', { ...defaults, isDir: true });
    assert.equal(result.skip, false);
  });

  it('user --skip takes precedence over force', () => {
    const result = shouldSkip('terrain', '/nonexistent', { skipList: ['terrain'], force: true });
    assert.equal(result.skip, true);
    assert.ok(result.reason.includes('--skip'));
  });
});
