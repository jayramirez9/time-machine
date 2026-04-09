/**
 * Rendering Config — Configure Lumen GI, Nanite, Virtual Shadow Maps, and
 * auto-exposure on Unreal Engine via Remote Control API.
 *
 * Called once at engine startup, after CesiumGeoreference and terrain import.
 * Uses Python script execution (same pattern as cesiumTileset.js disableIonImagery).
 *
 * Non-fatal — engine continues if Unreal is unreachable or commands fail.
 */

// ─── Python Scripts ────────────────────────────────────────────

/**
 * Build the Python script that configures Lumen GI, VSM, Nanite, and auto-exposure.
 * @returns {string}
 */
export function buildRenderingScript() {
  return `
import unreal

world = unreal.EditorLevelLibrary.get_editor_world()
applied = []

# ── Lumen Global Illumination ──
cmds = [
    ("r.Lumen.DiffuseIndirect.Allow", "1"),
    ("r.Lumen.Reflections.Allow", "1"),
    ("r.Lumen.TraceMeshSDFs", "1"),
    ("r.Lumen.ScreenProbeGather.FinalGatherQuality", "2"),
    ("r.Lumen.Scene.Detail", "1.5"),
    ("r.Lumen.DirectLighting.AllowSkyLightLeaking", "0.1"),
]
for cvar, val in cmds:
    unreal.SystemLibrary.execute_console_command(world, f"{cvar} {val}")
    applied.append(cvar)

# ── Virtual Shadow Maps ──
vsm_cmds = [
    ("r.Shadow.Virtual.Enable", "1"),
    ("r.Shadow.Virtual.ResolutionLodBiasDirectional", "-1.0"),
]
for cvar, val in vsm_cmds:
    unreal.SystemLibrary.execute_console_command(world, f"{cvar} {val}")
    applied.append(cvar)

# ── Nanite ──
unreal.SystemLibrary.execute_console_command(world, "r.Nanite.Enable 1")
applied.append("r.Nanite.Enable")

# ── Auto-Exposure (PostProcessVolume) ──
pp_actors = unreal.GameplayStatics.get_all_actors_of_class(world, unreal.PostProcessVolume)

if len(pp_actors) == 0:
    # Create an unbound PostProcessVolume for global post-process
    loc = unreal.Vector(0, 0, 0)
    rot = unreal.Rotator(0, 0, 0)
    pp = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.PostProcessVolume, loc, rot)
    if pp:
        pp.set_actor_label("TM_PostProcess")
        pp.set_editor_property("unbound", True)
        pp.set_editor_property("priority", 1.0)
        unreal.log("[TM] Created global PostProcessVolume (TM_PostProcess)")
    pp_actors = [pp] if pp else []

if len(pp_actors) > 0:
    pp = pp_actors[0]
    settings = pp.get_editor_property("settings")

    # Auto-exposure method: histogram (1)
    settings.set_editor_property("bOverride_AutoExposureMethod", True)
    settings.set_editor_property("auto_exposure_method", unreal.AutoExposureMethod.AEM_HISTOGRAM)

    # Exposure brightness range
    settings.set_editor_property("bOverride_AutoExposureMinBrightness", True)
    settings.set_editor_property("auto_exposure_min_brightness", 0.03)
    settings.set_editor_property("bOverride_AutoExposureMaxBrightness", True)
    settings.set_editor_property("auto_exposure_max_brightness", 8.0)

    # Exposure speed (slower adaptation for cinematic feel)
    settings.set_editor_property("bOverride_AutoExposureSpeedUp", True)
    settings.set_editor_property("auto_exposure_speed_up", 2.0)
    settings.set_editor_property("bOverride_AutoExposureSpeedDown", True)
    settings.set_editor_property("auto_exposure_speed_down", 1.0)

    applied.append("AutoExposure.Histogram")
    unreal.log(f"[TM] PostProcessVolume configured: histogram auto-exposure")

unreal.log(f"[TM] Rendering config applied ({len(applied)} settings): {', '.join(applied)}")
`.trim();
}

/**
 * Build the Python script that configures soft shadows on TM_Lamp_ actors.
 * @returns {string}
 */
export function buildLampShadowScript() {
  return `
import unreal

world = unreal.EditorLevelLibrary.get_editor_world()
all_actors = unreal.GameplayStatics.get_all_actors_of_class(world, unreal.PointLight)
configured = 0

for actor in all_actors:
    label = actor.get_actor_label()
    if not label.startswith("TM_Lamp_"):
        continue

    comp = actor.point_light_component
    if not comp:
        continue

    comp.set_editor_property("cast_shadows", True)
    comp.set_editor_property("contact_shadow_length", 0.02)

    configured += 1

unreal.log(f"[TM] Lamp shadows configured for {configured} TM_Lamp_ actors")
`.trim();
}

