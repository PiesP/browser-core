/**
 * Clamp a number between `min` and `max` (inclusive).
 *
 * @param value - The value to clamp
 * @param min - Minimum bound
 * @param max - Maximum bound
 * @returns The clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Safely clamp an index to valid array bounds.
 * Handles non-finite values and invalid lengths.
 *
 * @param index - Index to validate
 * @param length - Array length
 * @returns Valid index in [0, length-1] or 0 on invalid input
 */
export function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index) || !Number.isSafeInteger(length) || length <= 0) {
    return 0;
  }
  return clamp(Math.floor(index), 0, length - 1);
}
