# @piesp/browser-core

[한국어](./README.ko.md) | [日本語](./README.ja.md)

Shared TypeScript utilities and design contracts for PiesP browser projects.

This is a private source package. Its package exports point directly to `.ts`
files and are consumed by TypeScript-aware workspace bundlers through exact-SHA
`packages/core` gitlinks and `file:` dependencies. It is not published to npm
and does not provide compiled output for native Node.js consumption.

## API

| Import path | Main exports |
| --- | --- |
| `@piesp/browser-core` | All runtime exports |
| `@piesp/browser-core/async` | Timers, debounce, timeouts, and deferred promises |
| `@piesp/browser-core/error` | Error and cancellation helpers |
| `@piesp/browser-core/events` | `MessageBus`, `createEventEmitter` |
| `@piesp/browser-core/locale` | Locale detection and formatting |
| `@piesp/browser-core/logging` | Logger contracts and console/no-op implementations |
| `@piesp/browser-core/util` | Guards, collections, caches, colors, and scheduler helpers |
| `@piesp/browser-core/design` | Quiet Instruments tokens and interaction contracts |
| `@piesp/browser-core/design/tokens.css` | Scoped `.pp-design` custom properties |
| `@piesp/browser-core/design/tokens.json` | DTCG design-token source |

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

The required Node.js and pnpm versions are defined in
[`package.json`](./package.json).

```bash
pnpm install
pnpm check
pnpm test
pnpm verify
```

Reusable consumer CI setup is documented separately in
[`automation/README.md`](./automation/README.md).

This project is developed with assistance from AI tools.

## Links

- [Security policy](./.github/SECURITY.md)
- [Issues](https://github.com/PiesP/browser-core/issues)
- [License](./LICENSE)
