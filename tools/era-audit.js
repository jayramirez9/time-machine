#!/usr/bin/env node
/**
 * Era Audit Tool
 *
 * Scans an audio profile's sources for anachronistic sounds that don't
 * belong in the target era. Works with both Freesound-sourced and
 * ElevenLabs-generated assets.
 *
 * Usage:
 *   ./tools/era-audit.js audio-profiles/nyc_city_1884.json
 *   ./tools/era-audit.js audio-profiles/nyc_city_1884.json --fix
 *
 * The tool checks:
 *   1. ElevenLabs sources: auto-passed (era-safe by design — prompts are era-aware)
 *   2. Freesound sources: attribution text scanned for modern keywords
 *   3. Source labels/filenames for era mismatches
 *   4. Synth/procedural sources (flagged as needing real audio eventually)
 *
 * Exit code: 0 if clean, 1 if flags found.
 */

import { readFile } from 'fs/promises';
import { basename } from 'path';
import { getAuditPatterns } from '../lib/eraData.js';

// ── Supplementary context keywords ──────────────────────────
// These catch broad recording-context clues that the shared anachronisms
// list doesn't cover (e.g., "urban street" likely contains modern sounds).
const CONTEXT_KEYWORDS = [
  { pattern: /\btraffic\b/i, flag: 'modern traffic (cars)', threshold: 1900 },
  { pattern: /\burban street\b/i, flag: 'likely modern urban recording', threshold: 1900 },
  { pattern: /\bcity life\b/i, flag: 'likely modern city recording', threshold: 1900 },
  { pattern: /\bcity street\b/i, flag: 'likely modern city recording', threshold: 1900 },
  { pattern: /\bplayground\b/i, flag: 'modern playground equipment', threshold: 1920 },
];

// ── Source mismatch detection ────────────────────────────────

// Freesound filenames/attributions that obviously don't match the profile description
const MISMATCH_PATTERNS = [
  { pattern: /gun.case/i, flag: 'gun case used as barrel sound' },
  { pattern: /i don.t wanna/i, flag: 'modern vocal, not period vendor cry' },
  { pattern: /movethatcrap/i, flag: 'modern vocal, not period vendor cry' },
  { pattern: /archers.*british/i, flag: 'generic vocal, not period vendor cry' },
];

// ── Main audit logic ─────────────────────────────────────────

function getEraYear(profile) {
  return profile.era?.year || null;
}

function collectSources(profile) {
  const sources = [];

  // Base beds
  for (const src of profile.beds?.base?.sources || []) {
    sources.push({ category: 'base_bed', id: src.label, ...src });
  }

  // Directional beds
  for (const [dir, config] of Object.entries(profile.beds?.directional || {})) {
    for (const src of config.sources || []) {
      sources.push({ category: `dir_${dir}`, id: src.label, description: config.description, ...src });
    }
  }

  // Weather
  for (const [type, config] of Object.entries(profile.weather || {})) {
    for (const src of config.sources || []) {
      sources.push({ category: `weather_${type}`, id: src.label, ...src });
    }
  }

  // Micro-events
  for (const evt of profile.microEvents || []) {
    for (const src of evt.sources || []) {
      sources.push({
        category: 'micro',
        id: evt.id,
        sourceLabel: src.label,
        description: evt.description,
        ...src,
      });
    }
  }

  return sources;
}

function auditSource(source, eraYear) {
  const flags = [];
  const searchText = [
    source.attribution || '',
    source.label || '',
    source.sourceLabel || '',
    source.url || '',
  ].join(' ').toLowerCase();

  // Check if it's an ElevenLabs-generated source (era-safe by design)
  if (source.license === 'elevenlabs-generated' || source.generatedPrompt) {
    flags.push({ severity: 'info', message: 'ElevenLabs-generated — era-safe by design' });
    return flags;
  }

  // Check if it's a synth/procedural source
  if (source.url?.includes('/synth/') || source.url?.includes('data:') || !source.freesoundId) {
    flags.push({ severity: 'info', message: 'Procedural/synth source — no era risk, but needs real audio eventually' });
    return flags;
  }

  // Shared anachronism checks (from lib/eraData.js)
  if (eraYear) {
    const eraPatterns = getAuditPatterns(eraYear);
    for (const ep of eraPatterns) {
      if (ep.pattern.test(searchText)) {
        flags.push({
          severity: 'error',
          message: `"${ep.flag}" — anachronistic for ${eraYear}`,
          match: searchText.match(ep.pattern)?.[0],
        });
      }
    }
  }

  // Supplementary context keyword checks
  for (const kw of CONTEXT_KEYWORDS) {
    if (eraYear && eraYear < kw.threshold && kw.pattern.test(searchText) &&
        !flags.some(f => f.match === searchText.match(kw.pattern)?.[0])) {
      flags.push({
        severity: 'error',
        message: `"${kw.flag}" — anachronistic for ${eraYear} (post-${kw.threshold})`,
        match: searchText.match(kw.pattern)?.[0],
      });
    }
  }

  // Source mismatch
  for (const mp of MISMATCH_PATTERNS) {
    if (mp.pattern.test(searchText)) {
      flags.push({
        severity: 'warn',
        message: `Source mismatch: ${mp.flag}`,
      });
    }
  }

  return flags;
}

// ── CLI ──────────────────────────────────────────────────────

const profilePath = process.argv[2];
if (!profilePath) {
  console.error('Usage: ./tools/era-audit.js <profile.json>');
  process.exit(1);
}

const raw = await readFile(profilePath, 'utf-8');
const profile = JSON.parse(raw);
const eraYear = getEraYear(profile);
const profileName = basename(profilePath, '.json');

console.log(`\n  Era Audit: ${profileName}`);
console.log(`  Target year: ${eraYear || 'unknown'}`);
console.log(`  ${'─'.repeat(50)}\n`);

const sources = collectSources(profile);
let errorCount = 0;
let warnCount = 0;
let infoCount = 0;

for (const src of sources) {
  const flags = auditSource(src, eraYear);
  if (flags.length === 0) continue;

  const label = src.sourceLabel || src.id || src.label;
  console.log(`  ${src.category.padEnd(14)} ${label}`);
  if (src.attribution) {
    console.log(`               ↳ "${src.attribution.slice(0, 80)}${src.attribution.length > 80 ? '…' : ''}"`);
  }

  for (const f of flags) {
    const icon = f.severity === 'error' ? '✗' : f.severity === 'warn' ? '⚠' : 'ℹ';
    const color = f.severity === 'error' ? '\x1b[31m' : f.severity === 'warn' ? '\x1b[33m' : '\x1b[36m';
    console.log(`               ${color}${icon}\x1b[0m ${f.message}`);
    if (f.severity === 'error') errorCount++;
    else if (f.severity === 'warn') warnCount++;
    else infoCount++;
  }
  console.log();
}

// Summary
console.log(`  ${'─'.repeat(50)}`);
console.log(`  ${sources.length} sources scanned`);
if (errorCount > 0) console.log(`  \x1b[31m${errorCount} anachronism(s)\x1b[0m`);
if (warnCount > 0) console.log(`  \x1b[33m${warnCount} source mismatch(es)\x1b[0m`);
if (infoCount > 0) console.log(`  \x1b[36m${infoCount} info\x1b[0m`);
if (errorCount === 0 && warnCount === 0) console.log(`  \x1b[32m✓ Clean — no era flags\x1b[0m`);
console.log();

process.exit(errorCount > 0 ? 1 : 0);
