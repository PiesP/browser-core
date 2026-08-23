import {
  assertValidCacheByteSize,
  assertValidCacheKey,
  estimateRetainedEntrySize,
  hasRetainedEntryCapacity,
} from './cache-entry-size.js';

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
      (!Number.isSafeInteger(maxEntries) || maxEntries < 0)
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
    const evicted: V[] = [];

    while (this._currentBytes > this._maxBytes && this._map.size > 0) {
      const oldestKey = this._map.keys().next().value;
      if (oldestKey === undefined) break;
      const entry = this._remove(oldestKey);
      if (entry) evicted.push(entry.value);
    }

    this._notifyEvictions(evicted);
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
    assertValidCacheKey(key);
    const valueSize = this._estimateSize(value);
    this._assertValidSize(valueSize);
    const size = estimateRetainedEntrySize(key, valueSize);
    if (size > this._maxBytes || this._maxEntries < 1) {
      this._onEvict?.(value);
      return false;
    }

    const evicted: V[] = [];
    const existing = this._remove(key);
    if (existing) evicted.push(existing.value);

    while (
      (!hasRetainedEntryCapacity(this._currentBytes, this._maxBytes, size) ||
        this._map.size >= this._maxEntries) &&
      this._map.size > 0
    ) {
      const oldestKey = this._map.keys().next().value;
      if (oldestKey === undefined) break;
      const entry = this._remove(oldestKey);
      if (entry) evicted.push(entry.value);
    }

    this._map.set(key, { value, size });
    this._currentBytes += size;
    this._notifyEvictions(evicted);
    return true;
  }

  /** Remove a value and invoke eviction cleanup. */
  delete(key: string): boolean {
    const entry = this._remove(key);
    if (!entry) return false;

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
    this._notifyEvictions(values);
  }

  /** Promote an entry to most-recently-used without returning it. */
  touch(key: string): void {
    this.get(key);
  }

  private _assertValidMaxBytes(maxBytes: number): void {
    assertValidCacheByteSize(maxBytes, 'maxBytes');
  }

  private _assertValidSize(size: number): void {
    assertValidCacheByteSize(size, 'estimateSize result');
  }

  private _remove(key: string): { value: V; size: number } | undefined {
    const entry = this._map.get(key);
    if (!entry) return undefined;

    this._map.delete(key);
    this._currentBytes -= entry.size;
    return entry;
  }

  private _notifyEvictions(values: readonly V[]): void {
    if (!this._onEvict) return;

    let firstError: unknown;
    let cleanupFailed = false;
    for (const value of values) {
      try {
        this._onEvict(value);
      } catch (error) {
        if (!cleanupFailed) {
          firstError = error;
          cleanupFailed = true;
        }
      }
    }
    if (cleanupFailed) throw firstError;
  }
}
