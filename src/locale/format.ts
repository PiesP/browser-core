/**
 * Locale-aware formatting — file sizes and durations.
 *
 * MIT License
 * Copyright (c) 2025-2026 PiesP
 */

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

function getOrCreateNumberFormat(
  formats: Map<Locale, Intl.NumberFormat>,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  let numberFormat = formats.get(locale);
  if (!numberFormat) {
    numberFormat = new Intl.NumberFormat(locale, options);
    formats.set(locale, numberFormat);
  }
  return numberFormat;
}

function getIntegerNumberFormat(locale: Locale): Intl.NumberFormat {
  integerNumberFormats ??= new Map();
  return getOrCreateNumberFormat(
    integerNumberFormats,
    locale,
    INTEGER_NUMBER_FORMAT_OPTIONS,
  );
}

function getDecimalNumberFormat(locale: Locale): Intl.NumberFormat {
  decimalNumberFormats ??= new Map();
  return getOrCreateNumberFormat(
    decimalNumberFormats,
    locale,
    DECIMAL_NUMBER_FORMAT_OPTIONS,
  );
}

function getFileSizeNumberFormat(locale: Locale): Intl.NumberFormat {
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

  if (bytes === 0) {
    const units = getFileSizeUnits(locale);
    const numberFormat = getIntegerNumberFormat(locale);
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
  const units = getFileSizeUnits(locale);

  const numberFormat =
    unitIndex === 0
      ? getIntegerNumberFormat(locale)
      : getFileSizeNumberFormat(locale);
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

  const normalizedMs = Math.max(0, ms);
  const units = getDurationUnits(locale);
  const numberFormat = getIntegerNumberFormat(locale);

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

  const decimalNumberFormat = getDecimalNumberFormat(locale);
  return `${decimalNumberFormat.format(normalizedMs / 1000)}${units.sec}`;
}
