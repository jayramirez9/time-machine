/**
 * RC Helpers — Shared Unreal Remote Control API + CLI arg parsing
 *
 * Extracted from spawn-buildings.js, spawn-streets.js, spawn-landmarks.js
 * which all had identical copies of these ~30 lines.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// ─── RC API Client ──────────────────────────────────────────────

/**
 * Create an RC API client bound to a host URL.
 * @param {string} host - Unreal RC API base URL (e.g. "http://localhost:30010")
 * @returns {{ rc: Function, runPython: Function, isUnrealReachable: Function }}
 */
export function createRcClient(host) {
  async function rc(endpoint, body) {
    const res = await fetch(`${host}/remote/${endpoint}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : {} };
  }

  async function runPython(script) {
    return rc('object/call', {
      objectPath: '/Script/PythonScriptPlugin.Default__PythonScriptLibrary',
      functionName: 'ExecutePythonScript',
      parameters: { PythonScript: script }
    });
  }

  async function isUnrealReachable() {
    try {
      const res = await fetch(`${host}/remote/info`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch { return false; }
  }

  return { rc, runPython, isUnrealReachable };
}

/**
 * RC host precedence (documented in CLAUDE.md): explicit --host flag beats
 * routes.json's unreal endpoint beats UNREAL_RC_HOST beats local editor.
 * routes.json is the tracked source of truth for which box is live; the env
 * var covers shells outside the daemon (which is the only thing sourcing .env).
 */
export function resolveRcHost(routesHost, envHost) {
  const raw = routesHost || envHost || 'http://localhost:30010';
  const withScheme = raw.includes('://') ? raw : `http://${raw}`;
  return withScheme.replace(/\/+$/, '');
}

const ROUTES_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'routes.json');
let routesHostCache;
let routesHostRead = false;

export function defaultRcHost() {
  if (!routesHostRead) {
    routesHostRead = true;
    try {
      routesHostCache = JSON.parse(readFileSync(ROUTES_PATH, 'utf-8'))?.endpoints?.unreal?.host;
    } catch { /* no routes.json — fall through to env/localhost */ }
  }
  return resolveRcHost(routesHostCache, process.env.UNREAL_RC_HOST);
}

// ─── CLI Argument Parsing ───────────────────────────────────────

/**
 * Parse spawn tool CLI arguments.
 * @param {string[]} argv - process.argv.slice(2)
 * @returns {{ getFlag: Function, hasFlag: Function, positionalArg: string|undefined }}
 */
export function parseSpawnArgs(argv) {
  function getFlag(name, defaultValue) {
    const idx = argv.indexOf(name);
    if (idx === -1) return defaultValue;
    return argv[idx + 1];
  }

  const hasFlag = (name) => argv.includes(name);

  const positionalArg = argv.find((a, i) =>
    !a.startsWith('--') && (i === 0 || !argv[i - 1].startsWith('--'))
  );

  return { getFlag, hasFlag, positionalArg };
}
