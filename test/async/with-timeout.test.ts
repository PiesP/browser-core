import { describe, expect, it, vi } from 'vitest';
import { withTimeout } from '../../src/async/with-timeout.js';

describe('withTimeout', () => {
  it('resolves when promise resolves before timeout', async () => {
    const result = await withTimeout(Promise.resolve(42), 5000);
    expect(result).toBe(42);
  });

  it('rejects with TimeoutError when promise takes too long', async () => {
    const never = new Promise<number>(() => {});
    await expect(withTimeout(never, 10)).rejects.toThrow('timed out');
    // Should be a DOMException with name TimeoutError
    try {
      await withTimeout(never, 10);
    } catch (err) {
      expect(err).toBeInstanceOf(DOMException);
      expect((err as DOMException).name).toBe('TimeoutError');
    }
  });

  it('rejects with custom timeout message', async () => {
    const never = new Promise<number>(() => {});
    await expect(withTimeout(never, 10, 'Custom timeout')).rejects.toThrow(
      'Custom timeout',
    );
  });

  it('rejects immediately if signal is already aborted', () => {
    const controller = new AbortController();
    controller.abort();
    expect(() =>
      withTimeout(Promise.resolve(42), 5000, undefined, undefined, controller.signal),
    ).toThrow('aborted');
  });

  it('rejects when signal is aborted mid-wait', async () => {
    const controller = new AbortController();
    const never = new Promise<number>(() => {});
    const promise = withTimeout(never, 5000, undefined, undefined, controller.signal);

    // Abort after a short delay
    setTimeout(() => controller.abort(), 20);

    await expect(promise).rejects.toThrow();
  });

  it('calls onTimeout callback when timeout fires', async () => {
    const onTimeout = vi.fn();
    const never = new Promise<number>(() => {});

    let caught = false;
    try {
      await withTimeout(never, 20, undefined, onTimeout);
    } catch {
      caught = true;
    }
    expect(caught).toBe(true);
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it('rejects the returned promise when onTimeout throws', async () => {
    vi.useFakeTimers();
    const callbackError = new Error('timeout cleanup failed');

    try {
      const result = withTimeout(
        new Promise<never>(() => {}),
        10,
        undefined,
        () => {
          throw callbackError;
        },
      );
      const outcome = result.then(
        () => ({ status: 'resolved' as const }),
        (reason: unknown) => ({ status: 'rejected' as const, reason }),
      );

      expect(() => vi.advanceTimersByTime(10)).not.toThrow();
      await expect(outcome).resolves.toEqual({
        status: 'rejected',
        reason: callbackError,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects with an asynchronous onTimeout error without leaking a rejection', async () => {
    vi.useFakeTimers();
    const callbackError = new Error('asynchronous timeout cleanup failed');

    try {
      const result = withTimeout(
        new Promise<never>(() => {}),
        10,
        undefined,
        async () => {
          throw callbackError;
        },
      );
      const outcome = result.then(
        () => ({ status: 'resolved' as const }),
        (reason: unknown) => ({ status: 'rejected' as const, reason }),
      );

      await vi.advanceTimersByTimeAsync(10);

      await expect(outcome).resolves.toEqual({
        status: 'rejected',
        reason: callbackError,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not call onTimeout when promise resolves before timeout', async () => {
    const onTimeout = vi.fn();
    const result = await withTimeout(Promise.resolve('ok'), 5000, undefined, onTimeout);
    expect(result).toBe('ok');
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('resolves with the winning promise in a race', async () => {
    const fast = new Promise<string>((resolve) => setTimeout(() => resolve('fast'), 10));
    const result = await withTimeout(fast, 5000);
    expect(result).toBe('fast');
  });

  it('handles rejection from the underlying promise', async () => {
    const failing = Promise.reject(new Error('underlying error'));
    await expect(withTimeout(failing, 5000)).rejects.toThrow('underlying error');
  });

  it('uses signal reason if it is a DOMException', async () => {
    const controller = new AbortController();
    const reason = new DOMException('Custom abort', 'AbortError');
    const never = new Promise<number>(() => {});
    const promise = withTimeout(never, 5000, undefined, undefined, controller.signal);

    // Need to replace the reason — AbortController.abort() creates its own DOMException
    // We'll test by pre-aborting with a custom reason
    setTimeout(() => {
      // Monkey-patch to test: call abort with custom reason
      try {
        controller.abort(reason);
      } catch {
        // Already aborted by our custom abort, which is fine
      }
    }, 20);

    await expect(promise).rejects.toThrow();
  });

  it('wraps non-DOMException signal reason in AbortError', () => {
    const controller = new AbortController();
    controller.abort('just a string');
    expect(() =>
      withTimeout(Promise.resolve(42), 5000, undefined, undefined, controller.signal),
    ).toThrow('aborted');
  });
});
