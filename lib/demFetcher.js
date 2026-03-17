/**
 * DEM Fetcher — Download and process USGS 3DEP elevation data
 *
 * Downloads elevation data from the USGS 3DEP WCS endpoint and processes
 * it with GDAL to produce Unreal-compatible heightmap files (R16 or PNG16).
 *
 * Requires GDAL CLI tools (gdalwarp, gdal_translate, gdalinfo) on PATH.
 * Install: brew install gdal
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { isInUS } from './cesiumGeoreference.js';

const execFileAsync = promisify(execFile);

/**
 * Valid Unreal Landscape dimensions (Component Count * Quads + 1)
 * These are the only sizes Unreal accepts for heightmap import.
 */
const LANDSCAPE_SIZES = [127, 253, 505, 1009, 2017, 4033, 8129];

/**
 * Compute a WGS84 bounding box from a center point and radius
 * @param {number} lat - Center latitude
 * @param {number} lon - Center longitude
 * @param {number} radiusMeters - Radius in meters
 * @returns {{ minLat: number, maxLat: number, minLon: number, maxLon: number }}
 */
export function computeBoundingBox(lat, lon, radiusMeters) {
  // 1 degree of latitude ≈ 111,320 meters
  const latDelta = radiusMeters / 111320;
  // 1 degree of longitude varies with latitude
  const lonDelta = radiusMeters / (111320 * Math.cos(lat * Math.PI / 180));

  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLon: lon - lonDelta,
    maxLon: lon + lonDelta
  };
}

/**
 * Find the best matching Unreal Landscape dimension
 * @param {number} pixels - Desired dimension in pixels
 * @returns {number} Closest valid Landscape dimension
 */
export function nearestLandscapeSize(pixels) {
  let best = LANDSCAPE_SIZES[0];
  let bestDiff = Infinity;
  for (const s of LANDSCAPE_SIZES) {
    const diff = Math.abs(s - pixels);
    if (diff < bestDiff) { bestDiff = diff; best = s; }
  }
  return best;
}

/**
 * Check if GDAL CLI tools are available on PATH
 * @returns {Promise<{ available: boolean, version?: string }>}
 */
export async function checkGDAL() {
  try {
    const { stdout } = await execFileAsync('gdalinfo', ['--version']);
    return { available: true, version: stdout.trim() };
  } catch {
    return { available: false };
  }
}

/**
 * Fetch DEM data from USGS 3DEP WCS endpoint
 * @param {number} lat - Center latitude
 * @param {number} lon - Center longitude
 * @param {number} radiusMeters - Radius in meters (default 500)
 * @param {object} [options]
 * @param {string} [options.outputDir] - Output directory (default: terrain-data/{slug})
 * @param {number} [options.resolution] - Target resolution in meters (default: 1)
 * @param {string} [options.slug] - Location slug for output directory
 * @returns {Promise<{ demPath: string, bbox: object, metadata: object }>}
 */
