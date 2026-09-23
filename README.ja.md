# @piesp/browser-core

[English](./README.md) | [한국어](./README.ko.md)

PiesP のブラウザプロジェクトで共有する TypeScript ユーティリティとデザイン契約です。

これは非公開のソースパッケージです。パッケージの exports は `.ts` ファイルを直接参照し、
TypeScript を処理できるワークスペースのバンドラーが、SHA を固定した `packages/core` gitlink と
`file:` 依存関係を通じて利用します。npm には公開せず、ネイティブ Node.js で使用できる
コンパイル済み出力も提供しません。

## API

| インポートパス | 主なエクスポート |
| --- | --- |
| `@piesp/browser-core` | すべてのランタイムエクスポート |
| `@piesp/browser-core/async` | タイマー、デバウンス、タイムアウト、遅延 Promise |
| `@piesp/browser-core/error` | エラーとキャンセルのヘルパー |
| `@piesp/browser-core/events` | `MessageBus`、`createEventEmitter` |
| `@piesp/browser-core/locale` | ロケール検出とフォーマット |
| `@piesp/browser-core/logging` | ロガー契約とコンソール/no-op 実装 |
| `@piesp/browser-core/util` | ガード、コレクション、キャッシュ、色、スケジューラーヘルパー |
| `@piesp/browser-core/design` | Quiet Instruments のトークンと操作契約 |
| `@piesp/browser-core/design/tokens.css` | `.pp-design` スコープのカスタムプロパティ |
| `@piesp/browser-core/design/tokens.json` | DTCG デザイントークンのソース |

```ts
import { sleep } from '@piesp/browser-core/async';
import { MessageBus } from '@piesp/browser-core/events';

const messages = new MessageBus<string>();
const unsubscribe = messages.subscribe(console.log);
messages.publish('ready');
unsubscribe();

await sleep(100);
```

詳しい動作は [API 契約](./docs/API.md) と
[Quiet Instruments デザイン契約](./docs/DESIGN.md) を参照してください。

## 開発

必要な Node.js と pnpm のバージョンは [`package.json`](./package.json) に定義されています。

```bash
pnpm install
pnpm check
pnpm test
pnpm verify
```

利用側リポジトリで再利用する CI 設定は
[`automation/README.md`](./automation/README.md) に別途記載しています。

このプロジェクトは AI ツールの支援を受けて開発されています。

## リンク

- [セキュリティポリシー](./.github/SECURITY.md)
- [Issues](https://github.com/PiesP/browser-core/issues)
- [ライセンス](./LICENSE)
