/**
 * Escape a string so it can be safely embedded in a `RegExp` literal.
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
