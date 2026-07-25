export interface CancellationCheckOptions {
  /** Also check the error message for "cancelled" / "canceled" keywords. */
  checkMessage?: boolean;
}

export interface AbortErrorCheckOptions {
  /**
   * Also recognize TimeoutError DOMExceptions as abort-like errors.
   * When `true`, `isAbortError` returns `true` for `TimeoutError` in addition
   * to `AbortError`.
   */
  checkTimeout?: boolean;
}

/**
 * Check whether an error is a strict AbortError.
 *
 * Returns `true` only for DOMException instances with name "AbortError".
 * If `options.checkTimeout` is `true`, also returns `true` for
 * DOMException instances with name "TimeoutError".
 *
 * This matches the behavior of xcom-enhanced-gallery (`cancellation.ts:10-14`)
 * and yt-live-chat-overlay (`dom.ts:178-179`).
 *
 * @param error - Unknown error value
 * @param options - Configuration for timeout checking
 * @returns True if the error is a DOMException AbortError (or TimeoutError)
 */
export function isAbortError(
  error: unknown,
  options: AbortErrorCheckOptions = {},
): boolean {
  if (!(error instanceof DOMException)) return false;
  if (error.name === 'AbortError') return true;
  if (options.checkTimeout && error.name === 'TimeoutError') return true;
  return false;
}

/**
 * Broader cancellation check that also inspects the cause chain and
 * (optionally) message text for cancellation keywords.
 *
 * This matches the behavior of wasm-motion-converter's
 * `isCancellationError` (`error-utils.ts:61-87`).
 *
 * @param error - Unknown error value
 * @param options - Configuration for message checking
 * @returns True if the error indicates a cancellation
 */
export function isCancellationError(
  error: unknown,
  options: CancellationCheckOptions = {}
): boolean {
  // 1. Direct AbortError name
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name: unknown }).name === 'AbortError'
  ) {
    return true;
  }

  // 2. Cause chain — AbortError wrapped in one or more errors. A visited set
  // prevents malformed cyclic cause objects from looping forever.
  const visited = new Set<object>();
  let current: unknown = error;
  while (typeof current === 'object' && current !== null) {
    if (visited.has(current)) break;
    visited.add(current);

    if ('name' in current && (current as { name: unknown }).name === 'AbortError') {
      return true;
    }
    if (!('cause' in current)) break;
    current = (current as { cause: unknown }).cause;
  }

  // 3. Optional message keyword check
  if (options.checkMessage) {
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message).toLowerCase()
        : String(error).toLowerCase();

    return message.includes('cancelled') || message.includes('canceled');
  }

  return false;
}
