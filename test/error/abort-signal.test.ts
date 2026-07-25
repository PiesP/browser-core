import { describe, expect, it } from 'vitest';
import {
  getUserCancelledAbortErrorFromSignal,
  getAbortReasonOrAbortErrorFromSignal,
} from '../../src/error/abort-signal.js';

describe('getUserCancelledAbortErrorFromSignal', () => {
  it('returns null when the signal is not aborted', () => {
    const controller = new AbortController();
    expect(getUserCancelledAbortErrorFromSignal(controller.signal)).toBeNull();
  });

  it('returns null when aborted without the canonical reason', () => {
    const controller = new AbortController();
    controller.abort(); // creates a fresh DOMException
    expect(getUserCancelledAbortErrorFromSignal(controller.signal)).toBeNull();
  });

  it('returns null when aborted with a non-DOMException reason', () => {
    const controller = new AbortController();
    controller.abort('Some message');
    expect(getUserCancelledAbortErrorFromSignal(controller.signal)).toBeNull();
  });

  it('returns null when aborted with a different AbortError', () => {
    const controller = new AbortController();
    controller.abort(new DOMException('something else', 'AbortError'));
    expect(getUserCancelledAbortErrorFromSignal(controller.signal)).toBeNull();
  });
});

describe('getAbortReasonOrAbortErrorFromSignal', () => {
  it('returns a new AbortError when signal is not aborted', () => {
    const controller = new AbortController();
    const result = getAbortReasonOrAbortErrorFromSignal(controller.signal);
    expect(result).toBeInstanceOf(DOMException);
    expect(result.name).toBe('AbortError');
  });

  it('returns the signal reason when it is a DOMException', () => {
    const controller = new AbortController();
    const reason = new DOMException('custom reason', 'AbortError');
    controller.abort(reason);
    const result = getAbortReasonOrAbortErrorFromSignal(controller.signal);
    expect(result).toBe(reason);
    expect(result.name).toBe('AbortError');
    expect(result.message).toBe('custom reason');
  });

  it('wraps a string reason in an AbortError DOMException', () => {
    const controller = new AbortController();
    controller.abort('user clicked cancel');
    const result = getAbortReasonOrAbortErrorFromSignal(controller.signal);
    expect(result).toBeInstanceOf(DOMException);
    expect(result.name).toBe('AbortError');
    expect(result.message).toBe('user clicked cancel');
  });

  it('returns a default message for undefined reason', () => {
    const controller = new AbortController();
    controller.abort();
    const result = getAbortReasonOrAbortErrorFromSignal(controller.signal);
    expect(result).toBeInstanceOf(DOMException);
    expect(result.name).toBe('AbortError');
    // Default reason from AbortController.abort() is the DOMException itself
    expect(result).toBeInstanceOf(DOMException);
  });

  it('wraps a number reason in an AbortError DOMException', () => {
    const controller = new AbortController();
    controller.abort(42 as unknown as string);
    const result = getAbortReasonOrAbortErrorFromSignal(controller.signal);
    expect(result).toBeInstanceOf(DOMException);
    expect(result.name).toBe('AbortError');
  });

  it('wraps an object reason in an AbortError DOMException', () => {
    const controller = new AbortController();
    controller.abort({ code: 'CANCEL' } as unknown as string);
    const result = getAbortReasonOrAbortErrorFromSignal(controller.signal);
    expect(result).toBeInstanceOf(DOMException);
    expect(result.name).toBe('AbortError');
  });
});
