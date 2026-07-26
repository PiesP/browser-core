import { describe, expect, it, vi } from 'vitest';
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

  it('cleans earlier listeners when a later signal is already aborted', () => {
    const active = new AbortController();
    const aborted = new AbortController();
    aborted.abort('already stopped');
    const addListener = vi.spyOn(active.signal, 'addEventListener');
    const removeListener = vi.spyOn(active.signal, 'removeEventListener');

    const merged = mergeAbortSignals([active.signal, aborted.signal]);

    expect(merged.signal.aborted).toBe(true);
    expect(merged.signal.reason).toBe('already stopped');
    expect(addListener).toHaveBeenCalledOnce();
    expect(removeListener).toHaveBeenCalledOnce();
    expect(removeListener).toHaveBeenCalledWith(
      'abort',
      addListener.mock.calls[0]![1],
    );
  });

  it('removes every registered listener exactly once after abort', () => {
    const sources = [
      new AbortController(),
      new AbortController(),
      new AbortController(),
    ];
    const listenerSpies = sources.map(({ signal }) => ({
      add: vi.spyOn(signal, 'addEventListener'),
      remove: vi.spyOn(signal, 'removeEventListener'),
    }));
    const merged = mergeAbortSignals(sources.map(({ signal }) => signal));

    sources[1]!.abort('stopped');
    sources[2]!.abort('ignored later abort');

    expect(merged.signal.reason).toBe('stopped');
    for (const { add, remove } of listenerSpies) {
      expect(add).toHaveBeenCalledOnce();
      expect(remove).toHaveBeenCalledOnce();
      expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]![1]);
    }
  });

  it('removes source listeners when the merged controller is aborted directly', () => {
    const sources = [new AbortController(), new AbortController()];
    const removeListeners = sources.map(({ signal }) =>
      vi.spyOn(signal, 'removeEventListener'),
    );
    const merged = mergeAbortSignals(sources.map(({ signal }) => signal));

    merged.abort('cancelled directly');

    for (const removeListener of removeListeners) {
      expect(removeListener).toHaveBeenCalledOnce();
    }
  });

  it('registers a duplicate source signal only once', () => {
    const source = new AbortController();
    const addListener = vi.spyOn(source.signal, 'addEventListener');
    const removeListener = vi.spyOn(source.signal, 'removeEventListener');
    const merged = mergeAbortSignals([source.signal, source.signal]);

    merged.abort();

    expect(addListener).toHaveBeenCalledOnce();
    expect(removeListener).toHaveBeenCalledOnce();
  });
});
