/** Debounced function with cancel and flush methods. */
export interface DebouncedFunction<Args extends unknown[]> {
  (...args: Args): void;
  /** Cancel any pending execution. */
  cancel(): void;
  /** Immediately execute the pending call (if any). */
  flush(): void;
}

/**
 * Create a debounced version of a function.
 *
 * Delays invoking `fn` until after `wait` milliseconds have elapsed
 * since the last invocation. Each new call resets the timer.
 *
 * @param fn - The function to debounce
 * @param wait - Delay in milliseconds before invoking
 * @returns Debounced function with `cancel()` and `flush()` methods
 */
export function debounce<Args extends unknown[], Return>(
  fn: (...args: Args) => Return,
  wait: number
): DebouncedFunction<Args> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Args | null = null;

  const cancel = (): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastArgs = null;
  };

  const flush = (): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (lastArgs !== null) {
      const args = lastArgs;
      lastArgs = null;
      fn(...args);
    }
  };

  const debounced = (...args: Args): void => {
    lastArgs = args;
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = null;
      flush();
    }, wait);
  };

  debounced.cancel = cancel;
  debounced.flush = flush;

  return debounced;
}
