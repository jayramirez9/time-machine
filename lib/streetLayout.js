/**
 * Street Layout — Era-appropriate street surface classification and dimension rules
 *
 * Maps OSM road categories to historically accurate surfaces, widths, sidewalk
 * dimensions, and gas lamp spacing for a given era and locale. The default rules
 * target 1884 Lower Manhattan.
 *
 * Surface types are keyed for future Unreal material assignment (Phase 6.4).
 */

// ─── Surface Types ──────────────────────────────────────────────

export const SURFACE_TYPES = {
  belgian_block: 'belgian_block', // Rectangular granite setts — main avenues
  cobblestone:   'cobblestone',   // Irregular rounded stone — secondary streets
  dirt:          'dirt',          // Packed earth — alleys, service lanes
  granite_flag:  'granite_flag',  // Flat granite slabs — sidewalks, footways
  macadam:       'macadam',       // Crushed stone — transitional roads (1880s–1900s)
  brick:         'brick'          // Brick pavement — some crosswalks, sidewalks
};

// ─── 1884 NYC Street Rules ──────────────────────────────────────

/**
 * Default classification rules for 1884 Lower Manhattan.
 *
 * Historical basis:
 * - Belgian block (granite setts) dominated major avenues by 1880s
 * - Cobblestone (rounded fieldstone) on older secondary streets
 * - Dirt/packed earth on service alleys and minor lanes
 * - Granite flagstone sidewalks standard on commercial streets
 * - Gas lamps on major avenues at ~30–40m intervals (NYPD/lamp dept records)
 * - No asphalt in Lower Manhattan until ~1890s (sheet asphalt trials on 5th Ave 1890)
 * - No electric streetlights south of 14th St until 1882 Pearl Street station
 *   (limited to a few blocks; gas remained dominant through 1880s)
 */
const NYC_1884_RULES = {
  // Major avenues (Broadway, Bowery, Park Row)
  primary: {
    surface: SURFACE_TYPES.belgian_block,
    widthM: 25,
    sidewalkWidthM: 5,
    sidewalkSurface: SURFACE_TYPES.granite_flag,
    lampSpacingM: 30,
    lampSides: 'both'    // 'both', 'one', 'none'
  },
  // Cross streets between avenues
  secondary: {
    surface: SURFACE_TYPES.belgian_block,
    widthM: 18,
    sidewalkWidthM: 4,
    sidewalkSurface: SURFACE_TYPES.granite_flag,
    lampSpacingM: 35,
    lampSides: 'both'
  },
  // Minor cross streets
  tertiary: {
    surface: SURFACE_TYPES.cobblestone,
    widthM: 15,
    sidewalkWidthM: 3,
    sidewalkSurface: SURFACE_TYPES.granite_flag,
    lampSpacingM: 40,
    lampSides: 'one'
  },
  // Residential side streets
  residential: {
    surface: SURFACE_TYPES.cobblestone,
    widthM: 12,
    sidewalkWidthM: 2.5,
    sidewalkSurface: SURFACE_TYPES.granite_flag,
    lampSpacingM: 0,    // 0 = no lamps
    lampSides: 'none'
  },
  // Service alleys, rear lanes
  service: {
    surface: SURFACE_TYPES.dirt,
    widthM: 6,
    sidewalkWidthM: 0,
    sidewalkSurface: null,
    lampSpacingM: 0,
    lampSides: 'none'
  },
  // Pedestrian paths, footways
  footway: {
    surface: SURFACE_TYPES.granite_flag,
    widthM: 3,
    sidewalkWidthM: 0,
    sidewalkSurface: null,
    lampSpacingM: 0,
    lampSides: 'none'
  },
  // Steps, stairs
  steps: {
    surface: SURFACE_TYPES.granite_flag,
    widthM: 2,
    sidewalkWidthM: 0,
    sidewalkSurface: null,
    lampSpacingM: 0,
    lampSides: 'none'
  },
  // Pedestrian plazas
  pedestrian: {
    surface: SURFACE_TYPES.granite_flag,
    widthM: 8,
    sidewalkWidthM: 0,
    sidewalkSurface: null,
    lampSpacingM: 35,
    lampSides: 'one'
  }
};

