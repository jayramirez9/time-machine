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
// Each entry has a primary query and fallback queries (tried in order if primary returns nothing)
const SEARCH_MAP = [
  { pattern: /suburban-ambient/, queries: ['suburban ambient', 'neighborhood ambience', 'quiet outdoor'], duration: [10, 120] },
  { pattern: /neighborhood/, queries: ['neighborhood ambient', 'outdoor ambience', 'suburban sounds'], duration: [10, 120] },
  { pattern: /backyard/, queries: ['backyard ambient', 'garden outdoor', 'outdoor quiet ambient'], duration: [10, 120] },
  { pattern: /residential-road/, queries: ['car road ambient', 'traffic residential', 'road ambience'], duration: [5, 60] },
  { pattern: /wind-gust/, queries: ['wind gust', 'gust wind', 'strong wind'], duration: [3, 30] },
  { pattern: /wind-base/, queries: ['wind ambient', 'wind blowing', 'breeze outdoor'], duration: [5, 60] },
  { pattern: /rain-texture/, queries: ['rain ambient', 'rain outdoor', 'rainfall'], duration: [10, 120] },
  { pattern: /thunder-roll/, queries: ['thunder distant', 'thunder rolling', 'thunder rumble'], duration: [3, 20] },
  { pattern: /thunder-crack/, queries: ['thunder crack', 'thunder close', 'thunderclap'], duration: [1, 15] },
  { pattern: /cicada/, queries: ['cicada', 'cicadas summer', 'insect buzz'], duration: [3, 30] },
  { pattern: /bird/, queries: ['bird song', 'birdsong', 'birds singing outdoor'], duration: [2, 30] },
  { pattern: /dog-bark/, queries: ['dog bark', 'dog barking distant', 'barking dog'], duration: [1, 10] },
  { pattern: /car-pass/, queries: ['car passing', 'car drive by', 'car pass road'], duration: [2, 15] },
  { pattern: /screen-door/, queries: ['screen door', 'door slam', 'door close'], duration: [0.5, 5] },
  { pattern: /cricket/, queries: ['cricket night', 'crickets', 'cricket chirp'], duration: [3, 30] },
];

function getSearchQueries(label) {
  for (const entry of SEARCH_MAP) {
    if (entry.pattern.test(label)) {
      return { queries: entry.queries, duration: entry.duration };
    }
  }
  // Fallback: use the label itself as query
  return { queries: [label.replace(/-/g, ' ')], duration: [1, 60] };
}

async function searchFreesound(query, duration) {
  // Filter by duration only; license filtering done post-search since
  // Freesound license filter values can be fragile across API versions
  const filter = `duration:[${duration[0]} TO ${duration[1]}]`;
  const fields = 'id,name,previews,license,username,duration,avg_rating,num_ratings';
  const url = `${API_BASE}/search/text/?query=${encodeURIComponent(query)}&filter=${encodeURIComponent(filter)}&fields=${fields}&sort=rating_desc&page_size=15&token=${API_KEY}`;

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
    const { queries, duration } = getSearchQueries(label);

    // Skip if already pointing to a local URL (from a previous run)
    if (ref.url && ref.url.startsWith('/audio-assets/')) {
      const destPath = path.join(PROJECT_ROOT, ref.url);
      if (fs.existsSync(destPath)) {
        process.stdout.write(`  ${label.padEnd(25)} `);
        console.log(`CACHED (already downloaded)`);
        downloaded++;
        continue;
      }
    }

    process.stdout.write(`  ${label.padEnd(25)} `);

    try {
      // Try each query in order until we find results
      let results = [];
      let usedQuery = queries[0];
      for (const q of queries) {
        await new Promise(r => setTimeout(r, 300));
        results = await searchFreesound(q, duration);
        usedQuery = q;
        if (results.length > 0) break;
      }

      if (results.length === 0) {
        console.log(`SKIP (no results for any of: ${queries.join(', ')})`);
        failed++;
        continue;
      }

      // Pick the top-rated result with a compatible license (CC0 or CC-BY)
      const sound = results.find(r =>
        r.license && (
          r.license.includes('Creative Commons 0') ||
          r.license.includes('publicdomain') ||
          r.license.includes('Attribution') ||
          r.license.includes('/by/')
        )
      ) || results[0]; // fall back to any if none match
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
