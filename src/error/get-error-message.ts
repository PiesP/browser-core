/**
 * Type guard: check if an unknown value has a string `message` property.
 */
function isErrorWithMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
}

/**
 * Extract a human-readable error message from any error type.
 *
 * Handles Error instances, objects with a `message` property,
 * plain strings, and fallback to `String(error)`.
 *
 * @param error - Unknown error value
 * @returns Error message string
 */
export function getErrorMessage(error: unknown): string {
  if (isErrorWithMessage(error)) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
