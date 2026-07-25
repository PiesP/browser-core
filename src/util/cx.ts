/**
 * Class name composer — clsx-style utility.
 *
 * Accepts strings, arrays, and conditional objects.
 * Falsy values, empty strings, and `undefined` members are silently dropped.
 *
 * @param args - Any number of class name arguments
 * @returns Joined class name string
 *
 * @example
 * ```ts
 * cx('foo', 'bar')                     // 'foo bar'
 * cx('foo', false && 'bar')            // 'foo'
 * cx('foo', ['bar', { baz: true }])    // 'foo bar baz'
 * cx({ foo: true, bar: false })        // 'foo'
 * ```
 */
export function cx(...args: unknown[]): string {
  const out: string[] = [];

  for (const arg of args) {
    if (!arg) continue;

    if (typeof arg === 'string') {
      out.push(arg);
      continue;
    }

    if (Array.isArray(arg)) {
      const nested = cx(...arg);
      if (nested) out.push(nested);
      continue;
    }

    if (typeof arg === 'object') {
      for (const [key, value] of Object.entries(arg as Record<string, unknown>)) {
        if (value) out.push(key);
      }
    }
  }

  return out.join(' ');
}
