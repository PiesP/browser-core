/**
 * Color parsing and manipulation utilities.
 *
 * All functions are framework-agnostic and operate on plain strings and
 * numeric tuples.
 */

/**
 * RGBA color tuple: `[red, green, blue, alpha]`.
 * Each channel is 0–255, alpha is 0–1.
 */
export type RgbaTuple = [number, number, number, number];

/**
 * Hex color string like `#rgb`, `#rrggbb`, `#rrggbbaa`.
 */
type HexColor = `#${string}`;

/**
 * Parse a CSS color string into an RGBA tuple.
 *
 * Supports:
 * - Hex: `#rgb`, `#rrggbb`, `#rrggbbaa`
 * - `rgb(r, g, b)` / `rgba(r, g, b, a)`
 * - Named colors (subset of CSS named colors)
 *
 * Returns `null` for malformed hex input and `[0, 0, 0, 1]` (opaque black)
 * for other unrecognized input.
 *
 * @param color - A CSS color string
 * @returns RGBA tuple `[r, g, b, a]`, or `null` for malformed hex input
 */
export function parseAnyColor(color: string): RgbaTuple | null {
  if (!color || typeof color !== 'string') {
    return [0, 0, 0, 1];
  }

  const trimmed = color.trim();

  // CSS color tokens are short. Bounding untrusted input before the functional
  // color regular expression prevents pathological backtracking on strings
  // containing very large runs of whitespace.
  if (trimmed.length > 128) {
    return [0, 0, 0, 1];
  }

  if (trimmed.toLowerCase() === 'transparent') {
    return [0, 0, 0, 0];
  }

  // Named colors
  const named = NAMED_COLORS[trimmed.toLowerCase()];
  if (named) {
    return [named[0], named[1], named[2], 1];
  }

  // Hex colors
  if (trimmed.startsWith('#')) {
    return parseHexColor(trimmed as HexColor);
  }

  // rgb() / rgba()
  const rgbMatch = trimmed.match(
    /^(rgba?)\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(\d+(?:\.\d*)?|\.\d+))?\s*\)$/i,
  );
  if (rgbMatch) {
    const functionName = rgbMatch[1];
    const red = rgbMatch[2];
    const green = rgbMatch[3];
    const blue = rgbMatch[4];
    const alpha = rgbMatch[5];
    if (
      functionName === undefined ||
      red === undefined ||
      green === undefined ||
      blue === undefined ||
      (functionName.toLowerCase() === 'rgba') !== (alpha !== undefined)
    ) {
      return [0, 0, 0, 1];
    }

    const r = clampByte(Number(red));
    const g = clampByte(Number(green));
    const b = clampByte(Number(blue));
    const a = alpha === undefined ? 1 : clampAlpha(Number(alpha));
    return [r, g, b, a];
  }

  return [0, 0, 0, 1];
}

/**
 * Convert an RGBA tuple to a CSS `rgba()` string.
 *
 * @param rgba - The RGBA tuple `[r, g, b, a]`
 * @returns CSS `rgba(r, g, b, a)` string
 */
export function toRgba(rgba: RgbaTuple): string {
  const [r, g, b, a] = rgba;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Compute a readable text color (black or white) given a background color.
 *
 * Uses the W3C relative luminance formula (sRGB) to calculate perceived
 * brightness and returns `'#000'` for light backgrounds and `'#fff'` for
 * dark backgrounds.
 *
 * @param backgroundColor - CSS color string or RGBA tuple
 * @returns `'#000'` or `'#fff'`
 */
export function computeReadableTextColor(
  backgroundColor: string | RgbaTuple,
): '#000' | '#fff' {
  const parsed = Array.isArray(backgroundColor)
    ? backgroundColor
    : parseAnyColor(backgroundColor);
  const [r, g, b] = parsed ?? [0, 0, 0, 1];

  // W3C relative luminance
  const luminance = relativeLuminance(r, g, b);

  // WCAG contrast threshold: use white text on dark backgrounds,
  // black text on light backgrounds
  return luminance > 0.179 ? '#000' : '#fff';
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Clamp a byte channel to 0–255. */
function clampByte(value: number): number {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return Math.round(value);
}

/** Clamp alpha to 0–1. */
function clampAlpha(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Parse a hex color string. */
function parseHexColor(hex: HexColor): RgbaTuple | null {
  let h = hex.slice(1);

  if (!/^(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(h)) {
    return null;
  }

  // Handle shorthand: #RGB -> #RRGGBB, #RGBA -> #RRGGBBAA
  if (h.length === 3) {
    h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  } else if (h.length === 4) {
    h =
      h.charAt(0) +
      h.charAt(0) +
      h.charAt(1) +
      h.charAt(1) +
      h.charAt(2) +
      h.charAt(2) +
      h.charAt(3) +
      h.charAt(3);
  }

  if (h.length === 6) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      1,
    ];
  }

  if (h.length === 8) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      Math.round((parseInt(h.slice(6, 8), 16) / 255) * 100) / 100,
    ];
  }

  return null;
}

/**
 * W3C relative luminance of an sRGB color.
 * Formula: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function relativeLuminance(r8: number, g8: number, b8: number): number {
  const srgb = [r8, g8, b8].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const [rs, gs, bs] = srgb;
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Subset of CSS named colors used for common UI colors.
 */
const NAMED_COLORS: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  cyan: [0, 255, 255],
  magenta: [255, 0, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  maroon: [128, 0, 0],
  olive: [128, 128, 0],
  lime: [0, 255, 0],
  aqua: [0, 255, 255],
  teal: [0, 128, 128],
  navy: [0, 0, 128],
  fuchsia: [255, 0, 255],
  purple: [128, 0, 128],
  orange: [255, 165, 0],
  pink: [255, 192, 203],
  brown: [165, 42, 42],
  coral: [255, 127, 80],
  gold: [255, 215, 0],
  indigo: [75, 0, 130],
  ivory: [255, 255, 240],
  khaki: [240, 230, 140],
  lavender: [230, 230, 250],
  lightgray: [211, 211, 211],
  lightgrey: [211, 211, 211],
  lightblue: [173, 216, 230],
  lightgreen: [144, 238, 144],
  lightyellow: [255, 255, 224],
};
