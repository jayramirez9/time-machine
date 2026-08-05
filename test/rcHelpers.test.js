import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRcHost } from '../lib/rcHelpers.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('resolveRcHost precedence: routes.json beats env beats localhost', () => {
  assert.equal(resolveRcHost('http://box:30010', 'http://other:30010'), 'http://box:30010');
  assert.equal(resolveRcHost(null, 'http://other:30010'), 'http://other:30010');
  assert.equal(resolveRcHost(null, null), 'http://localhost:30010');
  assert.equal(resolveRcHost(undefined, ''), 'http://localhost:30010');
});

test('resolveRcHost normalizes scheme-less hosts and trailing slashes', () => {
  assert.equal(resolveRcHost('192.168.68.79:30010', null), 'http://192.168.68.79:30010');
  assert.equal(resolveRcHost(null, '192.168.68.79:30010'), 'http://192.168.68.79:30010');
  assert.equal(resolveRcHost('http://box:30010/', null), 'http://box:30010');
  assert.equal(resolveRcHost('https://box:30010', null), 'https://box:30010');
});

// Tripwire: every RC-speaking site must resolve its host through defaultRcHost()
// (or routes config). A hardcoded fallback in a new tool reintroduces the
// split-brain this guards against — B049 found 15 such sites.
test('no hardcoded RC host literals outside rcHelpers', () => {
  const offenders = [];
  const files = [
    ...readdirSync(resolve(ROOT, 'tools')).filter(f => f.endsWith('.js')).map(f => `tools/${f}`),
    'lib/dispatch.js',
    'tm-engine.js',
    'lib/runtimeEngine.js'
  ];
  for (const rel of files) {
    const lines = readFileSync(resolve(ROOT, rel), 'utf-8').split('\n');
    lines.forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return;
      if (t.includes('localhost:30010')) offenders.push(`${rel}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, [], `hardcoded RC host at: ${offenders.join(', ')} — use defaultRcHost()`);
});
