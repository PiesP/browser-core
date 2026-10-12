# API contracts

The package exports TypeScript source directly. The authoritative export map is
[`package.json`](../package.json), and the root barrel is
[`src/index.ts`](../src/index.ts).

## Consumer and verification boundaries

The production integration scope is the three consumers' `src/` trees, their
TypeScript aliases and local re-exports, stylesheet imports, and workflow Action
references. Consumers use the subpaths below; the root export remains public.
Type-only imports establish type compatibility, not runtime execution. Consumer
tests exercise their product integration; core tests own the shared algorithms.

| Import surface | Representative production consumers and relied-on behavior | Existing verification responsibility |
| --- | --- | --- |
| `/async`: `withTimeout`, `sleep`, `debounce`, `createDeferred`, safe timer cleanup | WMC [video metadata](https://github.com/PiesP/wasm-motion-converter/blob/master/src/services/video-metadata.ts) owns abort/stale-result cleanup; XEG [HTTP service](https://github.com/PiesP/xcom-enhanced-gallery/blob/master/src/shared/services/http-request-service.ts) owns deferred request settlement and [retry](https://github.com/PiesP/xcom-enhanced-gallery/blob/master/src/shared/async/retry.ts) owns retry policy; Overlay [DOM adapter](https://github.com/PiesP/yt-live-chat-overlay/blob/master/src/util/dom.ts) re-exports timer helpers | Core [async tests](../test/async/) own settlement and timer/listener cleanup; WMC [metadata cancellation](https://github.com/PiesP/wasm-motion-converter/blob/master/test/unit/services/video-metadata-cancellation.test.ts) and XEG [HTTP tests](https://github.com/PiesP/xcom-enhanced-gallery/blob/master/test/unit/shared/services/http-request-service.test.ts) own product teardown |
| `/error`: reason conversion, classifiers, `throwIfAborted`, `mergeAbortSignalsWithCleanup` | WMC [file validation](https://github.com/PiesP/wasm-motion-converter/blob/master/src/utils/file-validation.ts) owns cancellation presentation; XEG [gallery](https://github.com/PiesP/xcom-enhanced-gallery/blob/master/src/features/gallery/gallery-app.ts) combines session signals and retains its [local cancellation policy](https://github.com/PiesP/xcom-enhanced-gallery/blob/master/src/shared/error/cancellation.ts); Overlay's DOM adapter re-exports abort helpers | Core [error tests](../test/error/) own reason/classifier contracts; XEG [gallery lifecycle](https://github.com/PiesP/xcom-enhanced-gallery/blob/master/test/unit/shared/utils/events/gallery-lifecycle.test.ts) and [download tests](https://github.com/PiesP/xcom-enhanced-gallery/blob/master/test/unit/shared/services/download/download-orchestrator.test.ts) own session cleanup and download outcomes |
| `/util`: `LruMap`, `ResizableByteLimitedCache`, guards, clamps, `createId` | WMC [decoder](https://github.com/PiesP/wasm-motion-converter/blob/master/src/services/decoder-service.ts) uses LRU and [format adapter](https://github.com/PiesP/wasm-motion-converter/blob/master/src/utils/format-utils.ts) re-exports `createId`; XEG [guard adapter](https://github.com/PiesP/xcom-enhanced-gallery/blob/master/src/shared/utils/types/guards.ts) re-exports guards and gallery uses clamps; Overlay [image manager](https://github.com/PiesP/yt-live-chat-overlay/blob/master/src/media/image-fetch-manager.ts) and [Worker](https://github.com/PiesP/yt-live-chat-overlay/blob/master/src/renderer/worker/renderer.ts) own resource lifetimes | Core [LRU](../test/util/lru-map.test.ts), [resource cache](../test/util/resizable-byte-limited-cache.test.ts), and [guards](../test/util/guards.test.ts) own invariants; Overlay [image lifecycle](https://github.com/PiesP/yt-live-chat-overlay/blob/master/test/unit/core/image-fetch-manager.test.ts) and [Worker protocol](https://github.com/PiesP/yt-live-chat-overlay/blob/master/test/unit/worker/renderer-protocol.test.ts) own actual release/transfer, context invalidation, and stale-result behavior |
| `/util`: `schedulerYield`, `yieldIfOverBudgetAsync` | WMC [demuxer](https://github.com/PiesP/wasm-motion-converter/blob/master/src/services/demuxer-service.ts) aliases `schedulerYield` as `yieldToMain`; XEG [download orchestrator](https://github.com/PiesP/xcom-enhanced-gallery/blob/master/src/shared/services/download/download-orchestrator.ts) yields during work; Overlay [Canvas renderer](https://github.com/PiesP/yt-live-chat-overlay/blob/master/src/renderer/canvas-renderer.ts) uses budget-aware yielding | Core [scheduler tests](../test/util/scheduler.test.ts) own native/fallback behavior; each consumer owns work placement, responsiveness, and cancellation at its integration boundary |
| `/locale`: `detectLocale`, formatting, `LOCALE_CODES`, type-only `Locale`/`SettingLocale` | WMC format adapter owns supported presentation; XEG [language service](https://github.com/PiesP/xcom-enhanced-gallery/blob/master/src/shared/services/language-service.ts) and [language types](https://github.com/PiesP/xcom-enhanced-gallery/blob/master/src/shared/constants/i18n/language-types.ts) own setting policy; Overlay [i18n](https://github.com/PiesP/yt-live-chat-overlay/blob/master/src/i18n/index.ts) owns message selection | Core [detection](../test/locale/detect.test.ts) and [formatting](../test/locale/format.test.ts) own normalization/formatting; XEG [language service tests](https://github.com/PiesP/xcom-enhanced-gallery/blob/master/test/unit/shared/services/language-service.test.ts) and consumer i18n gates own supported UI behavior |
| `/design`, `/design/tokens.css` | WMC [icon component](https://github.com/PiesP/wasm-motion-converter/blob/master/src/components/ui/Icon.tsx) and CSS import; XEG [entry](https://github.com/PiesP/xcom-enhanced-gallery/blob/master/src/main.ts) imports scoped CSS plus its local adapter; Overlay [settings adapter](https://github.com/PiesP/yt-live-chat-overlay/blob/master/src/settings/ui/design-adapter.ts) consumes token/icon values | Core [token tests](../test/design/tokens.test.ts), `check:design`, and [design contract](./DESIGN.md) own generated consistency; WMC [design E2E](https://github.com/PiesP/wasm-motion-converter/blob/master/test/e2e/design-system.spec.ts), XEG [adapter tests](https://github.com/PiesP/xcom-enhanced-gallery/blob/master/test/unit/shared/styles/quiet-instruments-adapter.test.ts), and Overlay [adapter tests](https://github.com/PiesP/yt-live-chat-overlay/blob/master/test/unit/settings/ui/design-adapter.test.ts) own rendered/framework behavior |
| `automation/actions/...@SHA` and shared unprivileged helpers | Consumer workflows use setup-project, consumer-impact, and prepare-osv; these are separate from runtime imports | The [automation catalog](../automation/README.md#maintained-tooling-catalog) owns helper tests and independent-pin policy; consumers own workflow events, permissions, required checks, and publication |

No production import of `/events`, `/logging`, or `/design/tokens.json` is
observed in that scope. WMC's `utils/logger.ts`, XEG's
`shared/logging/logger.ts`, and Overlay's `util/logging.ts` retain local logging
policies. XEG uses its feature-local emitter; Overlay uses its batch bus, described
below. The [public API test](../test/public-api.test.ts),
[event tests](../test/events/), and [logging tests](../test/logging/logger.test.ts)
protect those public exports independently of observed consumer usage.

## Async and event errors

`withTimeout` invokes `onTimeout` in the timer task. If the callback returns a
promise, settlement waits for it and a callback rejection becomes the returned
promise's rejection. Consequently, the deadline does not impose an unconditional
upper bound on settlement time: cleanup can remain pending. The wrapper consumes
late source settlement but does not cancel the underlying operation. Callers own
aborting it and releasing its resources. Pre-existing and mid-flight aborts follow the same path: a
`DOMException` signal reason is preserved, while any other reason produces a new
`AbortError`. See
[`withTimeout`](../src/async/with-timeout.ts).

`throwIfAborted` rethrows the exact `AbortSignal.reason`, including custom
non-`DOMException` values. `createAbortError` preserves an optional original
cause, while `createUserCancelledAbortError` creates a reason recognized by
`getUserCancelledAbortErrorFromSignal`. See
[`throwIfAborted`](../src/error/throw-if-aborted.ts) and the
[abort-reason helpers](../src/error/abort-signal.ts).

These adapters deliberately differ from each other. The
[DOM abort contract](https://dom.spec.whatwg.org/#dom-abortsignal-throwifaborted)
throws the signal's abort reason; converting that reason is a library/product
policy, not a platform requirement.

| API / adapter | Aborted reason and original cause | Pre-aborted / mid-flight behavior and timeout policy |
| --- | --- | --- |
| `/error` `throwIfAborted` | Throws the exact defined reason, including non-errors; falls back to a new `AbortError` if the reason is undefined | Synchronous check only; callers repeat it where needed. No timer or operation cancellation |
| `/async` `sleep` | Preserves a `DOMException`; otherwise creates `AbortError` without the original cause | Rejects for pre-abort, including a nonpositive delay; mid-flight abort clears its timer/listener. A supplied `TimeoutError` DOMException remains a timeout |
| `/async` `withTimeout` | Abort preserves a `DOMException`; otherwise creates `AbortError` without the original cause | Pre-abort/mid-flight reject and consume source settlement. On deadline, awaits `onTimeout`; rejects with its error or `TimeoutError`. Underlying work remains caller-owned |
| `/error` `getAbortReasonOrAbortErrorFromSignal` | Preserves an aborted `DOMException`; wraps another reason in `AbortError` with `cause` | Conversion/check helper; an unaborted signal returns a fallback error. Does not cancel work |
| `/error` `createAbortError`, user-cancellation helpers | Creates `AbortError` with optional `cause`; user helpers use the canonical `USER_CANCELLED_ABORT_MESSAGE` | User detection requires an aborted signal plus canonical DOMException name/message. General abort detection does not imply a user action |
| XEG local `getAbortReasonOrAbortErrorFromSignal` | Preserves `Error` as well as `DOMException`; other reasons become an AbortError with `cause` | Optional-signal adapter, without the core helper's aborted-state check. Conversion only |
| XEG local user-cancellation helpers | Preserve a `TimeoutError` Error/DOMException or recognized user abort; otherwise create user AbortError with `cause` and the product's `USER_CANCELLED_MESSAGE` | Product download policy differs from core's canonical user message; these identically named helpers are not interchangeable |

Core `isAbortError` includes `TimeoutError` only with `checkTimeout: true`.
XEG's local `isAbortError` always includes TimeoutError DOMExceptions. WMC's
`isCancellationError` follows AbortError names/causes and optional cancellation
text, rather than classifying every timeout as user cancellation. Existing
[sleep](../test/async/sleep.test.ts), [timeout](../test/async/with-timeout.test.ts),
[abort conversion](../test/error/abort-signal.test.ts), and
[abort check](../test/error/throw-if-aborted.test.ts) tests own these core contracts.

`MessageBus.publish` is synchronous. It snapshots subscribers, delivers to all
of them, and then rethrows the first synchronous error. Promise-returning
subscribers are consumed to avoid unhandled rejections, but cause `publish` to
throw `TypeError`. Use and await `publishAsync` for asynchronous subscribers;
it waits for every subscriber and rejects with the first error in subscription
order. See [`MessageBus`](../src/events/message-bus.ts).

Core's [`createEventEmitter`](../src/events/emitter.ts) delegates synchronous
delivery/errors to MessageBus and returns per-listener unsubscribe functions; it
has no emitter-wide `dispose` method. XEG's
[local emitter](https://github.com/PiesP/xcom-enhanced-gallery/blob/master/src/shared/utils/events/emitter.ts)
isolates synchronous listener failures and provides disposal. Overlay's
[batch bus](https://github.com/PiesP/yt-live-chat-overlay/blob/master/src/util/message-bus.ts)
has its own empty-batch and diagnostic policy. These lifecycle/error contracts
are intentional local alternatives, not migration targets based on naming.

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
ownership transfer through `take`, and cleanup callbacks for removed
resource. Both caches require byte limits and size estimates to be non-negative
safe integers so every retained byte remains representable in their accounting.
See [`ByteLimitedCache`](../src/util/byte-limited-cache.ts),
[`ResizableByteLimitedCache`](../src/util/resizable-byte-limited-cache.ts), and
the [shared accounting rules](../src/util/cache-entry-size.ts).

With a cleanup callback, `ResizableByteLimitedCache` exclusively owns each
object/function value under one key within that cache:

- Re-registering the same reference under the same key promotes recency and
  retains its insertion-time size. The estimator is not called again, even if
  its mutable input now yields an invalid or oversized estimate. To refresh the
  estimate, transfer with `take` and insert again; normal validation and capacity
  rejection then apply. The estimate is a snapshot, not live memory measurement.
- Registering an owned reference under another key throws `TypeError` before
  estimation, mutation, or cleanup. Resources pending/in removal cleanup also
  reject re-entrant registration. A removed batch is protected before its first
  callback so an earlier callback cannot reinsert a later resource before disposal.
- Successful insertion transfers ownership before removed-value cleanup runs.
  If a callback throws, the committed cache state remains valid; callers must
  not assume an insertion exception means they still own the incoming resource.
  Distinct replacement, eviction, resize and clear remove state/accounting first,
  attempt all required cleanups, then rethrow the first cleanup error.
- Capacity rejection cleans the new incoming value, preserves an existing entry,
  and returns `false` unless cleanup throws. Key/estimate validation and ownership
  exceptions neither transfer nor clean the incoming resource. Estimators must
  not mutate the cache. `take` releases ownership without cleanup.
- Primitives and caches without a cleanup callback retain value-cache behavior,
  including repeated values. Cross-cache aliasing and reuse after disposal remain
  caller responsibilities; there is no global registry.

Consumer migration: keep each disposable reference in a single owned entry;
handle an ownership `TypeError` as misuse without disposing the still-owned
resource. Do not close a capacity-rejected bitmap again. Main-thread image
caches without a cleanup callback are unaffected. Provider regressions stay in
core; consumers verify actual image lifetimes, context ownership, teardown and
stale-result suppression with their own integration/browser checks.

`schedulerYield` and `schedulerPostTask` prefer the browser Scheduler API and
feature-detect each method independently. Timer fallback yields to a later task,
but does not preserve `scheduler.yield()`'s prioritized continuation or implement
native task priorities. The background delay in `schedulerPostTask` is a
heuristic, not an equivalent priority queue. Fallback tasks preserve abort reasons, and async callback
results are flattened into the returned promise. New budget-aware loops should
await `yieldIfOverBudgetAsync`; the synchronous `yieldIfOverBudget` marker is
retained only for compatibility. See the
[scheduler wrappers](../src/util/scheduler.ts).
See the [Chrome scheduler.yield explainer](https://developer.chrome.com/blog/use-scheduler-yield)
and [Scheduling APIs draft](https://wicg.github.io/scheduling-apis/);
feature detection, rather than a hard-coded browser-version list, selects behavior.

## Verified adoption and rollback

Runtime `packages/core` gitlinks and `automation/actions/...@SHA` references are
independent; follow the [independent-pin policy](../automation/README.md#versioning-and-rollout).
Adopt a reviewed, merged, remotely reachable core commit through the consumer's
existing reviewed update path. Check actual imported paths and run each
consumer's maintained local, integration/browser, and exact-final-revision hosted
gates. Record the merged PR, final consumer/core SHAs, run links and relevant
artifact receipts in the coordinating issue; provider green checks alone do not
prove consumer adoption.

For rollback, use a reviewed revert of the relevant consumer implementation/update
or a reviewed compatibility fix. A runtime gitlink downgrade may be rejected by
the existing ancestry guard: follow its reviewed path or publish a forward
compatibility correction instead of bypassing it. Preserve unrelated consumer
work and independent Action pins; do not force-push protected branches. The
coordinating issue remains open until every required adoption/runtime receipt is
complete, with blocked or unavailable checks identified explicitly.
