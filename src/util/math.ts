/**
 * Compute the percentage of `current` relative to `total`.
 *
 * Returns `0` when `total` is zero or negative to avoid division-by-zero
 * and nonsensical results.
 *
 * @param current - The current value (numerator)
 * @param total - The total value (denominator)
 * @returns Percentage as a number (0–100)
 */
export function computePercentage(current: number, total: number): number {
  if (total <= 0) return 0;
  return (current / total) * 100;
}
