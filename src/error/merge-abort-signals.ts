export interface MergedAbortSignal {
  readonly signal: AbortSignal;
  cleanup: () => void;
}

interface MergedAbortController extends MergedAbortSignal {
  readonly controller: AbortController;
}

function createMergedAbortController(signals: readonly AbortSignal[]): MergedAbortController {
  const controller = new AbortController();
  const listeningSignals = new Set<AbortSignal>();

  const cleanup = (): void => {
    controller.signal.removeEventListener('abort', cleanup);
    for (const signal of listeningSignals) {
      signal.removeEventListener('abort', onAbort);
    }
    listeningSignals.clear();
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

  controller.signal.addEventListener('abort', cleanup, { once: true });

  for (const sig of signals) {
    if (sig.aborted) {
      controller.abort(sig.reason);
      cleanup();
      return { controller, signal: controller.signal, cleanup };
    }
    if (listeningSignals.has(sig)) continue;
    sig.addEventListener('abort', onAbort, { once: true });
    listeningSignals.add(sig);
  }

  return { controller, signal: controller.signal, cleanup };
}

/**
 * Create a signal that aborts when any input signal aborts and expose an
 * idempotent cleanup function for successful operations.
 */
export function mergeAbortSignalsWithCleanup(
  signals: readonly AbortSignal[],
): MergedAbortSignal {
  const { signal, cleanup } = createMergedAbortController(signals);
  return { signal, cleanup };
}

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
  return createMergedAbortController(signals).controller;
}
