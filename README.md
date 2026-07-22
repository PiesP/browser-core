# @piesp/browser-core

> Shared TypeScript utilities for PiesP browser-based projects.

## API

| Import path | Exports | Description |
|---|---|---|
| `@piesp/browser-core/async` | `sleep`, `debounce`, `DebouncedFunction` | Async utilities: cancellable sleep, debounce |
| `@piesp/browser-core/error` | `getErrorMessage`, `isAbortError`, `isCancellationError`, `mergeAbortSignals`, `throwIfAborted` | Error handling utilities with abort/cancellation support |
| `@piesp/browser-core/util` | `createId`, `clamp`, `clampIndex` | General-purpose utilities |
| `@piesp/browser-core/logging` | `Logger`, `LoggerFactory`, `createConsoleLogger`, `createNoopLogger` | Logging contracts and implementations |
| `@piesp/browser-core/locale` | _(to be defined)_ | Locale detection utilities |

## Usage

```ts
import { sleep } from '@piesp/browser-core/async';
import { isAbortError } from '@piesp/browser-core/error';
import { createId, clamp } from '@piesp/browser-core/util';
```

## Development

```bash
pnpm install    # install dependencies
pnpm check      # typecheck
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
