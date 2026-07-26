/**
 * A priority queue backed by FIFO buckets and an active-priority min-heap.
 *
 * Items are assigned a safe-integer priority (lower = higher priority).
 * Buckets are stored by priority without allocating intermediate slots, so
 * priorities with very large gaps do not create sparse arrays.
 *
 * Enqueue is O(1) for an existing priority and O(log p) for a new priority,
 * where p is the number of active priorities. Dequeue is amortized O(1) within
 * a bucket and O(log p) when a bucket becomes empty.
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
interface PriorityBucket<T> {
  items: T[];
  head: number;
}

const BUCKET_COMPACTION_THRESHOLD = 1024;

export class PriorityBucketQueue<T> {
  /** Non-empty item buckets keyed by priority. */
  private readonly _buckets = new Map<number, PriorityBucket<T>>();

  /** Min-heap containing every active priority exactly once. */
  private readonly _priorities: number[] = [];

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
      bucket = { items: [], head: 0 };
      this._buckets.set(priority, bucket);
      this._pushPriority(priority);
    }
    bucket.items.push(item);
    this._count++;

    return this;
  }

  /**
   * Remove and return the highest-priority item.
   *
   * @returns The item, or `undefined` if the queue is empty
   */
  dequeue(): T | undefined {
    if (this._count === 0) return undefined;

    const priority = this._priorities[0];
    if (priority === undefined) {
      throw new Error('Priority queue invariant violated: no active priority');
    }
    const bucket = this._buckets.get(priority);
    if (!bucket) {
      throw new Error('Priority queue invariant violated: no active bucket');
    }

    const item = bucket.items[bucket.head];
    bucket.head++;
    this._count--;

    if (bucket.head === bucket.items.length) {
      this._buckets.delete(priority);
      this._removeMinimumPriority();
    } else if (
      bucket.head >= BUCKET_COMPACTION_THRESHOLD &&
      bucket.head * 2 >= bucket.items.length
    ) {
      bucket.items = bucket.items.slice(bucket.head);
      bucket.head = 0;
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
    const priority = this._priorities[0];
    if (priority === undefined) return undefined;
    const bucket = this._buckets.get(priority);
    return bucket?.items[bucket.head];
  }

  /** Remove all items. */
  clear(): void {
    this._buckets.clear();
    this._priorities.length = 0;
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
    const snapshot = [...this._buckets.entries()]
      .sort(([priorityA], [priorityB]) => priorityA - priorityB)
      .map(([priority, bucket]) => ({
        priority,
        items: bucket.items.slice(bucket.head),
      }));

    for (const { priority, items } of snapshot) {
      for (const item of items) {
        callback(item, priority);
      }
    }
  }

  /** Add a new active priority to the min-heap. */
  private _pushPriority(priority: number): void {
    let index = this._priorities.push(priority) - 1;

    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parentPriority = this._priorities[parentIndex];
      if (parentPriority === undefined || parentPriority <= priority) break;

      this._priorities[index] = parentPriority;
      index = parentIndex;
    }

    this._priorities[index] = priority;
  }

  /** Remove the current minimum priority and restore the heap invariant. */
  private _removeMinimumPriority(): void {
    const replacement = this._priorities.pop();
    if (this._priorities.length === 0 || replacement === undefined) return;

    let index = 0;
    this._priorities[0] = replacement;

    while (true) {
      const leftIndex = index * 2 + 1;
      if (leftIndex >= this._priorities.length) break;

      const leftPriority = this._priorities[leftIndex];
      if (leftPriority === undefined) break;

      const rightIndex = leftIndex + 1;
      const rightPriority = this._priorities[rightIndex];
      const childIndex =
        rightPriority !== undefined && rightPriority < leftPriority
          ? rightIndex
          : leftIndex;
      const childPriority = this._priorities[childIndex];
      if (childPriority === undefined || childPriority >= replacement) break;

      this._priorities[index] = childPriority;
      index = childIndex;
    }

    this._priorities[index] = replacement;
  }
}
