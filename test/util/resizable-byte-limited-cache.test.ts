import { beforeEach, describe, expect, it } from 'vitest';
import { ResizableByteLimitedCache } from '../../src/util/resizable-byte-limited-cache.js';

function estimateSize(value: string): number {
  return value.length;
}

describe('ResizableByteLimitedCache', () => {
  let cache: ResizableByteLimitedCache<string>;

  beforeEach(() => {
    cache = new ResizableByteLimitedCache(100, estimateSize);
  });

  it('stores, retrieves, and accounts for values', () => {
    expect(cache.set('key', 'hello')).toBe(true);
    expect(cache.get('key')).toBe('hello');
    expect(cache.size).toBe(1);
    expect(cache.currentBytes).toBe(5);
  });

  it('evicts least-recently-used entries when the byte limit is exceeded', () => {
    cache.set('a', 'a'.repeat(40));
    cache.set('b', 'b'.repeat(40));
    cache.get('a');
    cache.set('c', 'c'.repeat(40));

    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(true);
    expect(cache.currentBytes).toBe(80);
  });

  it('releases the previous value when replacing an entry', () => {
    const evicted: string[] = [];
    const replacementCache = new ResizableByteLimitedCache<string>(
      100,
      estimateSize,
      (value) => evicted.push(value),
    );
    replacementCache.set('key', 'old');

    expect(replacementCache.set('key', 'replacement')).toBe(true);
    expect(replacementCache.get('key')).toBe('replacement');
    expect(replacementCache.currentBytes).toBe(11);
    expect(evicted).toEqual(['old']);
  });

  it('rejects a value that cannot fit and releases it', () => {
    const evicted: string[] = [];
    const limitedCache = new ResizableByteLimitedCache<string>(
      5,
      estimateSize,
      (value) => evicted.push(value),
    );

    expect(limitedCache.set('large', 'too large')).toBe(false);
    expect(limitedCache.has('large')).toBe(false);
    expect(limitedCache.currentBytes).toBe(0);
    expect(evicted).toEqual(['too large']);
  });

  it('enforces the optional entry limit independently of bytes', () => {
    const limitedCache = new ResizableByteLimitedCache<string>(
      100,
      estimateSize,
      undefined,
      2,
    );
    limitedCache.set('a', '1');
    limitedCache.set('b', '2');
    limitedCache.set('c', '3');

    expect(limitedCache.size).toBe(2);
    expect(limitedCache.has('a')).toBe(false);
  });

  it('shrinks at runtime and evicts the oldest entries', () => {
    const evicted: string[] = [];
    const resizableCache = new ResizableByteLimitedCache<string>(
      100,
      estimateSize,
      (value) => evicted.push(value),
    );
    resizableCache.set('a', 'a'.repeat(40));
    resizableCache.set('b', 'b'.repeat(40));

    resizableCache.resize(50);

    expect(resizableCache.maxBytes).toBe(50);
    expect(resizableCache.has('a')).toBe(false);
    expect(resizableCache.has('b')).toBe(true);
    expect(evicted).toEqual(['a'.repeat(40)]);
  });

  it('transfers ownership with take without invoking cleanup', () => {
    const evicted: string[] = [];
    const ownedCache = new ResizableByteLimitedCache<string>(
      100,
      estimateSize,
      (value) => evicted.push(value),
    );
    ownedCache.set('key', 'value');

    expect(ownedCache.take('key')).toBe('value');
    expect(ownedCache.currentBytes).toBe(0);
    expect(evicted).toEqual([]);
  });

  it('clears state before invoking cleanup callbacks', () => {
    let callbackSize = -1;
    const clearedCache = new ResizableByteLimitedCache<string>(
      100,
      estimateSize,
      () => {
        callbackSize = clearedCache.size;
      },
    );
    clearedCache.set('a', 'one');
    clearedCache.set('b', 'two');

    clearedCache.clear();

    expect(callbackSize).toBe(0);
    expect(clearedCache.currentBytes).toBe(0);
  });

  it('removes state before invoking a re-entrant deletion callback', () => {
    let callbackSawEntry = true;
    const deletionCache = new ResizableByteLimitedCache<string>(
      100,
      estimateSize,
      () => {
        callbackSawEntry = deletionCache.has('key');
      },
    );
    deletionCache.set('key', 'value');

    expect(deletionCache.delete('key')).toBe(true);
    expect(callbackSawEntry).toBe(false);
  });

  it('keeps accounting consistent when cleanup throws', () => {
    const throwingCache = new ResizableByteLimitedCache<string>(5, estimateSize, () => {
      throw new Error('cleanup failed');
    });
    throwingCache.set('key', 'value');

    expect(() => throwingCache.delete('key')).toThrow('cleanup failed');
    expect(throwingCache.has('key')).toBe(false);
    expect(throwingCache.currentBytes).toBe(0);
  });

  it('uses the insertion-time size when cleanup mutates a value', () => {
    const first = { bytes: 60 };
    const second = { bytes: 60 };
    const third = { bytes: 40 };
    const mutationCache = new ResizableByteLimitedCache<{ bytes: number }>(
      100,
      (value) => value.bytes,
      (value) => {
        value.bytes = 0;
      },
    );

    mutationCache.set('first', first);
    mutationCache.set('second', second);
    mutationCache.set('third', third);

    expect(mutationCache.has('second')).toBe(true);
    expect(mutationCache.has('third')).toBe(true);
    expect(mutationCache.currentBytes).toBe(100);
  });

  it.each([-1, Number.POSITIVE_INFINITY, Number.NaN])(
    'rejects invalid maxBytes %s',
    (maxBytes) => {
      expect(() => new ResizableByteLimitedCache(maxBytes, estimateSize)).toThrow(RangeError);
      expect(() => cache.resize(maxBytes)).toThrow(RangeError);
    },
  );

  it.each([-1, Number.NaN, 1.5])('rejects invalid maxEntries %s', (maxEntries) => {
    expect(
      () => new ResizableByteLimitedCache(100, estimateSize, undefined, maxEntries),
    ).toThrow(RangeError);
  });

  it.each([-1, Number.POSITIVE_INFINITY, Number.NaN])(
    'rejects invalid estimated size %s',
    (estimatedSize) => {
      const invalidCache = new ResizableByteLimitedCache<string>(100, () => estimatedSize);

      expect(() => invalidCache.set('key', 'value')).toThrow(RangeError);
      expect(invalidCache.size).toBe(0);
    },
  );
});
