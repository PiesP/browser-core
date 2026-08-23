/**
 * Locale-aware formatting — file sizes and durations.
 *
 * MIT License
 * Copyright (c) 2025-2026 PiesP
 */

import { normalizeLocale } from './detect';
import { DEFAULT_LOCALE, LOCALE_CODES } from './constants';
import type { Locale } from './types';

/** Bytes per kilobyte */
const BYTES_PER_KB = 1024;

/** Reused number formatters, keyed by their stable formatting role and locale. */
let integerNumberFormats: Map<Locale, Intl.NumberFormat> | undefined;
let decimalNumberFormats: Map<Locale, Intl.NumberFormat> | undefined;
let fileSizeNumberFormats: Map<Locale, Intl.NumberFormat> | undefined;

const INTEGER_NUMBER_FORMAT_OPTIONS: Intl.NumberFormatOptions = {
  maximumFractionDigits: 0,
};
const DECIMAL_NUMBER_FORMAT_OPTIONS: Intl.NumberFormatOptions = {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
};
const FILE_SIZE_NUMBER_FORMAT_OPTIONS: Intl.NumberFormatOptions = {
  maximumFractionDigits: 2,
};

const MAX_FORMAT_LOCALE_LENGTH = 64;

interface ResolvedFormattingLocale {
  readonly numberLocale: string;
  readonly labelLocale: Locale;
}

function resolveFormattingLocale(locale: unknown): ResolvedFormattingLocale {
  if (typeof locale !== 'string' || locale.length > MAX_FORMAT_LOCALE_LENGTH) {
    throw new RangeError('locale must be a valid bounded BCP 47 locale');
  }
  const trimmedLocale = locale.trim();
  if (!trimmedLocale) throw new RangeError('locale must be a valid bounded BCP 47 locale');

  let canonicalLocale: string;
  try {
    const [canonical] = Intl.getCanonicalLocales(trimmedLocale);
    if (!canonical) throw new RangeError('missing canonical locale');
    canonicalLocale = canonical;
  } catch {
    throw new RangeError('locale must be a valid bounded BCP 47 locale');
  }

  return {
    numberLocale: canonicalLocale,
    labelLocale: normalizeLocale(canonicalLocale) ?? DEFAULT_LOCALE,
  };
}

function getOrCreateNumberFormat(
  formats: Map<Locale, Intl.NumberFormat>,
  locale: string,
  options?: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const cacheLocale = LOCALE_CODES.includes(locale as Locale)
    ? (locale as Locale)
    : null;
  if (!cacheLocale) return new Intl.NumberFormat(locale, options);

  let numberFormat = formats.get(cacheLocale);
  if (!numberFormat) {
    numberFormat = new Intl.NumberFormat(cacheLocale, options);
    formats.set(cacheLocale, numberFormat);
  }
  return numberFormat;
}

function getIntegerNumberFormat(locale: string): Intl.NumberFormat {
  integerNumberFormats ??= new Map();
  return getOrCreateNumberFormat(
    integerNumberFormats,
    locale,
    INTEGER_NUMBER_FORMAT_OPTIONS,
  );
}

function getDecimalNumberFormat(locale: string): Intl.NumberFormat {
  decimalNumberFormats ??= new Map();
  return getOrCreateNumberFormat(
    decimalNumberFormats,
    locale,
    DECIMAL_NUMBER_FORMAT_OPTIONS,
  );
}

function getFileSizeNumberFormat(locale: string): Intl.NumberFormat {
  fileSizeNumberFormats ??= new Map();
  return getOrCreateNumberFormat(
    fileSizeNumberFormats,
    locale,
    FILE_SIZE_NUMBER_FORMAT_OPTIONS,
  );
}

// ── File size unit labels per locale ──────────────────────────────────────

const FILE_SIZE_LABELS: Record<string, readonly string[]> = {
  en: ['B', 'KB', 'MB', 'GB'],
  ko: ['바이트', 'KB', 'MB', 'GB'],
  /** For locales without localized labels, English SI abbreviations are used. */
};

function getFileSizeUnits(locale: Locale): readonly string[] {
  const units = FILE_SIZE_LABELS[locale];
  if (units) return units;
  // Fall back to English SI units
  return FILE_SIZE_LABELS.en!;
}

/**
 * Format file size with locale-aware separators and units.
 *
 * @param bytes - Number of bytes (must be non-negative)
 * @param locale - BCP 47 locale identifier
 */
export function formatFileSize(bytes: number, locale: Locale): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new RangeError('bytes must be a finite, non-negative number');
  }
  const resolvedLocale = resolveFormattingLocale(locale);

  if (bytes === 0) {
    const units = getFileSizeUnits(resolvedLocale.labelLocale);
    const numberFormat = getIntegerNumberFormat(resolvedLocale.numberLocale);
    return `${numberFormat.format(0)} ${units[0]!}`;
  }

  const unitIndex =
    bytes >= BYTES_PER_KB ** 3
      ? 3
      : bytes >= BYTES_PER_KB ** 2
        ? 2
        : bytes >= BYTES_PER_KB
          ? 1
          : 0;
  const value = bytes / BYTES_PER_KB ** unitIndex;
  const units = getFileSizeUnits(resolvedLocale.labelLocale);

  const numberFormat =
    unitIndex === 0
      ? getIntegerNumberFormat(resolvedLocale.numberLocale)
      : getFileSizeNumberFormat(resolvedLocale.numberLocale);
  const formatted = numberFormat.format(value);

  return `${formatted} ${units[unitIndex]!}`;
}

// ── Duration unit labels per locale ───────────────────────────────────────

interface DurationUnits {
  readonly ms: string;
  readonly sec: string;
  readonly min: string;
}

const DURATION_LABELS: Record<string, DurationUnits> = {
  en: { ms: 'ms', sec: 's', min: 'm' },
  ko: { ms: 'ms', sec: '초', min: '분' },
  ja: { ms: 'ms', sec: '秒', min: '分' },
  'zh-CN': { ms: 'ms', sec: '秒', min: '分' },
  es: { ms: 'ms', sec: 's', min: 'm' },
  ar: { ms: 'مللي', sec: 'ث', min: 'د' },
};

function getDurationUnits(locale: Locale): DurationUnits {
  return DURATION_LABELS[locale] ?? DURATION_LABELS.en!;
}

/**
 * Format duration with locale-aware units.
 *
 * Negative durations are normalized to zero.
 *
 * @param ms - Duration in milliseconds
 * @param locale - BCP 47 locale identifier
 * @throws {RangeError} If `ms` is not finite
 */
export function formatDuration(ms: number, locale: Locale): string {
  if (!Number.isFinite(ms)) {
    throw new RangeError('ms must be a finite number');
  }
  const resolvedLocale = resolveFormattingLocale(locale);

  const normalizedMs = Math.max(0, ms);
  const units = getDurationUnits(resolvedLocale.labelLocale);
  const numberFormat = getIntegerNumberFormat(resolvedLocale.numberLocale);

  if (normalizedMs < 1000) {
    return `${numberFormat.format(Math.round(normalizedMs))}${units.ms}`;
  }

  const totalSeconds = Math.floor(normalizedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    const formattedMinutes = numberFormat.format(minutes);
    const formattedSeconds = numberFormat.format(seconds);
    return `${formattedMinutes}${units.min} ${formattedSeconds}${units.sec}`;
  }

  const decimalNumberFormat = getDecimalNumberFormat(resolvedLocale.numberLocale);
  return `${decimalNumberFormat.format(normalizedMs / 1000)}${units.sec}`;
}
