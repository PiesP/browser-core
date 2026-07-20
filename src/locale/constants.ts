import type { Locale, LocaleInfo } from './types';

/** Metadata for all supported locales */
export const SUPPORTED_LOCALES: readonly LocaleInfo[] = [
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'ko', name: '한국어', dir: 'ltr' },
  { code: 'ja', name: '日本語', dir: 'ltr' },
  { code: 'zh-CN', name: '简体中文', dir: 'ltr' },
  { code: 'es', name: 'Español', dir: 'ltr' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
] as const;

/** Array of locale codes (not auto) */
export const LOCALE_CODES: readonly Locale[] = SUPPORTED_LOCALES.map((l) => l.code);

/** Default fallback locale */
export const DEFAULT_LOCALE: Locale = 'en';
