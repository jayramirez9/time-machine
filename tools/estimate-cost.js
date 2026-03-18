#!/usr/bin/env node

/**
 * Cost Estimator — estimate API costs for a new Time Machine location.
 *
 * Calculates expected API calls and costs for launching a Place×Time,
 * broken down by pipeline stage: weather, terrain, audio, 3D assets.
 *
 * Usage:
 *   node tools/estimate-cost.js -l "Baton Rouge, LA" -d "07-04-1978"
 *   node tools/estimate-cost.js -l "New York, NY" -d "06-15-1884" --buildings 29
 *   node tools/estimate-cost.js -l "Baton Rouge, LA" -d "07-04-1978" --json
 *   node tools/estimate-cost.js --profile audio-profiles/nyc_city_1884.json --terrain terrain-data/manhattan-ny/
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geocode } from '../lib/openmeteo.js';
import { classifyDensity, getEraBracket } from '../lib/profileGenerator.js';
import { previewAllPrompts } from '../lib/texturePromptBuilder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ── Pricing constants (as of 2026-03) ───────────────────────

const PRICING = {
  // Subscriptions (monthly)
  visualCrossing: { monthly: 35.00, note: 'Unlimited calls within plan' },
  meshy:          { monthly: 20.00, creditsPerMonth: 1000, note: 'Pro plan' },

  // Per-call costs
  elevenlabs: {
    sfx:   0.10,  // ~$0.10 per SFX generation (varies by plan)
    tts:   0.03,  // ~$0.03 per TTS phrase (short phrases, varies by plan)
    note:  'Varies by plan tier and generation length',
  },

  gemini: {
    imageGen: 0.02,  // Gemini Flash image generation per call
    note: 'Free tier available; pay-as-you-go after',
  },

  meshyCredits: {
    textTo3d:   30,  // preview (20) + refine/texture (10)
    imageTo3d:  30,  // image-to-3d + texture
    retexture:  10,  // retexture only
  },

  // Free APIs
  free: [
    'Open-Meteo (geocoding + weather)',
    'NOAA GHCN-Daily (weather, pre-1940)',
    'USGS 3DEP (elevation + DEM)',
    'USGS NAIP (satellite imagery)',
    'Overpass / OSM (vector data)',
    'Library of Congress (Sanborn maps)',
    'Open-Elevation (non-US fallback)',
  ],
};

// ── Audio asset count estimation ────────────────────────────

/**
 * Estimate audio asset counts for a Place×Time.
 * Uses the same logic as profileGenerator but just counts.
 */
function estimateAudioAssets(year, density) {
  const era = getEraBracket(year);

  // Base counts (constant across all profiles)
  const beds = { base: 3, directional: 4 };
  const weather = { wind: 2, rain: 2, thunder: 2 };
  let ir = 1;

  // Micro-events vary by era + density
  // Based on profileGenerator.js patterns
  let microEventCount;
  if (density === 'dense_urban' || density === 'urban') {
    microEventCount = era === 'modern' ? 9 : era === 'steam_age' ? 15 : 11;
  } else if (density === 'suburban') {
    microEventCount = era === 'modern' ? 7 : era === 'steam_age' ? 10 : 8;
  } else {
    microEventCount = 5; // rural
  }

  // Average ~1.5 sources per micro-event
  const microEventSources = Math.round(microEventCount * 1.5);

  // Voice phrases (only if hand-authored — procedural generator doesn't add these)
  // Estimate: ~5 voice events × 2.5 phrases for urban, fewer for suburban/rural
  const voicePhrases = density === 'dense_urban' ? 12
    : density === 'urban' ? 8
    : density === 'suburban' ? 4
    : 0;

  const sfxTotal = beds.base + beds.directional + weather.wind + weather.rain
    + weather.thunder + microEventSources + ir;

  return { beds, weather, microEventCount, microEventSources, voicePhrases, ir, sfxTotal };
}

// ── Building count estimation ───────────────────────────────

function estimateBuildingCount(density) {
  // Rough estimates for a city-block scale scene
  if (density === 'dense_urban') return 30;
  if (density === 'urban') return 20;
  if (density === 'suburban') return 12;
  return 5;
}

// ── Cost calculation ────────────────────────────────────────

