/**
 * A deferred promise that can be resolved or rejected externally.
 */
export interface Deferred<T> {
  /** The underlying promise. */
  promise: Promise<T>;
  /** Resolve the promise. */
  resolve: (value: T | PromiseLike<T>) => void;
  /** Reject the promise. */
  reject: (reason?: unknown) => void;
}

/**
 * Create a deferred promise — a promise whose resolution can be controlled
 * from outside the executor.
 *
 * Useful for building promise-based interfaces around callback-style APIs,
 * or when you need to pass `resolve` / `reject` to a different scope.
 *
 * @returns A Deferred object with `promise`, `resolve`, and `reject`
 *
 * @example
 * ```ts
 * const deferred = createDeferred<string>();
 * someAsyncCallback((result) => deferred.resolve(result));
 * return deferred.promise;
 * ```
 */
export function createDeferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}
