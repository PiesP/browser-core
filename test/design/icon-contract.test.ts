import { describe, expect, it } from 'vitest';
import {
  DESIGN_ICON_CONTRACT,
  QUIET_INSTRUMENTS_TOKENS,
} from '../../src/design/index.js';

describe('Quiet Instruments icon contract', () => {
  it('uses token-backed sizes and stroke geometry', () => {
    expect(DESIGN_ICON_CONTRACT).toMatchObject({
      viewBox: '0 0 24 24',
      sizes: {
        compact: QUIET_INSTRUMENTS_TOKENS['component.icon.size-sm'],
        default: QUIET_INSTRUMENTS_TOKENS['component.icon.size-md'],
        emphasis: QUIET_INSTRUMENTS_TOKENS['component.icon.size-lg'],
      },
      strokeWidth:
        QUIET_INSTRUMENTS_TOKENS['component.icon.stroke-width'],
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      fill: 'none',
    });
  });
});
