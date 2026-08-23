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
      maxBytes: 12,
      estimateSize: (v) => v.length,
      onEvict: (k) => evicted.push(k),
    });
    cache.set('a', '1234'); // 2 key bytes + 4 value bytes
    cache.set('b', '1234'); // 12 total
    cache.set('c', '1234'); // 18 > 12, should evict 'a'
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('1234');
    expect(cache.get('c')).toBe('1234');
    expect(evicted).toContain('a');
  });

  it('calls onEvict when entries are evicted', () => {
    const evictedKeys: string[] = [];
    const cache = new ByteLimitedCache<string>({
      maxBytes: 18,
      estimateSize: (v) => v.length,
      onEvict: (k) => evictedKeys.push(k),
    });
    cache.set('small', 'hi'); // 10 key bytes + 2 value bytes
    cache.set('large', 'four'); // 14 bytes -> total exceeds, evicts 'small'
    expect(evictedKeys).toContain('small');
  });

  it('finishes eviction and cleanup before rethrowing the first callback error', () => {
    const evictedKeys: string[] = [];
    const cache = new ByteLimitedCache<string>({
      maxBytes: 14,
      estimateSize: (value) => value.length,
      onEvict: (key) => {
        evictedKeys.push(key);
        if (key === 'a') throw new Error('first cleanup failed');
      },
    });
    cache.set('a', '12');
    cache.set('b', '12345678');

    expect(() => cache.set('c', '12345678')).toThrow('first cleanup failed');
    expect(evictedKeys).toEqual(['a', 'b']);
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(false);
    expect(cache.get('c')).toBe('12345678');
    expect(cache.currentBytes).toBe(10);
  });

  it('rejects an oversized value without evicting existing entries', () => {
    const evictedKeys: string[] = [];
    const cache = new ByteLimitedCache<string>({
      maxBytes: 12,
      estimateSize: (v) => v.length,
      onEvict: (k) => evictedKeys.push(k),
    });
    cache.set('small', 'hi');
    cache.set('large', 'hello world');

    expect(cache.get('small')).toBe('hi');
    expect(cache.get('large')).toBeUndefined();
    expect(cache.currentBytes).toBe(12);
    expect(evictedKeys).toEqual([]);
  });

  it('keeps the old value when an oversized replacement is rejected', () => {
    const cache = new ByteLimitedCache<string>({
      maxBytes: 9,
      estimateSize: (v) => v.length,
    });
    cache.set('key', 'old');
    cache.set('key', 'too large');

    expect(cache.get('key')).toBe('old');
    expect(cache.currentBytes).toBe(9);
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

  it('bounds distinct keys when values have a zero-byte estimate', () => {
    const cache = new ByteLimitedCache<string>({
      maxBytes: 32,
      estimateSize: () => 0,
    });

    for (let index = 0; index < 100; index++) {
      cache.set(`key-${index}`, '');
    }

    expect(cache.currentBytes).toBeLessThanOrEqual(cache.maxBytes);
    expect(cache.size).toBeLessThan(100);
    expect(cache.get('key-99')).toBe('');
  });

  it('rejects an oversized key without disturbing existing entries', () => {
    const cache = new ByteLimitedCache<string>({
      maxBytes: 10,
      estimateSize: (value) => value.length,
    });
    cache.set('a', '1234');
    cache.set('attacker-controlled-long-key', '');

    expect(cache.get('a')).toBe('1234');
    expect(cache.has('attacker-controlled-long-key')).toBe(false);
    expect(cache.currentBytes).toBe(6);
  });

  it('accounts for key bytes and a minimum retained-entry cost', () => {
    const cache = new ByteLimitedCache<string>({
      maxBytes: 20,
      estimateSize: (value) => value.length,
    });

    cache.set('ab', 'x');
    cache.set('', '');
    expect(cache.currentBytes).toBe(6);

    cache.set('ab', 'xxxx');
    expect(cache.currentBytes).toBe(9);
  });

  it('rejects a derived entry cost outside the safe-integer range', () => {
    const cache = new ByteLimitedCache<string>({
      maxBytes: Number.MAX_SAFE_INTEGER,
      estimateSize: () => Number.MAX_SAFE_INTEGER,
    });

    cache.set('a', 'value');
    expect(cache.size).toBe(0);
    expect(cache.currentBytes).toBe(0);
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
      expect(
        () =>
          new ByteLimitedCache<string>({
            maxBytes,
            estimateSize: (v) => v.length,
          }),
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
      const cache = new ByteLimitedCache<string>({
        maxBytes: 100,
        estimateSize: () => estimatedSize,
      });

      expect(() => cache.set('key', 'value')).toThrow(RangeError);
      expect(cache.size).toBe(0);
    },
  );
});
