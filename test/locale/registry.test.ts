import { describe, expect, it } from 'vite-plus/test';
import { isLocale, LOCALE_CODES, SUPPORTED_LOCALES } from '../../src/locale';

const expectedLocales = [
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'ko', name: '한국어', dir: 'ltr' },
  { code: 'ja', name: '日本語', dir: 'ltr' },
  { code: 'zh-CN', name: '简体中文', dir: 'ltr' },
  { code: 'es', name: 'Español', dir: 'ltr' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
] as const;

describe('supported locale registry', () => {
  it('keeps the independent supported set, order, and required metadata', () => {
    expect(SUPPORTED_LOCALES).toEqual(expectedLocales);
    expect(LOCALE_CODES).toEqual(expectedLocales.map(({ code }) => code));
    expect(new Set(LOCALE_CODES).size).toBe(expectedLocales.length);
  });

  it('accepts only exact canonical locale identifiers', () => {
    for (const { code } of expectedLocales) {
      expect(isLocale(code)).toBe(true);
    }

    for (const value of [
      'auto',
      'en-US',
      'EN',
      'zh-TW',
      'fr',
      '',
      'toString',
      '__proto__',
      null,
      undefined,
      1,
      { code: 'en' },
    ]) {
      expect(isLocale(value)).toBe(false);
    }
  });
});
