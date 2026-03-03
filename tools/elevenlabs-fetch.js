#!/usr/bin/env node

/**
 * ElevenLabs Sound Effects Fetcher
 *
 * Generates high-quality AI sound effects for each source in an audio profile
 * using the ElevenLabs Text-to-Sound Effects API. Uses the profile's description
 * and era context to generate era-appropriate prompts — no modern sounds leak in.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=xxx ./tools/elevenlabs-fetch.js audio-profiles/nyc_city_1884.json
 *   ELEVENLABS_API_KEY=xxx ./tools/elevenlabs-fetch.js audio-profiles/nyc_city_1884.json --dry-run
 *   ELEVENLABS_API_KEY=xxx ./tools/elevenlabs-fetch.js audio-profiles/nyc_city_1884.json --only micro
 *   ELEVENLABS_API_KEY=xxx ./tools/elevenlabs-fetch.js audio-profiles/nyc_city_1884.json --only beds
 *   ELEVENLABS_API_KEY=xxx ./tools/elevenlabs-fetch.js audio-profiles/nyc_city_1884.json --only weather
 *   ELEVENLABS_API_KEY=xxx ./tools/elevenlabs-fetch.js audio-profiles/nyc_city_1884.json --only ir
 *
 * Compared to freesound-fetch.js:
 *   - Generates audio from text prompts instead of searching a database
 *   - Era-aware: prompts are built from profile context, no anachronism risk
 *   - Higher quality foley than Freesound preview MP3s
 *   - No license concerns — generated audio is yours
 *   - Costs credits per generation (not free like Freesound)
 *
 * Environment:
 *   ELEVENLABS_API_KEY — your ElevenLabs API key
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getExclusionText } from '../lib/eraData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const API_URL = 'https://api.elevenlabs.io/v1/sound-generation';
const API_KEY = process.env.ELEVENLABS_API_KEY;

// ── WAV utility ─────────────────────────────────────────────

/**
 * Wrap raw PCM samples in a WAV container.
 * ElevenLabs pcm_44100 returns signed 16-bit LE mono samples with no header.
 */
function wrapPCMasWAV(pcmBuffer, sampleRate, channels, bitsPerSample) {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const headerSize = 44;
  const wav = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8);

  // fmt  sub-chunk
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);           // sub-chunk size
  wav.writeUInt16LE(1, 20);            // PCM format
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);
  pcmBuffer.copy(wav, headerSize);

  return wav;
}

// ── Prompt engineering ──────────────────────────────────────

/**
 * Build a generation prompt for a source, using profile context + era.
 * The prompt describes the sound in rich detail so ElevenLabs produces
 * era-appropriate audio without needing keyword filtering.
 */
function buildPrompt(source, section, profile) {
  const era = profile.era;
  const eraPrefix = era
    ? `${era.period || ''} era, circa ${era.year}.`
    : '';

  // The source's own description or the parent event/bed description
  const desc = source._eventDescription || source._bedDescription || source.label.replace(/-/g, ' ');

  // Duration hint — longer for beds, shorter for one-shots
  const isBed = section.startsWith('beds.');
  const isWeather = section.startsWith('weather.');

  // Build the prompt
  const parts = [eraPrefix];

  if (isBed) {
    parts.push(`Ambient background soundscape: ${desc}.`);
    parts.push('Steady, loopable, no sudden events. Suitable as a continuous background bed.');
  } else if (isWeather) {
    parts.push(`Weather sound: ${desc}.`);
    parts.push('Natural, organic, no modern artifacts.');
  } else {
    parts.push(`Sound effect: ${desc}.`);
  }

  // Add surface context if available
  if (source._surface) {
    parts.push(`Surface material: ${source._surface}.`);
  }

  // Add motion context
  if (source._motionType && source._motionType !== 'static') {
    parts.push(`Movement: ${source._motionType} — sound passes by the listener.`);
  }

  // Year-based technology exclusions from shared era data
  if (era && era.year) {
    const exclusion = getExclusionText(era.year);
    if (exclusion) parts.push(exclusion);
    parts.push(`Sounds typical of life in ${era.year}.`);
  }

  let prompt = parts.filter(Boolean).join(' ').trim();

  // ElevenLabs has a 450 character limit on prompts
  if (prompt.length > 450) {
    prompt = prompt.slice(0, 447) + '...';
  }

  return prompt;
}

