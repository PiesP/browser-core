/**
 * Class name composer — clsx-style utility.
 *
 * Accepts strings, arrays, and conditional objects.
 * Falsy values, empty strings, and `undefined` members are silently dropped.
 * Cyclic array references are skipped, and oversized input graphs throw a
 * `RangeError` after a bounded number of processed values.
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
const MAX_CLASS_VALUE_NODES = 10_000;

type TraversalFrame =
  | { readonly kind: 'value'; readonly value: unknown }
  | { readonly kind: 'array-exit'; readonly array: unknown[] };

export function cx(...args: unknown[]): string {
  const out: string[] = [];
  const activeArrays = new Set<unknown[]>();
  const stack: TraversalFrame[] = [];
  let processedNodes = 0;
  let pendingValueFrames = 0;

  if (args.length > MAX_CLASS_VALUE_NODES) {
    throw new RangeError(`cx input exceeds ${MAX_CLASS_VALUE_NODES} processed values`);
  }

  for (let index = args.length - 1; index >= 0; index--) {
    stack.push({ kind: 'value', value: args[index] });
    pendingValueFrames++;
  }

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) break;
    if (frame.kind === 'array-exit') {
      activeArrays.delete(frame.array);
      continue;
    }

    pendingValueFrames--;
    processedNodes++;
    if (processedNodes > MAX_CLASS_VALUE_NODES) {
      throw new RangeError(`cx input exceeds ${MAX_CLASS_VALUE_NODES} processed values`);
    }

    const arg = frame.value;
    if (!arg) continue;

    if (typeof arg === 'string') {
      out.push(arg);
      continue;
    }

    if (Array.isArray(arg)) {
      if (activeArrays.has(arg)) continue;
      const arrayLength = arg.length;
      if (
        !Number.isSafeInteger(arrayLength) ||
        arrayLength < 0 ||
        processedNodes + pendingValueFrames + arrayLength >
        MAX_CLASS_VALUE_NODES
      ) {
        throw new RangeError(`cx input exceeds ${MAX_CLASS_VALUE_NODES} processed values`);
      }

      activeArrays.add(arg);
      stack.push({ kind: 'array-exit', array: arg });
      for (let index = arrayLength - 1; index >= 0; index--) {
        stack.push({ kind: 'value', value: arg[index] });
        pendingValueFrames++;
      }
      continue;
    }

    if (typeof arg === 'object') {
      const record = arg as Record<string, unknown>;
      const ownStringKeys = Reflect.ownKeys(record).filter(
        (key): key is string => typeof key === 'string',
      );
      if (processedNodes + ownStringKeys.length > MAX_CLASS_VALUE_NODES) {
        throw new RangeError(`cx input exceeds ${MAX_CLASS_VALUE_NODES} processed values`);
      }
      processedNodes += ownStringKeys.length;
      for (const key of ownStringKeys) {
        if (!Object.prototype.propertyIsEnumerable.call(record, key)) continue;
        if (record[key]) out.push(key);
      }
    }
  }

  return out.join(' ');
}
