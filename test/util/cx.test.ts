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

  it('handles deep arrays without consuming the JavaScript call stack', () => {
    let nested: unknown = 'leaf';
    for (let depth = 0; depth < 5_000; depth++) nested = [nested];

    expect(cx(nested)).toBe('leaf');
  });

  it('skips cyclic array references and preserves surrounding values', () => {
    const cyclic: unknown[] = ['before'];
    cyclic.push(cyclic, 'after');

    expect(cx(cyclic)).toBe('before after');
  });

  it('preserves repeated non-cyclic array values', () => {
    const shared = ['value'];
    expect(cx(shared, shared)).toBe('value value');
  });

  it('rejects input graphs above the processed-value bound', () => {
    const oversized = Array.from({ length: 10_001 }, () => 'value');
    expect(() => cx(oversized)).toThrow(RangeError);
  });

  it('does not traverse oversized inherited enumerable keys', () => {
    const prototype: Record<string, boolean> = {};
    for (let index = 0; index < 10_001; index++) {
      prototype[`inherited-${index}`] = true;
    }
    const value = Object.create(prototype) as Record<string, unknown>;
    value.own = true;

    expect(cx(value)).toBe('own');
  });

  it('does not emit inherited enumerable keys below the work bound', () => {
    const value = Object.create({ inherited: true }) as Record<string, unknown>;
    value.own = true;

    expect(cx(value)).toBe('own');
  });

  it('uses one validated array-length snapshot for proxy arrays', () => {
    let lengthReads = 0;
    const value = new Proxy(['class-name'], {
      get(target, property, receiver) {
        if (property === 'length') {
          lengthReads++;
          return lengthReads === 1 ? 1 : Number.POSITIVE_INFINITY;
        }
        return Reflect.get(target, property, receiver);
      },
    });

    expect(cx(value)).toBe('class-name');
    expect(lengthReads).toBe(1);
  });

  it('rejects an unsafe proxy array-length snapshot before frame allocation', () => {
    const value = new Proxy([], {
      get(target, property, receiver) {
        if (property === 'length') return Number.POSITIVE_INFINITY;
        return Reflect.get(target, property, receiver);
      },
    });

    expect(() => cx(value)).toThrow(RangeError);
  });

  it('does not traverse deeply chained prototypes for own-key output', () => {
    let prototype: object | null = null;
    for (let depth = 0; depth < 20_000; depth++) {
      prototype = Object.create(prototype) as object;
    }
    const value = Object.create(prototype) as Record<string, unknown>;
    value.own = true;

    expect(cx(value)).toBe('own');
  });

  it('does not fall back to an inherited key deleted by an earlier getter', () => {
    const value = Object.create({ second: true }) as Record<string, unknown>;
    Object.defineProperty(value, 'first', {
      enumerable: true,
      get() {
        delete value.second;
        return true;
      },
    });
    value.second = true;

    expect(cx(value)).toBe('first');
  });

  it('includes an own key made enumerable by an earlier getter', () => {
    const value: Record<string, unknown> = {};
    Object.defineProperty(value, 'first', {
      enumerable: true,
      get() {
        Object.defineProperty(value, 'second', {
          configurable: true,
          enumerable: true,
          value: true,
        });
        return true;
      },
    });
    Object.defineProperty(value, 'second', {
      configurable: true,
      enumerable: false,
      value: true,
    });

    expect(cx(value)).toBe('first second');
  });

  it('charges symbol keys to the work bound without emitting them', () => {
    const value: Record<PropertyKey, unknown> = { own: true };
    for (let index = 0; index < 10_000; index++) {
      value[Symbol(`ignored-${index}`)] = true;
    }

    expect(() => cx(value)).toThrow(RangeError);
  });

  it('ignores ordinary symbol keys while preserving string-key order', () => {
    const value: Record<PropertyKey, unknown> = {
      first: true,
      second: true,
    };
    value[Symbol('ignored')] = true;

    expect(cx(value)).toBe('first second');
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
