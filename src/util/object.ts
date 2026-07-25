/**
 * Resolve a dot-delimited path against a nested object and return the
 * value at that path. Returns `undefined` when any segment is missing
 * or when the input is not a record.
 *
 * @param obj - The source object
 * @param path - Dot-separated path (e.g. `'a.b.c'`)
 * @returns The value at the path, or `undefined`
 *
 * @example
 * ```ts
 * resolveNestedPath({ a: { b: 42 } }, 'a.b') // 42
 * resolveNestedPath({ a: { b: 42 } }, 'a.x') // undefined
 * resolveNestedPath(null, 'a.b')             // undefined
 * ```
 */
export function resolveNestedPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;

  const segments = path.split('.');
  let current: unknown = obj;

  for (const segment of segments) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}