/**
 * Decide duration based on source type.
 * Beds: 22s (max useful loop length)
 * Weather: 20s
 * Micro-events: 3-15s depending on motion duration
 */
function getDuration(source, section) {
  if (section.startsWith('beds.')) return 22;
  if (section.startsWith('weather.thunder')) return 8;
  if (section.startsWith('weather.')) return 20;

  // Micro-events: use explicit duration, motion duration, or default
  const explicitDur = source._explicitDuration;
  if (explicitDur) return explicitDur;
  const motionDur = source._motionDuration;
  if (motionDur) return Math.min(Math.ceil(motionDur) + 2, 30);
  return 6;
}

/**
 * Build a prompt for impulse response generation.
 * Describes the acoustic space so ElevenLabs produces a short reverb tail.
 */
function buildIRPrompt(profile) {
  const era = profile.era;
  const eraPrefix = era ? `${era.period || ''} era, circa ${era.year}.` : '';
  const enclosure = profile.listener?.enclosure || 'street';
  const elevation = profile.listener?.elevation || 0;

  const enclosureDesc = {
    open_window: `heard from an open window ${elevation}m above the street`,
    porch: 'heard from a covered porch or stoop at street level',
    street: 'heard at street level in the open air',
    indoor: `heard from inside a room ${elevation}m above the street`,
  };

  const parts = [
    eraPrefix,
    'Short reverb impulse response of a narrow stone street between tall brick buildings.',
    'Hard granite pavement, brick and brownstone walls on both sides, open sky above.',
    enclosureDesc[enclosure] || enclosureDesc.street + '.',
    'Single sharp clap or starter pistol recording capturing early reflections and short decay tail.',
    'No background noise, no music, just the acoustic response of the space.',
  ];

  let prompt = parts.filter(Boolean).join(' ').trim();
  if (prompt.length > 450) prompt = prompt.slice(0, 447) + '...';
  return prompt;
}

// ── Source collection ────────────────────────────────────────

function collectSources(profile, only) {
  const sources = [];

  // IR: impulse response file
  if ((!only || only === 'ir') && profile.spatialConfig?.irProfile) {
    const irObj = typeof profile.spatialConfig.irProfile === 'string'
      ? { id: profile.spatialConfig.irProfile }
      : profile.spatialConfig.irProfile;
    if (irObj.file) {
      sources.push({
        ref: { label: irObj.file.replace(/\.[^.]+$/, ''), _isIR: true, _irFile: irObj.file },
        section: 'ir',
      });
    }
  }

  // Beds: base
  if ((!only || only === 'beds') && profile.beds?.base?.sources) {
    const baseSources = profile.beds.base.sources;
    const variants = [
      'Focus on distant activity and general atmosphere.',
      'Focus on close surface textures and immediate surroundings.',
      'Focus on mid-range ambience — voices, animal sounds, wind.',
    ];
    // Use promptContext (concise) over full description (long) if available
    const baseDesc = profile.assetGeneration?.promptContext || profile.description;
    // Trim to ~200 chars to leave room for prefix/suffix
    const trimmedDesc = baseDesc.length > 200 ? baseDesc.slice(0, 200) : baseDesc;
    for (let i = 0; i < baseSources.length; i++) {
      const s = baseSources[i];
      s._bedDescription = `${trimmedDesc} ${variants[i % variants.length]}`;
      sources.push({ ref: s, section: 'beds.base' });
    }
  }

  // Beds: directional
  if ((!only || only === 'beds') && profile.beds?.directional) {
    for (const [dir, bed] of Object.entries(profile.beds.directional)) {
      if (bed.sources) {
        for (const s of bed.sources) {
          s._bedDescription = bed.description;
          sources.push({ ref: s, section: `beds.directional.${dir}` });
        }
      }
    }
  }

  // Weather
  if ((!only || only === 'weather') && profile.weather) {
    for (const [type, group] of Object.entries(profile.weather)) {
      if (group.sources) {
        for (const s of group.sources) {
          // Use group description if available, else fall back to label
          s._bedDescription = group.description || s.label.replace(/-/g, ' ');
          sources.push({ ref: s, section: `weather.${type}` });
        }
      }
    }
  }

  // Micro-events
  if ((!only || only === 'micro') && profile.microEvents) {
    for (const event of profile.microEvents) {
      if (event.sources) {
        for (const s of event.sources) {
          s._eventDescription = event.description;
          s._surface = event.surface || null;
          s._motionType = event.motion?.type || 'static';
          s._motionDuration = event.motion?.durationSec || null;
          s._explicitDuration = event.durationSec || null;
          sources.push({ ref: s, section: `microEvents.${event.id}` });
        }
      }
    }
  }

  return sources;
}

