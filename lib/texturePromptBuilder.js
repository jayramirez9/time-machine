/**
 * Texture Prompt Builder — generates Meshy API prompts from building metadata.
 *
 * Pure functions: no API calls, no side effects. Takes architecture style
 * classification output + building properties → returns prompt strings for
 * Meshy Text-to-3D or Retexture API.
 *
 * Designed to be tested and tuned offline before spending Meshy credits.
 *
 * Usage:
 *   import { buildTexturePrompt, buildNegativePrompt } from './lib/texturePromptBuilder.js';
 *   const prompt = buildTexturePrompt({ style, building, era });
 *   const negative = buildNegativePrompt(era);
 */

import { classifyBuilding, STYLES, ERA_RULES, resolveEra } from './architectureStyles.js';

// ─── Quality Tiers ───────────────────────────────────────────
// Polycount presets by intended viewing distance / importance

export const QUALITY_TIERS = {
  hero:       { polycount: 300000, label: 'Hero (street-level, close viewing)' },
  foreground: { polycount: 150000, label: 'Foreground (visible detail)' },
  background: { polycount: 50000,  label: 'Background (mid-distance)' },
  distant:    { polycount: 15000,  label: 'Distant (silhouette only)' },
};

// ─── Material Descriptions ───────────────────────────────────
// Translate terse material codes into texture-generation language

const MATERIAL_DESCRIPTIONS = {
  brownstone:   'dark brown sandstone blocks with visible chisel marks',
  brick:        'red-brown clay brick laid in running bond',
  stone:        'cut limestone blocks with smooth dressed face',
  iron:         'painted cast iron panels with bolt heads visible',
  cast_iron:    'ornamental cast iron facade, painted pale gray, with Corinthian columns and arched bays',
  wood:         'weathered wood clapboard siding with visible grain',
  frame:        'rough-sawn wood plank siding',
  granite:      'rough-hewn gray granite blocks',
  marble:       'polished white marble with subtle veining',
  terra_cotta:  'glazed terra cotta ornamental panels, warm cream color',
  stucco:       'smooth lime stucco, off-white, with hairline cracks',
  concrete:     'poured concrete with board-formed texture',
  steel_frame:  'structural steel frame with masonry infill',
  mixed:        'mixed material cladding',
  glass:        'plate glass panels in metal frames',
  metal:        'corrugated metal panels',
  tile:         'red clay roof tiles',
};

// ─── Decorative Element Descriptions ─────────────────────────
// Translate style element codes into visual descriptions

const ELEMENT_DESCRIPTIONS = {
  cornice_brackets:     'deep projecting cornice supported by carved wooden brackets',
  bracketed_cornice:    'ornate bracketed cornice with dentil molding',
  ornate_cornice:       'elaborate pressed-metal cornice with modillions',
  simple_cornice:       'plain projecting cornice with minimal trim',
  dentil_cornice:       'cornice with repeating dentil blocks',
  stoop:                'high brownstone stoop with iron railings rising to parlor floor',
  window_lintels:       'carved stone window lintels with slight arch',
  iron_railings:        'wrought iron railings with scroll pattern',
  segmental_arches:     'segmental brick arches over windows',
  round_arches:         'semicircular arched window openings',
  pointed_arches:       'tall pointed Gothic arches',
  fire_escape:          'iron fire escape zigzagging down the facade',
  storefront_columns:   'ground-floor storefront with iron columns and large display windows',
  iron_columns:         'slender fluted cast iron columns at each bay',
  large_windows:        'tall multi-pane windows spanning most of each bay',
  fan_window:           'fanlight window over the entrance',
  flemish_bond:         'Flemish bond brickwork with alternating headers and stretchers',
  mansard_roof:         'steep mansard roof clad in slate with dormer windows',
  dormer_windows:       'projecting dormer windows set into the roof slope',
  quoins:               'dressed stone quoins at building corners',
  columns:              'full-height Classical columns at the entrance',
  pediment:             'triangular pediment over the main facade',
  entablature:          'Classical entablature with architrave, frieze, and cornice',
  pilasters:            'engaged pilasters dividing the facade into bays',
  tracery:              'stone tracery in window openings',
  buttresses:           'projecting stone buttresses along the walls',
  rose_window:          'large circular rose window with stone tracery',
  iron_shutters:        'heavy iron shutters on each window opening',
  loading_doors:        'large loading doors at ground level',
  clapboard:            'horizontal clapboard siding',
  porch:                'covered front porch with turned posts',
  chicago_window:       'wide Chicago window: large fixed center pane flanked by narrow sashes',
  terra_cotta_ornament: 'ornamental terra cotta panels at cornice and spandrels',
  horizontal_bands:     'horizontal stone banding emphasizing the horizontal',
  wide_eaves:           'deeply overhanging eaves',
  casement_windows:     'art glass casement windows in bands',
  balustrade:           'stone balustrade along the roofline',
  cartouche:            'carved cartouche ornament at the entrance',
  rustication:          'rusticated stone base with deep-cut joints',
  exposed_rafters:      'exposed rafter tails under wide eaves',
  tapered_columns:      'tapered porch columns on stone piers',
  wide_porch:           'wide covered porch spanning the facade',
  zigzag_ornament:      'Art Deco zigzag and chevron ornament',
  stepped_parapet:      'stepped parapet silhouette at roofline',
  fluted_pilasters:     'fluted pilasters with stylized capitals',
  picture_window:       'large single-pane picture window',
  attached_garage:      'attached single-car garage',
  low_roof:             'low-pitch roof with wide overhang',
  curtain_wall:         'glass curtain wall facade',
  cantilevered_canopy:  'cantilevered concrete entrance canopy',
  mosaic_panel:         'decorative mosaic panel at entrance',
  split_entry:          'split-level entry with half-flight stairs',
  strip_mall_facade:    'flat strip-mall facade with applied fascia',
  large_signage:        'large commercial signage over storefront',
  plate_glass:          'floor-to-ceiling plate glass storefront',
  mixed_cladding:       'mixed material cladding panels',
  clean_lines:          'clean minimal lines, no ornamentation',
  metal_panels:         'metal composite panels',
  recessed_entry:       'recessed glass entrance',
  bay_window:           'projecting bay window',
  turret:               'corner turret with conical roof',
  gingerbread_trim:     'ornate gingerbread scroll trim',
  fish_scale_shingles:  'decorative fish-scale shingles in gable',
  stick_work:           'applied stick-work patterns on facade',
  sunburst_panels:      'sunburst ornament panels in gable',
  square_bay_window:    'square projecting bay window',
  classical_columns:    'simplified Classical columns at porch',
  arched_openings:      'arched openings with heavy voussoirs',
  red_tile_roof:        'red clay tile roof',
  bell_tower:           'bell tower with arched openings',
  quatrefoil_window:    'quatrefoil window set in stucco wall',
};

