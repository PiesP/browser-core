import { describe, expect, it } from 'vitest';
import { parseAnyColor } from '../../src/util/color.js';

describe('parseAnyColor', () => {
  it('parses transparent as fully transparent black', () => {
    expect(parseAnyColor('transparent')).toEqual([0, 0, 0, 0]);
  });

  it.each([
    '#ggg',
    '#12',
    '#12345',
    '#1234567',
    '#123456789',
    '#12xz34',
  ])('returns null for invalid hex color %s', (color) => {
    expect(parseAnyColor(color)).toBeNull();
  });

  it.each(['#abc', '#abcd', '#123456', '#12345678'])(
    'never returns NaN channels for valid hex color %s',
    (color) => {
      const parsed = parseAnyColor(color);

      expect(parsed).not.toBeNull();
      expect(parsed!.every(Number.isFinite)).toBe(true);
    },
  );

  it.each([
    'rgba(1, 2, 3, .)',
    'rgba(1, 2, 3, 1.2.3)',
    'rgba(1, 2, 3)',
    'rgb(1, 2, 3, 0.5)',
    'prefix rgb(1, 2, 3)',
    'rgb(1, 2, 3) suffix',
  ])('uses the non-hex fallback for malformed functional color %s', (color) => {
    expect(parseAnyColor(color)).toEqual([0, 0, 0, 1]);
  });

  it('parses a leading-decimal alpha without producing NaN', () => {
    expect(parseAnyColor('rgba(1, 2, 3, .5)')).toEqual([1, 2, 3, 0.5]);
  });

  it('rejects oversized functional colors before regular-expression parsing', () => {
    const oversized = `rgba(${` `.repeat(10_000)}1, 2, 3, 0.5)`;

    expect(parseAnyColor(oversized)).toEqual([0, 0, 0, 1]);
  });
});
