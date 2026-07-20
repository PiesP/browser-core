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

## License

MIT
