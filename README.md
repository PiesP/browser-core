# @piesp/browser-core

> Shared TypeScript utilities for PiesP browser-based projects.

## API

| Import path | Exports | Description |
|---|---|---|
| `@piesp/browser-core/async` | `sleep`, `debounce`, `DebouncedFunction` | Async utilities: cancellable sleep, debounce |
| `@piesp/browser-core/error` | `getErrorMessage`, `isAbortError`, `isCancellationError`, `mergeAbortSignals`, `throwIfAborted` | Error handling utilities with abort/cancellation support |
| `@piesp/browser-core/events` | `MessageBus`, `createEventEmitter`, `EventEmitter` | Typed synchronous publish/subscribe utilities |
| `@piesp/browser-core/util` | `createId`, `clamp`, `clampIndex` | General-purpose utilities |
| `@piesp/browser-core/logging` | `Logger`, `LoggerFactory`, `createConsoleLogger`, `createNoopLogger` | Logging contracts and implementations |
| `@piesp/browser-core/locale` | `detectLocale`, `normalizeLocale`, `formatFileSize`, `formatDuration` | Locale detection and number formatting utilities |

## Usage

```ts
import { sleep } from '@piesp/browser-core/async';
import { isAbortError } from '@piesp/browser-core/error';
import { MessageBus } from '@piesp/browser-core/events';
import { createId, clamp } from '@piesp/browser-core/util';
```

## Locale contract

The locale API supports `en`, `ko`, `ja`, `zh-CN`, `es`, and `ar`.
`normalizeLocale` matches supported tags case-insensitively, maps supported
language-region variants to their base locale, and returns `null` when no
supported locale matches. `detectLocale` checks the platform UI language,
`navigator.languages`, and `navigator.language` in that order, then falls back
to `en` unless a different `defaultLocale` is provided.

File sizes and durations use `Intl.NumberFormat` for locale-specific digits,
grouping, and decimal separators. Negative durations are normalized to zero.
File sizes must be finite and non-negative; invalid values throw `RangeError`.

## Development

```bash
pnpm install    # install dependencies
pnpm check      # formatting, type, lint, and unused-code checks
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
