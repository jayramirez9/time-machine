#!/usr/bin/env node
/**
 * spawn-backdrop.js — Spawns a backdrop plane for AI-generated scene images
 *
 * Creates a large plane mesh behind the scene that can display
 * textures pushed from the Time Machine image generator.
 *
 * Usage: node tools/spawn-backdrop.js [--host http://localhost:30010]
 */

const HOST = process.argv.includes('--host')
  ? process.argv[process.argv.indexOf('--host') + 1]
  : 'http://localhost:30010';

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

// ─── Spawn via EditorLevelLibrary ───────────────────────────────────

async function spawnPlane(location) {
  // Method 1: SpawnActorFromObject with plane mesh
  let result = await rcCall(
    '/Engine/Transient.UnrealEditorSubsystem',
    'SpawnActorFromObject',
    {
      ObjToUse: '/Engine/BasicShapes/Plane.Plane',
      Location: { X: location[0], Y: location[1], Z: location[2] }
    }
  );
  if (result.ok) return result;

  // Method 2: SpawnActorFromClass
  result = await rcCall(
    '/Script/UnrealEd.Default__EditorLevelLibrary',
    'SpawnActorFromClass',
    {
      ActorClass: '/Script/Engine.StaticMeshActor',
      Location: { X: location[0], Y: location[1], Z: location[2] }
    }
  );
  return result;
}

// ─── Layout ─────────────────────────────────────────────────────────

// Player is at [-1800, 800, 450] facing roughly East (+Y)
// Place backdrop plane far behind in +Y, high up, rotated to face player
const BACKDROP = {
  loc: [-1800, 15000, 3000],  // Far behind scene, elevated
  rot: [90, 0, 0],            // Rotated to face the camera
  scale: [200, 120, 1]        // 200m wide × 120m tall
};

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(' Backdrop Plane Setup');
  console.log(` Host: ${HOST}`);
  console.log('═══════════════════════════════════════════════\n');

  // Test connectivity
  try {
    const res = await fetch(`${HOST}/remote/info`);
    if (!res.ok) throw new Error(`${res.status}`);
    console.log('✓ Connected to Unreal Remote Control API\n');
  } catch (e) {
    console.error(`✗ Cannot connect to Unreal at ${HOST}`);
    console.error('  Make sure Unreal is running with Remote Control API plugin enabled');
    process.exit(1);
  }

  // ── Phase 1: Spawn the plane ──
  console.log('── Phase 1: Spawning backdrop plane ──');
  const spawnResult = await spawnPlane(BACKDROP.loc);

  if (!spawnResult.ok) {
    console.error('✗ Failed to spawn plane actor');
    console.error('  ', JSON.stringify(spawnResult.data));
    process.exit(1);
  }

  // Get the spawned actor's path from the return value
  const returnValue = spawnResult.data?.ReturnValue;
  let actorPath = null;
  if (typeof returnValue === 'string') {
    actorPath = returnValue;
  } else if (returnValue?.ObjectPath) {
    actorPath = returnValue.ObjectPath;
  }

  if (!actorPath) {
    console.error('✗ Spawn succeeded but could not get actor path');
    console.error('  Return:', JSON.stringify(spawnResult.data));
    process.exit(1);
  }

  // Clean up path — remove trailing class reference if present
  actorPath = actorPath.split("'")[0].replace(/^.*?'/, '');
  console.log(`  ✓ Spawned at path: ${actorPath}`);

  // ── Phase 2: Set rotation ──
  console.log('── Phase 2: Configuring transform ──');

  const rotResult = await rcCall(actorPath, 'SetActorRotation', {
    NewRotation: {
      Pitch: BACKDROP.rot[0],
      Yaw: BACKDROP.rot[1],
      Roll: BACKDROP.rot[2]
    }
  });
  console.log(`  ${rotResult.ok ? '✓' : '✗'} Rotation → [${BACKDROP.rot}]`);

  // Set scale
  const scaleResult = await rcCall(actorPath, 'SetActorScale3D', {
    NewScale3D: {
      X: BACKDROP.scale[0],
      Y: BACKDROP.scale[1],
      Z: BACKDROP.scale[2]
    }
  });
  console.log(`  ${scaleResult.ok ? '✓' : '✗'} Scale → [${BACKDROP.scale}]`);

  // ── Phase 3: Set the mesh (in case it didn't get set) ──
  const meshComp = `${actorPath}.StaticMeshComponent0`;
  const meshResult = await rcProp(meshComp, 'StaticMesh', {
    AssetPathName: '/Engine/BasicShapes/Plane.Plane',
    SubPathString: ''
  });
  console.log(`  ${meshResult.ok ? '✓' : '✗'} StaticMesh → Plane`);

  // ── Phase 4: Label the actor ──
  const labelResult = await rcCall(actorPath, 'SetActorLabel', {
    NewActorLabel: 'BackdropPlane'
  });
  console.log(`  ${labelResult.ok ? '✓' : '✗'} Label → BackdropPlane`);

  // ── Summary ──
  console.log('\n═══════════════════════════════════════════════');
  console.log(' Backdrop plane spawned!');
  console.log(` Actor: ${actorPath}`);
  console.log(` Position: [${BACKDROP.loc}]`);
  console.log(` Scale: [${BACKDROP.scale}] (${BACKDROP.scale[0] * 100}cm × ${BACKDROP.scale[1] * 100}cm)`);
  console.log('');
  console.log(' Next steps:');
  console.log('  1. In Unreal, create a Material with a TextureSampleParameter2D');
  console.log('     named "BackdropTexture" and set Shading Model to Unlit');
  console.log('  2. Create a MaterialInstance at /Game/Materials/MI_Backdrop');
  console.log('  3. Assign it to the BackdropPlane mesh');
  console.log('  4. Set UNREAL_CONTENT_DIR in .env and generate an image');
  console.log('═══════════════════════════════════════════════');
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
