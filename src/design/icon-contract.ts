import { QUIET_INSTRUMENTS_TOKENS } from './generated/tokens.js';

/**
 * Framework-independent geometry for icons in Quiet Instruments interfaces.
 * Products choose their own metaphors and paths while sharing optical weight.
 */
export const DESIGN_ICON_CONTRACT = {
  viewBox: '0 0 24 24',
  sizes: {
    compact: QUIET_INSTRUMENTS_TOKENS['component.icon.size-sm'],
    default: QUIET_INSTRUMENTS_TOKENS['component.icon.size-md'],
    emphasis: QUIET_INSTRUMENTS_TOKENS['component.icon.size-lg'],
  },
  strokeWidth: QUIET_INSTRUMENTS_TOKENS['component.icon.stroke-width'],
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  fill: 'none',
} as const;

export type DesignIconSize = keyof typeof DESIGN_ICON_CONTRACT.sizes;
