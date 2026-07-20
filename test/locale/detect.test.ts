import { describe, expect, it } from 'vitest';
import { detectLocale, normalizeLocale } from '../../src/locale/detect';

describe('normalizeLocale', () => {
  it('returns exact match for lowercase code', () => {
    expect(normalizeLocale('ko')).toBe('ko');
  });

  it('returns exact match for uppercase code', () => {
    expect(normalizeLocale('EN')).toBe('en');
  });

  it('returns language-region match', () => {
    expect(normalizeLocale('zh-CN')).toBe('zh-CN');
  });

  it('returns base match for 2-letter prefix', () => {
    expect(normalizeLocale('zh-TW')).toBe('zh-CN');
  });

  it('returns null for unsupported locale', () => {
    expect(normalizeLocale('fr')).toBeNull();
  });

  it('returns null for gibberish', () => {
    expect(normalizeLocale('xyz')).toBeNull();
  });

  it('handles region codes for supported languages', () => {
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('ko-KR')).toBe('ko');
    expect(normalizeLocale('ja-JP')).toBe('ja');
    expect(normalizeLocale('es-ES')).toBe('es');
    expect(normalizeLocale('ar-SA')).toBe('ar');
  });
});

describe('detectLocale', () => {
  it('uses platformUI language first', () => {
    const result = detectLocale({
      platformUILanguage: 'ko',
      languages: ['en-US', 'en'],
    });
    expect(result).toBe('ko');
  });

  it('uses navigator.languages order', () => {
    const result = detectLocale({
      languages: ['ko-KR', 'en'],
    });
    expect(result).toBe('ko');
  });

  it('falls back to second language when first is unsupported', () => {
    const result = detectLocale({
      languages: ['fr', 'de', 'ko'],
    });
    expect(result).toBe('ko');
  });

  it('falls back to DEFAULT_LOCALE when nothing matches', () => {
    const result = detectLocale({
      languages: ['fr', 'de'],
    });
    expect(result).toBe('en');
  });

  it('uses singleLanguage as fallback', () => {
    const result = detectLocale({
      singleLanguage: 'ja',
    });
    expect(result).toBe('ja');
  });

  it('prefers platformUI over singleLanguage', () => {
    const result = detectLocale({
      platformUILanguage: 'es',
      singleLanguage: 'en',
    });
    expect(result).toBe('es');
  });

  it('handles zh-TW → zh-CN mapping', () => {
    const result = detectLocale({
      languages: ['zh-TW', 'en'],
    });
    expect(result).toBe('zh-CN');
  });

  it('returns DEFAULT_LOCALE for empty options', () => {
    const result = detectLocale({});
    expect(result).toBe('en');
  });
});
