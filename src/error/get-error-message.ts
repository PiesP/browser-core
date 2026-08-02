/**
 * Read a useful string property from error-like objects produced by runtimes
 * such as Emscripten/Embind. Those objects are not always JavaScript Error
 * instances and may expose the native exception through `what` or
 * `description` instead of `message`.
 */
function getErrorProperty(
  error: object,
  key: string,
  allowEmpty = false
): string | undefined {
  try {
    const value = Reflect.get(error, key) as unknown;
    return typeof value === 'string' && (allowEmpty || value.length > 0)
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

/** Convert an arbitrary thrown value without allowing coercion hooks to throw. */
function stringifyError(error: unknown): string {
  try {
    return String(error);
  } catch {
    return 'Unknown error';
  }
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
  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'object' && error !== null) {
    const message = getErrorProperty(error, 'message', true);
    if (message !== undefined) return message;

    for (const key of ['what', 'description']) {
      const nativeMessage = getErrorProperty(error, key);
      if (nativeMessage) return nativeMessage;
    }

    return stringifyError(error);
  }

  return stringifyError(error);
}
