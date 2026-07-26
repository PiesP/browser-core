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
  const source = Promise.resolve(promise);

  return new Promise<T>((resolve, reject) => {
    let outcomeOwned = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let abortHandler: (() => void) | null = null;

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

    // Attach both handlers before checking a pre-aborted signal so an already
    // rejected source is still consumed and cannot leak an unhandled rejection.
    void source.then(
      (value) => {
        if (outcomeOwned) return;
        outcomeOwned = true;
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        if (outcomeOwned) return;
        outcomeOwned = true;
        cleanup();
        reject(error);
      },
    );

    if (signal?.aborted) {
      outcomeOwned = true;
      reject(createAbortError(signal, message));
      return;
    }

    if (signal) {
      abortHandler = (): void => {
        if (outcomeOwned) return;
        outcomeOwned = true;
        cleanup();
        reject(createAbortError(signal, message));
      };
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    timerId = setTimeout(() => {
      if (outcomeOwned) return;
      // The deadline owns settlement from this point forward. A late source
      // result cannot win while asynchronous timeout cleanup is pending.
      outcomeOwned = true;
      timerId = null;
      cleanup();

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
}

function createAbortError(signal: AbortSignal, message: string | undefined): DOMException {
  return signal.reason instanceof DOMException
    ? signal.reason
    : new DOMException(message ?? 'The operation was aborted.', 'AbortError');
}