function calculateCosts({ year, density, buildingCount, audioAssets, meshyMode, hasProfile, hasTerrainData }) {
  const lines = [];
  let totalOneTime = 0;

  // ── Free tier (always) ──
  const freeItems = [
    { name: 'Geocoding', api: 'Open-Meteo', calls: 1 },
    { name: 'Elevation query', api: 'USGS 3DEP', calls: 1 },
  ];

  // Weather provider
  const weatherProvider = year < 1940 ? 'NOAA GHCN-Daily'
    : year < 1970 ? 'Open-Meteo' : 'Visual Crossing (if key set) / Open-Meteo fallback';
  freeItems.push({ name: 'Weather data', api: weatherProvider, calls: '1 + periodic refresh' });

  // Terrain
  if (!hasTerrainData) {
    freeItems.push({ name: 'DEM fetch', api: 'USGS 3DEP WCS', calls: 1 });
    freeItems.push({ name: 'Satellite imagery', api: 'USGS NAIP', calls: 1 });
    freeItems.push({ name: 'Vector data (roads, water)', api: 'Overpass / OSM', calls: 1 });
  }

  // ── ElevenLabs SFX ──
  const sfxCost = audioAssets.sfxTotal * PRICING.elevenlabs.sfx;
  totalOneTime += sfxCost;

  // ── ElevenLabs TTS ──
  const ttsCost = audioAssets.voicePhrases * PRICING.elevenlabs.tts;
  totalOneTime += ttsCost;

  // ── Meshy 3D ──
  const creditsPerBuilding = PRICING.meshyCredits[meshyMode] || PRICING.meshyCredits.textTo3d;
  const totalMeshyCredits = buildingCount * creditsPerBuilding;
  const meshyDollarValue = (totalMeshyCredits / PRICING.meshy.creditsPerMonth) * PRICING.meshy.monthly;
  totalOneTime += meshyDollarValue;

  // ── Gemini (only for image-to-3d pipeline) ──
  let geminiCost = 0;
  if (meshyMode === 'imageTo3d') {
    geminiCost = buildingCount * PRICING.gemini.imageGen;
    totalOneTime += geminiCost;
  }

  return {
    freeItems,
    paid: {
      elevenlabsSfx: { count: audioAssets.sfxTotal, unitCost: PRICING.elevenlabs.sfx, total: sfxCost },
      elevenlabsTts: { count: audioAssets.voicePhrases, unitCost: PRICING.elevenlabs.tts, total: ttsCost },
      meshy: { buildings: buildingCount, creditsEach: creditsPerBuilding, totalCredits: totalMeshyCredits, dollarValue: meshyDollarValue },
      gemini: { count: meshyMode === 'imageTo3d' ? buildingCount : 0, unitCost: PRICING.gemini.imageGen, total: geminiCost },
    },
    totalOneTime,
    subscriptions: {
      visualCrossing: year >= 1970 ? PRICING.visualCrossing.monthly : 0,
      meshy: buildingCount > 0 ? PRICING.meshy.monthly : 0,
    },
  };
}

// ── CLI ─────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getFlag(name, defaultValue = null) {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultValue;
  return args[idx + 1] || defaultValue;
}
const hasFlag = (name) => args.includes(name);

const location = getFlag('-l') || getFlag('--location');
const dateStr = getFlag('-d') || getFlag('--date');
const buildingOverride = getFlag('--buildings');
const meshyMode = getFlag('--meshy-mode', 'textTo3d'); // textTo3d | imageTo3d | retexture
const profilePath = getFlag('--profile');
const terrainDir = getFlag('--terrain');
const jsonOutput = hasFlag('--json');

if (!location && !profilePath) {
  console.error(`Usage: estimate-cost.js -l "Location" -d "MM-DD-YYYY" [options]

Options:
  -l, --location      Location name (geocoded via Open-Meteo)
  -d, --date          Target date (MM-DD-YYYY)
  --buildings N       Override building count estimate
  --meshy-mode MODE   textTo3d (default) | imageTo3d | retexture
  --profile PATH      Use existing audio profile for exact asset counts
  --terrain PATH      Use existing terrain-data dir for building counts
  --json              Output as JSON`);
  process.exit(1);
}

