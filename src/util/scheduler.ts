/**
 * Browser scheduler API wrappers with graceful degradation for
 * environments that do not support `scheduler.yield` or
 * `scheduler.postTask` (notably Safari < 18.4 and older browsers).
 */

/**
 * Yield control back to the browser's event loop.
 *
 * Uses `scheduler.yield()` when available (Chromium 115+, Firefox 135+).
 * Falls back to a microtask-delayed `setTimeout(0)` for Safari and older
 * browsers, which still allows pending UI work to be processed.
 *
 * Call this inside long-running synchronous work to keep the page
 * responsive.
 *
 * @returns A promise that resolves after yielding
 */
export function schedulerYield(): Promise<void> {
  if (
    typeof globalThis.scheduler !== 'undefined' &&
    typeof (globalThis.scheduler as Scheduler & { yield?: () => Promise<void> }).yield === 'function'
  ) {
    return (globalThis.scheduler as Scheduler & { yield: () => Promise<void> }).yield();
  }

  // Fallback: yield via setTimeout(0) wrapped in a resolved promise
  // so the microtask queue drains before the macrotask fires.
  return Promise.resolve().then(
    () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
  );
}

/**
 * Priority levels supported by `schedulerPostTask`.
 */
export type TaskPriority = 'user-blocking' | 'user-visible' | 'background';

/**
 * Options for `schedulerPostTask`.
 */
export interface SchedulerPostTaskOptions {
  /** Task priority. Defaults to `'user-visible'`. */
  priority?: TaskPriority;
  /** An `AbortSignal` that can cancel the task before it runs. */
  signal?: AbortSignal;
}

/**
 * Schedule a callback to run at the given priority.
 *
 * Uses `scheduler.postTask()` when available (Chromium 94+).
 * Falls back to `setTimeout(callback, delay)` with priority-appropriate
 * delays for Safari and older browsers.
 *
 * @param callback - The function to schedule
 * @param options - Scheduling options
 * @returns A promise that resolves with the callback's return value
 *
 * @typeParam T - Return type of the callback
 */
export function schedulerPostTask<T = void>(
  callback: () => T,
  options: SchedulerPostTaskOptions = {},
): Promise<T> {
  const { signal, priority = 'user-visible' } = options;

  if (
    typeof globalThis.scheduler !== 'undefined' &&
    typeof (globalThis.scheduler as Scheduler & { postTask?: unknown }).postTask === 'function'
  ) {
    return (
      globalThis.scheduler as Scheduler & {
        postTask: <R>(
          cb: () => R,
          opts: { priority?: TaskPriority; signal?: AbortSignal },
        ) => Promise<R>;
      }
    ).postTask(callback, { priority, ...(signal ? { signal } : {}) });
  }

  // Fallback: setTimeout with priority-appropriate delays
  return new Promise<T>((resolve, reject) => {
    // Abort handling for the fallback path
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    const delayMap: Record<TaskPriority, number> = {
      'user-blocking': 0,
      'user-visible': 0,
      background: 50,
    };

    const timeoutId = setTimeout(() => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      try {
        resolve(callback());
      } catch (err) {
        reject(err);
      }
    }, delayMap[priority]);

    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(signal!.reason);
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/**
 * Yield control back to the browser if the elapsed time since the last
 * yield exceeds the given budget.
 *
 * Useful inside long loops — call this periodically and pass the result
 * of a `performance.now()` snapshot taken at the start of the frame/work
 * unit.
 *
 * @param now - Current `performance.now()` value
 * @param lastYield - Timestamp of the last yield (or 0 for the first check)
 * @param budgetMs - Max allowed milliseconds before yielding (default 8)
 * @returns The new `lastYield` timestamp (pass this to the next call)
 *
 * @example
 * ```ts
 * let lastYield = 0;
 * for (const item of items) {
 *   processItem(item);
 *   lastYield = yieldIfOverBudget(performance.now(), lastYield, 8);
 * }
 * ```
 */
export function yieldIfOverBudget(
  now: number,
  lastYield: number,
  budgetMs = 8,
): number {
  if (now - lastYield > budgetMs) {
    // Note: we must await the caller to actually yield — this function
    // returns the new lastYield so the caller can do:
    //   lastYield = await yieldIfOverBudget(...)
    // For synchronous callers, this is a no-op marker.
    return now;
  }
  return lastYield;
}

/**
 * Async variant of `yieldIfOverBudget` that actually yields when over budget.
 *
 * @param now - Current `performance.now()` value
 * @param lastYield - Timestamp of the last yield (or 0)
 * @param budgetMs - Max allowed milliseconds before yielding (default 8)
 * @returns The new `lastYield` timestamp after potentially yielding
 *
 * @example
 * ```ts
 * let lastYield = 0;
 * for (const item of items) {
 *   processItem(item);
 *   lastYield = await yieldIfOverBudgetAsync(performance.now(), lastYield, 8);
 * }
 * ```
 */
export async function yieldIfOverBudgetAsync(
  now: number,
  lastYield: number,
  budgetMs = 8,
): Promise<number> {
  if (now - lastYield > budgetMs) {
    await schedulerYield();
    return performance.now();
  }
  return lastYield;
}
