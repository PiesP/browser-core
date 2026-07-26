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
});
