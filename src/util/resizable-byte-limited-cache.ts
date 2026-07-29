/**
 * An LRU cache bounded by both estimated byte usage and an optional entry count.
 *
 * Unlike {@link ByteLimitedCache}, the byte limit can change at runtime and all
 * removals invoke the value-only eviction callback. This makes the cache suitable
 * for resources such as canvases and bitmaps that require explicit cleanup.
 *
 * @typeParam V - Value type
 */
export class ResizableByteLimitedCache<V> {
  private readonly _map = new Map<string, { value: V; size: number }>();
  private _currentBytes = 0;
  private _maxBytes: number;
  private readonly _estimateSize: (value: V) => number;
  private readonly _onEvict: ((value: V) => void) | undefined;
  private readonly _maxEntries: number;

  constructor(
    maxBytes: number,
    estimateSize: (value: V) => number,
    onEvict?: (value: V) => void,
    maxEntries = Number.POSITIVE_INFINITY,
  ) {
    this._assertValidMaxBytes(maxBytes);
    if (
      maxEntries !== Number.POSITIVE_INFINITY &&
      (!Number.isInteger(maxEntries) || maxEntries < 0)
    ) {
      throw new RangeError('maxEntries must be a non-negative integer');
    }

    this._maxBytes = maxBytes;
    this._estimateSize = estimateSize;
    this._onEvict = onEvict;
    this._maxEntries = maxEntries;
  }

  /** Current byte limit. */
  get maxBytes(): number {
    return this._maxBytes;
  }

  /** Current estimated byte usage. */
  get currentBytes(): number {
    return this._currentBytes;
  }

  /** Number of cached entries. */
  get size(): number {
    return this._map.size;
  }

  /**
   * Change the byte limit, evicting least-recently-used entries when shrinking.
   */
  resize(newMaxBytes: number): void {
    this._assertValidMaxBytes(newMaxBytes);
    this._maxBytes = newMaxBytes;

    while (this._currentBytes > this._maxBytes && this._map.size > 0) {
      const oldestKey = this._map.keys().next().value;
      if (oldestKey === undefined) break;
      this.delete(oldestKey);
    }
  }

  /** Retrieve a value and promote it to most-recently-used. */
  get(key: string): V | undefined {
    const entry = this._map.get(key);
    if (!entry) return undefined;

    this._map.delete(key);
    this._map.set(key, entry);
    return entry.value;
  }

  /**
   * Store a value and return whether it fits in the configured limits.
   *
   * Replaced, evicted, or rejected values are passed to `onEvict` after their
   * cache state and byte accounting have been removed.
   */
  set(key: string, value: V): boolean {
    const size = this._estimateSize(value);
    this._assertValidSize(size);

    const existing = this._map.get(key);
    if (existing) {
      this._map.delete(key);
      this._currentBytes -= existing.size;
      this._onEvict?.(existing.value);
    }

    while (
      (this._currentBytes + size > this._maxBytes ||
        this._map.size >= this._maxEntries) &&
      this._map.size > 0
    ) {
      const oldestKey = this._map.keys().next().value;
      if (oldestKey === undefined) break;
      this.delete(oldestKey);
    }

    if (this._currentBytes + size > this._maxBytes || this._maxEntries < 1) {
      this._onEvict?.(value);
      return false;
    }

    this._map.set(key, { value, size });
    this._currentBytes += size;
    return true;
  }

  /** Remove a value and invoke eviction cleanup. */
  delete(key: string): boolean {
    const entry = this._map.get(key);
    if (!entry) return false;

    this._map.delete(key);
    this._currentBytes -= entry.size;
    this._onEvict?.(entry.value);
    return true;
  }

  /** Remove a value without cleanup when ownership transfers elsewhere. */
  take(key: string): V | undefined {
    const entry = this._map.get(key);
    if (!entry) return undefined;

    this._map.delete(key);
    this._currentBytes -= entry.size;
    return entry.value;
  }

  /** Check whether a key exists without changing LRU order. */
  has(key: string): boolean {
    return this._map.has(key);
  }

  /** Remove all entries and invoke cleanup for every value. */
  clear(): void {
    const values = this._onEvict
      ? Array.from(this._map.values(), (entry) => entry.value)
      : [];
    this._map.clear();
    this._currentBytes = 0;
    for (const value of values) this._onEvict?.(value);
  }

  /** Promote an entry to most-recently-used without returning it. */
  touch(key: string): void {
    this.get(key);
  }

  private _assertValidMaxBytes(maxBytes: number): void {
    if (!Number.isFinite(maxBytes) || maxBytes < 0) {
      throw new RangeError('maxBytes must be a finite, non-negative number');
    }
  }

  private _assertValidSize(size: number): void {
    if (!Number.isFinite(size) || size < 0) {
      throw new RangeError('estimateSize must return a finite, non-negative number');
    }
  }
}
