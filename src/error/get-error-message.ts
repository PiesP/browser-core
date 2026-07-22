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
 * Read a useful string property from error-like objects produced by runtimes
 * such as Emscripten/Embind. Those objects are not always JavaScript Error
 * instances and may expose the native exception through `what` or
 * `description` instead of `message`.
 */
function getErrorProperty(error: object, key: string): string | undefined {
  const value = (error as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Serialize an object when String(error) would only produce `[object Object]`.
 */
function serializeErrorObject(error: object): string | undefined {
  try {
    const serialized = JSON.stringify(error);
    return serialized && serialized !== '{}' ? serialized : undefined;
  } catch {
    return undefined;
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
  if (isErrorWithMessage(error)) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    for (const key of ['what', 'description', 'reason', 'detail']) {
      const message = getErrorProperty(error, key);
      if (message) return message;
    }

    const stringified = String(error);
    if (stringified !== '[object Object]') return stringified;

    return serializeErrorObject(error) ?? stringified;
  }

  return String(error);
}
