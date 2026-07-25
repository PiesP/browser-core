import { describe, expect, it } from 'vitest';
import { resolveNestedPath } from '../../src/util/object.js';

describe('resolveNestedPath', () => {
  it('resolves a simple property', () => {
    expect(resolveNestedPath({ a: 1 }, 'a')).toBe(1);
  });

  it('resolves a nested property', () => {
    const obj = { a: { b: { c: 42 } } };
    expect(resolveNestedPath(obj, 'a.b.c')).toBe(42);
  });

  it('resolves intermediate objects', () => {
    const obj = { a: { b: { c: 42 } } };
    expect(resolveNestedPath(obj, 'a.b')).toEqual({ c: 42 });
  });

  it('returns undefined for missing path', () => {
    const obj = { a: { b: 1 } };
    expect(resolveNestedPath(obj, 'a.x')).toBeUndefined();
  });

  it('returns undefined for null/undefined input', () => {
    expect(resolveNestedPath(null, 'a.b')).toBeUndefined();
    expect(resolveNestedPath(undefined, 'a.b')).toBeUndefined();
  });

  it('returns undefined for primitive input', () => {
    expect(resolveNestedPath('string', 'length')).toBeUndefined();
    expect(resolveNestedPath(42, 'toString')).toBeUndefined();
  });

  it('returns undefined when intermediate value is null', () => {
    const obj = { a: null };
    expect(resolveNestedPath(obj, 'a.b')).toBeUndefined();
  });

  it('resolves array index by numeric string segment', () => {
    const obj = { items: ['a', 'b', 'c'] };
    expect(resolveNestedPath(obj, 'items.1')).toBe('b');
  });

  it('returns undefined for empty path', () => {
    // Empty path splits to [''], resolves to obj[''] which is undefined
    expect(resolveNestedPath({ a: 1 }, '')).toBeUndefined();
  });

  it('works with deeply nested structures', () => {
    const obj = {
      level1: {
        level2: {
          level3: {
            value: 'deep',
          },
        },
      },
    };
    expect(resolveNestedPath(obj, 'level1.level2.level3.value')).toBe('deep');
  });

  it('returns undefined for non-existent root-level path', () => {
    expect(resolveNestedPath({ a: 1 }, 'z')).toBeUndefined();
  });

  it('handles objects with array values', () => {
    const obj = { arr: [1, 2, 3] };
    expect(resolveNestedPath(obj, 'arr')).toEqual([1, 2, 3]);
  });
});