// ─── Weathering Descriptions ─────────────────────────────────

function getWeatheringText(stories, year, material) {
  const age = Math.max(0, year - 1800); // rough proxy for building age
  const parts = [];

  // Coal soot — ubiquitous in 19th/early 20th century cities
  if (year < 1960) {
    parts.push('coal soot darkening mortar joints and window sills');
  }

  // Height-based dirt accumulation
  if (stories >= 5) {
    parts.push('grime concentrated at street level, cleaner upper floors');
  } else {
    parts.push('uniform weathering across all floors');
  }

  // Material-specific aging
  if (material === 'brick' || material === 'brownstone') {
    parts.push('moss in shaded mortar joints');
    if (age > 30) parts.push('spalling bricks at corners');
  } else if (material === 'stone' || material === 'granite' || material === 'marble') {
    parts.push('water staining below window sills');
    if (age > 50) parts.push('slight surface erosion on carved elements');
  } else if (material === 'iron' || material === 'cast_iron') {
    parts.push('paint wear revealing iron substrate at high-touch areas');
  } else if (material === 'wood' || material === 'frame') {
    parts.push('paint peeling and wood grain showing through');
    if (age > 20) parts.push('slight warping of boards');
  }

  return parts.join('. ');
}

// ─── Era Exclusions ──────────────────────────────────────────

function getEraExclusions(year) {
  const exclusions = [];
  if (year < 1880) exclusions.push('no electric lights', 'no telephone wires');
  if (year < 1900) exclusions.push('no steel-frame construction visible', 'no reinforced concrete');
  if (year < 1920) exclusions.push('no Art Deco ornament', 'no neon signs');
  if (year < 1940) exclusions.push('no aluminum', 'no glass curtain walls');
  if (year < 1960) exclusions.push('no brutalist concrete', 'no prefab panels');
  if (year < 1980) exclusions.push('no postmodern pastiche', 'no EIFS cladding');
  return exclusions;
}

// ─── Roof Descriptions ──────────────────────────────────────

const ROOF_DESCRIPTIONS = {
  flat:       'flat roof with parapet wall',
  mansard:    'steep mansard roof clad in dark slate with zinc-cap dormers',
  gabled:     'pitched gable roof with standing-seam metal or slate',
  low_pitch:  'low-pitch roof, barely visible from street level',
};

// ─── Prompt Builders ─────────────────────────────────────────

/**
 * Build a texture prompt for the Meshy Retexture or Text-to-3D API.
 *
 * @param {object} opts
 * @param {object} opts.style - classifyBuilding() result (includes styleName, materials, etc.)
 * @param {object} opts.building - GeoJSON properties (material, use, stories, address)
 * @param {number} opts.year - Target year
 * @param {string} [opts.eraLabel] - Human-readable era label (e.g. '1884 New York City')
 * @param {'retexture'|'text-to-3d'} [opts.mode='retexture'] - Generation mode
 * @returns {string} Prompt string (max ~550 chars for Meshy's 600 char limit)
 */
