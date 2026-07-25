/**
 * A cache that evicts entries based on an estimated byte size limit.
 *
 * Each value's byte cost is computed via a user-supplied `estimateSize`
 * callback at insertion time. When the accumulated byte total exceeds
 * `maxBytes`, the least-recently-used entries are evicted until the
 * total is back under the limit.
 *
 * Evicted entries are passed to the optional `onEvict` callback, so
 * callers can free associated resources.
 *
 * @typeParam V - Value type
 *
 * @example
 * ```ts
 * const cache = new ByteLimitedCache<string>({
 *   maxBytes: 1024 * 1024, // 1 MB
 *   estimateSize: (value) => new TextEncoder().encode(value).length,
 * });
 * cache.set('a', 'hello');
 * cache.set('b', 'world');
 * ```
 */
export class ByteLimitedCache<V> {
  /** Byte-cap for the entire cache. */
  readonly maxBytes: number;

  /** Underlying LRU tracking via insertion-order map. */
  private readonly _map = new Map<string, { value: V; size: number }>();

  /** Current total estimated bytes. */
  private _currentBytes = 0;

  /** Callback invoked for each evicted entry. */
  private readonly _estimateSize: (value: V) => number;
  private readonly _onEvict?: (key: string, value: V) => void;

  /**
   * @param options - Configuration
   * @param options.maxBytes - Maximum total byte size
   * @param options.estimateSize - Compute byte cost for a value
   * @param options.onEvict - Called for each evicted `(key, value)` pair
   */
  constructor(options: {
    maxBytes: number;
    estimateSize: (value: V) => number;
    onEvict?: (key: string, value: V) => void;
  }) {
    this.maxBytes = options.maxBytes;
    this._estimateSize = options.estimateSize;
    this._onEvict = options.onEvict;
  }

  /** Number of currently stored entries. */
  get size(): number {
    return this._map.size;
  }

  /** Current estimated total bytes, as tracked by `estimateSize`. */
  get currentBytes(): number {
    return this._currentBytes;
  }

  /**
   * Retrieve a value by key and promote it to most-recently-used.
   *
   * @param key - The key
   * @returns The value, or `undefined` if not present
   */
  get(key: string): V | undefined {
    const entry = this._map.get(key);
    if (!entry) return undefined;

    // Promote: re-insert at MRU position
    this._map.delete(key);
    this._map.set(key, entry);
    return entry.value;
  }

  /**
   * Store a value by key.
   *
   * If the key already exists its old size is subtracted, the new size is
   * added, and the entry is promoted. After insertion any excess bytes are
   * evicted from the LRU end.
   *
   * @param key - The key
   * @param value - The value to cache
   * @returns This cache (for chaining)
   */
  set(key: string, value: V): this {
    const newSize = this._estimateSize(value);

    // Remove old entry if present
    const existing = this._map.get(key);
    if (existing) {
      this._currentBytes -= existing.size;
      this._map.delete(key);
    }

    // Insert new entry
    this._map.set(key, { value, size: newSize });
    this._currentBytes += newSize;

    // Evict until under limit
    this._evictExcess();

    return this;
  }

  /**
   * Check whether a key exists.
   *
   * @param key - The key
   * @returns `true` if the key exists
   */
  has(key: string): boolean {
    return this._map.has(key);
  }

  /**
   * Delete a key and return whether it was present.
   *
   * Removes the entry and subtracts its byte cost. Does NOT invoke
   * `onEvict` — that callback is reserved for automatic eviction.
   *
   * @param key - The key to delete
   * @returns `true` if the key was present
   */
  delete(key: string): boolean {
    const entry = this._map.get(key);
    if (!entry) return false;

    this._currentBytes -= entry.size;
    return this._map.delete(key);
  }

  /** Remove all entries without calling `onEvict`. */
  clear(): void {
    this._map.clear();
    this._currentBytes = 0;
  }

  /**
   * Evict entries from the LRU end until `_currentBytes <= maxBytes`.
   * Calls `onEvict` for each evicted entry.
   */
  private _evictExcess(): void {
    while (this._currentBytes > this.maxBytes && this._map.size > 0) {
      const firstKey = this._map.keys().next().value;
      if (firstKey === undefined) break;

      const entry = this._map.get(firstKey)!;
      this._map.delete(firstKey);
      this._currentBytes -= entry.size;

      if (this._onEvict) {
        this._onEvict(firstKey, entry.value);
      }
    }
  }
}
