import { describe, expect, it } from 'vitest';
import { isAbortError, isCancellationError } from '../../src/error/is-abort-error.js';

describe('isAbortError', () => {
  it('detects DOMException with AbortError name', () => {
    expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true);
  });

  it('rejects DOMException with different name', () => {
    expect(isAbortError(new DOMException('timeout', 'TimeoutError'))).toBe(false);
  });

  it('rejects plain Error', () => {
    expect(isAbortError(new Error('cancelled'))).toBe(false);
  });

  it('rejects non-DOMException with AbortError name', () => {
    expect(isAbortError({ name: 'AbortError' })).toBe(false);
  });

  it('rejects null and undefined', () => {
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });

  it('rejects string', () => {
    expect(isAbortError('aborted')).toBe(false);
  });
});

describe('isCancellationError', () => {
  it('detects DOMException with AbortError name', () => {
    expect(isCancellationError(new DOMException('aborted', 'AbortError'))).toBe(true);
  });

  it('detects error with AbortError cause chain', () => {
    const cause = new DOMException('aborted', 'AbortError');
    const error = new Error('something', { cause });
    expect(isCancellationError(error)).toBe(true);
  });

  it('detects message containing "cancelled"', () => {
    const error = new Error('Operation was cancelled by user');
    expect(isCancellationError(error, { checkMessage: true })).toBe(true);
  });

  it('detects message containing "canceled"', () => {
    const error = new Error('Operation was canceled');
    expect(isCancellationError(error, { checkMessage: true })).toBe(true);
  });

  it('rejects abort message without keyword flag', () => {
    const error = new Error('cancelled by user');
    expect(isCancellationError(error)).toBe(false);
  });

  it('rejects null', () => {
    expect(isCancellationError(null)).toBe(false);
  });

  it('detects plain object with name "AbortError"', () => {
    // isCancellationError checks name property on any object, not just DOMException
    // (matches wasm isCancellationError behavior in error-utils.ts:62-68)
    expect(isCancellationError({ name: 'AbortError' })).toBe(true);
  });
});
