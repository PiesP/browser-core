import { beforeEach, describe, expect, it } from 'vite-plus/test';
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
    expect(cache.size).toBe(0);
    expect(cache.currentBytes).toBe(0);
    expect(cache.maxBytes).toBe(100);
    expect(cache.set('key', 'hello')).toBe(true);
    expect(cache.get('key')).toBe('hello');
    expect(cache.size).toBe(1);
    expect(cache.currentBytes).toBe(11);
  });

  it.each(['get', 'touch'] as const)('promotes entries with %s before byte-limit eviction', (access) => {
    cache.set('a', 'a'.repeat(40));
    cache.set('b', 'b'.repeat(40));
    cache[access]('a');
    cache.set('c', 'c'.repeat(40));

    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(true);
    expect(cache.currentBytes).toBe(84);
  });

  it('leaves accounting and recency unchanged for lookups and missing-key operations', () => {
    cache.set('a', 'a'.repeat(40));
    cache.set('b', 'b'.repeat(40));

    expect(cache.has('a')).toBe(true);
    expect(cache.has('missing')).toBe(false);
    expect(cache.get('missing')).toBeUndefined();
    expect(cache.take('missing')).toBeUndefined();
    expect(cache.delete('missing')).toBe(false);
    cache.touch('missing');
    expect(cache.size).toBe(2);
    expect(cache.currentBytes).toBe(84);

    cache.set('c', 'c'.repeat(40));
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(true);
    expect(cache.has('c')).toBe(true);
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
    expect(replacementCache.currentBytes).toBe(17);
    expect(evicted).toEqual(['old']);
  });

  it('does not dispose a resource that remains stored after re-registration', () => {
    const resource = { bytes: 16, cleanupCalls: 0 };
    const resourceCache = new ResizableByteLimitedCache(
      1024,
      (value: typeof resource) => value.bytes,
      (value) => { value.cleanupCalls++; },
    );

    resourceCache.set('image', resource);
    resourceCache.set('image', resource);

    expect(resourceCache.get('image')).toBe(resource);
    expect(resource.cleanupCalls).toBe(0);
  });

  it('rejects a cross-key resource alias without cleaning its owner', () => {
    const resource = { bytes: 16, cleanupCalls: 0 };
    const resourceCache = new ResizableByteLimitedCache(
      1024,
      (value: typeof resource) => value.bytes,
      (value) => { value.cleanupCalls++; },
    );
    resourceCache.set('image', resource);

    expect(() => resourceCache.set('alias', resource)).toThrow(/already owned/);
    expect(resourceCache.has('alias')).toBe(false);
    expect(resourceCache.get('image')).toBe(resource);
    expect(resourceCache.currentBytes).toBe(26);
    expect(resource.cleanupCalls).toBe(0);
    resourceCache.delete('image');
    expect(resource.cleanupCalls).toBe(1);
  });

  it.each([32, -1, Number.NaN, Number.POSITIVE_INFINITY, 4096])(
    'retains insertion-time accounting when a registered resource estimate becomes %s',
    (updatedBytes) => {
      const resource = { bytes: 16, cleanupCalls: 0 };
      let estimates = 0;
      const resourceCache = new ResizableByteLimitedCache(
        1024,
        (value: typeof resource) => { estimates++; return value.bytes; },
        (value) => { value.cleanupCalls++; },
      );
      resourceCache.set('image', resource);
      resource.bytes = updatedBytes;

      expect(resourceCache.set('image', resource)).toBe(true);
      expect(estimates).toBe(1);
      expect(resourceCache.currentBytes).toBe(26);
      expect(resource.cleanupCalls).toBe(0);
    },
  );

  it('promotes same-reference re-registration before entry-limit eviction', () => {
    const first = { bytes: 16, cleanupCalls: 0 };
    const second = { bytes: 16, cleanupCalls: 0 };
    const third = { bytes: 16, cleanupCalls: 0 };
    const resourceCache = new ResizableByteLimitedCache(
      1024,
      (value: typeof first) => value.bytes,
      (value) => { value.cleanupCalls++; },
      2,
    );
    resourceCache.set('first', first);
    resourceCache.set('second', second);
    resourceCache.set('first', first);
    resourceCache.set('third', third);

    expect(resourceCache.has('first')).toBe(true);
    expect(resourceCache.has('second')).toBe(false);
    expect(resourceCache.has('third')).toBe(true);
    expect(first.cleanupCalls).toBe(0);
    expect(second.cleanupCalls).toBe(1);
    expect(third.cleanupCalls).toBe(0);
  });

  it('rejects an alias before estimation or replacement of its target key', () => {
    const first = { bytes: 16, cleanupCalls: 0 };
    const second = { bytes: 16, cleanupCalls: 0 };
    let estimates = 0;
    const resourceCache = new ResizableByteLimitedCache(
      1024,
      (value: typeof first) => { estimates++; return value.bytes; },
      (value) => { value.cleanupCalls++; },
    );
    resourceCache.set('', first);
    resourceCache.set('second', second);
    first.bytes = Number.NaN;

    expect(() => resourceCache.set('second', first)).toThrow(TypeError);
    expect(resourceCache.get('')).toBe(first);
    expect(resourceCache.get('second')).toBe(second);
    expect(resourceCache.currentBytes).toBe(44);
    expect(estimates).toBe(2);
    expect(first.cleanupCalls).toBe(0);
    expect(second.cleanupCalls).toBe(0);
  });

  it.each([16, 4096, Number.NaN])(
    'releases ownership on take and re-estimates %s bytes on reinsertion',
    (updatedBytes) => {
      const resource = { bytes: 16, cleanupCalls: 0 };
      const resourceCache = new ResizableByteLimitedCache(
        1024,
        (value: typeof resource) => value.bytes,
        (value) => { value.cleanupCalls++; },
      );
      resourceCache.set('image', resource);
      expect(resourceCache.take('image')).toBe(resource);
      expect(resourceCache.currentBytes).toBe(0);
      expect(resource.cleanupCalls).toBe(0);
      resource.bytes = updatedBytes;

      if (Number.isNaN(updatedBytes)) {
        expect(() => resourceCache.set('new', resource)).toThrow(RangeError);
        expect(resource.cleanupCalls).toBe(0);
        resource.bytes = 16;
        expect(resourceCache.set('new', resource)).toBe(true);
      } else {
        expect(resourceCache.set('new', resource)).toBe(updatedBytes === 16);
        expect(resource.cleanupCalls).toBe(updatedBytes === 16 ? 0 : 1);
      }
    },
  );

  it.each(['delete', 'evict', 'resize', 'clear'] as const)(
    'cleans resource values exactly once on %s',
    (removal) => {
      const resource = { bytes: 16, cleanupCalls: 0 };
      const replacement = { bytes: 16, cleanupCalls: 0 };
      const resourceCache = new ResizableByteLimitedCache(
        1024,
        (value: typeof resource) => value.bytes,
        (value) => { value.cleanupCalls++; },
        1,
      );
      resourceCache.set('image', resource);
      if (removal === 'delete') resourceCache.delete('image');
      if (removal === 'evict') resourceCache.set('new', replacement);
      if (removal === 'resize') resourceCache.resize(0);
      if (removal === 'clear') resourceCache.clear();
      resourceCache.clear();
      resourceCache.clear();
      expect(resource.cleanupCalls).toBe(1);
      expect(resourceCache.size).toBe(0);
      expect(resourceCache.currentBytes).toBe(0);
    },
  );

  it('preserves distinct resource replacement and oversized rejection ownership', () => {
    const first = { bytes: 16, cleanupCalls: 0 };
    const replacement = { bytes: 20, cleanupCalls: 0 };
    const oversized = { bytes: 2048, cleanupCalls: 0 };
    const resourceCache = new ResizableByteLimitedCache(
      1024,
      (value: typeof first) => value.bytes,
      (value) => { value.cleanupCalls++; },
    );
    resourceCache.set('image', first);
    expect(resourceCache.set('image', replacement)).toBe(true);
    expect(first.cleanupCalls).toBe(1);
    expect(resourceCache.set('image', oversized)).toBe(false);
    expect(resourceCache.get('image')).toBe(replacement);
    expect(resourceCache.currentBytes).toBe(30);
    expect(replacement.cleanupCalls).toBe(0);
    expect(oversized.cleanupCalls).toBe(1);
    expect(() => resourceCache.set('alias', replacement)).toThrow(/already owned/);
  });

  it('keeps an incoming resource owned when replaced-value cleanup throws', () => {
    const first = { bytes: 16 };
    const incoming = { bytes: 16 };
    const failure = new Error('cleanup failed');
    const resourceCache = new ResizableByteLimitedCache(
      1024,
      (value: typeof first) => value.bytes,
      () => { throw failure; },
    );
    resourceCache.set('image', first);
    expect(() => resourceCache.set('image', incoming)).toThrow(failure);
    expect(resourceCache.get('image')).toBe(incoming);
    expect(() => resourceCache.set('alias', incoming)).toThrow(/already owned/);
    expect(resourceCache.take('image')).toBe(incoming);
    expect(resourceCache.set('new', incoming)).toBe(true);
  });

  it('protects every pending resource from re-entrant registration during clear', () => {
    const first = { bytes: 16 };
    const second = { bytes: 16 };
    const fresh = { bytes: 16 };
    const cleaned: object[] = [];
    const resourceCache = new ResizableByteLimitedCache(
      1024,
      (value: typeof first) => value.bytes,
      (value) => {
        cleaned.push(value);
        if (value === first) {
          expect(resourceCache.size).toBe(0);
          expect(() => resourceCache.set('first-again', first)).toThrow(/awaiting/);
          expect(() => resourceCache.set('second-again', second)).toThrow(/awaiting/);
          resourceCache.set('fresh', fresh);
          throw new Error('first cleanup failed');
        }
      },
    );
    resourceCache.set('first', first);
    resourceCache.set('second', second);

    expect(() => resourceCache.clear()).toThrow('first cleanup failed');
    expect(cleaned).toEqual([first, second]);
    expect(resourceCache.get('fresh')).toBe(fresh);
    expect(resourceCache.currentBytes).toBe(26);
    expect(() => resourceCache.set('alias', fresh)).toThrow(/already owned/);
    resourceCache.clear();
    expect(cleaned).toEqual([first, second, fresh]);
  });

  it('supports nested cleanup that replaces the newly installed resource', () => {
    const first = { bytes: 16 };
    const incoming = { bytes: 16 };
    const nested = { bytes: 16 };
    const cleaned: object[] = [];
    const resourceCache = new ResizableByteLimitedCache(
      1024,
      (value: typeof first) => value.bytes,
      (value) => {
        cleaned.push(value);
        if (value === first) resourceCache.set('image', nested);
      },
    );
    resourceCache.set('image', first);
    resourceCache.set('image', incoming);
    expect(cleaned).toEqual([first, incoming]);
    expect(resourceCache.get('image')).toBe(nested);
    expect(() => resourceCache.set('alias', nested)).toThrow(/already owned/);
    expect(resourceCache.currentBytes).toBe(26);
  });

  it('protects a capacity-rejected resource during its cleanup callback', () => {
    const resource = { bytes: 16 };
    let cleanupCalls = 0;
    const resourceCache = new ResizableByteLimitedCache(
      0,
      (value: typeof resource) => value.bytes,
      (value) => {
        cleanupCalls++;
        resourceCache.resize(1024);
        expect(() => resourceCache.set('again', value)).toThrow(/awaiting/);
      },
    );
    expect(resourceCache.set('image', resource)).toBe(false);
    expect(cleanupCalls).toBe(1);
    expect(resourceCache.size).toBe(0);
  });

  it('applies exclusive ownership to function resources', () => {
    const resource = (): void => undefined;
    let cleanupCalls = 0;
    const resourceCache = new ResizableByteLimitedCache(1024, () => 16, () => { cleanupCalls++; });
    resourceCache.set('image', resource);
    resourceCache.set('image', resource);
    expect(() => resourceCache.set('alias', resource)).toThrow(/already owned/);
    expect(cleanupCalls).toBe(0);
    resourceCache.clear();
    expect(cleanupCalls).toBe(1);
  });

  it.each(['repeat', null, 0, false])('preserves repeated primitive value %s with cleanup', (value) => {
    const cleaned: unknown[] = [];
    const valueCache = new ResizableByteLimitedCache(1024, () => 1, (entry) => { cleaned.push(entry); });
    valueCache.set('a', value);
    valueCache.set('a', value);
    valueCache.set('b', value);
    expect(valueCache.size).toBe(2);
    expect(cleaned).toEqual([value]);
    valueCache.clear();
    expect(cleaned).toEqual([value, value, value]);
  });

  it('allows object aliases and refreshes estimates without a cleanup callback', () => {
    const resource = { bytes: 16 };
    const valueCache = new ResizableByteLimitedCache(1024, (value: typeof resource) => value.bytes);
    valueCache.set('a', resource);
    resource.bytes = 32;
    valueCache.set('a', resource);
    valueCache.set('b', resource);
    expect(valueCache.currentBytes).toBe(68);
    valueCache.delete('a');
    expect(valueCache.get('b')).toBe(resource);
    expect(valueCache.currentBytes).toBe(34);
  });

  it('rejects a value that cannot fit and releases it', () => {
    const evicted: string[] = [];
    const limitedCache = new ResizableByteLimitedCache<string>(
      13,
      estimateSize,
      (value) => evicted.push(value),
    );

    expect(limitedCache.set('large', 'too large')).toBe(false);
    expect(limitedCache.has('large')).toBe(false);
    expect(limitedCache.currentBytes).toBe(0);
    expect(evicted).toEqual(['too large']);
  });

  it('rejects an oversized value without evicting existing entries', () => {
    const evicted: string[] = [];
    const limitedCache = new ResizableByteLimitedCache<string>(
      13,
      estimateSize,
      (value) => evicted.push(value),
    );
    limitedCache.set('small', 'old');

    expect(limitedCache.set('large', 'too large')).toBe(false);
    expect(limitedCache.get('small')).toBe('old');
    expect(limitedCache.currentBytes).toBe(13);
    expect(evicted).toEqual(['too large']);
  });

  it('keeps an existing value when its oversized replacement is rejected', () => {
    const evicted: string[] = [];
    const limitedCache = new ResizableByteLimitedCache<string>(
      9,
      estimateSize,
      (value) => evicted.push(value),
    );
    limitedCache.set('key', 'old');

    expect(limitedCache.set('key', 'too large')).toBe(false);
    expect(limitedCache.get('key')).toBe('old');
    expect(limitedCache.currentBytes).toBe(9);
    expect(evicted).toEqual(['too large']);
  });

  it.each([
    { maxEntries: 2, expectedSize: 2, retainsOldest: false },
    { maxEntries: Number.POSITIVE_INFINITY, expectedSize: 3, retainsOldest: true },
  ])('enforces an optional entry limit of $maxEntries', ({ maxEntries, expectedSize, retainsOldest }) => {
    const limitedCache = new ResizableByteLimitedCache<string>(
      100,
      estimateSize,
      undefined,
      maxEntries,
    );
    limitedCache.set('a', '1');
    limitedCache.set('b', '2');
    limitedCache.set('c', '3');

    expect(limitedCache.size).toBe(expectedSize);
    expect(limitedCache.has('a')).toBe(retainsOldest);
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

  it('retains values and their recency when the byte budget grows', () => {
    const evicted: string[] = [];
    const growingCache = new ResizableByteLimitedCache<string>(
      100,
      estimateSize,
      (value) => evicted.push(value),
    );
    growingCache.set('a', 'a'.repeat(40));
    growingCache.set('b', 'b'.repeat(40));
    growingCache.get('a');

    growingCache.resize(126);
    expect(growingCache.maxBytes).toBe(126);
    expect(growingCache.currentBytes).toBe(84);
    expect(growingCache.size).toBe(2);
    expect(evicted).toEqual([]);

    growingCache.set('c', 'c'.repeat(40));
    growingCache.set('d', 'd'.repeat(40));
    expect(growingCache.has('b')).toBe(false);
    expect(growingCache.has('a')).toBe(true);
    expect(growingCache.has('c')).toBe(true);
    expect(growingCache.has('d')).toBe(true);
    expect(evicted).toEqual(['b'.repeat(40)]);
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
    const evicted: string[] = [];
    const clearedCache = new ResizableByteLimitedCache<string>(
      100,
      estimateSize,
      (value) => {
        callbackSize = clearedCache.size;
        evicted.push(value);
      },
    );
    clearedCache.set('a', 'one');
    clearedCache.set('b', 'two');

    clearedCache.clear();

    expect(callbackSize).toBe(0);
    expect(clearedCache.currentBytes).toBe(0);
    expect(clearedCache.has('a')).toBe(false);
    expect(clearedCache.has('b')).toBe(false);
    expect(evicted).toEqual(['one', 'two']);
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
    const throwingCache = new ResizableByteLimitedCache<string>(11, estimateSize, () => {
      throw new Error('cleanup failed');
    });
    throwingCache.set('key', 'value');

    expect(() => throwingCache.delete('key')).toThrow('cleanup failed');
    expect(throwingCache.has('key')).toBe(false);
    expect(throwingCache.currentBytes).toBe(0);
    expect(throwingCache.set('next', 'new')).toBe(true);
    expect(throwingCache.currentBytes).toBe(11);
  });

  it('preserves a re-entrant replacement and its byte accounting', () => {
    let replacementCache!: ResizableByteLimitedCache<string>;
    replacementCache = new ResizableByteLimitedCache<string>(100, estimateSize, (value) => {
      if (value === 'old') replacementCache.set('key', 'callback');
    });
    replacementCache.set('key', 'old');

    replacementCache.set('key', 'outer');

    expect(replacementCache.get('key')).toBe('callback');
    expect(replacementCache.size).toBe(1);
    expect(replacementCache.currentBytes).toBe(14);
  });

  it('attempts every clear cleanup before rethrowing the first error', () => {
    const cleaned: string[] = [];
    const throwingCache = new ResizableByteLimitedCache<string>(100, estimateSize, (value) => {
      cleaned.push(value);
      if (value === 'one') throw new Error('first cleanup failed');
    });
    throwingCache.set('a', 'one');
    throwingCache.set('b', 'two');

    expect(() => throwingCache.clear()).toThrow('first cleanup failed');
    expect(cleaned).toEqual(['one', 'two']);
    expect(throwingCache.size).toBe(0);
    expect(throwingCache.currentBytes).toBe(0);
  });

  it('uses the insertion-time size when cleanup mutates a value', () => {
    const first = { bytes: 60 };
    const second = { bytes: 60 };
    const third = { bytes: 40 };
    const mutationCache = new ResizableByteLimitedCache<{ bytes: number }>(
      122,
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
    expect(mutationCache.currentBytes).toBe(122);
  });

  it('bounds distinct keys when values have a zero-byte estimate', () => {
    const limitedCache = new ResizableByteLimitedCache<string>(32, () => 0);

    for (let index = 0; index < 100; index++) {
      limitedCache.set(`key-${index}`, '');
    }

    expect(limitedCache.currentBytes).toBeLessThanOrEqual(limitedCache.maxBytes);
    expect(limitedCache.size).toBeLessThan(100);
    expect(limitedCache.get('key-99')).toBe('');
  });

  it('rejects an oversized key without disturbing existing entries', () => {
    const evicted: string[] = [];
    const limitedCache = new ResizableByteLimitedCache<string>(
      10,
      estimateSize,
      (value) => evicted.push(value),
    );
    limitedCache.set('a', '1234');

    expect(limitedCache.set('attacker-controlled-long-key', '')).toBe(false);
    expect(limitedCache.get('a')).toBe('1234');
    expect(limitedCache.has('attacker-controlled-long-key')).toBe(false);
    expect(limitedCache.currentBytes).toBe(6);
    expect(evicted).toEqual(['']);
  });

  it('rejects a derived entry cost outside the safe-integer range', () => {
    const limitedCache = new ResizableByteLimitedCache<string>(
      Number.MAX_SAFE_INTEGER,
      () => Number.MAX_SAFE_INTEGER,
    );

    expect(limitedCache.set('a', 'value')).toBe(false);
    expect(limitedCache.size).toBe(0);
    expect(limitedCache.currentBytes).toBe(0);
  });

  it.each([
    { label: 'object', key: { length: 0, retained: Array.from({ length: 1_000 }, () => 'value') } },
    { label: 'boxed string', key: new String('key') },
    { label: 'function', key: (): void => undefined },
  ])('rejects a non-string runtime $label key before mutation', ({ key }) => {
    const evicted: string[] = [];
    let estimateCalls = 0;
    const limitedCache = new ResizableByteLimitedCache<string>(
      100,
      (value) => {
        estimateCalls++;
        return estimateSize(value);
      },
      (value) => evicted.push(value),
    );
    const setWithUnknownKey = limitedCache.set.bind(limitedCache) as (
      unsafeKey: unknown,
      value: string,
    ) => boolean;

    expect(() => setWithUnknownKey(key, 'value')).toThrow(TypeError);
    expect(limitedCache.size).toBe(0);
    expect(limitedCache.currentBytes).toBe(0);
    expect(evicted).toEqual([]);
    expect(estimateCalls).toBe(0);
  });

  it.each([
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    Number.MAX_VALUE,
    Number.POSITIVE_INFINITY,
    Number.NaN,
  ])(
    'rejects invalid maxBytes %s',
    (maxBytes) => {
      expect(() => new ResizableByteLimitedCache(maxBytes, estimateSize)).toThrow(RangeError);
      expect(() => cache.resize(maxBytes)).toThrow(RangeError);
    },
  );

  it.each([-1, Number.NaN, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.MAX_VALUE])(
    'rejects invalid maxEntries %s',
    (maxEntries) => {
      expect(
        () => new ResizableByteLimitedCache(100, estimateSize, undefined, maxEntries),
      ).toThrow(RangeError);
    },
  );

  it.each([
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    Number.MAX_VALUE,
    Number.POSITIVE_INFINITY,
    Number.NaN,
  ])(
    'rejects invalid estimated size %s',
    (estimatedSize) => {
      const invalidCache = new ResizableByteLimitedCache<string>(100, () => estimatedSize);

      expect(() => invalidCache.set('key', 'value')).toThrow(RangeError);
      expect(invalidCache.size).toBe(0);
    },
  );
});
