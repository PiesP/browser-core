/**
 * An O(1) enqueue priority queue backed by bucketed arrays.
 *
 * Items are assigned a numeric priority (lower = higher priority). Internally
 * the queue maintains an array of buckets where the index is the priority
 * level, plus an offset so that the lowest active priority always starts at
 * index 0 of the internal bucket array, avoiding large sparse arrays for
 * high-priority-first workloads.
 *
 * Dequeue is O(number-of-priority-levels) because it scans forward through
 * buckets to find the next non-empty one and shifts the first item.
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
  /** Buckets indexed by `priority - _offset`. Empty slots are `undefined`. */
  private _buckets: (T[] | undefined)[] = [];

  /**
   * Offset so that the lowest active priority maps to index 0.
   * This keeps the internal array compact.
   */
  private _offset = 0;

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
   * @param priority - Numeric priority (lower value = higher priority)
   * @returns This queue (for chaining)
   */
  enqueue(item: T, priority: number): this {
    this._ensureBucket(priority);

    // Rebase priority against the current offset
    const adjustedIndex = priority - this._offset;
    if (!this._buckets[adjustedIndex]) {
      this._buckets[adjustedIndex] = [];
    }
    this._buckets[adjustedIndex].push(item);
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

    // Find the first non-empty bucket
    while (
      this._min !== Infinity &&
      this._min - this._offset < this._buckets.length
    ) {
      const adjustedIndex = this._min - this._offset;
      const bucket = this._buckets[adjustedIndex];
      if (bucket && bucket.length > 0) {
        const item = bucket.shift()!;
        this._count--;

        // Advance _min if this bucket is now empty
        if (bucket.length === 0) {
          this._advanceMin();
        }
        return item;
      }
      this._advanceMin();
    }

    return undefined;
  }

  /**
   * Return the highest-priority item without removing it.
   *
   * @returns The item, or `undefined` if the queue is empty
   */
  peek(): T | undefined {
    if (this._count === 0) return undefined;

    let scanMin = this._min;
    while (
      scanMin !== Infinity &&
      scanMin - this._offset < this._buckets.length
    ) {
      const adjustedIndex = scanMin - this._offset;
      const bucket = this._buckets[adjustedIndex];
      if (bucket && bucket.length > 0) {
        return bucket[0];
      }
      scanMin++;
    }

    return undefined;
  }

  /** Remove all items. */
  clear(): void {
    this._buckets.length = 0;
    this._offset = 0;
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
    for (let i = 0; i < this._buckets.length; i++) {
      const bucket = this._buckets[i];
      if (!bucket) continue;
      const priority = i + this._offset;
      for (const item of bucket) {
        callback(item, priority);
      }
    }
  }

  /** Grow buckets array to accommodate the given priority. */
  private _ensureBucket(priority: number): void {
    const adjustedIndex = priority - this._offset;

    if (adjustedIndex < 0) {
      // Priority is lower than current offset — need to shift everything right
      const shift = -adjustedIndex;
      const newLen = this._buckets.length + shift;
      const newBuckets: (T[] | undefined)[] = new Array(newLen);
      for (let i = 0; i < this._buckets.length; i++) {
        newBuckets[i + shift] = this._buckets[i];
      }
      this._buckets = newBuckets;
      this._offset -= shift; // actually lower the offset
    } else if (adjustedIndex >= this._buckets.length) {
      // Grow the array
      this._buckets.length = adjustedIndex + 1;
    }
  }

  /** Advance `_min` to the next non-empty priority, compacting if possible. */
  private _advanceMin(): void {
    this._min++;
    while (
      this._min !== Infinity &&
      this._min - this._offset < this._buckets.length
    ) {
      const bucket = this._buckets[this._min - this._offset];
      if (bucket && bucket.length > 0) {
        return;
      }
      this._min++;
    }

    // All buckets are empty — reset
    if (this._count === 0) {
      this._buckets.length = 0;
      this._offset = 0;
      this._min = Infinity;
    }
  }
}
