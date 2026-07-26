import { describe, expect, it } from 'vitest';
import { LruMap } from '../../src/util/lru-map.js';

describe('LruMap', () => {
  it('sets and gets values', () => {
    const map = new LruMap<string, number>(3);
    map.set('a', 1);
    expect(map.get('a')).toBe(1);
  });

  it('returns undefined for missing keys', () => {
    const map = new LruMap<string, number>(3);
    expect(map.get('missing')).toBeUndefined();
  });

  it('evicts the least recently used entry when maxSize is exceeded', () => {
    const map = new LruMap<string, number>(2);
    map.set('a', 1);
    map.set('b', 2);
    map.set('c', 3); // should evict 'a'
    expect(map.get('a')).toBeUndefined();
    expect(map.get('b')).toBe(2);
    expect(map.get('c')).toBe(3);
  });

  it('promotes accessed entries on get()', () => {
    const map = new LruMap<string, number>(2);
    map.set('a', 1);
    map.set('b', 2);
    map.get('a'); // promote 'a'
    map.set('c', 3); // should evict 'b', not 'a'
    expect(map.get('a')).toBe(1);
    expect(map.get('b')).toBeUndefined();
    expect(map.get('c')).toBe(3);
  });

  it('promotes accessed entries on set()', () => {
    const map = new LruMap<string, number>(2);
    map.set('a', 1);
    map.set('b', 2);
    map.set('a', 10); // promote 'a'
    map.set('c', 3); // should evict 'b'
    expect(map.get('a')).toBe(10);
    expect(map.get('b')).toBeUndefined();
    expect(map.get('c')).toBe(3);
  });

  it('has() returns true for existing keys', () => {
    const map = new LruMap<string, number>(2);
    map.set('a', 1);
    expect(map.has('a')).toBe(true);
    expect(map.has('b')).toBe(false);
  });

  it('delete() removes entries', () => {
    const map = new LruMap<string, number>(2);
    map.set('a', 1);
    expect(map.delete('a')).toBe(true);
    expect(map.get('a')).toBeUndefined();
  });

  it('size reflects current entries', () => {
    const map = new LruMap<string, number>(3);
    expect(map.size).toBe(0);
    map.set('a', 1);
    expect(map.size).toBe(1);
    map.set('b', 2);
    expect(map.size).toBe(2);
  });

  it('clear() removes all entries', () => {
    const map = new LruMap<string, number>(3);
    map.set('a', 1);
    map.set('b', 2);
    map.clear();
    expect(map.size).toBe(0);
    expect(map.get('a')).toBeUndefined();
  });

  it('forEach() iterates in insertion/access order', () => {
    const map = new LruMap<string, number>(3);
    map.set('a', 1);
    map.set('b', 2);
    const entries: [string, number][] = [];
    map.forEach((v, k) => entries.push([k, v]));
    expect(entries).toEqual([['a', 1], ['b', 2]]);
  });

  it('throws on zero maxSize', () => {
    expect(() => new LruMap<string, number>(0)).toThrow(RangeError);
  });

  it('supports maxSize = 1', () => {
    const map = new LruMap<string, number>(1);
    map.set('a', 1);
    expect(map.get('a')).toBe(1);
    map.set('b', 2);
    expect(map.get('a')).toBeUndefined(); // evicted
    expect(map.get('b')).toBe(2);
  });

  it('evicts an undefined key when it is least recently used', () => {
    const map = new LruMap<string | undefined, number>(1);

    map.set(undefined, 1);
    map.set('replacement', 2);

    expect(map.size).toBe(1);
    expect(map.has(undefined)).toBe(false);
    expect(map.get('replacement')).toBe(2);
  });

  it('supports large maxSize without eviction', () => {
    const map = new LruMap<number, number>(100);
    for (let i = 0; i < 100; i++) map.set(i, i);
    expect(map.size).toBe(100);
    map.set(100, 100);
    expect(map.size).toBe(100); // evicts oldest
    expect(map.get(0)).toBeUndefined();
  });
});
