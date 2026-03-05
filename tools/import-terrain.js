#!/usr/bin/env node
/**
 * import-terrain.js — Import heightmap and imagery into Unreal via Remote Control API
 *
 * Reads a processed heightmap (and optional imagery) from a terrain-data directory
 * and imports it into Unreal Engine via the Remote Control API Python scripting endpoint.
 *
 * Usage:
 *   node tools/import-terrain.js terrain-data/manhattan-ny/
 *   node tools/import-terrain.js terrain-data/baton-rouge-la/ --host http://localhost:30010
 *   node tools/import-terrain.js terrain-data/manhattan-ny/ --dry-run
 */

import fs from 'fs';
import path from 'path';
import { isUnrealReachable } from '../lib/cesiumGeoreference.js';

// ─── Argument parsing ────────────────────────────────────────────

const args = process.argv.slice(2);

function getFlag(name, defaultValue) {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultValue;
  return args[idx + 1];
}

const hasFlag = (name) => args.includes(name);

const HOST = getFlag('--host', 'http://localhost:30010');
const DRY_RUN = hasFlag('--dry-run');

// Terrain data directory is the first positional arg
const terrainDir = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--')));

if (!terrainDir) {
  console.error('Usage: node tools/import-terrain.js <terrain-data-dir/> [options]');
  console.error('');
  console.error('Options:');
  console.error('  --host URL    Unreal RC API host (default: http://localhost:30010)');
  console.error('  --dry-run     Show what would be imported without sending to Unreal');
  process.exit(1);
}

// ─── RC API helpers ──────────────────────────────────────────────

