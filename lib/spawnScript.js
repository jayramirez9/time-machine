/**
 * Spawn Script — Python script generation primitives for Unreal RC API
 *
 * Extracted from buildingMassing.js, streetMeshing.js, landmarks.js,
 * and lampPlacement.js which all had near-identical Python generation code.
 *
 * Each buildXxxSpawnScript() becomes a thin composition of these primitives.
 */

/**
 * Script header: import unreal, create editor, preload mesh assets.
 * @param {string} title - Comment title (e.g. "Building Massing Spawn Script")
 * @param {Object<string, string>} meshLoads - { varName: assetPath } map
 * @param {Object<string, string>} [materialLoads] - { varName: assetPath } map for materials (guarded by does_asset_exist)
 * @returns {string[]} Lines array
 */
export function scriptHeader(title, meshLoads = {}, materialLoads = {}) {
  const lines = [
    'import unreal',
    '',
    `# ── ${title} ──`,
    '',
    'editor = unreal.EditorLevelLibrary()',
  ];

  for (const [varName, assetPath] of Object.entries(meshLoads)) {
    lines.push(`${varName} = unreal.EditorAssetLibrary.load_asset("${assetPath}")`);
  }

  // Material preloads — guarded by does_asset_exist for graceful fallback
  for (const [varName, assetPath] of Object.entries(materialLoads)) {
    lines.push(`${varName} = unreal.EditorAssetLibrary.load_asset("${assetPath}") if unreal.EditorAssetLibrary.does_asset_exist("${assetPath}") else None`);
  }

  lines.push('');
  return lines;
}

/**
 * Clear block: destroy actors matching one or more label prefixes.
 * @param {string|string[]} prefixes - Single prefix or array of prefixes
 * @param {string} logLabel - What to say in the log (e.g. "building")
 * @returns {string[]} Lines array
 */
export function scriptClear(prefixes, logLabel) {
  const arr = Array.isArray(prefixes) ? prefixes : [prefixes];
  const condition = arr.length === 1
    ? `actor.get_actor_label().startswith("${arr[0]}")`
    : `label = actor.get_actor_label()\n    if ${arr.map(p => `label.startswith("${p}")`).join(' or ')}`;

  const lines = [
    `# Clear existing ${logLabel} actors`,
    'all_actors = unreal.EditorLevelLibrary.get_all_level_actors()',
    'for actor in all_actors:'
  ];

  if (arr.length === 1) {
    lines.push(
      `    if actor.get_actor_label().startswith("${arr[0]}"):`,
      '        actor.destroy()'
    );
  } else {
    lines.push(
      '    label = actor.get_actor_label()',
      `    if ${arr.map(p => `label.startswith("${p}")`).join(' or ')}:`,
      '        actor.destroy()'
    );
  }

  const prefixStr = arr.map(p => `${p}_*`).join(' and ');
  lines.push(`unreal.log("Cleared existing ${prefixStr} actors")`, '');
  return lines;
}

/**
 * Spawn counter preamble: "# Spawn N items" + "spawned = 0".
 * @param {number} count - Total items to spawn
 * @param {string} label - What we're spawning (e.g. "buildings", "street elements")
 * @returns {string[]} Lines array
 */
export function scriptCounterStart(count, label) {
  return [
    `# Spawn ${count} ${label}`,
    'spawned = 0',
    ''
  ];
}

/**
 * Spawn counter footer: log the final spawned/total.
 * @param {number} count - Total items
 * @param {string} label - What was spawned (e.g. "Building massing")
 * @returns {string[]} Lines array
 */
export function scriptCounterEnd(count, label) {
  return [
    `unreal.log(f"${label}: spawned {spawned}/${count}")`,
    ''
  ];
}

/**
 * StaticMeshActor spawn block for one item.
 * @param {object} item - { label, location: [x,y,z], scale: [sx,sy,sz], rotation: [p,y,r] }
 * @param {{ comment?: string, meshExpr?: string, materialVar?: string }} opts
 *   - comment: Python comment line (without #)
 *   - meshExpr: Python expression for the mesh (default: "mesh")
 *   - materialVar: Python variable name for material (if set, emits set_material call guarded by None check)
 * @returns {string[]} Lines array
 */
