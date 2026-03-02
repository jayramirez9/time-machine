#!/usr/bin/env node

/**
 * ElevenLabs Voice Generation Tool
 *
 * Generates period-appropriate spoken phrases for voice micro-events in an
 * audio profile using the ElevenLabs Text-to-Speech API. Each micro-event
 * with a `voice` and `phrases` array gets spoken audio clips added to its
 * sources pool — the engine's bag-draw naturally mixes SFX and speech.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=xxx ./tools/elevenlabs-voice-fetch.js audio-profiles/nyc_city_1884.json
 *   ELEVENLABS_API_KEY=xxx ./tools/elevenlabs-voice-fetch.js audio-profiles/nyc_city_1884.json --dry-run
 *   ELEVENLABS_API_KEY=xxx ./tools/elevenlabs-voice-fetch.js audio-profiles/nyc_city_1884.json --only newsboy
 *   ELEVENLABS_API_KEY=xxx ./tools/elevenlabs-voice-fetch.js audio-profiles/nyc_city_1884.json --force
 *   ELEVENLABS_API_KEY=xxx ./tools/elevenlabs-voice-fetch.js audio-profiles/nyc_city_1884.json --list-voices
 *
 * Environment:
 *   ELEVENLABS_API_KEY — your ElevenLabs API key
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const TTS_API_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const VOICES_API_URL = 'https://api.elevenlabs.io/v1/voices';
const API_KEY = process.env.ELEVENLABS_API_KEY;

// ── Voice discovery ─────────────────────────────────────────

/**
 * Fetch all available voices from ElevenLabs.
 * Returns the full voice list (shared + premade + cloned).
 */