/**
 * Build a Python script that batch-converts existing spawned static mesh actors
 * to Nanite-enabled meshes.
 * @param {string} [actorPrefix='TM_'] - Label prefix to match
 * @returns {string}
 */
export function buildNaniteConversionScript(actorPrefix = 'TM_') {
  return `
import unreal

world = unreal.EditorLevelLibrary.get_editor_world()
all_actors = unreal.GameplayStatics.get_all_actors_of_class(world, unreal.StaticMeshActor)
converted = 0
skipped = 0

for actor in all_actors:
    label = actor.get_actor_label()
    if not label.startswith("${actorPrefix}"):
        continue

    mesh = actor.static_mesh_component.static_mesh if actor.static_mesh_component else None
    if not mesh:
        skipped += 1
        continue

    try:
        nanite_settings = mesh.get_editor_property("nanite_settings")
        if not nanite_settings.enabled:
            nanite_settings.enabled = True
            mesh.set_editor_property("nanite_settings", nanite_settings)
            converted += 1
        else:
            skipped += 1
    except Exception as e:
        unreal.log_warning(f"[TM] Nanite conversion failed for {label}: {e}")
        skipped += 1

unreal.log(f"[TM] Nanite conversion: {converted} converted, {skipped} skipped")
`.trim();
}

// ─── RVT Blending ─────────────────────────────────────────────

/**
 * Build the Python script that configures Runtime Virtual Texture blending
 * on the Landscape actor. Uses road/water/landuse masks to blend between
 * surface types (road, grass, water edge) with soft transitions.
 *
 * @param {string} slug - Location slug (e.g. "manhattan_ny") for mask asset paths
 * @returns {string}
 */
export function buildRVTBlendingScript(slug) {
  const safeSlug = slug.replace(/-/g, '_');
  return `
import unreal

world = unreal.EditorLevelLibrary.get_editor_world()
applied = []

# Enable Virtual Textures
unreal.SystemLibrary.execute_console_command(world, "r.VirtualTextures 1")
unreal.SystemLibrary.execute_console_command(world, "r.VirtualTexturedLightmaps 1")
applied.append("r.VirtualTextures")

# Find Landscape actor
landscapes = unreal.GameplayStatics.get_all_actors_of_class(world, unreal.Landscape)
if len(landscapes) == 0:
    unreal.log_warning("[TM] No Landscape actor found — skipping RVT blending")
else:
    landscape = landscapes[0]

    # Load mask textures (imported by landscapeImport.js)
    road_mask = unreal.EditorAssetLibrary.load_asset("/Game/TimeMachine/Terrain/Mask_roads_${safeSlug}")
    water_mask = unreal.EditorAssetLibrary.load_asset("/Game/TimeMachine/Terrain/Mask_water_${safeSlug}")
    landuse_mask = unreal.EditorAssetLibrary.load_asset("/Game/TimeMachine/Terrain/Mask_landuse_${safeSlug}")

    masks_found = []
    if road_mask: masks_found.append("roads")
    if water_mask: masks_found.append("water")
    if landuse_mask: masks_found.append("landuse")

    # Find or create landscape blend material instance
    mi_path = "/Game/TimeMachine/Materials/MI_Landscape_${safeSlug}"
    mi = unreal.EditorAssetLibrary.load_asset(mi_path)
    master_path = "/Game/TimeMachine/Materials/M_TM_Landscape"
    master_mat = unreal.EditorAssetLibrary.load_asset(master_path)

    if not mi and master_mat:
        factory = unreal.MaterialInstanceConstantFactoryNew()
        factory.set_editor_property("initial_parent", master_mat)
        tools = unreal.AssetToolsHelpers.get_asset_tools()
        mi = tools.create_asset("MI_Landscape_${safeSlug}", "/Game/TimeMachine/Materials", unreal.MaterialInstanceConstant, factory)
        if mi:
            unreal.log("[TM] Created landscape material instance MI_Landscape_${safeSlug}")

    if mi:
        if road_mask:
            mi.set_texture_parameter_value(unreal.Name("RoadMask"), road_mask)
            applied.append("RoadMask")
        if water_mask:
            mi.set_texture_parameter_value(unreal.Name("WaterMask"), water_mask)
            applied.append("WaterMask")
        if landuse_mask:
            mi.set_texture_parameter_value(unreal.Name("LanduseMask"), landuse_mask)
            applied.append("LanduseMask")

        # Blend parameters
        mi.set_scalar_parameter_value(unreal.Name("RoadBlendSharpness"), 8.0)
        mi.set_scalar_parameter_value(unreal.Name("WaterBlendSharpness"), 4.0)
        mi.set_scalar_parameter_value(unreal.Name("GrassBlendSharpness"), 6.0)
        unreal.EditorAssetLibrary.save_asset(mi_path)

        # Assign to landscape
        landscape.set_editor_property("landscape_material", mi)
        applied.append("LandscapeMaterial")
        unreal.log(f"[TM] Landscape material assigned: MI_Landscape_${safeSlug}")
    elif not master_mat:
        unreal.log_warning("[TM] M_TM_Landscape master material not found — create in UE editor first")
    else:
        unreal.log_warning("[TM] Could not create landscape material instance")

    unreal.log(f"[TM] RVT blending: masks={masks_found}, applied={applied}")

unreal.log(f"[TM] RVT blending configured ({len(applied)} settings)")
`.trim();
}

