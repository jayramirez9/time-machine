#!/usr/bin/env node

/**
 * Texture prompt preview tool — inspect prompts WITHOUT calling Meshy API.
 *
 * Reads buildings.geojson, classifies each building, generates texture prompts,
 * and prints them for review. Zero API calls, zero credits spent.
 *
 * Usage:
 *   node tools/preview-textures.js terrain-data/manhattan-ny/
 *   node tools/preview-textures.js terrain-data/manhattan-ny/ --era nyc_1884
 *   node tools/preview-textures.js terrain-data/manhattan-ny/ --year 1920
 *   node tools/preview-textures.js terrain-data/manhattan-ny/ --mode text-to-3d
 *   node tools/preview-textures.js terrain-data/manhattan-ny/ --index 5
 *   node tools/preview-textures.js terrain-data/manhattan-ny/ --json
 *   node tools/preview-textures.js terrain-data/manhattan-ny/ --summary
 */

import fs from 'node:fs';
import path from 'node:path';
import { previewAllPrompts, buildPromptsForBuilding } from '../lib/texturePromptBuilder.js';

const args = process.argv.slice(2);

function getFlag(name, defaultValue = null) {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultValue;
  return args[idx + 1] || defaultValue;
}
const hasFlag = (name) => args.includes(name);

const terrainDir = args.find(a => !a.startsWith('-'));
const era = getFlag('--era');
const year = getFlag('--year');
const mode = getFlag('--mode', 'retexture');
const quality = getFlag('--quality', 'background');
const indexFilter = getFlag('--index');
const jsonOutput = hasFlag('--json');
const summary = hasFlag('--summary');

if (!terrainDir) {
  console.error('Usage: preview-textures.js <terrain-data-dir/> [--era nyc_1884] [--year 1884] [--mode retexture|text-to-3d] [--quality hero|foreground|background|distant] [--index N] [--json] [--summary]');
  process.exit(1);
}

// Load buildings.geojson
const geojsonPath = path.join(terrainDir, 'buildings.geojson');
if (!fs.existsSync(geojsonPath)) {
  console.error(`Not found: ${geojsonPath}`);
  console.error('This tool requires a buildings.geojson in the terrain data directory.');
  process.exit(1);
}

const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf-8'));
const featureCount = geojson.features?.length || 0;

// Build opts
const opts = { mode, quality };
if (era) opts.era = era;
if (year) opts.year = parseInt(year, 10);

// If neither era nor year provided, try to infer from geojson metadata
if (!era && !year) {
  const targetYear = geojson._meta?.targetYear;
  if (targetYear) {
    opts.year = targetYear;
    console.error(`[preview] Using targetYear ${targetYear} from buildings.geojson metadata`);
  }
}

console.error(`[preview] ${featureCount} buildings in ${geojsonPath}`);
console.error(`[preview] Mode: ${mode}, Era: ${opts.era || 'auto'}, Year: ${opts.year || 'auto'}\n`);

// Generate all prompts
const previews = previewAllPrompts(geojson, opts);

// Filter by index if requested
const filtered = indexFilter != null
  ? previews.filter(p => p.index === parseInt(indexFilter, 10))
  : previews;

if (filtered.length === 0) {
  console.error(`No buildings found${indexFilter != null ? ` at index ${indexFilter}` : ''}`);
  process.exit(1);
}

// JSON output mode
if (jsonOutput) {
  console.log(JSON.stringify(filtered, null, 2));
  process.exit(0);
}

// Summary mode
if (summary) {
  const styleCounts = {};
  let totalCredits = 0;
  for (const p of filtered) {
    styleCounts[p.styleName] = (styleCounts[p.styleName] || 0) + 1;
    totalCredits += p.creditEstimate;
  }

  console.log(`Buildings: ${filtered.length}`);
  console.log(`Est. credits: ${totalCredits}`);
  console.log(`\nStyle distribution:`);
  for (const [style, count] of Object.entries(styleCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${style}: ${count}`);
  }

  // Prompt length stats
  const lengths = filtered.map(p => p.prompt.length);
  console.log(`\nPrompt lengths: min=${Math.min(...lengths)}, max=${Math.max(...lengths)}, avg=${Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)}`);
  console.log(`\nNegative prompt (shared): ${filtered[0].negative}`);
  process.exit(0);
}

// Detailed output (default)
for (const p of filtered) {
  console.log(`━━━ Building ${p.index}: ${p.address} ━━━`);
  console.log(`Style:    ${p.styleName}`);
  console.log(`Quality:  ${p.quality} (${p.polycount.toLocaleString()} polys)`);
  console.log(`Credits:  ~${p.creditEstimate}`);
  console.log(`Chars:    ${p.prompt.length}/600`);
  console.log(`Prompt:   ${p.prompt}`);
  console.log(`Negative: ${p.negative}`);
  console.log();
}

// Footer
const totalCredits = filtered.reduce((s, p) => s + p.creditEstimate, 0);
console.log(`Total: ${filtered.length} buildings, ~${totalCredits} credits`);
