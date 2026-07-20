/**
 * Throw if the given AbortSignal has already been aborted.
 *
 * This is a convenience wrapper for the common pattern of checking
 * `signal.aborted` and throwing the signal's reason.
 *
 * @param signal - Optional AbortSignal to check
 * @throws {DOMException} AbortError if the signal is aborted
 */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason instanceof DOMException
      ? signal.reason
      : new DOMException('The operation was aborted.', 'AbortError');
  }
}