export function buildTexturePrompt({ style, building, year, eraLabel, mode = 'retexture' }) {
  const parts = [];

  // Era context
  const label = eraLabel || `circa ${year}`;
  parts.push(`${label}.`);

  // Building identity
  const stories = building.stories || 3;
  const useLabel = building.use || 'commercial';
  parts.push(`${stories}-story ${style.label || style.styleName} ${useLabel} building.`);

  // Primary material
  const primaryMat = style.materials?.primary || building.material || 'brick';
  const matDesc = MATERIAL_DESCRIPTIONS[primaryMat] || primaryMat;
  parts.push(`Facade: ${matDesc}.`);

  // Trim/foundation materials (if different from primary)
  const trimMat = style.materials?.trim;
  if (trimMat && trimMat !== primaryMat) {
    const trimDesc = MATERIAL_DESCRIPTIONS[trimMat] || trimMat;
    parts.push(`Trim: ${trimDesc}.`);
  }

  // Decorative elements (pick top 3 most distinctive for prompt length)
  const elements = style.decorativeElements || [];
  const elementDescs = elements
    .slice(0, 3)
    .map(e => ELEMENT_DESCRIPTIONS[e] || e.replace(/_/g, ' '))
    .join('; ');
  if (elementDescs) {
    parts.push(`Details: ${elementDescs}.`);
  }

  // Roof
  const roofDesc = ROOF_DESCRIPTIONS[style.roofType] || '';
  if (roofDesc) parts.push(roofDesc);

  // Weathering
  const weathering = getWeatheringText(stories, year, primaryMat);
  if (weathering) parts.push(`Weathering: ${weathering}.`);

  // For text-to-3d mode, add geometry hints
  if (mode === 'text-to-3d') {
    parts.push(`Straight vertical walls. Rectangular footprint. Street-facing facade.`);
  }

  // Assemble and truncate to 550 chars (leaving room for Meshy overhead)
  let prompt = parts.join(' ');
  if (prompt.length > 550) {
    prompt = prompt.slice(0, 547) + '...';
  }

  return prompt;
}

/**
 * Build a negative prompt to prevent anachronistic materials.
 *
 * @param {number} year - Target year
 * @returns {string} Negative prompt string
 */
export function buildNegativePrompt(year) {
  const base = ['modern', 'low quality', 'blurry', 'cartoon', 'anime', 'plastic'];
  const eraExclusions = getEraExclusions(year);
  return [...base, ...eraExclusions].join(', ');
}

/**
 * Build prompt + negative for a building from its GeoJSON properties.
 * Convenience function that classifies the building and generates both prompts.
 *
 * @param {object} properties - GeoJSON feature properties (material, use, stories, address)
 * @param {object} opts
 * @param {string} [opts.era] - Era key (e.g. 'nyc_1884')
 * @param {number} [opts.year] - Year (used if era not provided)
 * @param {'retexture'|'text-to-3d'} [opts.mode='retexture'] - Generation mode
 * @returns {{ prompt: string, negative: string, style: object, building: object }}
 */
export function buildPromptsForBuilding(properties, opts = {}) {
  const year = opts.year || ERA_RULES[opts.era]?.yearRange?.[0] || 1884;
  const era = opts.era || resolveEra(year);
  const eraLabel = ERA_RULES[era]?.label || `circa ${year}`;

  const material = (properties.material || 'brick').toLowerCase();
  const use = (properties.use || 'commercial').toLowerCase();
  const stories = properties.stories || 3;

  const style = classifyBuilding(material, use, stories, { era });

  const prompt = buildTexturePrompt({
    style,
    building: { material, use, stories, address: properties.address },
    year,
    eraLabel,
    mode: opts.mode || 'retexture',
  });

  const negative = buildNegativePrompt(year);

  const tier = opts.quality || 'background';
  const qualityTier = QUALITY_TIERS[tier] || QUALITY_TIERS.background;

  return { prompt, negative, style, building: { material, use, stories }, quality: tier, polycount: qualityTier.polycount };
}

/**
 * Preview prompts for all buildings in a GeoJSON FeatureCollection.
 * Returns an array of { index, address, styleName, prompt, negative, polycount, creditEstimate }.
 * No API calls — pure preview for tuning prompts before spending credits.
 *
 * @param {object} geojson - GeoJSON FeatureCollection with building features
 * @param {object} opts - Same as buildPromptsForBuilding opts, plus:
 *   quality: 'hero' | 'foreground' | 'background' | 'distant' (default: 'background')
 * @returns {object[]}
 */
export function previewAllPrompts(geojson, opts = {}) {
  const features = geojson.features || [];
  return features.map((feature, index) => {
    const props = feature.properties || {};
    const result = buildPromptsForBuilding(props, opts);
    return {
      index,
      address: props.address || `building-${index}`,
      styleName: result.style.styleName,
      prompt: result.prompt,
      negative: result.negative,
      quality: result.quality,
      polycount: result.polycount,
      creditEstimate: (opts.mode === 'text-to-3d') ? 30 : 10,
    };
  });
}
