import { describe, expect, it } from 'vitest';
import { throwIfAborted } from '../../src/error/throw-if-aborted.js';

describe('throwIfAborted', () => {
  it('does not throw when signal is undefined', () => {
    expect(() => throwIfAborted(undefined)).not.toThrow();
  });

  it('does not throw when signal is not aborted', () => {
    const controller = new AbortController();
    expect(() => throwIfAborted(controller.signal)).not.toThrow();
  });

  it('throws AbortError when signal is aborted', () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => throwIfAborted(controller.signal)).toThrow(DOMException);
    expect(() => throwIfAborted(controller.signal)).toThrow(/aborted/i);
  });

  it('preserves the signal reason when available', () => {
    const controller = new AbortController();
    const reason = new DOMException('Custom reason', 'AbortError');
    controller.abort(reason);
    expect(() => throwIfAborted(controller.signal)).toThrow('Custom reason');
  });

  it('preserves a non-DOMException signal reason', () => {
    const controller = new AbortController();
    const reason = new Error('custom error');
    controller.abort(reason);

    expect(() => throwIfAborted(controller.signal)).toThrow(reason);
  });

  it('preserves an explicit null signal reason', () => {
    const controller = new AbortController();
    controller.abort(null);

    try {
      throwIfAborted(controller.signal);
      expect.unreachable('throwIfAborted should throw');
    } catch (reason) {
      expect(reason).toBeNull();
    }
  });

  it('throws for already-aborted signal passed as undefined does nothing', () => {
    const controller = new AbortController();
    controller.abort();
    // signal param is optional, undefined should not throw
    expect(() => throwIfAborted(undefined)).not.toThrow();
  });
});
