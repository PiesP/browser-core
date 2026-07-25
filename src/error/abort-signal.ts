/**
 * User-cancelled abort reason token. When an operation is cancelled by the user
 * (as opposed to a timeout or system aborts), the signal reason will be this
 * specific DOMException.
 *
 * Compare against this with `getUserCancelledAbortErrorFromSignal`.
 */
const USER_CANCELLED_REASON = new DOMException('The operation was aborted by the user.', 'AbortError');

/**
 * Check whether the given reason is a user-cancelled abort.
 *
 * Returns `true` when the reason is identical (===) to the canonical
 * user-cancelled DOMException token.
 */
function isUserCancelledReason(reason: unknown): boolean {
  return reason === USER_CANCELLED_REASON;
}

/**
 * Extract a user-cancelled AbortError from the signal's `reason` if present.
 *
 * If the signal's reason is the canonical user-cancelled token (created by
 * `getUserCancelledAbortErrorFromSignal` or `AbortController.abort()` called
 * with that same instance), this returns that DOMException. Otherwise returns
 * `null`.
 *
 * @param signal - The AbortSignal to inspect
 * @returns The user-cancelled DOMException, or `null`
 */
export function getUserCancelledAbortErrorFromSignal(
  signal: AbortSignal,
): DOMException | null {
  if (!signal.aborted) return null;
  return isUserCancelledReason(signal.reason) ? USER_CANCELLED_REASON : null;
}

/**
 * Get the abort reason from a signal, or a new AbortError if none is set.
 *
 * If the signal is aborted and has a DOMException reason, returns it.
 * If the signal is aborted with a non-DOMException reason, wraps it in a new
 * AbortError DOMException. If the signal is not aborted, creates a new
 * AbortError as a fallback.
 *
 * @param signal - The AbortSignal to inspect
 * @returns A DOMException representing the abort reason
 */
export function getAbortReasonOrAbortErrorFromSignal(
  signal: AbortSignal,
): DOMException {
  if (signal.aborted) {
    if (signal.reason instanceof DOMException) {
      return signal.reason;
    }
    // Wrap non-DOMException reasons
    return new DOMException(
      signal.reason !== undefined ? String(signal.reason) : 'The operation was aborted.',
      'AbortError',
    );
  }
  return new DOMException('The operation was aborted.', 'AbortError');
}