async function fetchVoices() {
  const res = await fetch(`${VOICES_API_URL}?show_legacy=false`, {
    headers: { 'xi-api-key': API_KEY },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ElevenLabs voices API ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.voices || [];
}

/**
 * Score a voice against a description string.
 * Higher = better match. Uses simple keyword matching.
 */
function scoreVoice(voice, description) {
  const desc = description.toLowerCase();
  const labels = voice.labels || {};
  let score = 0;

  // Gender match
  if (desc.includes('male') && labels.gender === 'male') score += 3;
  if (desc.includes('female') && labels.gender === 'female') score += 3;
  if (desc.includes('male') && labels.gender === 'female') score -= 5;
  if (desc.includes('female') && labels.gender === 'male') score -= 5;

  // Age match
  if (desc.includes('young') && labels.age === 'young') score += 2;
  if (desc.includes('child') && labels.age === 'young') score += 2;
  if (desc.includes('middle-aged') && labels.age === 'middle_aged') score += 2;
  if (desc.includes('old') && labels.age === 'old') score += 2;

  // Accent match
  if (desc.includes('new york') && labels.accent?.toLowerCase().includes('american')) score += 1;
  if (desc.includes('american') && labels.accent?.toLowerCase().includes('american')) score += 2;

  // Use case — narration and characters are good for period speech
  if (labels.use_case?.toLowerCase().includes('characters')) score += 1;
  if (labels.use_case?.toLowerCase().includes('narration')) score += 1;

  // Descriptive matches
  const descWords = ['gruff', 'energetic', 'playful', 'loud', 'clear', 'working class'];
  for (const word of descWords) {
    if (desc.includes(word)) {
      const voiceDesc = (labels.description || voice.description || '').toLowerCase();
      if (voiceDesc.includes(word)) score += 1;
    }
  }

  // Prefer premade voices (higher quality, more consistent)
  if (voice.category === 'premade') score += 1;

  return score;
}

/**
 * Find the best matching voice for a voice config entry.
 * Returns top 5 candidates sorted by score.
 */
function findCandidates(voices, voiceConfig) {
  const scored = voices.map(v => ({
    voice: v,
    score: scoreVoice(v, voiceConfig.description),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 5);
}

// ── TTS generation ──────────────────────────────────────────

/**
 * Generate speech audio from text using ElevenLabs TTS.
 * Returns raw MP3 buffer.
 */
async function generateSpeech(voiceId, text, settings) {
  const body = {
    text,
    model_id: 'eleven_multilingual_v2',
    voice_settings: {
      stability: settings.stability ?? 0.35,
      similarity_boost: settings.similarity_boost ?? 0.7,
      style: 0,
    },
  };

  const res = await fetch(
    `${TTS_API_URL}/${voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ElevenLabs TTS API ${res.status}: ${text}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

// ── Source collection ────────────────────────────────────────

/**
 * Collect all voice events from the profile.
 * Returns array of { event, voiceKey, voiceConfig, phrases }.
 */
function collectVoiceEvents(profile, only) {
  const events = [];
  if (!profile.microEvents || !profile.voiceConfig?.voices) return events;

  for (const event of profile.microEvents) {
    if (!event.voice || !event.phrases?.length) continue;
    if (only && event.id !== only) continue;

    const voiceConfig = profile.voiceConfig.voices[event.voice];
    if (!voiceConfig) {
      console.warn(`  WARNING: event "${event.id}" references voice "${event.voice}" but no voiceConfig found`);
      continue;
    }

    events.push({
      event,
      voiceKey: event.voice,
      voiceConfig,
      phrases: event.phrases,
    });
  }

  return events;
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const listVoices = args.includes('--list-voices');
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx !== -1 ? args[onlyIdx + 1] : null;
  const profilePath = args.find(a => !a.startsWith('--') && a !== only);

  if (!profilePath) {
    console.error('Usage: elevenlabs-voice-fetch.js <profile.json> [--dry-run] [--only <event_id>] [--force] [--list-voices]');
    process.exit(1);
  }

  if (!API_KEY) {
    console.error('Error: ELEVENLABS_API_KEY environment variable not set');
    console.error('Get a key at: https://elevenlabs.io/app/settings/api-keys');
    process.exit(1);
  }

  // Read profile
  const fullProfilePath = path.resolve(profilePath);
  const profile = JSON.parse(fs.readFileSync(fullProfilePath, 'utf-8'));
  const profileId = profile.id;

  console.log(`\n  ElevenLabs Voice Generation Tool`);
  console.log(`  Profile: ${profile.name} (${profileId})`);
  console.log(`  Era: ${profile.era?.year || 'modern'} ${profile.era?.period || ''}`);
  console.log(`  Mode: ${dryRun ? 'DRY RUN' : listVoices ? 'LIST VOICES' : 'LIVE'}${only ? ` (${only} only)` : ''}${force ? ' (force re-generate)' : ''}`);
  console.log(`  ${'─'.repeat(50)}\n`);

  // Fetch available voices from ElevenLabs
  console.log('  Fetching voice library...');
  const allVoices = await fetchVoices();
  console.log(`  ${allVoices.length} voices available\n`);

  // Collect voice events from profile
  const voiceEvents = collectVoiceEvents(profile, only);
  if (voiceEvents.length === 0) {
    console.log('  No voice events found in profile (need `voice` + `phrases` fields on micro-events)');
    process.exit(0);
  }
  console.log(`  ${voiceEvents.length} voice events, ${voiceEvents.reduce((n, e) => n + e.phrases.length, 0)} total phrases\n`);

  // ── List voices mode ──────────────────────────────────────

  if (listVoices) {
    const seenVoices = new Set();
    for (const { voiceKey, voiceConfig } of voiceEvents) {
      if (seenVoices.has(voiceKey)) continue;
      seenVoices.add(voiceKey);

      console.log(`  Voice: "${voiceKey}"`);
      console.log(`  Description: ${voiceConfig.description}`);
      if (voiceConfig.voiceId) {
        console.log(`  Selected: ${voiceConfig.voiceId} (locked)`);
      } else {
        const candidates = findCandidates(allVoices, voiceConfig);
        console.log(`  Top candidates:`);
        for (const { voice, score } of candidates) {
          const labels = voice.labels || {};
          console.log(`    ${score >= 0 ? '+' : ''}${score}  ${voice.voice_id}  "${voice.name}"  [${labels.gender || '?'}, ${labels.age || '?'}, ${labels.accent || '?'}]`);
        }
      }
      console.log();
    }
    process.exit(0);
  }

  // ── Resolve voice IDs ─────────────────────────────────────

  const resolvedVoices = {};
  const seenVoices = new Set();
  let profileModified = false;

  for (const { voiceKey, voiceConfig } of voiceEvents) {
    if (seenVoices.has(voiceKey)) {
      resolvedVoices[voiceKey] = resolvedVoices[voiceKey]; // already resolved
      continue;
    }
    seenVoices.add(voiceKey);

    if (voiceConfig.voiceId) {
      resolvedVoices[voiceKey] = voiceConfig.voiceId;
      console.log(`  Voice "${voiceKey}": ${voiceConfig.voiceId} (cached)`);
    } else {
      // Auto-select best candidate
      const candidates = findCandidates(allVoices, voiceConfig);
      if (candidates.length === 0) {
        console.error(`  ERROR: No voice candidates found for "${voiceKey}"`);
        process.exit(1);
      }
      const best = candidates[0];
      resolvedVoices[voiceKey] = best.voice.voice_id;
      console.log(`  Voice "${voiceKey}": auto-selected "${best.voice.name}" (${best.voice.voice_id}, score ${best.score})`);

      if (!dryRun) {
        // Write voice ID back to profile for reuse
        voiceConfig.voiceId = best.voice.voice_id;
        profileModified = true;
      }
    }
  }
  console.log();

  // ── Create output directory ───────────────────────────────

  const assetDir = path.join(PROJECT_ROOT, 'audio-assets', profileId);
  if (!dryRun) {
    fs.mkdirSync(assetDir, { recursive: true });
  }

  // ── Generate speech ───────────────────────────────────────

  const generated = [];
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const { event, voiceKey, voiceConfig, phrases } of voiceEvents) {
    const voiceId = resolvedVoices[voiceKey];

    for (let i = 0; i < phrases.length; i++) {
      const phrase = phrases[i];
      const label = `${event.id}-voice-${i + 1}`;
      const filename = `${label}.mp3`;
      const destPath = path.join(assetDir, filename);
      const localUrl = `/audio-assets/${profileId}/${filename}`;

      process.stdout.write(`  ${label.padEnd(28)} `);

      // Skip if already exists (unless --force)
      if (!force && fs.existsSync(destPath)) {
        console.log('CACHED');
        skipped++;
        downloaded++;
        continue;
      }

      if (dryRun) {
        console.log(`WOULD GENERATE  "${phrase}"`);
        console.log(`${''.padEnd(30)} voice: ${voiceKey} (${voiceId}), stability: ${voiceConfig.settings.stability}`);
        generated.push({ label, phrase, voiceKey, voiceId, event: event.id });
        downloaded++;
        continue;
      }

      try {
        const buffer = await generateSpeech(voiceId, phrase, voiceConfig.settings);
        fs.writeFileSync(destPath, buffer);
        console.log(`OK  ${Math.round(buffer.length / 1024)}KB  "${phrase}"`);

        // Add as a new source to the event
        const sourceExists = event.sources.some(s => s.label === label);
        if (!sourceExists) {
          event.sources.push({
            label,
            url: localUrl,
            license: 'elevenlabs-generated',
            attribution: `ElevenLabs TTS: "${phrase}"`,
            generatedPhrase: phrase,
          });
          profileModified = true;
        }

        generated.push({ label, phrase, voiceKey, voiceId, event: event.id, bytes: buffer.length });
        downloaded++;

        // Rate limit — be gentle with the API
        await new Promise(r => setTimeout(r, 1200));

      } catch (e) {
        console.log(`FAIL  ${e.message}`);
        failed++;
      }
    }
  }

  // ── Write manifest ────────────────────────────────────────

  if (!dryRun && generated.length > 0) {
    const manifest = {
      profile: profileId,
      generatedAt: new Date().toISOString(),
      generator: 'elevenlabs-voice-fetch.js',
      model: 'eleven_multilingual_v2',
      era: profile.era || null,
      voices: Object.fromEntries(
        [...seenVoices].map(key => [key, {
          voiceId: resolvedVoices[key],
          description: profile.voiceConfig.voices[key].description,
          settings: profile.voiceConfig.voices[key].settings,
        }])
      ),
      phrases: generated.map(g => ({
        label: g.label,
        event: g.event,
        phrase: g.phrase,
        voiceKey: g.voiceKey,
        voiceId: g.voiceId,
        bytes: g.bytes,
      })),
    };
    const manifestPath = path.join(assetDir, 'VOICE_MANIFEST.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`\n  Wrote ${manifestPath}`);
  }

  // ── Update profile ────────────────────────────────────────

  if (!dryRun && profileModified) {
    fs.writeFileSync(fullProfilePath, JSON.stringify(profile, null, 2) + '\n');
    console.log(`  Updated ${fullProfilePath}`);
  }

  // ── Update attribution ────────────────────────────────────

  if (!dryRun && generated.length > 0) {
    const attrPath = path.join(assetDir, 'ATTRIBUTION.md');
    let existing = '';
    if (fs.existsSync(attrPath)) {
      existing = fs.readFileSync(attrPath, 'utf-8');
    }

    // Append voice section if not already present
    if (!existing.includes('## Voice Clips')) {
      const lines = [
        '',
        '## Voice Clips',
        '',
        `Generated by elevenlabs-voice-fetch.js on ${new Date().toISOString().split('T')[0]}`,
        '',
        'All voice clips generated using [ElevenLabs Text-to-Speech API](https://elevenlabs.io/text-to-speech).',
        '',
        '| Label | Phrase | Voice |',
        '|-------|--------|-------|',
        ...generated.map(g =>
          `| ${g.label} | ${g.phrase} | ${g.voiceKey} (${g.voiceId.slice(0, 8)}…) |`
        ),
        '',
      ];
      fs.writeFileSync(attrPath, existing + lines.join('\n'));
      console.log(`  Updated ${attrPath}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────

  console.log(`\n  ${'─'.repeat(50)}`);
  console.log(`  ${downloaded} generated, ${skipped} cached, ${failed} failed`);
  console.log(`  ${voiceEvents.length} events, ${voiceEvents.reduce((n, e) => n + e.phrases.length, 0)} phrases total\n`);

  if (failed > 0) process.exit(1);
}

main().catch(e => {
  console.error(`Fatal: ${e.message}`);
  process.exit(1);
});
