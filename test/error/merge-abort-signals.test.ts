import { describe, expect, it } from 'vitest';
import { mergeAbortSignals } from '../../src/error/merge-abort-signals.js';

describe('mergeAbortSignals', () => {
  it('resolves when no signals are provided', () => {
    const controller = mergeAbortSignals([]);
    expect(controller.signal.aborted).toBe(false);
  });

  it('aborts when any signal aborts', () => {
    const c1 = new AbortController();
    const c2 = new AbortController();
    const merged = mergeAbortSignals([c1.signal, c2.signal]);

    c1.abort();
    expect(merged.signal.aborted).toBe(true);
  });

  it('aborts when later signal aborts', () => {
    const c1 = new AbortController();
    const c2 = new AbortController();
    const merged = mergeAbortSignals([c1.signal, c2.signal]);

    c2.abort();
    expect(merged.signal.aborted).toBe(true);
  });

  it('does not abort before any signal aborts', () => {
    const c1 = new AbortController();
    const merged = mergeAbortSignals([c1.signal]);
    expect(merged.signal.aborted).toBe(false);
  });

  it('cleans up listeners on abort', () => {
    // After the merged signal aborts, aborting the other source
    // should not throw or cause issues
    const c1 = new AbortController();
    const c2 = new AbortController();
    const merged = mergeAbortSignals([c1.signal, c2.signal]);

    c1.abort();
    expect(merged.signal.aborted).toBe(true);
    // This should be a no-op after cleanup
    c2.abort();
    expect(merged.signal.aborted).toBe(true);
  });
});
