/**
 * Returns a promise that resolves after `ms` milliseconds.
 *
 * Supports cancellation via AbortSignal — when the signal is aborted,
 * the promise rejects with an AbortError DOMException.
 *
 * @param ms - Delay duration in milliseconds
 * @param signal - Optional AbortSignal for cancellation
 * @returns Promise that resolves after the delay or rejects on abort
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  // Fast path: immediate resolution
  if (ms <= 0) {
    if (signal?.aborted) {
      return Promise.reject(signal.reason instanceof DOMException ? signal.reason : new DOMException('The operation was aborted.', 'AbortError'));
    }
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    // Already aborted — reject immediately
    if (signal?.aborted) {
      reject(signal.reason instanceof DOMException ? signal.reason : new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }

    const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, ms);

    const handleAbort = (): void => {
      clearTimeout(timeoutId);
      reject(
        signal?.reason instanceof DOMException
          ? signal.reason
          : new DOMException('The operation was aborted.', 'AbortError')
      );
    };

    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}