export function scriptStaticMeshItem(item, opts = {}) {
  const { comment, meshExpr = 'mesh', materialVar } = opts;
  const [x, y, z] = item.location;
  const [sx, sy, sz] = item.scale;
  const [pitch, yaw, roll] = item.rotation;

  const lines = [];
  if (comment) lines.push(`# ${comment}`);
  lines.push(
    `loc = unreal.Vector(${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`,
    `rot = unreal.Rotator(${pitch.toFixed(1)}, ${yaw.toFixed(1)}, ${roll.toFixed(1)})`,
    'actor = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.StaticMeshActor, loc, rot)',
    'if actor:',
    `    actor.set_actor_label("${item.label}")`,
    `    actor.set_actor_scale3d(unreal.Vector(${sx.toFixed(2)}, ${sy.toFixed(2)}, ${sz.toFixed(2)}))`,
    `    actor.static_mesh_component.set_static_mesh(${meshExpr})`
  );

  if (materialVar) {
    lines.push(
      `    if ${materialVar}:`,
      `        actor.static_mesh_component.set_material(0, ${materialVar})`
    );
  }

  lines.push(
    '    spawned += 1',
    ''
  );
  return lines;
}

/**
 * PointLight spawn block for one lamp.
 * @param {object} lamp - { label, location: [x,y,z], rotation: [p,y,r], color: {R,G,B}, intensity, attenuationRadius }
 * @param {{ comment?: string }} opts
 * @returns {string[]} Lines array
 */
export function scriptPointLightItem(lamp, opts = {}) {
  const { comment } = opts;
  const [x, y, z] = lamp.location;
  const { R, G, B } = lamp.color;

  const lines = [];
  if (comment) lines.push(`# ${comment}`);
  lines.push(
    `loc = unreal.Vector(${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`,
    `rot = unreal.Rotator(0.0, ${lamp.rotation[1].toFixed(1)}, 0.0)`,
    'actor = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.PointLight, loc, rot)',
    'if actor:',
    `    actor.set_actor_label("${lamp.label}")`,
    `    actor.point_light_component.set_editor_property("intensity", ${lamp.intensity})`,
    `    actor.point_light_component.set_editor_property("light_color", unreal.Color(${R}, ${G}, ${B}, 255))`,
    `    actor.point_light_component.set_editor_property("attenuation_radius", ${lamp.attenuationRadius})`,
    '    spawned += 1',
    ''
  );
  return lines;
}

/**
 * Material setup block: create Material Instances from master material.
 *
 * For each unique recipe:
 * 1. Skip if MI already exists (idempotent)
 * 2. Download base textures from daemon
 * 3. Import textures into Content Browser
 * 4. Create MI from master material via MaterialInstanceConstantFactoryNew
 * 5. Set texture + scalar + vector parameters
 * 6. Save MI
 *
 * @param {object[]} recipes - Deduplicated array from collectUniqueRecipes()
 *   Each: { textureKey, dir, tint: [r,g,b], roughness, metallic, tilingScale, miName, miPath }
 * @param {string} daemonUrl - Daemon base URL for texture downloads (e.g. "http://192.168.68.50:3000")
 * @param {{ masterMaterialPath?: string, texBasePath?: string }} [opts]
 * @returns {string[]} Lines array
 */
