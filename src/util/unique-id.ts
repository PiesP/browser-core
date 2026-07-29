/**
 * Generate a unique ID by stripping dashes from `crypto.randomUUID()`.
 *
 * Falls back to a timestamp + random suffix when `crypto.randomUUID()`
 * is unavailable (§ L17).
 *
 * @returns Dash-free unique ID string
 */
export function generateUniqueId(): string {
  try {
    return crypto.randomUUID().replaceAll('-', '');
  } catch {
    // L17: Fallback for non-secure contexts
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
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
