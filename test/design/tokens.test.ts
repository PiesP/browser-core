import { describe, expect, it } from 'vitest';
import {
  DESIGN_FAMILY,
  DESIGN_PRODUCTS,
  DESIGN_THEMES,
  QUIET_INSTRUMENTS_CSS_VARIABLES,
  QUIET_INSTRUMENTS_TOKENS,
} from '../../src/design/index.js';

describe('Quiet Instruments design tokens', () => {
  it('publishes the family and supported variants', () => {
    expect(DESIGN_FAMILY).toEqual({
      name: 'Quiet Instruments',
      version: '0.1.0',
      specVersion: '2025.10',
    });
    expect(DESIGN_THEMES).toEqual(['light', 'dark']);
    expect(DESIGN_PRODUCTS).toEqual(['wmc', 'xeg', 'ytco']);
  });

  it('keeps shared geometry independent from product accents', () => {
    expect(QUIET_INSTRUMENTS_TOKENS['component.target.minimum']).toBe('44px');
    expect(QUIET_INSTRUMENTS_TOKENS['component.focus.ring-width']).toBe('2px');
    expect(QUIET_INSTRUMENTS_TOKENS['component.icon.stroke-width']).toBe(
      '1.75',
    );

    const accents = DESIGN_PRODUCTS.map(
      (product) =>
        QUIET_INSTRUMENTS_TOKENS[`product.${product}.accent-light`],
    );
    expect(new Set(accents).size).toBe(DESIGN_PRODUCTS.length);
  });

  it('maps every token to a namespaced CSS custom property', () => {
    expect(Object.keys(QUIET_INSTRUMENTS_CSS_VARIABLES)).toEqual(
      Object.keys(QUIET_INSTRUMENTS_TOKENS),
    );
    expect(
      Object.values(QUIET_INSTRUMENTS_CSS_VARIABLES).every((name) =>
        name.startsWith('--pp-'),
      ),
    ).toBe(true);
  });

});
