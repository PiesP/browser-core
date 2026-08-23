import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatFileSize, formatDuration } from '../../src/locale/format.js';
import type { Locale } from '../../src/locale/types.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('formatFileSize', () => {
  it('formats 0 bytes', () => {
    expect(formatFileSize(0, 'en')).toBe('0 B');
  });

  it('formats bytes in KB', () => {
    const result = formatFileSize(1024, 'en');
    expect(result).toBe('1 KB');
  });

  it('formats bytes in MB', () => {
    const result = formatFileSize(1048576, 'en');
    expect(result).toBe('1 MB');
  });

  it('formats bytes in GB', () => {
    const result = formatFileSize(1073741824, 'en');
    expect(result).toBe('1 GB');
  });

  it('uses Korean units for ko locale', () => {
    const result = formatFileSize(1024, 'ko');
    expect(result).toContain('KB');
  });

  it('canonicalizes supported runtime locale variants', () => {
    expect(formatFileSize(1024, 'en-US' as Locale)).toBe('1 KB');
  });

  it('preserves arbitrary valid BCP 47 number formatting with fallback units', () => {
    expect(formatFileSize(1536, 'fr-FR' as Locale)).toBe('1,5 KB');
  });

  it.each(['not_a_locale', '', 'x'.repeat(65), { locale: 'en' }])(
    'rejects invalid runtime locale %s before formatting',
    (locale) => {
      expect(() => formatFileSize(1024, locale as Locale)).toThrow(RangeError);
    },
  );

  it('rejects negative byte counts', () => {
    expect(() => formatFileSize(-1, 'en')).toThrow(RangeError);
  });

  it('formats fractional bytes without selecting an invalid unit', () => {
    expect(formatFileSize(0.5, 'en')).toBe('1 B');
    expect(formatFileSize(Number.MIN_VALUE, 'en')).toBe('0 B');
  });

  it.each([
    [1023, '1,023 B'],
    [1024, '1 KB'],
    [1024 ** 2 - 1, '1,024 KB'],
    [1024 ** 2, '1 MB'],
    [1024 ** 3 - 1, '1,024 MB'],
    [1024 ** 3, '1 GB'],
  ])('selects the correct unit at the %i-byte boundary', (bytes, expected) => {
    expect(formatFileSize(bytes, 'en')).toBe(expected);
  });
});

describe('formatDuration', () => {
  it('formats milliseconds', () => {
    expect(formatDuration(500, 'en')).toBe('500ms');
  });

  it('formats seconds', () => {
    expect(formatDuration(1500, 'en')).toBe('1.5s');
  });

  it('formats minutes and seconds', () => {
    const result = formatDuration(300000, 'en');
    expect(result).toContain('m');
    expect(result).toContain('s');
  });

  it('formats with Korean units', () => {
    const result = formatDuration(300000, 'ko');
    expect(result).toContain('분');
    expect(result).toContain('초');
  });

  it('formats edge case: 0ms', () => {
    expect(formatDuration(0, 'en')).toBe('0ms');
  });

  it('formats exactly 1000ms as 1s', () => {
    const result = formatDuration(1000, 'en');
    expect(result).toBe('1.0s');
  });

  it('uses the locale decimal separator for fractional seconds', () => {
    expect(formatDuration(1500, 'es')).toBe('1,5s');
  });

  it('uses locale number formatting for minute and second components', () => {
    const numberFormat = new Intl.NumberFormat('en');

    expect(formatDuration(60_030_000, 'en')).toBe(
      `${numberFormat.format(1000)}m ${numberFormat.format(30)}s`,
    );
  });

  it('canonicalizes supported runtime locale variants', () => {
    expect(formatDuration(1500, 'ko-KR' as Locale)).toBe('1.5초');
  });

  it('preserves arbitrary valid BCP 47 duration formatting', () => {
    expect(formatDuration(1500, 'fr' as Locale)).toBe('1,5s');
  });

  it.each(['not_a_locale', '', 'x'.repeat(65), Symbol('en')])(
    'rejects invalid runtime locale %s before formatting',
    (locale) => {
      expect(() => formatDuration(1500, locale as Locale)).toThrow(RangeError);
    },
  );

  it('normalizes negative durations to zero', () => {
    expect(formatDuration(-1500, 'en')).toBe('0ms');
  });

  it.each([NaN, Infinity, -Infinity])(
    'rejects non-finite duration %s',
    (duration) => {
      expect(() => formatDuration(duration, 'en')).toThrow(RangeError);
    },
  );
});

describe('number formatter reuse', () => {
  it('creates each locale and formatting-role combination only once', async () => {
    vi.resetModules();
    const OriginalNumberFormat = Intl.NumberFormat;
    const numberFormatSpy = vi
      .spyOn(Intl, 'NumberFormat')
      .mockImplementation(function numberFormatConstructor(locales, options) {
        return new OriginalNumberFormat(locales, options);
      });
    const freshModule = await import('../../src/locale/format.js');

    expect(() => freshModule.formatFileSize(1024, 'not_a_locale' as Locale)).toThrow(
      RangeError,
    );
    expect(numberFormatSpy).not.toHaveBeenCalled();

    for (let iteration = 0; iteration < 2; iteration++) {
      freshModule.formatDuration(500, 'ar');
      freshModule.formatDuration(1500, 'ar');
      freshModule.formatFileSize(1024, 'ar');
    }

    expect(numberFormatSpy).toHaveBeenCalledTimes(3);
  });

  it('does not retain formatter instances for non-cacheable valid locales', async () => {
    vi.resetModules();
    const OriginalNumberFormat = Intl.NumberFormat;
    const numberFormatSpy = vi
      .spyOn(Intl, 'NumberFormat')
      .mockImplementation(function numberFormatConstructor(locales, options) {
        return new OriginalNumberFormat(locales, options);
      });
    const freshModule = await import('../../src/locale/format.js');

    freshModule.formatDuration(1500, 'fr' as Locale);
    freshModule.formatDuration(1500, 'fr' as Locale);
    freshModule.formatFileSize(1536, 'en-IN' as Locale);
    freshModule.formatFileSize(1536, 'en-IN' as Locale);

    expect(numberFormatSpy).toHaveBeenCalledTimes(6);
  });
});
