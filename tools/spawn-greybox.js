#!/usr/bin/env node
/**
 * spawn-greybox.js — Spawns 1884 NYC Lower Manhattan greybox scene
 *
 * Uses the Unreal Remote Control API + MCP-style spawn to place:
 *  - 12 brownstone blocks (2 rows of 6) as scaled cubes
 *  - 4 gas lamp point lights along the south sidewalk
 *  - Moves PlayerStart to 2nd floor listener position
 *
 * Usage: node tools/spawn-greybox.js [--host http://localhost:30010]
 *        node tools/spawn-greybox.js --clean   # Remove all spawned actors
 */

const HOST = process.argv.includes('--host')
  ? process.argv[process.argv.indexOf('--host') + 1]
  : 'http://localhost:30010';

const CLEAN = process.argv.includes('--clean');
const LEVEL = '/Game/TimeMachine-scene2a.TimeMachine-scene2a:PersistentLevel';

// ─── Remote Control API helpers ─────────────────────────────────────

async function rc(endpoint, body) {
  const res = await fetch(`${HOST}/remote/${endpoint}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : {} };
}

async function rcCall(objectPath, functionName, params = {}) {
  return rc('object/call', { objectPath, functionName, parameters: params });
}

async function rcProp(objectPath, propertyName, value) {
  return rc('object/property', {
    objectPath,
    access: 'WRITE_ACCESS',
    propertyName,
    propertyValue: { [propertyName]: value }
  });
}

// ─── MCP-compatible spawn (uses the same internal mechanism) ────────
// The MCP Python server has its own spawn logic. We replicate it here
// by using the EditorActorSubsystem approach.

async function spawnStaticMeshActor(label, location) {
  // Method 1: Try EditorActorSubsystem
  let result = await rcCall(
    '/Engine/Transient.UnrealEditorSubsystem',
    'SpawnActorFromObject',
    {
      ObjToUse: '/Engine/BasicShapes/Cube.Cube',
      Location: { X: location[0], Y: location[1], Z: location[2] }
    }
  );
  if (result.ok) return result;

  // Method 2: Try GEditor->GetEditorWorldContext spawn
  result = await rcCall(
    '/Script/UnrealEd.Default__EditorLevelLibrary',
    'SpawnActorFromClass',
    {
      ActorClass: '/Script/Engine.StaticMeshActor',
      Location: { X: location[0], Y: location[1], Z: location[2] }
    }
  );
  if (result.ok) return result;

  // Method 3: Direct UWorld::SpawnActor - won't work via RC typically
  // Method 4: Use the batch endpoint to run a Python/Blueprint command
  // Neither of these are reliable. We'll use the MCP as a fallback.
  return { ok: false, data: null };
}

async function spawnPointLight(label, location) {
  return rcCall(
    '/Script/UnrealEd.Default__EditorLevelLibrary',
    'SpawnActorFromClass',
    {
      ActorClass: '/Script/Engine.PointLight',
      Location: { X: location[0], Y: location[1], Z: location[2] }
    }
  );
}

// ─── Scene Layout ───────────────────────────────────────────────────

// Brownstone: 6m wide × 10m deep × 14m tall (4 stories)
// UE Cube default = 100cm per side, so scale [6, 10, 14] = 600×1000×1400cm
// Z = 700cm (half-height so bottom sits on ground)
const B_SCALE = [6, 10, 14];
const B_SPACING = 700;         // 7m between building centers
const STREET_HW = 1500;       // 15m half-width from center to face

const buildings = [];
// North row (6 brownstones)
for (let i = 0; i < 6; i++) {
  buildings.push({
    label: `Brownstone_N${i + 1}`,
    loc: [-3600 + i * B_SPACING, -STREET_HW, 700],
    rot: [0, 0, 0]
  });
}
// South row (6 brownstones, rotated 180°)
for (let i = 0; i < 6; i++) {
  buildings.push({
    label: `Brownstone_S${i + 1}`,
    loc: [-3600 + i * B_SPACING, STREET_HW, 700],
    rot: [0, 180, 0]
  });
}

// Gas lamps: 4 point lights along south sidewalk
const lamps = [];
for (let i = 0; i < 4; i++) {
  lamps.push({
    label: `GasLamp_${i + 1}`,
    loc: [-3200 + i * 1000, 800, 420]   // 4.2m height (lamp globe)
  });
}

// PlayerStart position
const PLAYER = { loc: [-1800, 800, 450], rot: [0, 0, 0] };

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(' 1884 NYC Greybox Scene Spawner');
  console.log(`  Host: ${HOST}`);
  console.log('═══════════════════════════════════════════════\n');

  // Test connectivity
  try {
    const res = await fetch(`${HOST}/remote/info`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    console.log('✓ Unreal Remote Control API reachable\n');
  } catch (e) {
    console.error(`✗ Cannot reach Unreal at ${HOST}: ${e.message}`);
    process.exit(1);
  }

  if (CLEAN) {
    console.log('── Cleaning spawned actors ──');
    // Find and delete all StaticMeshActors and extra PointLights
    // This is a simple approach - delete by name pattern
    for (const name of ['StaticMeshActor', 'PointLight']) {
      let deleted = 0;
      for (let i = 0; i < 20; i++) {
        const res = await rcCall(
          `${LEVEL}`,
          'K2_DestroyActor',
          {}
        );
        // This won't work on the level. Use MCP-style delete instead.
      }
    }
    console.log('Clean mode requires manual deletion via Unreal Editor');
    console.log('Use Edit > Undo to reverse spawns, or select and delete in Outliner');
    process.exit(0);
  }

  // ── Phase 1: Spawn brownstones via MCP proxy ──
  // The MCP server is accessible at the same host. We'll use the
  // approach that works: spawn a StaticMeshActor, get its path back,
  // then configure via /remote/object/call and /remote/object/property.

  console.log('── Phase 1: Spawning Brownstones ──');
  const spawnedPaths = [];

  for (const b of buildings) {
    // We use a two-step process:
    // Step 1: Spawn an empty StaticMeshActor at location
    // Step 2: Set scale, rotation, and static mesh via objectPath

    // Try the EditorLevelLibrary spawn
    let path = null;

    const spawnResult = await rcCall(
      '/Script/UnrealEd.Default__EditorLevelLibrary',
      'SpawnActorFromClass',
      {
        ActorClass: '/Script/Engine.StaticMeshActor',
        Location: { X: b.loc[0], Y: b.loc[1], Z: b.loc[2] }
      }
    );

    if (spawnResult.ok && spawnResult.data?.ReturnValue) {
      path = spawnResult.data.ReturnValue;
    }

    if (!path) {
      // Fallback: try another spawn method
      const altResult = await rcCall(
        '/Script/UnrealEd.Default__EditorActorSubsystem',
        'SpawnActorFromClass',
        {
          ActorClass: '/Script/Engine.StaticMeshActor',
          Location: { X: b.loc[0], Y: b.loc[1], Z: b.loc[2] }
        }
      );
      if (altResult.ok && altResult.data?.ReturnValue) {
        path = altResult.data.ReturnValue;
      }
    }

    if (!path) {
      console.log(`  ✗ ${b.label} — spawn failed, skipping`);
      continue;
    }

    // Step 2: Configure the actor
    // Set scale
    await rcCall(path, 'SetActorScale3D', {
      NewScale3D: { X: B_SCALE[0], Y: B_SCALE[1], Z: B_SCALE[2] }
    });

    // Set rotation
    if (b.rot[1] !== 0) {
      await rcCall(path, 'SetActorRotation', {
        NewRotation: { Pitch: b.rot[0], Yaw: b.rot[1], Roll: b.rot[2] }
      });
    }

    // Set static mesh to Cube
    await rcProp(`${path}.StaticMeshComponent0`, 'StaticMesh', '/Engine/BasicShapes/Cube.Cube');

    spawnedPaths.push({ label: b.label, path });
    console.log(`  ✓ ${b.label} → ${path.split('.').pop()}`);
  }

  console.log(`\n  Spawned ${spawnedPaths.length}/${buildings.length} brownstones\n`);

  // ── Phase 2: Spawn gas lamp lights ──
  console.log('── Phase 2: Spawning Gas Lamp Point Lights ──');
  let lampCount = 0;

  for (const lamp of lamps) {
    const result = await rcCall(
      '/Script/UnrealEd.Default__EditorLevelLibrary',
      'SpawnActorFromClass',
      {
        ActorClass: '/Script/Engine.PointLight',
        Location: { X: lamp.loc[0], Y: lamp.loc[1], Z: lamp.loc[2] }
      }
    );

    if (result.ok && result.data?.ReturnValue) {
      const path = result.data.ReturnValue;

      // Set warm color temperature (2200K gas light)
      // PointLight → PointLightComponent0
      await rcProp(`${path}.PointLightComponent0`, 'Intensity', 800);
      await rcProp(`${path}.PointLightComponent0`, 'AttenuationRadius', 800);
      await rcProp(`${path}.PointLightComponent0`, 'LightColor', {
        R: 255, G: 183, B: 76, A: 255  // Warm gas lamp ~2200K
      });

      console.log(`  ✓ ${lamp.label} → ${path.split('.').pop()}`);
      lampCount++;
    } else {
      console.log(`  ✗ ${lamp.label} — spawn failed`);
    }
  }

  console.log(`\n  Spawned ${lampCount}/${lamps.length} gas lamp lights\n`);

  // ── Phase 3: Move PlayerStart ──
  console.log('── Phase 3: Moving PlayerStart ──');
  const psPath = `${LEVEL}.PlayerStart_UAID_F02F74551BF5599B01_1153002503`;

  const moveResult = await rcCall(psPath, 'K2_SetActorLocation', {
    NewLocation: { X: PLAYER.loc[0], Y: PLAYER.loc[1], Z: PLAYER.loc[2] },
    bSweep: false,
    bTeleport: true
  });

  if (moveResult.ok) {
    console.log(`  ✓ PlayerStart → [${PLAYER.loc}] facing East`);
  } else {
    // Try property write instead
    const propResult = await rcProp(
      `${psPath}.DefaultSceneRoot`,
      'RelativeLocation',
      { X: PLAYER.loc[0], Y: PLAYER.loc[1], Z: PLAYER.loc[2] }
    );
    console.log(`  ${propResult.ok ? '✓' : '✗'} PlayerStart (via property)`);
  }

  // ── Summary ──
  console.log('\n═══════════════════════════════════════════════');
  console.log(` Scene: ${spawnedPaths.length} brownstones, ${lampCount} gas lamps`);
  console.log(` Player: 2nd floor window, south side, facing east`);
  console.log(` Street: 30m wide, ~42m long (6 buildings per side)`);
  console.log('═══════════════════════════════════════════════');
}

main().catch(e => { console.error(e); process.exit(1); });
