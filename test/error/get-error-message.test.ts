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

  it('serializes objects instead of hiding them as [object Object]', () => {
    expect(getErrorMessage({ code: 'AVIF_RESULT_OUT_OF_MEMORY' })).toBe(
      '{"code":"AVIF_RESULT_OUT_OF_MEMORY"}'
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
