/**
 * Architecture Styles — Era-appropriate building classification and massing parameters
 *
 * Maps (material + use + stories) to an architectural style for a given era,
 * providing style-aware massing parameters (floor height, cornice) and visual
 * metadata for future phases (facade rhythm, textures, props).
 *
 * Follows the ERA_RULES pattern from streetLayout.js: data-driven rule sets
 * keyed by era, thin classifier function, fallback to default.
 */

// ─── Style Definitions ─────────────────────────────────────────

/**
 * Architectural styles with massing parameters and future-phase metadata.
 * Massing params (floorHeightCm, corniceHeightCm, roofType) are consumed now.
 * Visual metadata (facadeRhythm, decorativeElements, textureSearchTerms,
 * compatibleProps) defines the schema for Phases 6.5-6.7.
 */
export const STYLES = {
  brownstone_rowhouse: {
    label: 'Brownstone Rowhouse',
    floorHeightCm: 350,
    corniceHeightCm: 90,
    roofType: 'flat',
    materials: { primary: 'brownstone', trim: 'brownstone', foundation: 'granite' },
    facadeRhythm: 'ABA',       // window-door-window pattern
    decorativeElements: ['cornice_brackets', 'stoop', 'window_lintels', 'iron_railings'],
    textureSearchTerms: ['brownstone facade', 'NYC rowhouse 1880s'],
    compatibleProps: ['stoop_railings', 'window_boxes', 'gas_lamp_bracket']
  },
  italianate_tenement: {
    label: 'Italianate Tenement',
    floorHeightCm: 330,
    corniceHeightCm: 75,
    roofType: 'flat',
    materials: { primary: 'brick', trim: 'stone', foundation: 'granite' },
    facadeRhythm: 'ABBA',
    decorativeElements: ['bracketed_cornice', 'segmental_arches', 'fire_escape'],
    textureSearchTerms: ['tenement facade', 'brick tenement 1880s'],
    compatibleProps: ['fire_escape', 'clothesline', 'window_shutters']
  },
  italianate_commercial: {
    label: 'Italianate Commercial',
    floorHeightCm: 400,
    corniceHeightCm: 90,
    roofType: 'flat',
    materials: { primary: 'brick', trim: 'stone', foundation: 'granite' },
    facadeRhythm: 'ABBA',
    decorativeElements: ['bracketed_cornice', 'round_arches', 'storefront_columns'],
    textureSearchTerms: ['italianate commercial building', 'NYC commercial 1870s'],
    compatibleProps: ['awning', 'signage_board', 'gas_lamp_bracket']
  },
  cast_iron_commercial: {
    label: 'Cast Iron Commercial',
    floorHeightCm: 450,
    corniceHeightCm: 120,
    roofType: 'flat',
    materials: { primary: 'cast_iron', trim: 'cast_iron', foundation: 'stone' },
    facadeRhythm: 'AAAA',
    decorativeElements: ['iron_columns', 'ornate_cornice', 'large_windows'],
    textureSearchTerms: ['cast iron facade', 'SoHo cast iron building'],
    compatibleProps: ['awning', 'loading_dock', 'signage_board']
  },
  federal_commercial: {
    label: 'Federal Commercial',
    floorHeightCm: 300,
    corniceHeightCm: 60,
    roofType: 'low_pitch',
    materials: { primary: 'brick', trim: 'wood', foundation: 'stone' },
    facadeRhythm: 'ABA',
    decorativeElements: ['fan_window', 'flemish_bond', 'dentil_cornice'],
    textureSearchTerms: ['federal style building', 'early american commercial'],
    compatibleProps: ['wooden_signage', 'shutters']
  },
  second_empire: {
    label: 'Second Empire',
    floorHeightCm: 400,
    corniceHeightCm: 100,
    roofType: 'mansard',
    materials: { primary: 'stone', trim: 'stone', foundation: 'granite' },
    facadeRhythm: 'ABCBA',
    decorativeElements: ['mansard_roof', 'dormer_windows', 'quoins', 'ornate_cornice'],
    textureSearchTerms: ['second empire building', 'mansard roof 1870s'],
    compatibleProps: ['dormer_windows', 'iron_cresting']
  },
  gothic_revival_church: {
    label: 'Gothic Revival Church',
    floorHeightCm: 600,
    corniceHeightCm: 0,
    roofType: 'gabled',
    materials: { primary: 'stone', trim: 'stone', foundation: 'stone' },
    facadeRhythm: 'ABA',
    decorativeElements: ['pointed_arches', 'tracery', 'buttresses', 'rose_window'],
    textureSearchTerms: ['gothic revival church', 'stone church 1880s'],
    compatibleProps: ['spire', 'iron_fence']
  },
  greek_revival_civic: {
    label: 'Greek Revival Civic',
    floorHeightCm: 500,
    corniceHeightCm: 80,
    roofType: 'low_pitch',
    materials: { primary: 'stone', trim: 'marble', foundation: 'granite' },
    facadeRhythm: 'ABCBA',
    decorativeElements: ['columns', 'pediment', 'entablature', 'pilasters'],
    textureSearchTerms: ['greek revival building', 'civic building columns'],
    compatibleProps: ['steps', 'flagpole', 'iron_fence']
  },
  industrial_loft: {
    label: 'Industrial Loft',
    floorHeightCm: 400,
    corniceHeightCm: 60,
    roofType: 'flat',
    materials: { primary: 'brick', trim: 'iron', foundation: 'stone' },
    facadeRhythm: 'AAAA',
    decorativeElements: ['segmental_arches', 'iron_shutters', 'loading_doors'],
    textureSearchTerms: ['industrial loft building', 'warehouse 1880s'],
    compatibleProps: ['loading_crane', 'iron_shutters', 'dock']
  },
  wood_frame_vernacular: {
    label: 'Wood Frame Vernacular',
    floorHeightCm: 280,
    corniceHeightCm: 30,
    roofType: 'gabled',
    materials: { primary: 'wood', trim: 'wood', foundation: 'stone' },
    facadeRhythm: 'ABA',
    decorativeElements: ['clapboard', 'simple_cornice', 'porch'],
    textureSearchTerms: ['wood frame house 1880s', 'clapboard building'],
    compatibleProps: ['porch', 'wooden_fence', 'shutters']
  },

  // ── Chicago 1920 styles ──

  chicago_school: {
    label: 'Chicago School',
    floorHeightCm: 380,
    corniceHeightCm: 100,
    roofType: 'flat',
    materials: { primary: 'steel_frame', trim: 'terra_cotta', foundation: 'concrete' },
    facadeRhythm: 'AAAA',
    decorativeElements: ['chicago_window', 'terra_cotta_ornament', 'cornice'],
    textureSearchTerms: ['chicago school building', 'chicago commercial 1920s'],
    compatibleProps: ['awning', 'signage_board']
  },
  prairie_style: {
    label: 'Prairie Style',
    floorHeightCm: 300,
    corniceHeightCm: 40,
    roofType: 'low_pitch',
    materials: { primary: 'brick', trim: 'stone', foundation: 'concrete' },
    facadeRhythm: 'ABBA',
    decorativeElements: ['horizontal_bands', 'wide_eaves', 'casement_windows'],
    textureSearchTerms: ['prairie style house', 'frank lloyd wright style'],
    compatibleProps: ['planter', 'low_wall']
  },
  beaux_arts: {
    label: 'Beaux-Arts',
    floorHeightCm: 450,
    corniceHeightCm: 120,
    roofType: 'flat',
    materials: { primary: 'stone', trim: 'marble', foundation: 'granite' },
    facadeRhythm: 'ABCBA',
    decorativeElements: ['columns', 'balustrade', 'cartouche', 'rustication'],
    textureSearchTerms: ['beaux arts building', 'classical commercial 1920s'],
    compatibleProps: ['flagpole', 'iron_lamp']
  },
  classical_revival: {
    label: 'Classical Revival',
    floorHeightCm: 420,
    corniceHeightCm: 90,
    roofType: 'flat',
    materials: { primary: 'stone', trim: 'stone', foundation: 'granite' },
    facadeRhythm: 'ABCBA',
    decorativeElements: ['columns', 'entablature', 'pediment'],
    textureSearchTerms: ['classical revival building', 'neoclassical 1920s'],
    compatibleProps: ['steps', 'iron_fence']
  },

  // ── General American styles ──

  craftsman_bungalow: {
    label: 'Craftsman Bungalow',
    floorHeightCm: 280,
    corniceHeightCm: 30,
    roofType: 'low_pitch',
    materials: { primary: 'wood', trim: 'wood', foundation: 'stone' },
    facadeRhythm: 'ABA',
    decorativeElements: ['exposed_rafters', 'tapered_columns', 'wide_porch'],
    textureSearchTerms: ['craftsman bungalow', 'arts and crafts house 1910s'],
    compatibleProps: ['porch', 'planter', 'wooden_fence']
  },
  art_deco_commercial: {
    label: 'Art Deco Commercial',
    floorHeightCm: 380,
    corniceHeightCm: 80,
    roofType: 'flat',
    materials: { primary: 'concrete', trim: 'terra_cotta', foundation: 'concrete' },
    facadeRhythm: 'ABBA',
    decorativeElements: ['zigzag_ornament', 'stepped_parapet', 'fluted_pilasters'],
    textureSearchTerms: ['art deco building', 'art deco commercial 1930s'],
    compatibleProps: ['neon_sign', 'marquee', 'flagpole']
  },
  ranch_house: {
    label: 'Ranch House',
    floorHeightCm: 260,
    corniceHeightCm: 20,
    roofType: 'low_pitch',
    materials: { primary: 'brick', trim: 'wood', foundation: 'concrete' },
    facadeRhythm: 'ABBA',
    decorativeElements: ['picture_window', 'attached_garage', 'low_roof'],
    textureSearchTerms: ['ranch house 1950s', 'midcentury ranch'],
    compatibleProps: ['carport', 'mailbox', 'lawn']
  },
  mid_century_commercial: {
    label: 'Mid-Century Commercial',
    floorHeightCm: 360,
    corniceHeightCm: 40,
    roofType: 'flat',
    materials: { primary: 'concrete', trim: 'glass', foundation: 'concrete' },
    facadeRhythm: 'AAAA',
    decorativeElements: ['curtain_wall', 'cantilevered_canopy', 'mosaic_panel'],
    textureSearchTerms: ['midcentury commercial building', 'modernist office 1960s'],
    compatibleProps: ['parking_lot', 'signage_board', 'planter']
  },
  split_level: {
    label: 'Split-Level',
    floorHeightCm: 270,
    corniceHeightCm: 20,
    roofType: 'low_pitch',
    materials: { primary: 'brick', trim: 'wood', foundation: 'concrete' },
    facadeRhythm: 'ABA',
    decorativeElements: ['split_entry', 'picture_window', 'attached_garage'],
    textureSearchTerms: ['split level house 1960s', 'suburban split level'],
    compatibleProps: ['carport', 'mailbox', 'lawn']
  },
  suburban_commercial: {
    label: 'Suburban Commercial',
    floorHeightCm: 400,
    corniceHeightCm: 30,
    roofType: 'flat',
    materials: { primary: 'concrete', trim: 'metal', foundation: 'concrete' },
    facadeRhythm: 'AAAA',
    decorativeElements: ['strip_mall_facade', 'large_signage', 'plate_glass'],
    textureSearchTerms: ['strip mall', 'suburban commercial 1980s'],
    compatibleProps: ['parking_lot', 'dumpster', 'signage_board']
  },
  contemporary_house: {
    label: 'Contemporary House',
    floorHeightCm: 300,
    corniceHeightCm: 20,
    roofType: 'low_pitch',
    materials: { primary: 'mixed', trim: 'metal', foundation: 'concrete' },
    facadeRhythm: 'ABBA',
    decorativeElements: ['large_windows', 'mixed_cladding', 'clean_lines'],
    textureSearchTerms: ['contemporary house', 'modern residential 2010s'],
    compatibleProps: ['garage_door', 'mailbox', 'landscaping']
  },
  generic_commercial: {
    label: 'Generic Commercial',
    floorHeightCm: 400,
    corniceHeightCm: 30,
    roofType: 'flat',
    materials: { primary: 'concrete', trim: 'glass', foundation: 'concrete' },
    facadeRhythm: 'AAAA',
    decorativeElements: ['curtain_wall', 'metal_panels', 'recessed_entry'],
    textureSearchTerms: ['modern commercial building', 'office building 2000s'],
    compatibleProps: ['parking_lot', 'signage_board', 'landscaping']
  },

  // ── San Francisco 1908 styles ──

  victorian_queen_anne: {
    label: 'Victorian Queen Anne',
    floorHeightCm: 320,
    corniceHeightCm: 50,
    roofType: 'gabled',
    materials: { primary: 'wood', trim: 'wood', foundation: 'brick' },
    facadeRhythm: 'ABBA',
    decorativeElements: ['bay_window', 'turret', 'gingerbread_trim', 'fish_scale_shingles'],
    textureSearchTerms: ['queen anne victorian', 'painted lady SF'],
    compatibleProps: ['porch', 'iron_fence', 'finial']
  },
  stick_eastlake: {
    label: 'Stick-Eastlake',
    floorHeightCm: 310,
    corniceHeightCm: 45,
    roofType: 'gabled',
    materials: { primary: 'wood', trim: 'wood', foundation: 'brick' },
    facadeRhythm: 'ABA',
    decorativeElements: ['stick_work', 'sunburst_panels', 'square_bay_window'],
    textureSearchTerms: ['stick eastlake victorian', 'SF victorian house'],
    compatibleProps: ['porch', 'wooden_fence']
  },
  edwardian: {
    label: 'Edwardian',
    floorHeightCm: 330,
    corniceHeightCm: 60,
    roofType: 'flat',
    materials: { primary: 'wood', trim: 'wood', foundation: 'concrete' },
    facadeRhythm: 'ABBA',
    decorativeElements: ['bay_window', 'classical_columns', 'simple_cornice'],
    textureSearchTerms: ['edwardian house SF', 'san francisco edwardian'],
    compatibleProps: ['bay_window', 'steps']
  },
  mission_revival: {
    label: 'Mission Revival',
    floorHeightCm: 350,
    corniceHeightCm: 0,
    roofType: 'low_pitch',
    materials: { primary: 'stucco', trim: 'tile', foundation: 'concrete' },
    facadeRhythm: 'ABA',
    decorativeElements: ['arched_openings', 'red_tile_roof', 'bell_tower', 'quatrefoil_window'],
    textureSearchTerms: ['mission revival building', 'california mission style'],
    compatibleProps: ['tile_roof', 'courtyard_wall']
  }
};

