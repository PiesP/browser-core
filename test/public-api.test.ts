import { describe, expect, it } from 'vitest';
import * as core from '../src/index';
import * as asyncApi from '../src/async/index';
import * as errorApi from '../src/error/index';
import * as localeApi from '../src/locale/index';
import * as loggingApi from '../src/logging/index';
import * as utilApi from '../src/util/index';

describe('user-facing public API', () => {
  it('exposes the documented feature groups from the package entry point', () => {
    expect(typeof core.sleep).toBe('function');
    expect(typeof core.debounce).toBe('function');

    expect(typeof core.getErrorMessage).toBe('function');
    expect(typeof core.isAbortError).toBe('function');
    expect(typeof core.isCancellationError).toBe('function');
    expect(typeof core.mergeAbortSignals).toBe('function');
    expect(typeof core.throwIfAborted).toBe('function');

    expect(core.DEFAULT_LOCALE).toBe('en');
    expect(core.SUPPORTED_LOCALES.length).toBeGreaterThan(0);
    expect(typeof core.detectLocale).toBe('function');
    expect(typeof core.normalizeLocale).toBe('function');
    expect(typeof core.formatFileSize).toBe('function');
    expect(typeof core.formatDuration).toBe('function');

    expect(typeof core.createConsoleLogger).toBe('function');
    expect(typeof core.createNoopLogger).toBe('function');
    expect(typeof core.createId).toBe('function');
    expect(typeof core.clamp).toBe('function');
    expect(typeof core.clampIndex).toBe('function');
  });

  it('keeps every documented subpath aligned with the main entry point', () => {
    expect(asyncApi.sleep).toBe(core.sleep);
    expect(asyncApi.debounce).toBe(core.debounce);
    expect(errorApi.getErrorMessage).toBe(core.getErrorMessage);
    expect(errorApi.mergeAbortSignals).toBe(core.mergeAbortSignals);
    expect(localeApi.formatFileSize).toBe(core.formatFileSize);
    expect(localeApi.formatDuration).toBe(core.formatDuration);
    expect(loggingApi.createConsoleLogger).toBe(core.createConsoleLogger);
    expect(loggingApi.createNoopLogger).toBe(core.createNoopLogger);
    expect(utilApi.createId).toBe(core.createId);
    expect(utilApi.clamp).toBe(core.clamp);
    expect(utilApi.clampIndex).toBe(core.clampIndex);
  });

  it('supports the shared user flow of clamping and presenting a value', () => {
    const normalized = core.clamp(125, 0, 100);
    expect(core.formatFileSize(normalized * 1024, 'en')).toBe('100 KB');
    expect(core.formatDuration(1500, 'en')).toBe('1.5s');
  });
});