// Aliases — OSM uses various subcategories that map to the same rules
const SUBCATEGORY_ALIASES = {
  trunk:          'primary',
  trunk_link:     'primary',
  primary_link:   'primary',
  secondary_link: 'secondary',
  tertiary_link:  'tertiary',
  living_street:  'residential',
  unclassified:   'residential',
  track:          'dirt',
  path:           'footway',
  cycleway:       'footway',
  bridleway:      'footway',
  corridor:       'footway'
};

// ─── Era Rule Sets ──────────────────────────────────────────────

const ERA_RULES = {
  nyc_1884: NYC_1884_RULES
};

// ─── Classification ─────────────────────────────────────────────

/**
 * Classify an OSM road subcategory into era-appropriate street properties.
 *
 * @param {string} subcategory - OSM highway value (e.g. 'primary', 'residential', 'footway')
 * @param {{ era?: string }} [opts] - Options. era defaults to 'nyc_1884'.
 * @returns {{ surface: string, widthM: number, sidewalkWidthM: number, sidewalkSurface: string|null, lampSpacingM: number, lampSides: string, category: string }}
 */
export function classifyStreet(subcategory, opts = {}) {
  const era = opts.era || 'nyc_1884';
  const rules = ERA_RULES[era] || NYC_1884_RULES;

  // Resolve alias
  const key = SUBCATEGORY_ALIASES[subcategory] || subcategory;

  // Look up rules, fall back to residential for unknown types
  const rule = rules[key] || rules.residential;

  return {
    ...rule,
    category: key
  };
}

/**
 * Find major intersections where multiple roads meet.
 * Returns points where 3+ road splines have control points within a threshold.
 *
 * @param {object[]} splines - Road spline data from roads-splines.json
 * @param {{ thresholdCm?: number }} [opts] - Clustering threshold in cm (default: 1500 = 15m)
 * @returns {{ x: number, y: number, roadCount: number, categories: string[] }[]}
 */
export function findIntersections(splines, opts = {}) {
  const threshold = opts.thresholdCm || 1500;
  const thresholdSq = threshold * threshold;

  // Collect all endpoints and junction points
  const points = [];
  for (const spline of splines) {
    if (!spline.points || spline.points.length < 2) continue;
    // Use first and last point of each spline as potential intersection nodes
    points.push({ x: spline.points[0][0], y: spline.points[0][1], category: spline.category });
    const last = spline.points[spline.points.length - 1];
    points.push({ x: last[0], y: last[1], category: spline.category });
  }

  // Cluster nearby points
  const used = new Set();
  const intersections = [];

  for (let i = 0; i < points.length; i++) {
    if (used.has(i)) continue;
    const cluster = [i];
    const categories = new Set([points[i].category]);

    for (let j = i + 1; j < points.length; j++) {
      if (used.has(j)) continue;
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      if (dx * dx + dy * dy < thresholdSq) {
        cluster.push(j);
        categories.add(points[j].category);
        used.add(j);
      }
    }
    used.add(i);

    // Only count as intersection if 3+ road endpoints meet
    if (cluster.length >= 3) {
      let cx = 0, cy = 0;
      for (const idx of cluster) {
        cx += points[idx].x;
        cy += points[idx].y;
      }
      intersections.push({
        x: cx / cluster.length,
        y: cy / cluster.length,
        roadCount: cluster.length,
        categories: [...categories]
      });
    }
  }

  return intersections;
}

// ─── Exports ────────────────────────────────────────────────────

export { NYC_1884_RULES as DEFAULT_RULES, ERA_RULES };