// ─── Era Classification Rules ──────────────────────────────────

/**
 * Classification rules per era. Each rule is tested in order; first match wins.
 * Rule fields: material (string or array), use (string or array), minStories,
 * maxStories, style (key into STYLES).
 */
export const ERA_RULES = {
  nyc_1884: {
    label: '1884 New York City',
    yearRange: [1870, 1895],
    defaultStyle: 'italianate_tenement',
    rules: [
      // Churches and religious buildings
      { use: 'church', style: 'gothic_revival_church' },
      { use: 'religious', style: 'gothic_revival_church' },

      // Civic / institutional
      { use: ['civic', 'government', 'institutional'], style: 'greek_revival_civic' },

      // Industrial / warehouse
      { material: ['brick', 'iron'], use: ['warehouse', 'industrial', 'factory'], style: 'industrial_loft' },

      // Cast iron commercial (SoHo / lower broadway)
      { material: 'iron', use: ['commercial', 'retail'], style: 'cast_iron_commercial' },

      // Large stone commercial / hotels
      { material: 'stone', use: ['commercial', 'hotel'], minStories: 4, style: 'second_empire' },

      // Stone civic-scale
      { material: 'stone', minStories: 3, style: 'greek_revival_civic' },

      // Brownstone residential (3-5 stories)
      { material: 'brick', use: 'residential', minStories: 3, maxStories: 5, style: 'brownstone_rowhouse' },

      // Small brick residential — also brownstone style
      { material: 'brick', use: 'residential', maxStories: 2, style: 'brownstone_rowhouse' },

      // Tall brick residential (6+ stories) — tenement
      { material: 'brick', use: 'residential', minStories: 6, style: 'italianate_tenement' },

      // Mixed use / commercial brick
      { material: 'brick', use: ['commercial', 'retail', 'mixed'], style: 'italianate_commercial' },

      // Old federal-era brick (short, pre-Civil War survivors)
      { material: 'brick', maxStories: 2, style: 'federal_commercial' },

      // Wood frame (shanties, small structures)
      { material: ['wood', 'frame'], style: 'wood_frame_vernacular' },

      // Default brick = tenement
      { material: 'brick', style: 'italianate_tenement' }
    ]
  },

  chicago_1920: {
    label: '1920 Chicago',
    yearRange: [1900, 1930],
    defaultStyle: 'chicago_school',
    rules: [
      { use: ['civic', 'government', 'institutional'], style: 'beaux_arts' },
      { material: 'stone', use: ['commercial', 'hotel'], minStories: 6, style: 'classical_revival' },
      { material: 'brick', use: 'residential', maxStories: 3, style: 'prairie_style' },
      { material: ['brick', 'stone'], use: ['commercial', 'retail', 'mixed'], style: 'chicago_school' },
      { use: ['church', 'religious'], style: 'classical_revival' },
      { material: 'brick', style: 'chicago_school' }
    ]
  },

  sf_1908: {
    label: '1908 San Francisco',
    yearRange: [1890, 1915],
    defaultStyle: 'stick_eastlake',
    rules: [
      { use: ['church', 'religious'], style: 'mission_revival' },
      { use: ['civic', 'government', 'institutional'], style: 'mission_revival' },
      { material: 'wood', use: 'residential', minStories: 3, style: 'edwardian' },
      { material: 'wood', use: 'residential', maxStories: 2, style: 'victorian_queen_anne' },
      { material: ['wood', 'frame'], style: 'stick_eastlake' },
      { material: 'brick', use: ['commercial', 'retail', 'mixed'], style: 'edwardian' }
    ]
  },

  // ── General American eras ──────────────────────────────────

  general_colonial: {
    label: 'Colonial / Federal (pre-1830)',
    yearRange: [0, 1830],
    defaultStyle: 'federal_commercial',
    rules: [
      { use: ['church', 'religious'], style: 'gothic_revival_church' },
      { use: ['civic', 'government', 'institutional'], style: 'greek_revival_civic' },
      { material: 'brick', use: ['commercial', 'retail', 'mixed'], style: 'federal_commercial' },
      { material: 'brick', use: 'residential', style: 'federal_commercial' },
      { material: ['wood', 'frame'], style: 'wood_frame_vernacular' },
      { material: 'stone', style: 'federal_commercial' }
    ]
  },

  general_antebellum: {
    label: 'Antebellum (1830–1865)',
    yearRange: [1830, 1865],
    defaultStyle: 'greek_revival_civic',
    rules: [
      { use: ['church', 'religious'], style: 'gothic_revival_church' },
      { use: ['civic', 'government', 'institutional'], style: 'greek_revival_civic' },
      { material: 'stone', minStories: 3, style: 'greek_revival_civic' },
      { material: 'brick', use: ['commercial', 'retail', 'mixed'], style: 'federal_commercial' },
      { material: 'brick', use: 'residential', maxStories: 3, style: 'federal_commercial' },
      { material: ['wood', 'frame'], style: 'wood_frame_vernacular' }
    ]
  },

  general_victorian: {
    label: 'Victorian (1865–1900)',
    yearRange: [1865, 1900],
    defaultStyle: 'wood_frame_vernacular',
    rules: [
      { use: ['church', 'religious'], style: 'gothic_revival_church' },
      { use: ['civic', 'government', 'institutional'], style: 'greek_revival_civic' },
      { material: 'iron', use: ['commercial', 'retail'], style: 'cast_iron_commercial' },
      { material: 'stone', minStories: 4, style: 'second_empire' },
      { material: 'brick', use: ['commercial', 'retail', 'mixed'], style: 'italianate_commercial' },
      { material: 'brick', use: 'residential', minStories: 5, style: 'italianate_tenement' },
      { material: 'brick', use: 'residential', style: 'brownstone_rowhouse' },
      { material: ['wood', 'frame'], style: 'wood_frame_vernacular' }
    ]
  },

  general_progressive: {
    label: 'Progressive Era (1900–1930)',
    yearRange: [1900, 1930],
    defaultStyle: 'craftsman_bungalow',
    rules: [
      { use: ['church', 'religious'], style: 'classical_revival' },
      { use: ['civic', 'government', 'institutional'], style: 'beaux_arts' },
      { material: 'stone', use: ['commercial', 'hotel'], minStories: 4, style: 'beaux_arts' },
      { material: 'brick', use: ['commercial', 'retail', 'mixed'], style: 'italianate_commercial' },
      { material: 'brick', use: 'residential', maxStories: 3, style: 'craftsman_bungalow' },
      { material: ['wood', 'frame'], use: 'residential', style: 'craftsman_bungalow' },
      { material: ['wood', 'frame'], style: 'wood_frame_vernacular' }
    ]
  },

  general_deco: {
    label: 'Art Deco / Early Modern (1925–1950)',
    yearRange: [1925, 1950],
    defaultStyle: 'art_deco_commercial',
    rules: [
      { use: ['church', 'religious'], style: 'classical_revival' },
      { use: ['civic', 'government', 'institutional'], style: 'art_deco_commercial' },
      { material: ['concrete', 'stone'], use: ['commercial', 'retail', 'mixed'], style: 'art_deco_commercial' },
      { material: 'brick', use: ['commercial', 'retail', 'mixed'], style: 'art_deco_commercial' },
      { material: 'brick', use: 'residential', maxStories: 3, style: 'craftsman_bungalow' },
      { material: ['wood', 'frame'], use: 'residential', style: 'craftsman_bungalow' }
    ]
  },

  general_midcentury: {
    label: 'Mid-Century (1945–1975)',
    yearRange: [1945, 1975],
    defaultStyle: 'ranch_house',
    rules: [
      { use: ['church', 'religious'], style: 'mid_century_commercial' },
      { use: ['civic', 'government', 'institutional'], style: 'mid_century_commercial' },
      { use: ['commercial', 'retail', 'mixed'], style: 'mid_century_commercial' },
      { use: ['warehouse', 'industrial', 'factory'], style: 'industrial_loft' },
      { use: 'residential', minStories: 2, maxStories: 2, style: 'split_level' },
      { use: 'residential', style: 'ranch_house' }
    ]
  },

  general_late20c: {
    label: 'Late 20th Century (1970–2000)',
    yearRange: [1970, 2000],
    defaultStyle: 'suburban_commercial',
    rules: [
      { use: ['church', 'religious'], style: 'suburban_commercial' },
      { use: ['civic', 'government', 'institutional'], style: 'generic_commercial' },
      { use: ['commercial', 'retail', 'mixed'], style: 'suburban_commercial' },
      { use: ['warehouse', 'industrial', 'factory'], style: 'industrial_loft' },
      { use: 'residential', maxStories: 2, style: 'ranch_house' },
      { use: 'residential', minStories: 3, style: 'suburban_commercial' }
    ]
  },

  general_contemporary: {
    label: 'Contemporary (2000–present)',
    yearRange: [2000, 2100],
    defaultStyle: 'generic_commercial',
    rules: [
      { use: ['church', 'religious'], style: 'generic_commercial' },
      { use: ['civic', 'government', 'institutional'], style: 'generic_commercial' },
      { use: ['commercial', 'retail', 'mixed'], style: 'generic_commercial' },
      { use: ['warehouse', 'industrial', 'factory'], style: 'generic_commercial' },
      { use: 'residential', maxStories: 2, style: 'contemporary_house' },
      { use: 'residential', minStories: 3, style: 'generic_commercial' }
    ]
  }
};

