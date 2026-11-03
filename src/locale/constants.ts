import type { Locale, LocaleInfo, TextDirection } from './types';

/** Internal source of supported locale identifiers and metadata. */
const localeRegistry = [
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'ko', name: '한국어', dir: 'ltr' },
  { code: 'ja', name: '日本語', dir: 'ltr' },
  { code: 'zh-CN', name: '简体中文', dir: 'ltr' },
  { code: 'es', name: 'Español', dir: 'ltr' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
] as const satisfies readonly { code: string; name: string; dir: TextDirection }[];

/** Derived internally so a supported code cannot be omitted from the metadata. */
export type RegistryLocale = (typeof localeRegistry)[number]['code'];

/** Metadata for all supported locales */
export const SUPPORTED_LOCALES: readonly LocaleInfo[] = localeRegistry;

/** Array of locale codes (not auto) */
export const LOCALE_CODES: readonly Locale[] = SUPPORTED_LOCALES.map((l) => l.code);

/** Default fallback locale */
export const DEFAULT_LOCALE: Locale = 'en';
