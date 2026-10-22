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

The required Node.js and pnpm versions are defined in
[`package.json`](./package.json).

### Native pnpm bootstrap

Volta selects Node.js. Install the manifest-selected native pnpm through npm,
allowing only pnpm's own installation scripts, and place npm's global binary
directory before Volta's experimental pnpm shim in `PATH`:

```bash
npm install --global "$(node -p "require('./package.json').packageManager")" --allow-scripts=pnpm
pnpm --version
```

The `packageManager` field owns pnpm version selection. Volta's pnpm shim expects
the older JavaScript entrypoint and cannot launch the native package.
If Volta already selects pnpm globally, back up
`$VOLTA_HOME/tools/user/platform.json` and set only its `pnpm` field to `null`.
Keep the Node selection and downloaded tool images. Volta's Node launcher can
otherwise prepend the obsolete pnpm image ahead of npm's global directory;
PATH order alone does not retire that selection. Volta's native pnpm uninstall
is [not implemented](https://docs.volta.sh/advanced/pnpm#known-limitations).
Verify that `node -e "require('node:child_process').execFileSync('pnpm', ['--version'], {stdio: 'inherit'})"`
reports the manifest-selected version before installing project dependencies.

```bash
pnpm install
pnpm check
pnpm test
pnpm verify
```

Vite+ owns formatting, lint and tests; both TypeScript project checks remain
explicit. See the [toolchain and retained checker catalog](automation/README.md#local-toolchain)
for configuration, dependency updates and runtime ownership.

Reusable consumer CI setup is documented separately in
[`automation/README.md`](./automation/README.md).

This project is developed with assistance from AI tools.

## Links

- [Security policy](./.github/SECURITY.md)
- [Issues](https://github.com/PiesP/browser-core/issues)
- [License](./LICENSE)
