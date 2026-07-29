/**
 * Throw if the given AbortSignal has already been aborted.
 *
 * This is a convenience wrapper for the common pattern of checking
 * `signal.aborted` and throwing the signal's reason.
 *
 * @param signal - Optional AbortSignal to check
 * @throws The signal's reason, or an AbortError when no reason is available
 */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason === undefined
      ? new DOMException('The operation was aborted.', 'AbortError')
      : signal.reason;
  }
}
