import { describe, expect, it } from 'vitest';
import { createDeferred } from '../../src/async/deferred.js';

describe('createDeferred', () => {
  it('returns an object with promise, resolve, and reject', () => {
    const d = createDeferred<number>();
    expect(d).toHaveProperty('promise');
    expect(d).toHaveProperty('resolve');
    expect(d).toHaveProperty('reject');
    expect(d.promise).toBeInstanceOf(Promise);
    expect(typeof d.resolve).toBe('function');
    expect(typeof d.reject).toBe('function');
  });

  it('resolves the promise when resolve is called', async () => {
    const d = createDeferred<string>();
    d.resolve('hello');
    await expect(d.promise).resolves.toBe('hello');
  });

  it('rejects the promise when reject is called', async () => {
    const d = createDeferred<string>();
    d.reject(new Error('fail'));
    await expect(d.promise).rejects.toThrow('fail');
  });

  it('resolves with a promise-like value', async () => {
    const d = createDeferred<number>();
    d.resolve(Promise.resolve(42));
    await expect(d.promise).resolves.toBe(42);
  });

  it('can be resolved after being awaited', async () => {
    const d = createDeferred<string>();
    setTimeout(() => d.resolve('async result'), 10);
    const result = await d.promise;
    expect(result).toBe('async result');
  });

  it('can be rejected after being awaited', async () => {
    const d = createDeferred<string>();
    setTimeout(() => d.reject(new Error('async error')), 10);
    await expect(d.promise).rejects.toThrow('async error');
  });

  it('creates independent deferred objects', async () => {
    const d1 = createDeferred<number>();
    const d2 = createDeferred<number>();

    d1.resolve(1);
    d2.resolve(2);

    await expect(d1.promise).resolves.toBe(1);
    await expect(d2.promise).resolves.toBe(2);
  });

  it('can resolve with undefined', async () => {
    const d = createDeferred<void>();
    d.resolve();
    await expect(d.promise).resolves.toBeUndefined();
  });

  it('can reject with a string reason', async () => {
    const d = createDeferred<void>();
    d.reject('string reason');
    await expect(d.promise).rejects.toBe('string reason');
  });
});
