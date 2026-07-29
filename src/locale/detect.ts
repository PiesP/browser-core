/**
 * Locale detection — unified browser locale detection across all projects.
 *
 * Priority order:
 * 1. Platform-provided UI language hint (chrome.i18n.getUILanguage() in extension context)
 * 2. navigator.languages[] — user's ordered accept-language list
 * 3. navigator.language — single fallback
 *
 * MIT License
 * Copyright (c) 2025-2026 PiesP
 */

import { DEFAULT_LOCALE, LOCALE_CODES } from './constants';
import type { Locale } from './types';

/** Minimal chrome.i18n API shape for platform UI language detection. */
declare const chrome:
  | {
      i18n?: { getUILanguage?: () => string };
    }
  | undefined;

/** Options for locale detection, primarily for testability injection. */
export interface DetectOptions {
  /** Override for navigator.languages (for testing / SSR) */
  readonly languages?: readonly string[];
  /** Override for navigator.language (for testing / SSR) */
  readonly singleLanguage?: string;
  /** Override for chrome.i18n.getUILanguage (extension context, for testing) */
  readonly platformUILanguage?: string | undefined;
  /** Override for the default fallback locale (default: DEFAULT_LOCALE) */
  readonly defaultLocale?: Locale;
}

/**
 * Normalize a raw locale string to a supported Locale code.
 * Returns null if no supported locale can be derived.
 *
 * Matching strategy:
 * 1. Exact match (e.g. 'ko' → 'ko')
 * 2. Language-region abbreviation match (e.g. 'zh-CN' → 'zh-CN')
 * 3. 2-letter base prefix match (e.g. 'zh-TW' → 'zh-CN')
 */
export function normalizeLocale(code: string): Locale | null {
  const normalizedCode = code.trim();
  if (!normalizedCode) return null;

  const lower = normalizedCode.toLowerCase();

  // Exact match
  const exact = LOCALE_CODES.find((l) => l.toLowerCase() === lower);
  if (exact) return exact;

  // Language-region match (e.g., 'zh-CN' or 'zh-cn')
  if (lower.includes('-')) {
    const region = normalizedCode.slice(0, 5); // 'zh-CN'
    const regionMatch = LOCALE_CODES.find((l) => l.toLowerCase() === region.toLowerCase());
    if (regionMatch) return regionMatch;
  }

  // 2-letter base prefix match (e.g., 'zh' → 'zh-CN')
  const base = lower.slice(0, 2);
  const baseMatch = LOCALE_CODES.find((l) => l.toLowerCase().startsWith(base));
  if (baseMatch) return baseMatch;

  return null;
}

/**
 * Detect the best-supported locale from the browser environment.
 *
 * Priority order:
 * 1. Platform-provided UI language (chrome.i18n.getUILanguage in extension context)
 * 2. navigator.languages[] — user's ordered preference list
 * 3. navigator.language — single fallback
 *
 * Falls back to DEFAULT_LOCALE if nothing matches.
 */
export function detectLocale(options: DetectOptions = {}): Locale {
  const hasInjectedLanguageSource =
    Object.prototype.hasOwnProperty.call(options, 'platformUILanguage') ||
    Object.prototype.hasOwnProperty.call(options, 'languages') ||
    Object.prototype.hasOwnProperty.call(options, 'singleLanguage');

  // 1. Platform-provided UI language (extension context only)
  if (options.platformUILanguage) {
    const normalized = normalizeLocale(options.platformUILanguage);
    if (normalized) return normalized;
  }

  // 2. navigator.languages[] (user preference order)
  const navLanguages = options.languages;
  if (navLanguages && navLanguages.length > 0) {
    for (const lang of navLanguages) {
      if (!lang) continue;
      const normalized = normalizeLocale(lang);
      if (normalized) return normalized;
    }
  }

  // 3. Single-language fallback
  const single = options.singleLanguage;
  if (single) {
    const normalized = normalizeLocale(single);
    if (normalized) return normalized;
  }

  // 4. When no language source was injected, try reading from globals.
  if (!hasInjectedLanguageSource && typeof navigator !== 'undefined') {
    try {
      const chromeGlobal =
        typeof chrome !== 'undefined' ? (chrome as { i18n?: { getUILanguage?: () => string } }) : undefined;
      const uiLang =
        chromeGlobal?.i18n?.getUILanguage?.() ?? undefined;
      if (uiLang) {
        const normalized = normalizeLocale(uiLang);
        if (normalized) return normalized;
      }

      const navLangs = navigator.languages as readonly string[] | undefined;
      const browserLangs = navLangs ?? (navigator.language ? [navigator.language] : []);
      if (browserLangs.length > 0) {
        for (const lang of browserLangs) {
          if (!lang) continue;
          const normalized = normalizeLocale(lang);
          if (normalized) return normalized;
        }
      }
      // If navigator.languages was an empty array, fall back to navigator.language
      if (navLangs && navLangs.length === 0 && navigator.language) {
        const normalized = normalizeLocale(navigator.language);
        if (normalized) return normalized;
      }
    } catch {
      // navigator or chrome may be unavailable (SSR, Workers)
    }
  }

  const fallbackLocale = options.defaultLocale ?? DEFAULT_LOCALE;
  return fallbackLocale;
}