export function scriptMaterialSetup(recipes, daemonUrl, opts = {}) {
  const {
    masterMaterialPath = '/Game/TimeMachine/Materials/M_TM_Surface',
    texBasePath = '/Game/TimeMachine/Materials/Textures'
  } = opts;

  if (!recipes || recipes.length === 0) return [];

  const lines = [
    '# ── Material Instance Setup ──',
    'import urllib.request',
    'import os',
    'import tempfile',
    'import socket',
    '',
    'socket.setdefaulttimeout(30)',
    'tmp = tempfile.gettempdir()',
    '',
    `master_mat = unreal.EditorAssetLibrary.load_asset("${masterMaterialPath}")`,
    'if not master_mat:',
    `    unreal.log_warning("[TM] Master material not found at ${masterMaterialPath} — skipping material setup")`,
    'else:',
    '    tools = unreal.AssetToolsHelpers.get_asset_tools()',
    ''
  ];

  for (const r of recipes) {
    const [tR, tG, tB] = r.tint;
    lines.push(
      `    # ── ${r.miName} (${r.textureKey}) ──`,
      `    if not unreal.EditorAssetLibrary.does_asset_exist("${r.miPath}"):`,
    );

    // Download and import base_color texture
    const texMaps = ['base_color', 'normal', 'roughness'];
    for (const mapName of texMaps) {
      const texAssetName = `T_${r.textureKey}_${mapName}`;
      const texAssetPath = `${texBasePath}/${texAssetName}`;
      lines.push(
        `        # Import ${mapName}`,
        `        if not unreal.EditorAssetLibrary.does_asset_exist("${texAssetPath}"):`,
        `            tex_url = "${daemonUrl}/material-assets/${r.dir}/${mapName}.png"`,
        `            tex_local = os.path.join(tmp, "tm_${r.textureKey}_${mapName}.png")`,
        `            try:`,
        `                urllib.request.urlretrieve(tex_url, tex_local)`,
        `                tex_task = unreal.AssetImportTask()`,
        `                tex_task.set_editor_property("filename", tex_local)`,
        `                tex_task.set_editor_property("destination_path", "${texBasePath}")`,
        `                tex_task.set_editor_property("destination_name", "${texAssetName}")`,
        `                tex_task.set_editor_property("replace_existing", True)`,
        `                tex_task.set_editor_property("automated", True)`,
        `                tex_task.set_editor_property("save", True)`,
        `                tools.import_asset_tasks([tex_task])`,
        `                unreal.log(f"[TM] Imported ${texAssetName}")`,
        `            except Exception as e:`,
        `                unreal.log_warning(f"[TM] Could not import ${mapName} for ${r.textureKey}: {e}")`,
      );
    }

    // Create MI from master
    lines.push(
      `        # Create Material Instance`,
      `        factory = unreal.MaterialInstanceConstantFactoryNew()`,
      `        factory.set_editor_property("initial_parent", master_mat)`,
      `        mi = tools.create_asset("${r.miName}", "${r.miPath.substring(0, r.miPath.lastIndexOf('/'))}", unreal.MaterialInstanceConstant, factory)`,
      `        if mi:`,
    );

    // Set texture parameters
    const bcPath = `${texBasePath}/T_${r.textureKey}_base_color`;
    const normPath = `${texBasePath}/T_${r.textureKey}_normal`;
    const roughPath = `${texBasePath}/T_${r.textureKey}_roughness`;
    lines.push(
      `            bc_tex = unreal.EditorAssetLibrary.load_asset("${bcPath}")`,
      `            if bc_tex:`,
      `                mi.set_texture_parameter_value(unreal.Name("BaseColor"), bc_tex)`,
      `            norm_tex = unreal.EditorAssetLibrary.load_asset("${normPath}")`,
      `            if norm_tex:`,
      `                mi.set_texture_parameter_value(unreal.Name("Normal"), norm_tex)`,
      `            rough_tex = unreal.EditorAssetLibrary.load_asset("${roughPath}")`,
      `            if rough_tex:`,
      `                mi.set_texture_parameter_value(unreal.Name("Roughness"), rough_tex)`,
    );

    // Set scalar/vector parameters
    lines.push(
      `            mi.set_scalar_parameter_value(unreal.Name("TilingScale"), ${r.tilingScale.toFixed(1)})`,
      `            mi.set_scalar_parameter_value(unreal.Name("RoughnessScale"), ${r.roughness.toFixed(2)})`,
      `            mi.set_scalar_parameter_value(unreal.Name("MetallicScale"), ${r.metallic.toFixed(2)})`,
      `            mi.set_vector_parameter_value(unreal.Name("Tint"), unreal.LinearColor(${tR.toFixed(2)}, ${tG.toFixed(2)}, ${tB.toFixed(2)}, 1.0))`,
      `            unreal.EditorAssetLibrary.save_asset("${r.miPath}")`,
      `            unreal.log(f"[TM] Created ${r.miName}")`,
      `        else:`,
      `            unreal.log_warning("[TM] Failed to create ${r.miName}")`,
      `    else:`,
      `        unreal.log("[TM] ${r.miName} already exists — skipping")`,
      ''
    );
  }

  return lines;
}

/**
 * Weathering parameter block: set AgeInYears + WeatheringStrength on a Material Instance.
 * Emitted during material setup to bake default weathering into MIs.
 *
 * @param {string} miPath - Content path of the Material Instance
 * @param {{ ageInYears?: number, weatheringStrength?: number }} params
 * @returns {string[]} Lines array (empty if no params set)
 */
export function scriptWeatheringParams(miPath, params = {}) {
  const lines = [];
  const { ageInYears, weatheringStrength } = params;
  if (ageInYears == null && weatheringStrength == null) return lines;

  const miVar = `mi_w`;
  lines.push(
    `    # Weathering params`,
    `    ${miVar} = unreal.EditorAssetLibrary.load_asset("${miPath}")`,
    `    if ${miVar}:`
  );
  if (ageInYears != null) {
    lines.push(`        ${miVar}.set_scalar_parameter_value(unreal.Name("AgeInYears"), ${ageInYears.toFixed(1)})`);
  }
  if (weatheringStrength != null) {
    lines.push(`        ${miVar}.set_scalar_parameter_value(unreal.Name("WeatheringStrength"), ${weatheringStrength.toFixed(3)})`);
  }
  lines.push('');
  return lines;
}

