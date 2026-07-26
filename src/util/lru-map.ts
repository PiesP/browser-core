/**
 * A `Map`-like data structure that evicts the least-recently-used entry
 * when the configured maximum size is exceeded.
 *
 * `get` and `set` both promote the entry to most-recently-used. Iteration
 * order follows insertion order in the underlying `Map`, which (after
 * promotions) reflects most-recently-used last.
 *
 * @typeParam K - Key type
 * @typeParam V - Value type
 *
 * @example
 * ```ts
 * const cache = new LruMap<string, number>(3);
 * cache.set('a', 1);
 * cache.set('b', 2);
 * cache.set('c', 3);
 * cache.set('d', 4); // evicts 'a'
 * cache.get('b');     // promotes 'b' — now 'c' is LRU
 * cache.set('e', 5);  // evicts 'c'
 * ```
 */
export class LruMap<K, V> {
  /** Underlying storage. */
  private readonly _map = new Map<K, V>();

  /** Maximum number of entries before eviction begins. */
  readonly maxSize: number;

  /**
   * @param maxSize - Maximum capacity; must be >= 1
   */
  constructor(maxSize: number) {
    if (maxSize < 1) {
      throw new RangeError('maxSize must be >= 1');
    }
    this.maxSize = maxSize;
  }

  /** Number of currently stored entries. */
  get size(): number {
    return this._map.size;
  }

  /**
   * Retrieve a value by key and promote it to most-recently-used.
   *
   * @param key - The key to look up
   * @returns The value, or `undefined` if not present
   */
  get(key: K): V | undefined {
    if (!this._map.has(key)) return undefined;

    // Promote: delete + re-insert
    const value = this._map.get(key)!;
    this._map.delete(key);
    this._map.set(key, value);
    return value;
  }

  /**
   * Store a value by key, promoting it and evicting the LRU entry
   * if the max size is exceeded *after* insertion.
   *
   * @param key - The key
   * @param value - The value to store
   * @returns This LruMap (for chaining)
   */
  set(key: K, value: V): this {
    // Delete first to ensure promotion on re-set of existing key
    if (this._map.has(key)) {
      this._map.delete(key);
    } else if (this._map.size >= this.maxSize) {
      // Evict LRU before inserting when at capacity
      this._evictLru();
    }

    this._map.set(key, value);
    return this;
  }

  /**
   * Check whether a key exists.
   *
   * @param key - The key to check
   * @returns `true` if the key exists
   */
  has(key: K): boolean {
    return this._map.has(key);
  }

  /**
   * Delete a key and return whether it was present.
   *
   * @param key - The key to delete
   * @returns `true` if the key was present
   */
  delete(key: K): boolean {
    return this._map.delete(key);
  }

  /** Remove all entries. */
  clear(): void {
    this._map.clear();
  }

  /**
   * Execute `callback` for each entry in insertion order
   * (LRU first, MRU last).
   *
   * @param callback - Called with value, key, and this LruMap
   */
  forEach(
    callback: (value: V, key: K, map: LruMap<K, V>) => void,
  ): void {
    this._map.forEach((value, key) => {
      callback(value, key, this);
    });
  }

  /** Iterator over `[key, value]` pairs in insertion order. */
  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this._map[Symbol.iterator]();
  }

  /** Iterator over `[key, value]` pairs. */
  entries(): IterableIterator<[K, V]> {
    return this._map.entries();
  }

  /** Iterator over keys in insertion order. */
  keys(): IterableIterator<K> {
    return this._map.keys();
  }

  /** Iterator over values in insertion order. */
  values(): IterableIterator<V> {
    return this._map.values();
  }

  /** Evict the least-recently-used entry (first in insertion order). */
  private _evictLru(): void {
    const firstEntry = this._map.keys().next();
    if (!firstEntry.done) {
      this._map.delete(firstEntry.value);
    }
  }
}
