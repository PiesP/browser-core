/** Canonical message used for user-initiated cancellation. */
export const USER_CANCELLED_ABORT_MESSAGE = 'The operation was aborted by the user.' as const;

/**
 * Create an AbortError with an optional cause.
 *
 * @param message - Human-readable abort reason
 * @param cause - Optional original reason
 */
export function createAbortError(
  message = 'The operation was aborted.',
  cause?: unknown,
): DOMException {
  const error = new DOMException(message, 'AbortError');
  if (cause !== undefined) {
    (error as DOMException & { cause?: unknown }).cause = cause;
  }
  return error;
}

/** Create the canonical user-cancelled AbortError. */
export function createUserCancelledAbortError(cause?: unknown): DOMException {
  return createAbortError(USER_CANCELLED_ABORT_MESSAGE, cause);
}

/**
 * Check whether the given reason is a user-cancelled abort.
 *
 * Returns `true` when the reason is the canonical user-cancelled AbortError.
 */
export function isUserCancelledAbortError(reason: unknown): reason is DOMException {
  return (
    reason instanceof DOMException &&
    reason.name === 'AbortError' &&
    reason.message === USER_CANCELLED_ABORT_MESSAGE
  );
}

/**
 * Extract a user-cancelled AbortError from the signal's `reason` if present.
 *
 * If the signal's reason is an AbortError with the canonical user-cancelled
 * message, this returns that DOMException regardless of how it was created.
 * Otherwise returns `null`.
 *
 * @param signal - The AbortSignal to inspect
 * @returns The user-cancelled DOMException, or `null`
 */
export function getUserCancelledAbortErrorFromSignal(
  signal: AbortSignal,
): DOMException | null {
  if (!signal.aborted) return null;
  return isUserCancelledAbortError(signal.reason) ? signal.reason : null;
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
    return createAbortError(
      signal.reason !== undefined ? String(signal.reason) : 'The operation was aborted.',
      signal.reason,
    );
  }
  return createAbortError();
}
