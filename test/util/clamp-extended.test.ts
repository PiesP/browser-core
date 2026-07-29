import { describe, expect, it } from 'vitest';
import { clampMinmax, clampSoft } from '../../src/util/clamp-extended.js';

describe('clampSoft', () => {
  it('preserves values inside the hard bounds', () => {
    expect(clampSoft(50, 0, 100, 10)).toBe(50);
  });

  it('allows overshoot within the tolerance', () => {
    expect(clampSoft(-5, 0, 100, 10)).toBe(-5);
    expect(clampSoft(105, 0, 100, 10)).toBe(105);
  });

  it('snaps overshoot beyond the tolerance to the boundary', () => {
    expect(clampSoft(-11, 0, 100, 10)).toBe(0);
    expect(clampSoft(111, 0, 100, 10)).toBe(100);
  });
});

describe('clampMinmax', () => {
  it('reports whether the value was clamped', () => {
    expect(clampMinmax(50, 0, 100)).toEqual([50, false]);
    expect(clampMinmax(101, 0, 100)).toEqual([100, true]);
  });
});
