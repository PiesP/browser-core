/**
 * Wraps a promise with a timeout. If the promise does not settle within `ms`
 * milliseconds, the returned promise rejects with a TimeoutError DOMException.
 *
 * Supports cancellation via an AbortSignal — when the signal is aborted,
 * the promise rejects with an AbortError before the timeout fires.
 * An already-aborted signal returns a rejected promise, matching aborts that
 * happen while the operation is pending.
 *
 * @param promise - The promise to wrap
 * @param ms - Timeout duration in milliseconds
 * @param message - Optional custom error message for the timeout
 * @param onTimeout - Optional callback invoked when the timeout fires. If it
 * returns a promise, timeout settlement waits for it; callback errors reject
 * the returned promise.
 * @param signal - Optional AbortSignal for cancellation
 * @returns Promise that resolves with the original value or rejects on timeout/abort
 */
export function withTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  message?: string,
  onTimeout?: () => void | PromiseLike<void>,
  signal?: AbortSignal,
): Promise<T> {
  // Fast path: already aborted
  if (signal?.aborted) {
    return Promise.reject(
      signal.reason instanceof DOMException
        ? signal.reason
        : new DOMException(message ?? 'The operation was aborted.', 'AbortError'),
    );
  }

  let timerId: ReturnType<typeof setTimeout> | null = null;
  let abortHandler: (() => void) | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      timerId = null;
      if (signal && abortHandler) {
        signal.removeEventListener('abort', abortHandler);
        abortHandler = null;
      }
      let callbackResult: void | PromiseLike<void>;
      try {
        callbackResult = onTimeout?.();
      } catch (error) {
        reject(error);
        return;
      }

      void Promise.resolve(callbackResult).then(
        () => {
          reject(new DOMException(message ?? 'The operation timed out.', 'TimeoutError'));
        },
        (error: unknown) => {
          reject(error);
        },
      );
    }, ms);
  });

  if (signal) {
    const abortPromise = new Promise<never>((_, reject) => {
      abortHandler = (): void => {
        if (timerId !== null) {
          clearTimeout(timerId);
          timerId = null;
        }
        reject(
          signal.reason instanceof DOMException
            ? signal.reason
            : new DOMException(message ?? 'The operation was aborted.', 'AbortError'),
        );
      };
      signal.addEventListener('abort', abortHandler, { once: true });
    });

    // Cleanup helper
    const cleanup = (): void => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (signal && abortHandler) {
        signal.removeEventListener('abort', abortHandler);
        abortHandler = null;
      }
    };

    return Promise.race([promise, timeoutPromise, abortPromise]).finally(cleanup) as Promise<T>;
  }

  // No signal — simpler path
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }) as Promise<T>;
}