// ── ElevenLabs API ──────────────────────────────────────────

async function generateSound(prompt, durationSec, loop = false, outputFormat = 'mp3_44100_128') {
  const body = {
    text: prompt,
    duration_seconds: durationSec,
    prompt_influence: 0.4,
  };

  if (loop) {
    body.model_id = 'eleven_text_to_sound_v2';
    body.loop = true;
  }

  const response = await fetch(`${API_URL}?output_format=${outputFormat}`, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`ElevenLabs API ${response.status}: ${text}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx !== -1 ? args[onlyIdx + 1] : null;
  const force = args.includes('--force');
  const profilePath = args.find(a => !a.startsWith('--') && a !== only);

  if (!profilePath) {
    console.error('Usage: elevenlabs-fetch.js <profile.json> [--dry-run] [--only beds|micro|weather|ir] [--force]');
    process.exit(1);
  }

  if (!API_KEY && !dryRun) {
    console.error('Error: ELEVENLABS_API_KEY environment variable not set');
    console.error('Get a key at: https://elevenlabs.io/app/settings/api-keys');
    process.exit(1);
  }

  // Read profile
  const fullProfilePath = path.resolve(profilePath);
  const profile = JSON.parse(fs.readFileSync(fullProfilePath, 'utf-8'));
  const profileId = profile.id;

  console.log(`\n  ElevenLabs Sound Effects Fetcher`);
  console.log(`  Profile: ${profile.name} (${profileId})`);
  console.log(`  Era: ${profile.era?.year || 'modern'} ${profile.era?.period || ''}`);
  console.log(`  Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}${only ? ` (${only} only)` : ''}${force ? ' (force re-generate)' : ''}`);
  console.log(`  ${'─'.repeat(50)}\n`);

  // Create output directory
  const assetDir = path.join(PROJECT_ROOT, 'audio-assets', profileId);
  if (!dryRun) {
    fs.mkdirSync(assetDir, { recursive: true });
  }

  const sources = collectSources(profile, only);
  console.log(`  ${sources.length} sources to generate\n`);

  const generated = [];
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const { ref, section } of sources) {
    const label = ref.label;
    const isIR = ref._isIR === true;
    const filename = isIR ? ref._irFile : `${label}.mp3`;
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

    const prompt = isIR ? buildIRPrompt(profile) : buildPrompt(ref, section, profile);
    const duration = isIR ? 2 : getDuration(ref, section);
    const loop = !isIR && (section.startsWith('beds.') || section.startsWith('weather.wind') || section.startsWith('weather.rain'));

    if (dryRun) {
      console.log(`WOULD GENERATE (${duration}s${loop ? ', loop' : ''})`);
      console.log(`${''.padEnd(30)} prompt: "${prompt.slice(0, 100)}${prompt.length > 100 ? '…' : ''}"`);
      generated.push({ label, prompt, duration, loop, section });
      downloaded++;
      continue;
    }

    try {
      const outputFmt = isIR ? 'pcm_44100' : 'mp3_44100_128';
      const buffer = await generateSound(prompt, duration, loop, outputFmt);

      // IR files: wrap raw PCM in a WAV container for browser decodeAudioData()
      const fileBuffer = isIR ? wrapPCMasWAV(buffer, 44100, 1, 16) : buffer;
      fs.writeFileSync(destPath, fileBuffer);
      console.log(`OK  ${Math.round(fileBuffer.length / 1024)}KB  (${duration}s${isIR ? ', IR/WAV' : loop ? ', loop' : ''})`);

      // Update source reference (skip for IR — not a playable source)
      if (!isIR) {
        ref.url = localUrl;
        ref.license = 'elevenlabs-generated';
        ref.attribution = `ElevenLabs SFX: "${prompt.slice(0, 80)}"`;
        ref.generatedPrompt = prompt;
      }

      generated.push({ label, prompt, duration, loop, section, bytes: fileBuffer.length });
      downloaded++;

      // Rate limit — be gentle with the API
      await new Promise(r => setTimeout(r, 1500));

    } catch (e) {
      console.log(`FAIL  ${e.message}`);
      failed++;
    }
  }

  // Write generation manifest
  if (!dryRun && generated.length > 0) {
    const manifest = {
      profile: profileId,
      generatedAt: new Date().toISOString(),
      generator: 'elevenlabs-fetch.js',
      model: 'eleven_text_to_sound_v2',
      era: profile.era || null,
      sources: generated.map(g => ({
        label: g.label,
        section: g.section,
        prompt: g.prompt,
        duration: g.duration,
        loop: g.loop,
        bytes: g.bytes,
      })),
    };
    fs.writeFileSync(
      path.join(assetDir, 'GENERATION_MANIFEST.json'),
      JSON.stringify(manifest, null, 2) + '\n'
    );
    console.log(`\n  Wrote ${path.join(assetDir, 'GENERATION_MANIFEST.json')}`);
  }

  // Write updated profile
  if (!dryRun) {
    // Clean up internal props before saving
    for (const { ref } of sources) {
      delete ref._eventDescription;
      delete ref._bedDescription;
      delete ref._surface;
      delete ref._motionType;
      delete ref._isIR;
      delete ref._irFile;
      delete ref._motionDuration;
      delete ref._explicitDuration;
    }
    fs.writeFileSync(fullProfilePath, JSON.stringify(profile, null, 2) + '\n');
    console.log(`  Updated ${fullProfilePath}`);
  }

  // Write attribution file
  if (!dryRun && generated.length > 0) {
    const lines = [
      `# Audio Attribution — ${profile.name}`,
      '',
      `Generated by elevenlabs-fetch.js on ${new Date().toISOString().split('T')[0]}`,
      '',
      'All sounds generated using [ElevenLabs Sound Effects API](https://elevenlabs.io/sound-effects).',
      '',
      '| Label | Duration | Prompt |',
      '|-------|----------|--------|',
      ...generated.map(g =>
        `| ${g.label} | ${g.duration}s | ${g.prompt.slice(0, 60)}${g.prompt.length > 60 ? '…' : ''} |`
      ),
      '',
    ];
    fs.writeFileSync(path.join(assetDir, 'ATTRIBUTION.md'), lines.join('\n'));
    console.log(`  Wrote ${path.join(assetDir, 'ATTRIBUTION.md')}`);
  }

  console.log(`\n  ${'─'.repeat(50)}`);
  console.log(`  ${downloaded} generated, ${skipped} cached, ${failed} failed, ${sources.length} total\n`);

  if (failed > 0) process.exit(1);
}

main().catch(e => {
  console.error(`Fatal: ${e.message}`);
  process.exit(1);
});