async function runPython(host, script) {
  const res = await fetch(`${host}/remote/script/run`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RC API script error (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(' Unreal Terrain Importer');
  console.log(`  Host: ${HOST}`);
  console.log('═══════════════════════════════════════════════\n');

  // Read metadata
  const metadataPath = path.join(terrainDir, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    console.error(`  No metadata.json found in ${terrainDir}`);
    console.error('  Run fetch-dem.js first to generate terrain data.');
    process.exit(1);
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  console.log(`  Location:   ${metadata.name || 'Unknown'}`);
  console.log(`  Coordinates: ${metadata.lat?.toFixed(4)}, ${metadata.lon?.toFixed(4)}`);

  // Find heightmap
  const heightmapInfo = metadata.heightmap;
  let heightmapPath = null;

  if (heightmapInfo?.path && fs.existsSync(heightmapInfo.path)) {
    heightmapPath = path.resolve(heightmapInfo.path);
  } else {
    // Search for heightmap files
    for (const ext of ['heightmap.r16', 'heightmap.png']) {
      const p = path.join(terrainDir, ext);
      if (fs.existsSync(p)) { heightmapPath = path.resolve(p); break; }
    }
  }

  if (!heightmapPath) {
    console.error('  No heightmap file found. Run fetch-dem.js first.');
    process.exit(1);
  }

  console.log(`  Heightmap:  ${heightmapPath}`);
  console.log(`  Dimensions: ${heightmapInfo?.dimensions?.w || '?'} x ${heightmapInfo?.dimensions?.h || '?'}`);
  console.log(`  Elevation:  ${heightmapInfo?.elevation?.min?.toFixed(1) || '?'}m – ${heightmapInfo?.elevation?.max?.toFixed(1) || '?'}m`);

  // Check for imagery
  const imageryPath = path.join(terrainDir, 'imagery.png');
  const hasImagery = fs.existsSync(imageryPath);
  if (hasImagery) {
    console.log(`  Imagery:    ${imageryPath}`);
  }

  // Unreal scale factors
  const scale = heightmapInfo?.unrealScale || { x: 100, y: 100, z: 100 };
  console.log(`  Scale:      X=${scale.x?.toFixed(2)}, Y=${scale.y?.toFixed(2)}, Z=${scale.z?.toFixed(2)}`);

  if (DRY_RUN) {
    console.log('\n  [DRY RUN] Would import heightmap into Unreal.');
    printManualInstructions(heightmapPath, heightmapInfo, scale, hasImagery ? path.resolve(imageryPath) : null);
    console.log('\n═══════════════════════════════════════════════');
    return;
  }

  // Check Unreal connectivity
  console.log('\n  Checking Unreal connectivity...');
  const reachable = await isUnrealReachable(HOST);
  if (!reachable) {
    console.error('  Unreal not reachable. Make sure the editor is running with Remote Control API plugin.');
    console.log('\n  Manual import instructions:');
    printManualInstructions(heightmapPath, heightmapInfo, scale, hasImagery ? path.resolve(imageryPath) : null);
    process.exit(1);
  }
  console.log('  Unreal connected.\n');

  // Step 1: Import heightmap as a texture asset
  console.log('  Step 1: Importing heightmap texture...');
  const slug = metadata.slug || 'terrain';
  const assetName = `Heightmap_${slug}`;

  const importScript = `
import unreal

source_path = "${heightmapPath.replace(/\\/g, '/')}"
task = unreal.AssetImportTask()
task.set_editor_property("filename", source_path)
task.set_editor_property("destination_path", "/Game/Terrain/Generated")
task.set_editor_property("destination_name", "${assetName}")
task.set_editor_property("replace_existing", True)
task.set_editor_property("automated", True)
task.set_editor_property("save", True)
unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
print("Heightmap imported: /Game/Terrain/Generated/${assetName}")
`;

  try {
    await runPython(HOST, importScript);
    console.log(`    Imported: /Game/Terrain/Generated/${assetName}`);
  } catch (e) {
    console.error(`    Import failed: ${e.message}`);
    console.log('\n  Falling back to manual instructions:');
    printManualInstructions(heightmapPath, heightmapInfo, scale, hasImagery ? path.resolve(imageryPath) : null);
    process.exit(1);
  }

  // Step 2: Attempt to create Landscape from heightmap
  console.log('\n  Step 2: Creating Landscape actor...');

  const w = heightmapInfo?.dimensions?.w || 1009;
  const h = heightmapInfo?.dimensions?.h || 1009;
  // Compute number of components: Landscape requires specific component/section configs
  // For a 1009 grid: 1 component with 1 section, 63 quads per section = 63*16+1 = 1009 (16 components, 1 section, 63 quads)
  // Simplified: try creating with subsystem API

  const createScript = `
import unreal

# Try using LandscapeSubsystem or EditorLevelLibrary to create landscape
# This may not be available in all UE versions
try:
    subsystem = unreal.get_editor_subsystem(unreal.LandscapeSubsystem)
    if subsystem:
        print("LandscapeSubsystem available")
    else:
        print("LandscapeSubsystem not available — use manual import")
except Exception as e:
    print(f"LandscapeSubsystem not available: {e}")
    print("FALLBACK: Use Landscape Mode > Import in Unreal Editor")
    print("Heightmap imported as texture asset — use manual Landscape import")
`;

  try {
    const result = await runPython(HOST, createScript);
    console.log('    Note: Programmatic Landscape creation is limited in UE5.');
    console.log('    The heightmap texture has been imported. Use manual import for the Landscape actor.');
  } catch (e) {
    console.log(`    Landscape creation not available via Python: ${e.message}`);
  }

  // Step 3: If imagery exists, import it as well
  if (hasImagery) {
    console.log('\n  Step 3: Importing satellite imagery texture...');
    const imageryName = `Imagery_${slug}`;

    const imageryScript = `
import unreal

source_path = "${path.resolve(imageryPath).replace(/\\/g, '/')}"
task = unreal.AssetImportTask()
task.set_editor_property("filename", source_path)
task.set_editor_property("destination_path", "/Game/Terrain/Generated")
task.set_editor_property("destination_name", "${imageryName}")
task.set_editor_property("replace_existing", True)
task.set_editor_property("automated", True)
task.set_editor_property("save", True)
unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
print("Imagery imported: /Game/Terrain/Generated/${imageryName}")
`;

    try {
      await runPython(HOST, imageryScript);
      console.log(`    Imported: /Game/Terrain/Generated/${imageryName}`);
      console.log('    Assign this texture to your Landscape material\'s Base Color.');
    } catch (e) {
      console.error(`    Imagery import failed: ${e.message}`);
    }
  }

  // Print final instructions
  console.log('\n  ─── Next Steps ───────────────────────────────');
  printManualInstructions(heightmapPath, heightmapInfo, scale, hasImagery ? path.resolve(imageryPath) : null);
  console.log('\n═══════════════════════════════════════════════');
}

function printManualInstructions(heightmapPath, heightmapInfo, scale, imageryPath) {
  const w = heightmapInfo?.dimensions?.w || '?';
  const h = heightmapInfo?.dimensions?.h || '?';
  console.log(`\n  Unreal Landscape Import:`);
  console.log(`    1. Open Landscape Mode (Shift+3 or Modes panel)`);
  console.log(`    2. Select "Import from File" tab`);
  console.log(`    3. Heightmap File: ${heightmapPath}`);
  console.log(`    4. Dimensions: ${w} x ${h}`);
  console.log(`    5. Scale X: ${scale.x?.toFixed(2)}, Y: ${scale.y?.toFixed(2)}, Z: ${scale.z?.toFixed(2)}`);
  console.log(`    6. Click "Import"`);
  if (imageryPath) {
    console.log(`\n  Satellite Imagery:`);
    console.log(`    - Texture imported at /Game/Terrain/Generated/Imagery_*`);
    console.log(`    - Create a Landscape material with this texture as Base Color`);
    console.log(`    - Assign material to the Landscape actor`);
  }
}

main().catch(e => { console.error(`\n  Error: ${e.message}`); process.exit(1); });
