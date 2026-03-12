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
 * @returns {string[]} Lines array
 */
export function scriptHeader(title, meshLoads = {}) {
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
 * @param {{ comment?: string, meshExpr?: string }} opts
 *   - comment: Python comment line (without #)
 *   - meshExpr: Python expression for the mesh (default: "mesh")
 * @returns {string[]} Lines array
 */
export function scriptStaticMeshItem(item, opts = {}) {
  const { comment, meshExpr = 'mesh' } = opts;
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
    `    actor.static_mesh_component.set_static_mesh(${meshExpr})`,
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
 * Join all line arrays into a single Python script string.
 * @param {...string[]} sections - Line arrays to concatenate
 * @returns {string}
 */
export function joinScript(...sections) {
  return sections.flat().join('\n');
}