/**
 * Per-building weathering: create a Dynamic Material Instance on a spawned actor
 * and override age/weathering params for this specific building.
 *
 * @param {string} actorVar - Python variable name for the spawned actor (e.g. 'actor')
 * @param {string} miPath - Content path of the base Material Instance
 * @param {{ ageInYears?: number, weatheringStrength?: number }} params
 * @returns {string[]} Lines array
 */
export function scriptPerBuildingWeathering(actorVar, miPath, params = {}) {
  const { ageInYears, weatheringStrength } = params;
  if (ageInYears == null && weatheringStrength == null) return [];

  const lines = [
    `        # Per-building weathering (age ${ageInYears != null ? ageInYears.toFixed(0) + 'yr' : 'n/a'})`,
    `        base_mi = unreal.EditorAssetLibrary.load_asset("${miPath}")`,
    `        if base_mi:`,
    `            dmi = unreal.KismetMaterialLibrary.create_dynamic_material_instance(${actorVar}.get_world(), base_mi)`,
    `            if dmi:`,
  ];
  if (ageInYears != null) {
    lines.push(`                dmi.set_scalar_parameter_value(unreal.Name("AgeInYears"), ${ageInYears.toFixed(1)})`);
  }
  if (weatheringStrength != null) {
    lines.push(`                dmi.set_scalar_parameter_value(unreal.Name("WeatheringStrength"), ${weatheringStrength.toFixed(3)})`);
  }
  lines.push(
    `                ${actorVar}.static_mesh_component.set_material(0, dmi)`,
    ''
  );
  return lines;
}

/**
 * DecalActor spawn block for one decal.
 * @param {object} decal - { label, location: [x,y,z], rotation: [p,y,r], size: [sx,sy,sz], decalMaterial }
 * @param {{ comment?: string }} opts
 * @returns {string[]} Lines array
 */
export function scriptDecalItem(decal, opts = {}) {
  const { comment } = opts;
  const [x, y, z] = decal.location;
  const [pitch, yaw, roll] = decal.rotation;
  const [sx, sy, sz] = decal.size;

  const lines = [];
  if (comment) lines.push(`# ${comment}`);
  lines.push(
    `loc = unreal.Vector(${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`,
    `rot = unreal.Rotator(${pitch.toFixed(1)}, ${yaw.toFixed(1)}, ${roll.toFixed(1)})`,
    'actor = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.DecalActor, loc, rot)',
    'if actor:',
    `    actor.set_actor_label("${decal.label}")`,
    `    actor.decal_component.set_editor_property("decal_size", unreal.Vector(${sx.toFixed(1)}, ${sy.toFixed(1)}, ${sz.toFixed(1)}))`,
  );

  if (decal.decalMaterial) {
    lines.push(
      `    dm = unreal.EditorAssetLibrary.load_asset("${decal.decalMaterial}")`,
      `    if dm:`,
      `        actor.decal_component.set_decal_material(dm)`,
    );
  }

  lines.push(
    '    spawned += 1',
    ''
  );
  return lines;
}

/**
 * NiagaraActor spawn block for one particle system.
 * @param {object} item - { label, location: [x,y,z], rotation: [p,y,r], niagaraSystem, variables?: { name: value } }
 * @param {{ comment?: string }} opts
 * @returns {string[]} Lines array
 */
export function scriptNiagaraItem(item, opts = {}) {
  const { comment } = opts;
  const [x, y, z] = item.location;
  const [pitch, yaw, roll] = item.rotation || [0, 0, 0];

  const lines = [];
  if (comment) lines.push(`# ${comment}`);
  lines.push(
    `loc = unreal.Vector(${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`,
    `rot = unreal.Rotator(${pitch.toFixed(1)}, ${yaw.toFixed(1)}, ${roll.toFixed(1)})`,
    'actor = unreal.EditorLevelLibrary.spawn_actor_from_class(unreal.NiagaraActor, loc, rot)',
    'if actor:',
    `    actor.set_actor_label("${item.label}")`,
  );

  if (item.niagaraSystem) {
    lines.push(
      `    ns = unreal.EditorAssetLibrary.load_asset("${item.niagaraSystem}")`,
      `    if ns:`,
      `        actor.niagara_component.set_asset(ns)`,
    );
  }

  // Set initial variable values
  if (item.variables) {
    for (const [name, value] of Object.entries(item.variables)) {
      if (typeof value === 'number') {
        lines.push(`    actor.niagara_component.set_variable_float(unreal.Name("${name}"), ${value.toFixed(2)})`);
      }
    }
  }

  lines.push(
    '    spawned += 1',
    ''
  );
  return lines;
}

/**
 * Join all line arrays into a single Python script string.
 * @param {...string[]} sections - Line arrays to concatenate
 * @returns {string}
 */
export function joinScript(...sections) {
  return sections.flat().join('\n');
}
