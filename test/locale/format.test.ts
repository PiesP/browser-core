import { describe, expect, it } from 'vitest';
import { formatFileSize, formatDuration } from '../../src/locale/format';

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

  it('rejects negative byte counts', () => {
    expect(() => formatFileSize(-1, 'en')).toThrow(RangeError);
  });

  it('formats fractional bytes without selecting an invalid unit', () => {
    expect(formatFileSize(0.5, 'en')).toBe('1 B');
    expect(formatFileSize(Number.MIN_VALUE, 'en')).toBe('0 B');
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
