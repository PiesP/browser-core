import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  schedulerPostTask,
  schedulerYield,
  yieldIfOverBudget,
  yieldIfOverBudgetAsync,
} from '../../src/util/scheduler.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('schedulerYield', () => {
  it('uses the native scheduler API when available', async () => {
    const nativeYield = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('scheduler', { yield: nativeYield });

    await schedulerYield();

    expect(nativeYield).toHaveBeenCalledOnce();
  });

  it('falls back to a zero-delay timer', async () => {
    vi.stubGlobal('scheduler', undefined);
    vi.useFakeTimers();
    const pendingYield = schedulerYield();

    await vi.runAllTimersAsync();

    await expect(pendingYield).resolves.toBeUndefined();
  });
});

describe('schedulerPostTask', () => {
  it('passes priority and signal to the native scheduler API', async () => {
    const controller = new AbortController();
    const postTask = vi.fn(
      async (callback: () => string | PromiseLike<string>) => await callback(),
    );
    vi.stubGlobal('scheduler', { postTask });

    await expect(
      schedulerPostTask(async () => 'done', {
        priority: 'user-blocking',
        signal: controller.signal,
      }),
    ).resolves.toBe('done');
    expect(postTask).toHaveBeenCalledWith(expect.any(Function), {
      priority: 'user-blocking',
      signal: controller.signal,
    });
  });

  it('uses the priority-specific fallback delay and flattens async results', async () => {
    vi.stubGlobal('scheduler', undefined);
    vi.useFakeTimers();
    const callback = vi.fn(async () => 'done');
    const task = schedulerPostTask(callback, { priority: 'background' });

    await vi.advanceTimersByTimeAsync(49);
    expect(callback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    await expect(task).resolves.toBe('done');
  });

  it('rejects a pre-aborted fallback task with the original reason', async () => {
    vi.stubGlobal('scheduler', undefined);
    const controller = new AbortController();
    const reason = new Error('cancelled');
    controller.abort(reason);

    await expect(
      schedulerPostTask(() => 'unreachable', { signal: controller.signal }),
    ).rejects.toBe(reason);
  });

  it('cancels a pending fallback task', async () => {
    vi.stubGlobal('scheduler', undefined);
    vi.useFakeTimers();
    const controller = new AbortController();
    const callback = vi.fn();
    const task = schedulerPostTask(callback, {
      priority: 'background',
      signal: controller.signal,
    });
    const reason = new DOMException('cancelled', 'AbortError');

    controller.abort(reason);

    await expect(task).rejects.toBe(reason);
    await vi.runAllTimersAsync();
    expect(callback).not.toHaveBeenCalled();
  });

  it('rejects when a fallback callback throws', async () => {
    vi.stubGlobal('scheduler', undefined);
    vi.useFakeTimers();
    const task = schedulerPostTask(() => {
      throw new Error('task failed');
    });
    const rejection = expect(task).rejects.toThrow('task failed');

    await vi.runAllTimersAsync();

    await rejection;
  });
});

describe('budget helpers', () => {
  it('updates only the synchronous budget marker', () => {
    expect(yieldIfOverBudget(10, 0, 8)).toBe(10);
    expect(yieldIfOverBudget(8, 0, 8)).toBe(0);
  });

  it('actually yields in the async variant when over budget', async () => {
    const nativeYield = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('scheduler', { yield: nativeYield });
    vi.spyOn(performance, 'now').mockReturnValue(42);

    await expect(yieldIfOverBudgetAsync(10, 0, 8)).resolves.toBe(42);
    expect(nativeYield).toHaveBeenCalledOnce();
  });

  it('keeps the previous timestamp when within budget', async () => {
    const nativeYield = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('scheduler', { yield: nativeYield });

    await expect(yieldIfOverBudgetAsync(8, 3, 8)).resolves.toBe(3);
    expect(nativeYield).not.toHaveBeenCalled();
  });
});
