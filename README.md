# @piesp/browser-core

[한국어](./README.ko.md) | [日本語](./README.ja.md)

Shared TypeScript utilities and design contracts for PiesP browser projects.

This is a private source package. Its package exports point directly to `.ts`
files and are consumed by TypeScript-aware workspace bundlers through exact-SHA
`packages/core` gitlinks and `file:` dependencies. It is not published to npm
and does not provide compiled output for native Node.js consumption.

## API

| Import path                              | Main exports                                               |
| ---------------------------------------- | ---------------------------------------------------------- |
| `@piesp/browser-core`                    | All runtime exports                                        |
| `@piesp/browser-core/async`              | Timers, debounce, timeouts, and deferred promises          |
| `@piesp/browser-core/error`              | Error and cancellation helpers                             |
| `@piesp/browser-core/events`             | `MessageBus`, `createEventEmitter`                         |
| `@piesp/browser-core/locale`             | Locale detection and formatting                            |
| `@piesp/browser-core/logging`            | Logger contracts and console/no-op implementations         |
| `@piesp/browser-core/util`               | Guards, collections, caches, colors, and scheduler helpers |
| `@piesp/browser-core/design`             | Quiet Instruments tokens and interaction contracts         |
| `@piesp/browser-core/design/tokens.css`  | Scoped `.pp-design` custom properties                      |
| `@piesp/browser-core/design/tokens.json` | DTCG design-token source                                   |

```ts
import { sleep } from '@piesp/browser-core/async';
import { MessageBus } from '@piesp/browser-core/events';

const messages = new MessageBus<string>();
const unsubscribe = messages.subscribe(console.log);
messages.publish('ready');
unsubscribe();

await sleep(100);
```

See [API contracts](./docs/API.md) and the
[Quiet Instruments design contract](./docs/DESIGN.md) for detailed behavior.

## Development

The [automation catalog](./automation/README.md#maintained-tooling-catalog)
records command ownership, Git hook adapters, Action bootstrap order, and the
remaining pre-runtime language exceptions.

Install the selected [Vite+ release](./pnpm-workspace.yaml) using the
[official environment guide](https://viteplus.dev/guide/env). Vite+ selects Node
from [`.node-version`](./.node-version) and pnpm from the
[`packageManager` field](./package.json); the exact Vite+ version is in the
workspace catalog. Start from a clean checkout with:

```bash
vp install --frozen-lockfile -- --no-runtime
vp run check
vp run test
vp run verify
```

Install Chromium once with `pnpm exec playwright install chromium` before running tests locally.
Vite+ owns setup, task execution, formatting, lint and tests. Its Node project runs pure and
automation tests; its Chromium Browser Mode project runs DOM contracts.
`vp check` discovers the browser project and the NodeNext/erasable automation projects for integrated
type checking. See the [toolchain and retained checker catalog](automation/README.md#local-toolchain)
for configuration, dependency updates and runtime ownership.

Reusable consumer CI setup is documented separately in
[`automation/README.md`](./automation/README.md).

This project is developed with assistance from AI tools.

## Links

- [Security policy](./.github/SECURITY.md)
- [Issues](https://github.com/PiesP/browser-core/issues)
- [License](./LICENSE)
