const UTF16_CODE_UNIT_BYTES = 2;
const MIN_ENTRY_COST_BYTES = 1;

export function assertValidCacheByteSize(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

export function assertValidCacheKey(key: unknown): asserts key is string {
  if (typeof key !== 'string') {
    throw new TypeError('cache key must be a string');
  }
}

/** Estimate retained key and value bytes while keeping every entry charge positive. */
export function estimateRetainedEntrySize(key: string, valueSize: number): number {
  assertValidCacheKey(key);
  const retainedSize = Math.max(
    MIN_ENTRY_COST_BYTES,
    key.length * UTF16_CODE_UNIT_BYTES + valueSize,
  );
  return Number.isSafeInteger(retainedSize) ? retainedSize : Number.POSITIVE_INFINITY;
}

export function hasRetainedEntryCapacity(
  currentBytes: number,
  maxBytes: number,
  incomingSize: number,
): boolean {
  return incomingSize <= maxBytes && currentBytes <= maxBytes - incomingSize;
}
