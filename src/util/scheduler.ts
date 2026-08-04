/**
 * Browser scheduler API wrappers with graceful degradation for
 * environments that do not support `scheduler.yield` or
 * `scheduler.postTask` (notably Safari < 18.4 and older browsers).
 */

/**
 * Yield control back to the browser's event loop.
 *
 * Uses `scheduler.yield()` when available (Chromium 115+, Firefox 135+).
 * Falls back to `setTimeout(0)` for Safari and older browsers, which still
 * allows pending UI work to be processed.
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

  // setTimeout schedules the next macrotask after the current microtask queue
  // drains, so an intermediate resolved promise only adds avoidable overhead.
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
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
  callback: () => T | PromiseLike<T>,
  options: SchedulerPostTaskOptions = {},
): Promise<Awaited<T>> {
  const { signal, priority = 'user-visible' } = options;

  if (
    typeof globalThis.scheduler !== 'undefined' &&
    typeof (globalThis.scheduler as Scheduler & { postTask?: unknown }).postTask === 'function'
  ) {
    return (
      globalThis.scheduler as Scheduler & {
        postTask: <R>(
          cb: () => R | PromiseLike<R>,
          opts: { priority?: TaskPriority; signal?: AbortSignal },
        ) => Promise<Awaited<R>>;
      }
    ).postTask(callback, { priority, ...(signal ? { signal } : {}) });
  }

  // Fallback: setTimeout with priority-appropriate delays
  return new Promise<Awaited<T>>((resolve, reject) => {
    // Abort handling for the fallback path
    if (signal?.aborted) {
      reject(getAbortReason(signal));
      return;
    }

    const abortSignal = signal;

    const delayMap: Record<TaskPriority, number> = {
      'user-blocking': 0,
      'user-visible': 0,
      background: 50,
    };

    const timeoutId = setTimeout(() => {
      if (abortSignal) {
        abortSignal.removeEventListener('abort', onAbort);
      }
      try {
        Promise.resolve(callback()).then(resolve, reject);
      } catch (err) {
        reject(err);
      }
    }, delayMap[priority]);

    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(getAbortReason(abortSignal));
    };

    if (abortSignal) {
      abortSignal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/**
 * Return an updated budget timestamp when the elapsed time exceeds the limit.
 *
 * This synchronous compatibility helper does not yield control. New code
 * should await {@link yieldIfOverBudgetAsync} instead.
 *
 * @param now - Current `performance.now()` value
 * @param lastYield - Timestamp of the last yield (or 0 for the first check)
 * @param budgetMs - Max allowed milliseconds before yielding (default 8)
 * @returns The new `lastYield` timestamp (pass this to the next call)
 * @deprecated Use {@link yieldIfOverBudgetAsync} to yield control.
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
    return now;
  }
  return lastYield;
}

function getAbortReason(signal: AbortSignal | undefined): unknown {
  return signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError');
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