// ─── General Era Resolution ───────────────────────────────────

/**
 * Ordered timeline of general American eras. Checked low-to-high;
 * first entry whose maxYear >= the query year wins.
 */
const GENERAL_ERA_TIMELINE = [
  { maxYear: 1830, era: 'general_colonial' },
  { maxYear: 1865, era: 'general_antebellum' },
  { maxYear: 1900, era: 'general_victorian' },
  { maxYear: 1930, era: 'general_progressive' },
  { maxYear: 1950, era: 'general_deco' },
  { maxYear: 1975, era: 'general_midcentury' },
  { maxYear: 2000, era: 'general_late20c' },
  { maxYear: Infinity, era: 'general_contemporary' }
];

/**
 * Resolve a year to the best general-purpose era key.
 * @param {number} year
 * @returns {string} Era key (e.g. 'general_victorian')
 */
export function resolveEra(year) {
  for (const entry of GENERAL_ERA_TIMELINE) {
    if (year <= entry.maxYear) return entry.era;
  }
  return 'general_contemporary';
}

// ─── Classifier ────────────────────────────────────────────────

/**
 * Test whether a single rule matches the given building attributes.
 */
function ruleMatches(rule, material, use, stories) {
  // Check material constraint
  if (rule.material) {
    const mats = Array.isArray(rule.material) ? rule.material : [rule.material];
    if (!mats.includes(material)) return false;
  }

  // Check use constraint
  if (rule.use) {
    const uses = Array.isArray(rule.use) ? rule.use : [rule.use];
    if (!uses.includes(use)) return false;
  }

  // Check story range
  if (rule.minStories != null && stories < rule.minStories) return false;
  if (rule.maxStories != null && stories > rule.maxStories) return false;

  return true;
}

