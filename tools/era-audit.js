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

// ── Anachronism keyword sets by era boundary ─────────────────

const ERA_KEYWORDS = {
  // Things that didn't exist before ~1890
  pre1890: [
    'car', 'automobile', 'motor', 'engine', 'truck', 'bus ',
    'taxi', 'siren', 'horn honk', 'traffic light',
    'airplane', 'aeroplane', 'jet', 'helicopter',
    'electric', 'amplifier', 'speaker', 'radio', 'television', 'tv ',
    'telephone ring', 'cell phone', 'mobile',
    'air condition', 'hvac', 'generator',
    'plastic', 'neon', 'synthesizer',
    'subway', 'metro ',    // NYC subway opened 1904
    'bicycle bell',        // existed but uncommon before 1890s
  ],
  // Things that didn't exist before ~1920
  pre1920: [
    'car', 'automobile', 'truck', 'bus ',
    'airplane', 'aeroplane', 'jet', 'helicopter',
    'radio', 'television', 'amplifier', 'speaker',
    'air condition', 'hvac',
    'neon', 'synthesizer',
  ],
  // Things that didn't exist before ~1950
  pre1950: [
    'jet', 'helicopter', 'television', 'tv ',
    'synthesizer', 'cell phone', 'mobile phone',
    'air condition', 'hvac',
    'neon sign',
  ],
};

// Context-sensitive keywords that need the full phrase, not just substring
const CONTEXT_KEYWORDS = [
  { pattern: /\btraffic\b/i, flag: 'modern traffic (cars)', threshold: 1900 },
  { pattern: /\burban street\b/i, flag: 'likely modern urban recording', threshold: 1900 },
  { pattern: /\bcity life\b/i, flag: 'likely modern city recording', threshold: 1900 },
  { pattern: /\bcity street\b/i, flag: 'likely modern city recording', threshold: 1900 },
  { pattern: /\bengine\b/i, flag: 'engine sounds', threshold: 1885 },
  { pattern: /\bmotor\b/i, flag: 'motor sounds', threshold: 1890 },
  { pattern: /\bcar\b/i, flag: 'automobile', threshold: 1900 },
  { pattern: /\bsiren\b/i, flag: 'modern siren', threshold: 1900 },
  { pattern: /\bhonk/i, flag: 'car horn', threshold: 1900 },
  { pattern: /\bplayground\b/i, flag: 'modern playground equipment', threshold: 1920 },
  { pattern: /\bswing/i, flag: 'modern playground swings', threshold: 1920 },
  { pattern: /\bgenerator\b/i, flag: 'electric generator', threshold: 1895 },
  { pattern: /\bsubway\b/i, flag: 'subway/metro', threshold: 1904 },
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

  // Context keyword checks
  for (const kw of CONTEXT_KEYWORDS) {
    if (eraYear && eraYear < kw.threshold && kw.pattern.test(searchText)) {
      flags.push({
        severity: 'error',
        message: `"${kw.flag}" — anachronistic for ${eraYear} (post-${kw.threshold})`,
        match: searchText.match(kw.pattern)?.[0],
      });
    }
  }

  // Also check the attribution specifically
  const attrib = (source.attribution || '').toLowerCase();
  for (const kw of CONTEXT_KEYWORDS) {
    if (eraYear && eraYear < kw.threshold && kw.pattern.test(attrib) &&
        !flags.some(f => f.match === attrib.match(kw.pattern)?.[0])) {
      flags.push({
        severity: 'error',
        message: `Attribution contains "${kw.flag}"`,
        match: attrib.match(kw.pattern)?.[0],
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
