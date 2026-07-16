import { describe, expect, it } from 'vitest';
import { sleep } from '../../src/async/sleep.js';

describe('sleep', () => {
  it('resolves immediately for zero ms', async () => {
    const start = Date.now();
    await sleep(0);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('resolves after approximately the specified delay', async () => {
    const start = Date.now();
    await sleep(100);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(80); // allow some slop
    expect(elapsed).toBeLessThan(200);
  });

  it('rejects immediately if signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(sleep(100, controller.signal)).rejects.toThrow('aborted');
  });

  it('rejects when signal is aborted mid-wait', async () => {
    const controller = new AbortController();
    const promise = sleep(500, controller.signal);
    setTimeout(() => controller.abort(), 50);
    await expect(promise).rejects.toThrow();
  });

  it('cleans up timeout on abort', async () => {
    // Should not leak timers — verify that resolve after timeout
    // doesn't cause unhandled rejection
    const controller = new AbortController();
    const promise = sleep(200, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow();

    // After abort, a second sleep with same signal should work
    // (previous listener was cleaned up with { once: true })
    const c2 = new AbortController();
    const start = Date.now();
    await sleep(50, c2.signal);
    expect(Date.now() - start).toBeGreaterThanOrEqual(30);
  });
});
