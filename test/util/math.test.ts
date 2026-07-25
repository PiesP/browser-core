import { describe, expect, it } from 'vitest';
import { computePercentage } from '../../src/util/math.js';

describe('computePercentage', () => {
  it('computes 50% for halfway values', () => {
    expect(computePercentage(50, 100)).toBe(50);
    expect(computePercentage(1, 2)).toBe(50);
    expect(computePercentage(5, 10)).toBe(50);
  });

  it('computes 100%', () => {
    expect(computePercentage(100, 100)).toBe(100);
    expect(computePercentage(1, 1)).toBe(100);
  });

  it('computes 0%', () => {
    expect(computePercentage(0, 100)).toBe(0);
  });

  it('returns 0 when total is zero', () => {
    expect(computePercentage(50, 0)).toBe(0);
    expect(computePercentage(0, 0)).toBe(0);
  });

  it('returns 0 when total is negative', () => {
    expect(computePercentage(50, -10)).toBe(0);
    expect(computePercentage(-50, -100)).toBe(0);
  });

  it('computes percentages for fractional inputs', () => {
    expect(computePercentage(0.5, 1)).toBe(50);
    expect(computePercentage(0.25, 1)).toBe(25);
  });

  it('computes percentages over 100 for current > total', () => {
    expect(computePercentage(150, 100)).toBe(150);
    expect(computePercentage(200, 100)).toBe(200);
  });

  it('computes percentages for negative current with positive total', () => {
    expect(computePercentage(-50, 100)).toBe(-50);
  });
});
