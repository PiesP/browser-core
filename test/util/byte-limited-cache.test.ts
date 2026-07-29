import { describe, expect, it } from 'vitest';
import { ByteLimitedCache } from '../../src/util/byte-limited-cache.js';

describe('ByteLimitedCache', () => {
  it('stores and retrieves values', () => {
    const cache = new ByteLimitedCache<string>({
      maxBytes: 100,
      estimateSize: (v) => v.length,
    });
    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');
  });

  it('returns undefined for missing keys', () => {
    const cache = new ByteLimitedCache<string>({
      maxBytes: 100,
      estimateSize: (v) => v.length,
    });
    expect(cache.get('missing')).toBeUndefined();
  });

  it('evicts oldest entries when byte limit is exceeded', () => {
    const evicted: string[] = [];
    const cache = new ByteLimitedCache<string>({
      maxBytes: 10,
      estimateSize: (v) => v.length,
      onEvict: (k) => evicted.push(k),
    });
    cache.set('a', '1234'); // 4 bytes
    cache.set('b', '1234'); // 4 bytes = 8 total
    cache.set('c', '1234'); // 4 bytes = 12 > 10, should evict 'a'
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('1234');
    expect(cache.get('c')).toBe('1234');
    expect(evicted).toContain('a');
  });

  it('calls onEvict when entries are evicted', () => {
    const evictedKeys: string[] = [];
    const cache = new ByteLimitedCache<string>({
      maxBytes: 5,
      estimateSize: (v) => v.length,
      onEvict: (k) => evictedKeys.push(k),
    });
    cache.set('small', 'hi'); // 2 bytes
    cache.set('large', 'four'); // 4 bytes -> total exceeds, evicts 'small'
    expect(evictedKeys).toContain('small');
  });

  it('rejects an oversized value without evicting existing entries', () => {
    const evictedKeys: string[] = [];
    const cache = new ByteLimitedCache<string>({
      maxBytes: 5,
      estimateSize: (v) => v.length,
      onEvict: (k) => evictedKeys.push(k),
    });
    cache.set('small', 'hi');
    cache.set('large', 'hello world');

    expect(cache.get('small')).toBe('hi');
    expect(cache.get('large')).toBeUndefined();
    expect(cache.currentBytes).toBe(2);
    expect(evictedKeys).toEqual([]);
  });

  it('keeps the old value when an oversized replacement is rejected', () => {
    const cache = new ByteLimitedCache<string>({
      maxBytes: 5,
      estimateSize: (v) => v.length,
    });
    cache.set('key', 'old');
    cache.set('key', 'too large');

    expect(cache.get('key')).toBe('old');
    expect(cache.currentBytes).toBe(3);
  });

  it('has() returns true for existing keys', () => {
    const cache = new ByteLimitedCache<string>({
      maxBytes: 100,
      estimateSize: (v) => v.length,
    });
    cache.set('key', 'value');
    expect(cache.has('key')).toBe(true);
    expect(cache.has('other')).toBe(false);
  });

  it('delete() removes entries', () => {
    const cache = new ByteLimitedCache<string>({
      maxBytes: 100,
      estimateSize: (v) => v.length,
    });
    cache.set('key', 'value');
    expect(cache.delete('key')).toBe(true);
    expect(cache.get('key')).toBeUndefined();
  });

  it('supports zero byte limit (no caching)', () => {
    const cache = new ByteLimitedCache<string>({
      maxBytes: 0,
      estimateSize: () => 1,
    });
    cache.set('key', 'value');
    expect(cache.get('key')).toBeUndefined();
  });

  it('size reflects current entries', () => {
    const cache = new ByteLimitedCache<string>({
      maxBytes: 100,
      estimateSize: () => 1,
    });
    expect(cache.size).toBe(0);
    cache.set('a', 'v1');
    expect(cache.size).toBe(1);
    cache.set('b', 'v2');
    expect(cache.size).toBe(2);
  });

  it.each([-1, Number.POSITIVE_INFINITY, Number.NaN])(
    'rejects invalid maxBytes %s',
    (maxBytes) => {
      expect(
        () =>
          new ByteLimitedCache<string>({
            maxBytes,
            estimateSize: (v) => v.length,
          }),
      ).toThrow(RangeError);
    },
  );

  it.each([-1, Number.POSITIVE_INFINITY, Number.NaN])(
    'rejects invalid estimated size %s',
    (estimatedSize) => {
      const cache = new ByteLimitedCache<string>({
        maxBytes: 100,
        estimateSize: () => estimatedSize,
      });

      expect(() => cache.set('key', 'value')).toThrow(RangeError);
      expect(cache.size).toBe(0);
    },
  );
});
