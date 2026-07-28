import { describe, expect, it } from 'vitest';
import { getErrorMessage } from '../../src/error/get-error-message.js';

describe('getErrorMessage', () => {
  it('extracts message from Error instance', () => {
    expect(getErrorMessage(new Error('test error'))).toBe('test error');
  });

  it('returns string values as-is', () => {
    expect(getErrorMessage('plain error')).toBe('plain error');
  });

  it('converts null to string', () => {
    expect(getErrorMessage(null)).toBe('null');
  });

  it('extracts message from object with message property', () => {
    expect(getErrorMessage({ message: 'custom obj' })).toBe('custom obj');
  });

  it('extracts native exception text from an object with a what property', () => {
    expect(getErrorMessage({ what: 'AVIF frame encoding failed: out of memory' })).toBe(
      'AVIF frame encoding failed: out of memory'
    );
  });

  it('does not serialize arbitrary object fields', () => {
    expect(getErrorMessage({ code: 'AVIF_RESULT_OUT_OF_MEMORY', token: 'secret' })).toBe(
      '[object Object]'
    );
  });

  it('handles undefined', () => {
    expect(getErrorMessage(undefined)).toBe('undefined');
  });

  it('extracts from Error subclass', () => {
    class CustomError extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = 'CustomError';
      }
    }
    expect(getErrorMessage(new CustomError('custom'))).toBe('custom');
  });
});
