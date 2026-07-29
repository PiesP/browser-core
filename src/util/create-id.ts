/**
 * Generate a collision-resistant UUID.
 *
 * Uses `crypto.randomUUID()` in modern browsers and Node.js 19+.
 * Accepts an optional `seed` parameter for determinism in tests.
 * Falls back to timestamp + random when `crypto.randomUUID()` is unavailable.
 *
 * @param seed - Optional deterministic seed (returned as-is for testability)
 * @returns A unique ID string
 */
export function createId(seed?: string): string {
  if (seed !== undefined) return seed;
  try {
    return crypto.randomUUID();
  } catch {
    // L8: Fallback for non-secure contexts where crypto.randomUUID() throws
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${performance.now()}`;
  }
}
