/**
 * Escape a string so it can be safely passed to the `RegExp` constructor.
 *
 * Escapes characters with special meaning in regex syntax:
 * `^ $ \ . * + ? ( ) [ ] { } |`
 *
 * @param value - The string to escape
 * @returns Regex-safe string
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
