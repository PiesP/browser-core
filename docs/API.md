# API contracts

The package exports TypeScript source directly. The authoritative export map is
[`package.json`](../package.json), and the root barrel is
[`src/index.ts`](../src/index.ts).

## Async and event errors

`withTimeout` invokes `onTimeout` in the timer task. If the callback returns a
promise, settlement waits for it and a callback rejection becomes the returned
promise's rejection. Pre-existing and mid-flight aborts follow the same path: a
`DOMException` signal reason is preserved, while any other reason produces a new
`AbortError`. See
[`withTimeout`](../src/async/with-timeout.ts).

`throwIfAborted` rethrows the exact `AbortSignal.reason`, including custom
non-`DOMException` values. `createAbortError` preserves an optional original
cause, while `createUserCancelledAbortError` creates a reason recognized by
`getUserCancelledAbortErrorFromSignal`. See
[`throwIfAborted`](../src/error/throw-if-aborted.ts) and the
[abort-reason helpers](../src/error/abort-signal.ts).

`MessageBus.publish` is synchronous. It snapshots subscribers, delivers to all
of them, and then rethrows the first synchronous error. Promise-returning
subscribers are consumed to avoid unhandled rejections, but cause `publish` to
throw `TypeError`. Use and await `publishAsync` for asynchronous subscribers;
it waits for every subscriber and rejects with the first error in subscription
order. See [`MessageBus`](../src/events/message-bus.ts).

## Locale

The locale API supports `en`, `ko`, `ja`, `zh-CN`, `es`, and `ar`. The
authoritative list is `SUPPORTED_LOCALES` in
[`src/locale/constants.ts`](../src/locale/constants.ts).
`normalizeLocale` matches supported tags case-insensitively, maps supported
language-region variants to their base locale, and returns `null` when no
supported locale matches. `detectLocale` checks explicitly injected language
sources without consulting browser globals. With no injected source, it checks
the platform UI language, `navigator.languages`, and `navigator.language` in
that order, then falls back to `en` unless a different `defaultLocale` is
provided. See [`detectLocale` and `normalizeLocale`](../src/locale/detect.ts).

`formatFileSize` and `formatDuration` use `Intl.NumberFormat` for locale-specific
digits, grouping, and decimal separators. Negative finite durations are
normalized to zero. File sizes must be finite and non-negative, and durations
must be finite; invalid values throw `RangeError`. See the
[formatting implementation](../src/locale/format.ts).

## Caches and scheduling

`ByteLimitedCache` is a fixed-budget LRU cache. Both byte-limited cache variants
include UTF-16 key storage, the caller-provided value estimate, and a positive
minimum cost for every entry in retained-cost accounting. An entry larger than
the entire budget is rejected without evicting existing entries.
`ResizableByteLimitedCache` adds runtime resizing, an optional entry-count cap,
ownership transfer through `take`, and cleanup callbacks for every removed
resource. Both caches require byte limits and size estimates to be non-negative
safe integers so every retained byte remains representable in their accounting.
See [`ByteLimitedCache`](../src/util/byte-limited-cache.ts),
[`ResizableByteLimitedCache`](../src/util/resizable-byte-limited-cache.ts), and
the [shared accounting rules](../src/util/cache-entry-size.ts).

`schedulerYield` and `schedulerPostTask` prefer the browser Scheduler API and
fall back to timers. Fallback tasks preserve abort reasons, and async callback
results are flattened into the returned promise. New budget-aware loops should
await `yieldIfOverBudgetAsync`; the synchronous `yieldIfOverBudget` marker is
retained only for compatibility. See the
[scheduler wrappers](../src/util/scheduler.ts).