async function main() {
  let year, lat, lon, population, density, placeName;

  // ── Resolve location ──
  if (location) {
    const geo = await geocode(location);
    lat = geo.lat;
    lon = geo.lon;
    population = geo.population || 0;
    placeName = geo.name || location;

    // Parse date
    if (dateStr) {
      const parts = dateStr.split('-');
      year = parseInt(parts.length === 3 && parts[2].length === 4 ? parts[2] : parts[0], 10);
    } else {
      year = new Date().getFullYear();
    }
  }

  density = classifyDensity(population || 0);

  // ── Count audio assets ──
  let audioAssets;
  if (profilePath && fs.existsSync(profilePath)) {
    // Count from actual profile
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
    let sfxCount = 0;
    let voiceCount = 0;

    // Beds
    const beds = profile.beds || {};
    sfxCount += (beds.base?.sources?.length || 0);
    for (const dir of ['north', 'east', 'south', 'west']) {
      sfxCount += (beds.directional?.[dir]?.sources?.length || 0);
    }

    // Micro-events
    const micro = profile.microEvents || {};
    for (const [, event] of Object.entries(micro)) {
      sfxCount += (event.sources?.length || 0);
      if (event.voice?.phrases) voiceCount += event.voice.phrases.length;
    }

    // Weather
    const weather = profile.weather || {};
    for (const [, w] of Object.entries(weather)) {
      sfxCount += (w.sources?.length || 0);
    }

    // IR
    if (profile.ir?.sources) sfxCount += profile.ir.sources.length;

    audioAssets = {
      sfxTotal: sfxCount,
      voicePhrases: voiceCount,
      microEventCount: Object.keys(micro).length,
      microEventSources: Object.values(micro).reduce((s, e) => s + (e.sources?.length || 0), 0),
      beds: { base: beds.base?.sources?.length || 0, directional: Object.keys(beds.directional || {}).length },
      weather: {},
      ir: profile.ir?.sources?.length || 0,
    };
    if (!year) year = profile.era?.year || new Date().getFullYear();
  } else {
    audioAssets = estimateAudioAssets(year, density);
  }

  // ── Count buildings ──
  let buildingCount;
  if (buildingOverride) {
    buildingCount = parseInt(buildingOverride, 10);
  } else if (terrainDir) {
    const geojsonPath = path.join(terrainDir, 'buildings.geojson');
    if (fs.existsSync(geojsonPath)) {
      const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf-8'));
      buildingCount = geojson.features?.length || 0;
    } else {
      buildingCount = estimateBuildingCount(density);
    }
  } else {
    buildingCount = estimateBuildingCount(density);
  }

  const hasTerrainData = terrainDir && fs.existsSync(terrainDir);

  // ── Calculate ──
  const costs = calculateCosts({
    year, density, buildingCount, audioAssets, meshyMode,
    hasProfile: !!profilePath,
    hasTerrainData,
  });

  // ── Output ──
  if (jsonOutput) {
    console.log(JSON.stringify({
      location: placeName || profilePath,
      year,
      density,
      buildingCount,
      audioAssets,
      meshyMode,
      costs,
    }, null, 2));
    return;
  }

  // Pretty print
  const line = (w, label, value) => console.log(`  ${label.padEnd(w)}${value}`);
  const W = 36;

  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  Cost Estimate: ${(placeName || 'Location').slice(0, 20).padEnd(20)} ${String(year).padEnd(10)} ║`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);

  console.log(`  Density: ${density}  |  Era: ${getEraBracket(year)}  |  Buildings: ${buildingCount}\n`);

  // Free tier
  console.log(`── Free APIs ──────────────────────────────────────`);
  for (const item of costs.freeItems) {
    line(W, item.name, `${item.api}`);
  }
  console.log();

  // Paid: ElevenLabs
  console.log(`── ElevenLabs (per-generation) ────────────────────`);
  const sfx = costs.paid.elevenlabsSfx;
  const tts = costs.paid.elevenlabsTts;
  line(W, `SFX generations (${sfx.count})`, `~$${sfx.total.toFixed(2)}`);
  line(W, `Voice phrases (${tts.count})`, `~$${tts.total.toFixed(2)}`);
  console.log();

  // Paid: Meshy
  console.log(`── Meshy 3D (credit-based) ────────────────────────`);
  const m = costs.paid.meshy;
  line(W, `Buildings (${m.buildings} × ${m.creditsEach} credits)`, `${m.totalCredits} credits (~$${m.dollarValue.toFixed(2)})`);
  if (meshyMode === 'imageTo3d') {
    const g = costs.paid.gemini;
    line(W, `Gemini ref images (${g.count})`, `~$${g.total.toFixed(2)}`);
  }
  console.log();

  // Totals
  console.log(`── Summary ────────────────────────────────────────`);
  line(W, `One-time generation cost`, `~$${costs.totalOneTime.toFixed(2)}`);

  const activeSubs = [];
  if (costs.subscriptions.visualCrossing > 0) activeSubs.push(`Visual Crossing $${costs.subscriptions.visualCrossing}/mo`);
  if (costs.subscriptions.meshy > 0) activeSubs.push(`Meshy $${costs.subscriptions.meshy}/mo`);
  if (activeSubs.length) {
    line(W, `Active subscriptions`, activeSubs.join(', '));
  }

  console.log(`\n  Note: ElevenLabs costs vary by plan tier. Meshy`);
  console.log(`  costs assume Pro plan ($20/mo, 1000 credits).`);
  console.log(`  All terrain/weather/vector data is free.\n`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