// ─── POM Configuration ───────────────────────────────────────

/**
 * Build the Python script that enables Parallax Occlusion Mapping globally
 * and verifies HeightScale is set on building material instances.
 * The actual POM node is in the master material (M_TM_Surface) — this script
 * ensures the engine-side settings are correct and logs POM readiness.
 *
 * @returns {string}
 */
export function buildPOMScript() {
  return `
import unreal

world = unreal.EditorLevelLibrary.get_editor_world()
applied = []

# Enable parallel occlusion (engine-level POM support)
unreal.SystemLibrary.execute_console_command(world, "r.ParallelOcclusion 1")
applied.append("r.ParallelOcclusion")

# Audit TM_Building_ actors for HeightScale on their materials
all_actors = unreal.GameplayStatics.get_all_actors_of_class(world, unreal.StaticMeshActor)
pom_ready = 0
pom_missing = 0

for actor in all_actors:
    label = actor.get_actor_label()
    if not label.startswith("TM_Building_"):
        continue

    comp = actor.static_mesh_component
    if not comp:
        continue

    num_mats = comp.get_num_materials()
    for i in range(num_mats):
        mi = comp.get_material(i)
        if mi and hasattr(mi, 'get_scalar_parameter_value'):
            try:
                hs = mi.get_scalar_parameter_value(unreal.Name("HeightScale"))
                if hs > 0:
                    pom_ready += 1
                else:
                    pom_missing += 1
            except:
                pom_missing += 1

unreal.log(f"[TM] POM audit: {pom_ready} materials ready, {pom_missing} missing HeightScale")
unreal.log(f"[TM] POM configured ({len(applied)} settings)")
`.trim();
}

// ─── RC API Calls ──────────────────────────────────────────────

import { createRcClient } from './rcHelpers.js';

/**
 * Configure rendering settings (Lumen GI, VSM, Nanite, auto-exposure).
 * @param {string} host - Unreal Remote Control API host (e.g. "http://localhost:30010")
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function configureRendering(host) {
  const { isUnrealReachable, runPython } = createRcClient(host);

  const reachable = await isUnrealReachable();
  if (!reachable) {
    return { ok: false, error: `Unreal not reachable at ${host}` };
  }

  try {
    const result = await runPython(buildRenderingScript());
    return { ok: result.ok, error: result.ok ? undefined : `RC API ${result.status}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Configure soft contact shadows on TM_Lamp_ actors.
 * @param {string} host - Unreal Remote Control API host
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function configureLampShadows(host) {
  const { isUnrealReachable, runPython } = createRcClient(host);

  const reachable = await isUnrealReachable();
  if (!reachable) {
    return { ok: false, error: `Unreal not reachable at ${host}` };
  }

  try {
    const result = await runPython(buildLampShadowScript());
    return { ok: result.ok, error: result.ok ? undefined : `RC API ${result.status}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Configure RVT blending on the Landscape using road/water/landuse masks.
 * @param {string} host - Unreal Remote Control API host
 * @param {string} slug - Location slug for mask asset paths
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function configureRVTBlending(host, slug) {
  const { isUnrealReachable, runPython } = createRcClient(host);

  const reachable = await isUnrealReachable();
  if (!reachable) {
    return { ok: false, error: `Unreal not reachable at ${host}` };
  }

  try {
    const result = await runPython(buildRVTBlendingScript(slug));
    return { ok: result.ok, error: result.ok ? undefined : `RC API ${result.status}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Configure Parallax Occlusion Mapping settings.
 * @param {string} host - Unreal Remote Control API host
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function configurePOM(host) {
  const { isUnrealReachable, runPython } = createRcClient(host);

  const reachable = await isUnrealReachable();
  if (!reachable) {
    return { ok: false, error: `Unreal not reachable at ${host}` };
  }

  try {
    const result = await runPython(buildPOMScript());
    return { ok: result.ok, error: result.ok ? undefined : `RC API ${result.status}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
