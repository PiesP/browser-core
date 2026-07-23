import { describe, expect, it } from 'vitest';
import { clamp, clampIndex } from '../../src/util/clamp.js';

describe('clamp', () => {
  it('returns the value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('returns min when value is below range', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(-100, 0, 10)).toBe(0);
  });

  it('returns max when value is above range', () => {
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(1000, 0, 10)).toBe(10);
  });

  it('returns boundary values correctly', () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('works with negative ranges', () => {
    expect(clamp(-5, -10, -2)).toBe(-5);
    expect(clamp(-15, -10, -2)).toBe(-10);
    expect(clamp(0, -10, -2)).toBe(-2);
  });
});

describe('clampIndex', () => {
  it('floors fractional indices and clamps them to array bounds', () => {
    expect(clampIndex(1.9, 3)).toBe(1);
    expect(clampIndex(-1, 3)).toBe(0);
    expect(clampIndex(5, 3)).toBe(2);
  });

  it('returns zero for non-finite indices and empty lengths', () => {
    expect(clampIndex(Number.NaN, 3)).toBe(0);
    expect(clampIndex(Number.POSITIVE_INFINITY, 3)).toBe(0);
    expect(clampIndex(1, 0)).toBe(0);
    expect(clampIndex(1, -1)).toBe(0);
  });
});
