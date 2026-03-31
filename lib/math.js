/**
 * Shared math utilities for interpolation and deterministic randomness
 */

/**
 * Linear interpolation between two values
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Interpolate angles (handles wraparound at 360)
 */
export function lerpAngle(a, b, t) {
  let diff = b - a;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return ((a + diff * t) + 360) % 360;
}

/**
 * Deterministic pseudo-random number generator (Knuth multiplicative hash).
 * Same seed always produces the same result. No Math.random().
 * @param {number} seed - Integer seed
 * @returns {number} Value in [0, 1)
 */
const SEED_MULTIPLIER = 2654435761;
export function seededRandom(seed) {
  let s = (seed * SEED_MULTIPLIER) >>> 0;
  s = ((s >>> 16) ^ s) * 0x45d9f3b;
  s = ((s >>> 16) ^ s) * 0x45d9f3b;
  s = (s >>> 16) ^ s;
  return (s & 0x7fffffff) / 0x7fffffff;
}
