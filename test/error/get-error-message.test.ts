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

  it('converts object without message to string', () => {
    expect(getErrorMessage({ foo: 'bar' })).toBe('[object Object]');
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
