import { describe, expect, it } from 'vitest';
import { cx } from '../../src/util/cx.js';

describe('cx', () => {
  it('joins multiple string arguments', () => {
    expect(cx('foo', 'bar')).toBe('foo bar');
    expect(cx('a', 'b', 'c')).toBe('a b c');
  });

  it('returns a single string as-is', () => {
    expect(cx('foo')).toBe('foo');
  });

  it('ignores falsy values', () => {
    expect(cx('foo', false && 'bar')).toBe('foo');
    expect(cx('foo', null, undefined, false, 0, '')).toBe('foo');
    expect(cx(null, undefined, false, 0, '')).toBe('');
  });

  it('handles conditional objects', () => {
    expect(cx('foo', { bar: true, baz: false })).toBe('foo bar');
    expect(cx({ foo: true, bar: true })).toBe('foo bar');
  });

  it('handles arrays', () => {
    expect(cx('foo', ['bar', 'baz'])).toBe('foo bar baz');
    expect(cx(['foo', 'bar'])).toBe('foo bar');
  });

  it('handles nested arrays and objects', () => {
    expect(cx('foo', ['bar', { baz: true, qux: false }])).toBe('foo bar baz');
    expect(cx([{ a: true, b: false }, 'c'])).toBe('a c');
  });

  it('handles deeply nested arrays', () => {
    expect(cx('root', ['a', ['b', ['c']]])).toBe('root a b c');
  });

  it('returns empty string for all-falsy arguments', () => {
    expect(cx(false, null, undefined, 0, '')).toBe('');
    expect(cx([])).toBe('');
    expect(cx({})).toBe('');
  });

  it('deduplicates is not guaranteed (no dedup)', () => {
    // cx does not deduplicate — it just joins
    expect(cx('foo', 'foo')).toBe('foo foo');
  });

  it('handles class names with special characters', () => {
    expect(cx('md:w-full', 'lg:w-1/2')).toBe('md:w-full lg:w-1/2');
  });
});