/**
 * Classify a building into an architectural style based on its attributes.
 *
 * @param {string} material - Building material (brick, stone, iron, wood, frame, etc.)
 * @param {string} use - Building use (residential, commercial, church, warehouse, etc.)
 * @param {number} stories - Number of stories
 * @param {{ era?: string, year?: number }} [opts] - Options.
 *   era: explicit era key (takes priority). year: resolved via resolveEra().
 *   When neither provided, defaults to 'general_contemporary'.
 * @returns {{ styleName: string, ...styleProps }} Style object with styleName included
 */
export function classifyBuilding(material, use, stories, opts = {}) {
  const era = opts.era || (opts.year != null ? resolveEra(opts.year) : 'general_contemporary');
  const eraConfig = ERA_RULES[era] || ERA_RULES.general_contemporary;

  // Walk rules in order — first match wins
  for (const rule of eraConfig.rules) {
    if (ruleMatches(rule, material, use, stories)) {
      const style = STYLES[rule.style];
      if (style) return { styleName: rule.style, ...style };
    }
  }

  // Fallback to era default
  const defaultKey = eraConfig.defaultStyle;
  const defaultStyle = STYLES[defaultKey];
  return { styleName: defaultKey, ...defaultStyle };
}

/**
 * Get the floor height for a building based on its classified style.
 * Convenience wrapper around classifyBuilding().
 *
 * @param {string} material
 * @param {string} use
 * @param {number} stories
 * @param {{ era?: string, year?: number }} [opts]
 * @returns {number} Floor height in cm
 */
export function getFloorHeight(material, use, stories, opts = {}) {
  return classifyBuilding(material, use, stories, opts).floorHeightCm;
}

/**
 * List all available era keys.
 * @returns {string[]}
 */
export function listEras() {
  return Object.keys(ERA_RULES);
}

/**
 * Get metadata about an era.
 * @param {string} eraKey
 * @returns {{ label: string, yearRange: number[], defaultStyle: string } | null}
 */
export function getEraInfo(eraKey) {
  const era = ERA_RULES[eraKey];
  if (!era) return null;
  return { label: era.label, yearRange: era.yearRange, defaultStyle: era.defaultStyle };
}
