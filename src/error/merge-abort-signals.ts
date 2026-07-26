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

  const listeningSignals: AbortSignal[] = [];

  const cleanup = (): void => {
    for (const signal of listeningSignals.splice(0)) {
      signal.removeEventListener('abort', onAbort);
    }
  };

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
    cleanup();
  };

  for (const sig of signals) {
    if (sig.aborted) {
      controller.abort(sig.reason);
      cleanup();
      return controller;
    }
    sig.addEventListener('abort', onAbort, { once: true });
    listeningSignals.push(sig);
  }

  return controller;
}
