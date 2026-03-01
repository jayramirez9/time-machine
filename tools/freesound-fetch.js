#!/usr/bin/env node

/**
 * Freesound Asset Fetcher
 * Searches Freesound API for sounds matching each label in an audio profile,
 * downloads HQ MP3 previews to audio-assets/, and updates the profile JSON.
 *
 * Usage:
 *   FREESOUND_API_KEY=xxx ./tools/freesound-fetch.js audio-profiles/baton_rouge_suburb_1978.json
 *   FREESOUND_API_KEY=xxx ./tools/freesound-fetch.js audio-profiles/baton_rouge_suburb_1978.json --dry-run
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const API_BASE = 'https://freesound.org/apiv2';
const API_KEY = process.env.FREESOUND_API_KEY;

// Search strategy: map label patterns to Freesound search queries + duration filters
const SEARCH_MAP = [
  { pattern: /suburban-ambient/, query: 'suburban neighborhood ambient outdoor', duration: [10, 60] },
  { pattern: /neighborhood/, query: 'neighborhood outdoor ambient birds', duration: [10, 60] },
  { pattern: /backyard/, query: 'backyard outdoor ambient summer', duration: [10, 60] },
  { pattern: /residential-road/, query: 'residential road traffic distant cars', duration: [5, 30] },
  { pattern: /wind-gust/, query: 'wind gust outdoor strong', duration: [5, 15] },
  { pattern: /wind-base/, query: 'wind outdoor sustained breeze', duration: [8, 30] },
  { pattern: /rain-texture/, query: 'rain outdoor ambience steady', duration: [10, 60] },
  { pattern: /thunder-roll/, query: 'thunder roll distant rumble', duration: [5, 15] },
  { pattern: /thunder-crack/, query: 'thunder crack close loud', duration: [3, 10] },
  { pattern: /cicada/, query: 'cicada buzz summer insects', duration: [3, 15] },
  { pattern: /bird/, query: 'bird song outdoor songbird', duration: [2, 10] },
  { pattern: /dog-bark/, query: 'dog bark distant outdoor', duration: [1, 5] },
  { pattern: /car-pass/, query: 'car passing residential road drive by', duration: [3, 10] },
  { pattern: /screen-door/, query: 'screen door slam close', duration: [1, 3] },
  { pattern: /cricket/, query: 'crickets night outdoor chorus', duration: [5, 20] },
];

function getSearchQuery(label) {
  for (const entry of SEARCH_MAP) {
    if (entry.pattern.test(label)) {
      return { query: entry.query, duration: entry.duration };
    }
  }
  // Fallback: use the label itself as query
  return { query: label.replace(/-/g, ' '), duration: [1, 60] };
}

async function searchFreesound(query, duration) {
  const filter = `license:("Attribution" OR "Creative Commons 0") duration:[${duration[0]} TO ${duration[1]}]`;
  const fields = 'id,name,previews,license,username,duration,avg_rating,num_ratings';
  const url = `${API_BASE}/search/text/?query=${encodeURIComponent(query)}&filter=${encodeURIComponent(filter)}&fields=${fields}&sort=rating_desc&page_size=5&token=${API_KEY}`;

  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Freesound search error ${response.status}: ${text}`);
  }
  const data = await response.json();
  return data.results || [];
}

async function downloadPreview(previewUrl, destPath) {
  const response = await fetch(previewUrl);
  if (!response.ok) {
    throw new Error(`Download failed ${response.status}: ${previewUrl}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  return buffer.length;
}

function collectSources(profile) {
  const sources = [];

  // Beds: base
  if (profile.beds?.base?.sources) {
    for (const s of profile.beds.base.sources) {
      sources.push({ ref: s, section: 'beds.base' });
    }
  }

  // Beds: directional
  if (profile.beds?.directional) {
    for (const [dir, bed] of Object.entries(profile.beds.directional)) {
      if (bed.sources) {
        for (const s of bed.sources) {
          sources.push({ ref: s, section: `beds.directional.${dir}` });
        }
      }
    }
  }

  // Weather
  if (profile.weather) {
    for (const [type, group] of Object.entries(profile.weather)) {
      if (group.sources) {
        for (const s of group.sources) {
          sources.push({ ref: s, section: `weather.${type}` });
        }
      }
    }
  }

  // Micro-events
  if (profile.microEvents) {
    for (const event of profile.microEvents) {
      if (event.sources) {
        for (const s of event.sources) {
          sources.push({ ref: s, section: `microEvents.${event.id}` });
        }
      }
    }
  }

  return sources;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const profilePath = args.find(a => !a.startsWith('--'));

  if (!profilePath) {
    console.error('Usage: freesound-fetch.js <profile.json> [--dry-run]');
    process.exit(1);
  }

  if (!API_KEY) {
    console.error('Error: FREESOUND_API_KEY environment variable not set');
    console.error('Get a key at: https://freesound.org/apiv2/apply');
    process.exit(1);
  }

  // Read profile
  const fullProfilePath = path.resolve(profilePath);
  const profile = JSON.parse(fs.readFileSync(fullProfilePath, 'utf-8'));
  const profileId = profile.id;

  console.log(`\nFreesound Asset Fetcher`);
  console.log(`Profile: ${profile.name} (${profileId})`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}\n`);

  // Create output directory
  const assetDir = path.join(PROJECT_ROOT, 'audio-assets', profileId);
  if (!dryRun) {
    fs.mkdirSync(assetDir, { recursive: true });
  }

  // Collect all sources from the profile
  const sources = collectSources(profile);
  console.log(`Found ${sources.length} audio sources to fetch\n`);

  const attributions = [];
  let downloaded = 0;
  let failed = 0;

  for (const { ref, section } of sources) {
    const label = ref.label;
    const { query, duration } = getSearchQuery(label);

    process.stdout.write(`  ${label.padEnd(25)} `);

    try {
      // Rate limit: max 60 req/min, add small delay
      await new Promise(r => setTimeout(r, 300));

      const results = await searchFreesound(query, duration);

      if (results.length === 0) {
        console.log(`SKIP (no results for "${query}")`);
        failed++;
        continue;
      }

      // Pick the top-rated result
      const sound = results[0];
      const previewUrl = sound.previews?.['preview-hq-mp3'];

      if (!previewUrl) {
        console.log(`SKIP (no preview for sound ${sound.id})`);
        failed++;
        continue;
      }

      const filename = `${label}.mp3`;
      const destPath = path.join(assetDir, filename);
      const localUrl = `/audio-assets/${profileId}/${filename}`;

      if (dryRun) {
        console.log(`OK  ${sound.name} (${sound.id}) [${sound.license}] ${Math.round(sound.duration)}s`);
      } else {
        const bytes = await downloadPreview(previewUrl, destPath);
        console.log(`OK  ${sound.name} (${sound.id}) [${sound.license}] ${Math.round(bytes / 1024)}KB`);

        // Update the source reference in-place
        ref.url = localUrl;
        ref.freesoundId = sound.id;
        ref.license = sound.license.includes('Creative Commons 0') ? 'CC0' : 'CC-BY';
        ref.attribution = `"${sound.name}" by ${sound.username}`;
      }

      attributions.push({
        label,
        soundId: sound.id,
        name: sound.name,
        username: sound.username,
        license: sound.license,
        url: `https://freesound.org/people/${sound.username}/sounds/${sound.id}/`
      });

      downloaded++;

      // Rate limit
      await new Promise(r => setTimeout(r, 200));

    } catch (e) {
      console.log(`FAIL (${e.message})`);
      failed++;
    }
  }

  // Write attribution file
  if (!dryRun && attributions.length > 0) {
    const attrLines = [
      `# Audio Attribution — ${profile.name}`,
      '',
      `Generated by freesound-fetch.js on ${new Date().toISOString().split('T')[0]}`,
      '',
      'All sounds sourced from [Freesound.org](https://freesound.org/).',
      '',
      '| Label | Sound | Author | License | Link |',
      '|-------|-------|--------|---------|------|',
      ...attributions.map(a =>
        `| ${a.label} | ${a.name} | ${a.username} | ${a.license.includes('Creative Commons 0') ? 'CC0' : 'CC-BY'} | [Link](${a.url}) |`
      ),
      ''
    ];
    fs.writeFileSync(path.join(assetDir, 'ATTRIBUTION.md'), attrLines.join('\n'));
    console.log(`\nWrote ${path.join(assetDir, 'ATTRIBUTION.md')}`);
  }

  // Write updated profile JSON
  if (!dryRun) {
    fs.writeFileSync(fullProfilePath, JSON.stringify(profile, null, 2) + '\n');
    console.log(`Updated ${fullProfilePath}`);
  }

  console.log(`\nDone: ${downloaded} downloaded, ${failed} failed, ${sources.length} total`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(e => {
  console.error(`Fatal: ${e.message}`);
  process.exit(1);
});
