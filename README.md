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

### Architecture and resource ownership

Follow the [composition and behavioral-contract policy](https://github.com/PiesP/.github/blob/master/MAINTENANCE_POLICY.md#composition-and-behavioral-contracts).
The runtime uses ordinary classes, closures, pure helpers and structural
interfaces, including interface extension; it does not share implementation or
state through product-defined base classes. Construct collaborators explicitly
at their owning boundary rather than adding an interface/factory to every helper.
Automation-only direct native error subclasses in
[`scanner-pins.ts`](./automation/security/scanner-pins.ts) are outside this
product-runtime migration.

Existing examples retain their distinct ownership contracts:

- [`createEventEmitter`](./src/events/emitter.ts) composes lazily created
  `MessageBus` instances behind `EventEmitter`; subscribers retain their
  unsubscribe functions, and the last unsubscribe removes that event's bus.
- [`mergeAbortSignalsWithCleanup`](./src/error/merge-abort-signals.ts) exposes a
  signal and idempotent listener cleanup without lending controller authority.
  [`withTimeout`](./src/async/with-timeout.ts) owns its timer/listeners; callers
  still own cancellation and resource retirement of the underlying operation.
- [`ByteLimitedCache`](./src/util/byte-limited-cache.ts) retains values with a
  fixed budget and an automatic-eviction callback. It is not an all-removals
  resource owner. [`ResizableByteLimitedCache`](./src/util/resizable-byte-limited-cache.ts)
  can exclusively own resources with cleanup, while `take` transfers ownership
  without cleanup. Keep their rejection, mutation and cleanup-error ordering
  distinct under the [canonical cache contracts](./docs/API.md#caches-and-scheduling).

The [API consumer map](./docs/API.md#consumer-and-verification-boundaries) owns
actual callers and their verification responsibilities. Preserve each consumer's
cancellation and event-error policy; a similarly named local helper is not an
interchangeable shared contract. [API.md](./docs/API.md) owns utility semantics;
[DESIGN.md](./docs/DESIGN.md) owns Quiet Instruments visual/interaction design.
This policy adoption preserves the private source exports and existing consumer
gitlinks and automation pins; it adds no runtime abstraction, publication step or
consumer rollout.

### Toolchain and checks

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
