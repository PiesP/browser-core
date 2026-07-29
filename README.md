# @piesp/browser-core

> Shared TypeScript utilities for PiesP browser-based projects.

## API

| Import path | Exports | Description |
|---|---|---|
| `@piesp/browser-core/async` | `sleep`, `debounce`, `withTimeout`, `createDeferred`, `clearSafe*` | Async control, timeout, deferred-promise, and timer cleanup utilities |
| `@piesp/browser-core/error` | `getErrorMessage`, abort detection/creation, `mergeAbortSignals`, `throwIfAborted` | Error handling utilities with abort/cancellation support |
| `@piesp/browser-core/events` | `MessageBus`, `createEventEmitter`, `EventEmitter` | Typed synchronous publish/subscribe utilities |
| `@piesp/browser-core/util` | IDs, clamps, guards, colors, LRU/byte caches, priority queue, scheduler wrappers | General-purpose browser and data-structure utilities |
| `@piesp/browser-core/logging` | `Logger`, `LoggerFactory`, `createConsoleLogger`, `createNoopLogger` | Logging contracts and implementations |
| `@piesp/browser-core/locale` | `detectLocale`, `normalizeLocale`, `formatFileSize`, `formatDuration` | Locale detection and number formatting utilities |

## Usage

```ts
import { createDeferred, sleep } from '@piesp/browser-core/async';
import { createUserCancelledAbortError, isAbortError } from '@piesp/browser-core/error';
import { MessageBus } from '@piesp/browser-core/events';
import { ResizableByteLimitedCache, schedulerYield } from '@piesp/browser-core/util';
```

This private source package is consumed by the workspace's TypeScript-aware
bundlers. Its exports point to `.ts` source and are not a native Node runtime
distribution.

## Async and event error contracts

`withTimeout` invokes `onTimeout` in the timer task. If the callback returns a
promise, settlement waits for it and a callback rejection becomes the returned
promise's rejection. Pre-existing and mid-flight aborts both reject the returned
promise with an `AbortError`.

`throwIfAborted` rethrows the exact `AbortSignal.reason`, including custom
non-DOMException values. `createAbortError` preserves an optional original
cause, while `createUserCancelledAbortError` creates a reason recognized by
`getUserCancelledAbortErrorFromSignal`.

`MessageBus.publish` is synchronous. It snapshots subscribers, delivers to all
of them, and then rethrows the first synchronous error. Promise-returning
subscribers are consumed to avoid unhandled rejections, but cause `publish` to
throw `TypeError`. Use and await `publishAsync` for asynchronous subscribers;
it waits for every subscriber and rejects with the first error in subscription
order.

## Locale contract

The locale API supports `en`, `ko`, `ja`, `zh-CN`, `es`, and `ar`.
`normalizeLocale` matches supported tags case-insensitively, maps supported
language-region variants to their base locale, and returns `null` when no
supported locale matches. `detectLocale` checks explicitly injected language
sources without consulting browser globals. With no injected source, it checks
the platform UI language, `navigator.languages`, and `navigator.language` in
that order, then falls back to `en` unless a different `defaultLocale` is
provided.

File sizes and durations use `Intl.NumberFormat` for locale-specific digits,
grouping, and decimal separators. Negative finite durations are normalized to
zero. File sizes must be finite and non-negative, and durations must be finite;
invalid values throw `RangeError`.

## Cache and scheduler contracts

`ByteLimitedCache` is a fixed-budget LRU cache. An entry larger than the entire
budget is rejected without evicting existing entries. `ResizableByteLimitedCache`
adds runtime resizing, an optional entry-count cap, ownership transfer through
`take`, and cleanup callbacks for every removed resource. Both caches reject
negative or non-finite byte limits and size estimates.

`schedulerYield` and `schedulerPostTask` prefer the browser Scheduler API and
fall back to timers. Fallback tasks preserve abort reasons, and async callback
results are flattened into the returned promise. New budget-aware loops should
await `yieldIfOverBudgetAsync`; the synchronous `yieldIfOverBudget` marker is
retained only for compatibility.

## Development

```bash
pnpm install    # install dependencies
pnpm check      # text hygiene, type, and compiler lint checks
pnpm test       # run tests
pnpm test:watch # watch mode
```

## Consumer updates

The browser-based consumer repositories track this repository as the
`packages/core` git submodule. Their update workflow checks for a newer
`master` commit daily and can also be started manually.

For immediate update PRs after a push, configure a repository secret named
`CONSUMER_UPDATE_TOKEN` with a GitHub App or fine-grained token that can create
repository dispatch events in:

- `PiesP/wasm-motion-converter`
- `PiesP/xcom-enhanced-gallery`
- `PiesP/yt-live-chat-overlay`

Without that secret, the daily polling workflow remains the fallback.

## License

MIT