export async function fetchDEM(lat, lon, radiusMeters = 500, options = {}) {
  const { resolution = 1, slug = 'location' } = options;
  const outputDir = options.outputDir || path.join('terrain-data', slug);

  // USGS 3DEP only covers the United States — guard against international coordinates
  if (!isInUS(lat, lon)) {
    throw new Error(
      `DEM pipeline uses USGS 3DEP which only covers the United States. ` +
      `Coordinates (${lat.toFixed(4)}, ${lon.toFixed(4)}) are outside US coverage. ` +
      `For international terrain, use Cesium World Terrain streaming instead.`
    );
  }

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  const bbox = computeBoundingBox(lat, lon, radiusMeters);
  const demPath = path.join(outputDir, 'dem.tif');

  // USGS 3DEP WCS endpoint — request GeoTIFF coverage
  // The 3DEP ImageServer supports export with bbox and size params
  const widthPx = Math.ceil((radiusMeters * 2) / resolution);
  const heightPx = widthPx; // Square for Landscape

  const wcsUrl = `https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage?`
    + `bbox=${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`
    + `&bboxSR=4326`
    + `&imageSR=4326`
    + `&size=${widthPx},${heightPx}`
    + `&format=tiff`
    + `&pixelType=F32`
    + `&noData=-9999`
    + `&interpolation=RSP_BilinearInterpolation`
    + `&f=image`;

  console.log(`  Fetching DEM: ${widthPx}x${heightPx}px @ ${resolution}m/px`);
  console.log(`  BBox: ${bbox.minLon.toFixed(6)}, ${bbox.minLat.toFixed(6)} → ${bbox.maxLon.toFixed(6)}, ${bbox.maxLat.toFixed(6)}`);

  const res = await fetch(wcsUrl, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) {
    throw new Error(`USGS 3DEP returned ${res.status}: ${res.statusText}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('json') || contentType.includes('html')) {
    const text = await res.text();
    throw new Error(`USGS 3DEP returned error: ${text.slice(0, 200)}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 1000) {
    throw new Error(`DEM response too small (${buffer.length} bytes) — may be an error page`);
  }

  fs.writeFileSync(demPath, buffer);
  console.log(`  Saved raw DEM: ${demPath} (${(buffer.length / 1024).toFixed(0)} KB)`);

  return {
    demPath,
    bbox,
    metadata: {
      lat, lon, radiusMeters, resolution,
      widthPx, heightPx,
      source: 'USGS 3DEP',
      fetchedAt: new Date().toISOString()
    }
  };
}

/**
 * Process a raw GeoTIFF DEM into an Unreal-compatible heightmap
 * @param {string} inputPath - Path to raw GeoTIFF
 * @param {string} outputDir - Output directory
 * @param {object} [options]
 * @param {number} [options.targetSize] - Target dimension (will snap to valid Landscape size)
 * @param {string} [options.format] - 'r16' or 'png16' (default: 'r16')
 * @returns {Promise<{ heightmapPath: string, dimensions: {w: number, h: number}, elevation: {min: number, max: number}, scale: {x: number, y: number, z: number} }>}
 */
export async function processDEM(inputPath, outputDir, options = {}) {
  const gdal = await checkGDAL();
  if (!gdal.available) {
    throw new Error('GDAL not found on PATH. Install with: brew install gdal');
  }

  const { format = 'r16' } = options;
  let { targetSize } = options;

  // Step 1: Get info about the input DEM
  const { stdout: infoOut } = await execFileAsync('gdalinfo', ['-json', inputPath]);
  const info = JSON.parse(infoOut);
  const srcWidth = info.size?.[0] || 1000;
  const srcHeight = info.size?.[1] || 1000;

  // Find valid Landscape size
  if (!targetSize) targetSize = Math.max(srcWidth, srcHeight);
  const landscapeSize = nearestLandscapeSize(targetSize);
  console.log(`  Target size: ${landscapeSize}x${landscapeSize} (nearest valid Landscape dimension)`);

  // Step 2: Reproject to UTM and resize to valid Landscape dimensions
  const reprojPath = path.join(outputDir, 'dem_utm.tif');
  // Auto-detect UTM zone from center coordinate
  await execFileAsync('gdalwarp', [
    '-t_srs', 'EPSG:3857',  // Web Mercator (good enough for local areas)
    '-ts', String(landscapeSize), String(landscapeSize),
    '-r', 'bilinear',
    '-ot', 'Float32',
    '-overwrite',
    inputPath,
    reprojPath
  ]);
  console.log(`  Reprojected: ${reprojPath}`);

  // Step 3: Get elevation range for scale calculation
  const { stdout: statsOut } = await execFileAsync('gdalinfo', ['-json', '-stats', reprojPath]);
  const stats = JSON.parse(statsOut);
  const band = stats.bands?.[0];
  const elevMin = band?.minimum ?? band?.computedMin ?? 0;
  const elevMax = band?.maximum ?? band?.computedMax ?? 100;
  const elevRange = elevMax - elevMin;
  console.log(`  Elevation: ${elevMin.toFixed(1)}m – ${elevMax.toFixed(1)}m (range: ${elevRange.toFixed(1)}m)`);

  // Step 4: Convert to output format
  let heightmapPath;

  if (format === 'r16') {
    // R16 = raw 16-bit unsigned integers, little-endian
    // Unreal expects values 0-65535 where midpoint (32768) = sea level
    heightmapPath = path.join(outputDir, 'heightmap.r16');
    const tempPath = path.join(outputDir, 'heightmap_u16.tif');

    // Scale elevation to 0-65535 range
    // Using gdal_translate with -scale to normalize
    await execFileAsync('gdal_translate', [
      '-ot', 'UInt16',
      '-scale', String(elevMin), String(elevMax), '0', '65535',
      '-of', 'GTiff',
      reprojPath,
      tempPath
    ]);

    // Convert to raw R16
    await execFileAsync('gdal_translate', [
      '-of', 'ENVI',
      '-ot', 'UInt16',
      tempPath,
      heightmapPath
    ]);

    // ENVI format produces .r16 header file — rename the data file
    // Actually ENVI produces basename + .hdr; the data file has no extension
    // We need to handle this differently
    const enviDataPath = heightmapPath; // ENVI writes data to the specified path
    if (fs.existsSync(enviDataPath) && !enviDataPath.endsWith('.r16')) {
      fs.renameSync(enviDataPath, heightmapPath);
    }

    // Clean up temp files
    try { fs.unlinkSync(tempPath); } catch {}
    try { fs.unlinkSync(heightmapPath + '.aux.xml'); } catch {}
    try { fs.unlinkSync(path.join(outputDir, 'heightmap.hdr')); } catch {}

    console.log(`  Heightmap: ${heightmapPath} (R16 ${landscapeSize}x${landscapeSize})`);
  } else {
    // PNG16 — 16-bit grayscale PNG
    heightmapPath = path.join(outputDir, 'heightmap.png');
    await execFileAsync('gdal_translate', [
      '-ot', 'UInt16',
      '-scale', String(elevMin), String(elevMax), '0', '65535',
      '-of', 'PNG',
      reprojPath,
      heightmapPath
    ]);
    console.log(`  Heightmap: ${heightmapPath} (PNG16 ${landscapeSize}x${landscapeSize})`);
  }

  // Also produce PNG16 for UE Python import (AssetImportTask can import PNG but not R16)
  const png16Path = path.join(outputDir, 'heightmap_16bit.png');
  if (format === 'r16' && fs.existsSync(reprojPath)) {
    await execFileAsync('gdal_translate', [
      '-ot', 'UInt16',
      '-scale', String(elevMin), String(elevMax), '0', '65535',
      '-of', 'PNG',
      reprojPath,
      png16Path
    ]);
    try { fs.unlinkSync(png16Path + '.aux.xml'); } catch {}
    console.log(`  PNG16 copy: ${png16Path}`);
  } else if (format === 'png16') {
    // Primary output is already PNG16, just copy/rename
    if (heightmapPath !== png16Path) {
      fs.copyFileSync(heightmapPath, png16Path);
    }
  }

  // Clean up reprojected file
  try { fs.unlinkSync(reprojPath); } catch {}
  try { fs.unlinkSync(reprojPath + '.aux.xml'); } catch {}

  // Calculate Unreal scale factors
  // Unreal Landscape: 1 unit = 1 cm. Scale = (real-world meters * 100) / pixels
  // For a square terrain covering radiusMeters*2 on each side:
  const bbox = JSON.parse(fs.readFileSync(path.join(outputDir, 'metadata.json'), 'utf8')).bbox
    || { radiusMeters: 500 };
  const worldSizeMeters = (bbox?.radiusMeters || 500) * 2;
  const scaleXY = (worldSizeMeters * 100) / landscapeSize; // cm per pixel
  const scaleZ = (elevRange * 100) / 65535 * 2; // cm per unit height (×2 because Unreal heightmap is bipolar)

  const result = {
    heightmapPath,
    dimensions: { w: landscapeSize, h: landscapeSize },
    elevation: { min: elevMin, max: elevMax, range: elevRange },
    scale: { x: scaleXY, y: scaleXY, z: Math.max(scaleZ, 1) }
  };

  return result;
}

/**
 * Create a location slug from a location name
 * @param {string} location
 * @returns {string}
 */
export function slugify(location) {
  return location
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
