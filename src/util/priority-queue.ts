/**
 * An O(1) enqueue priority queue backed by priority buckets.
 *
 * Items are assigned a safe-integer priority (lower = higher priority).
 * Buckets are stored by priority without allocating intermediate slots, so
 * priorities with very large gaps do not create sparse arrays.
 *
 * Dequeue is O(number of active priority levels) when it advances to the next
 * bucket, and shifts the first item within a bucket.
 *
 * @typeParam T - Item type
 *
 * @example
 * ```ts
 * const queue = new PriorityBucketQueue<string>();
 * queue.enqueue('a', 2);
 * queue.enqueue('b', 0); // higher priority
 * queue.dequeue(); // 'b'
 * queue.dequeue(); // 'a'
 * ```
 */
export class PriorityBucketQueue<T> {
  /** Non-empty item buckets keyed by priority. */
  private readonly _buckets = new Map<number, T[]>();

  /** Current minimum priority among non-empty buckets. */
  private _min = Infinity;

  /** Total number of items in the queue. */
  private _count = 0;

  /** Number of items currently stored. */
  get size(): number {
    return this._count;
  }

  /** Whether the queue is empty. */
  get isEmpty(): boolean {
    return this._count === 0;
  }

  /**
   * Insert an item with the given priority.
   *
   * @param item - The item to enqueue
   * @param priority - Safe-integer priority (lower value = higher priority)
   * @returns This queue (for chaining)
   * @throws {RangeError} If `priority` is not a safe integer
   */
  enqueue(item: T, priority: number): this {
    if (!Number.isSafeInteger(priority)) {
      throw new RangeError('priority must be a safe integer');
    }

    let bucket = this._buckets.get(priority);
    if (!bucket) {
      bucket = [];
      this._buckets.set(priority, bucket);
    }
    bucket.push(item);
    this._count++;

    if (priority < this._min) {
      this._min = priority;
    }

    return this;
  }

  /**
   * Remove and return the highest-priority item.
   *
   * @returns The item, or `undefined` if the queue is empty
   */
  dequeue(): T | undefined {
    if (this._count === 0) return undefined;

    const bucket = this._buckets.get(this._min)!;
    const item = bucket.shift()!;
    this._count--;

    if (bucket.length === 0) {
      this._buckets.delete(this._min);
      this._min = this._findMinimumPriority();
    }

    return item;
  }

  /**
   * Return the highest-priority item without removing it.
   *
   * @returns The item, or `undefined` if the queue is empty
   */
  peek(): T | undefined {
    if (this._count === 0) return undefined;
    return this._buckets.get(this._min)![0];
  }

  /** Remove all items. */
  clear(): void {
    this._buckets.clear();
    this._min = Infinity;
    this._count = 0;
  }

  /**
   * Execute `callback` for each item in priority order.
   *
   * This does NOT dequeue items; it iterates a snapshot of the current state.
   *
   * @param callback - Called with each item and its priority
   */
  forEach(callback: (item: T, priority: number) => void): void {
    const priorities = [...this._buckets.keys()].sort((a, b) => a - b);
    for (const priority of priorities) {
      const bucket = this._buckets.get(priority)!;
      for (const item of bucket) {
        callback(item, priority);
      }
    }
  }

  /** Find the lowest active priority, or `Infinity` when empty. */
  private _findMinimumPriority(): number {
    let minimum = Infinity;
    for (const priority of this._buckets.keys()) {
      if (priority < minimum) {
        minimum = priority;
      }
    }
    return minimum;
  }
}
