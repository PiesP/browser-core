/**
 * Shared locale type definitions for PiesP browser-based projects.
 *
 * Used by all three projects (wasm-motion-converter, xcom-enhanced-gallery,
 * yt-live-chat-overlay) for consistent locale handling.
 */

import type { RegistryLocale } from './constants';

/** BCP 47 locale identifiers supported across all projects */
export type Locale = RegistryLocale;

/** Language setting — may include 'auto' for browser detection */
export type SettingLocale = 'auto' | Locale;

/** Text direction */
export type TextDirection = 'ltr' | 'rtl';

/** Metadata for a single locale */
export interface LocaleInfo {
  readonly code: Locale;
  /** Native-language name (e.g. '한국어', '日本語') */
  readonly name: string;
  readonly dir: TextDirection;
}
