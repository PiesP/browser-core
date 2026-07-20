/**
 * Create a new AbortController that aborts when any of the input signals abort.
 *
 * Useful for composing multiple cancellation sources (timeout + user cancel + page unload)
 * into a single signal that can be passed to `sleep()`, `fetch()`, etc.
 *
 * @param signals - Array of AbortSignals to merge
 * @returns A new AbortController whose signal aborts when any input signal aborts
 */
export function mergeAbortSignals(signals: readonly AbortSignal[]): AbortController {
  const controller = new AbortController();

  if (signals.length === 0) return controller;

  const onAbort = (): void => {
    // Find the first aborted signal and use its reason
    for (const sig of signals) {
      if (sig.aborted) {
        controller.abort(sig.reason);
        break;
      }
    }
    if (!controller.signal.aborted) {
      controller.abort();
    }
    // Clean up listeners from all signals
    for (const sig of signals) {
      sig.removeEventListener('abort', onAbort);
    }
  };

  for (const sig of signals) {
    if (sig.aborted) {
      controller.abort(sig.reason);
      return controller;
    }
    sig.addEventListener('abort', onAbort, { once: true });
  }

  return controller;
}
