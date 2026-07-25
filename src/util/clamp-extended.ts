import { clamp } from './clamp.js';

/**
 * Soft-clamp a value: allow it to overshoot `min` or `max` by `tolerance`
 * before snapping back to the boundary.
 *
 * Useful for smooth-scroll and drag interactions where brief overshoot
 * feels natural but values should eventually settle inside `[min, max]`.
 *
 * @param value - The value to soft-clamp
 * @param min - Lower bound
 * @param max - Upper bound
 * @param tolerance - Allowed overshoot on each side
 * @returns Soft-clamped value
 *
 * @example
 * ```ts
 * clampSoft(110, 0, 100, 15); // 100 (snapped)
 * clampSoft(108, 0, 100, 15); // 108 (within tolerance)
 * clampSoft(-5, 0, 100, 15);  // 0 (snapped)
 * ```
 */
export function clampSoft(
  value: number,
  min: number,
  max: number,
  tolerance: number,
): number {
  if (value < min - tolerance) return min;
  if (value > max + tolerance) return max;
  return clamp(value, min, max);
}

/**
 * Clamp a value and return a `[clampedValue, didClamp]` tuple so callers
 * can detect whether clamping was applied.
 *
 * @param value - The value to clamp
 * @param min - Minimum bound
 * @param max - Maximum bound
 * @returns `[clampedValue, didClamp]` — `didClamp` is `true` when the
 *          original value was outside `[min, max]`
 *
 * @example
 * ```ts
 * const [v, clamped] = clampMinmax(150, 0, 100);
 * // v = 100, clamped = true
 * ```
 */
export function clampMinmax(
  value: number,
  min: number,
  max: number,
): [number, boolean] {
  const clamped = clamp(value, min, max);
  return [clamped, clamped !== value];
}
