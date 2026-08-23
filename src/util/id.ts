function tryCreateUuid(): string | null {
  try {
    return crypto.randomUUID();
  } catch {
    return null;
  }
}

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

  return (
    tryCreateUuid() ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${performance.now()}`
  );
}

/**
 * Generate a unique ID by stripping dashes from `crypto.randomUUID()`.
 *
 * Falls back to a timestamp + random suffix when `crypto.randomUUID()`
 * is unavailable.
 *
 * @returns Dash-free unique ID string
 */
export function generateUniqueId(): string {
  const uuid = tryCreateUuid();
  return (
    uuid?.replaceAll('-', '') ??
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  );
}

/**
 * Create a prefixed unique ID.
 *
 * @param prefix - The prefix string
 * @param separator - Separator between prefix and ID (default `'-'`)
 * @returns Prefixed unique ID (e.g. `'btn-a1b2c3'`)
 */
export function createPrefixedId(prefix: string, separator = '-'): string {
  return `${prefix}${separator}${generateUniqueId()}`;
}
