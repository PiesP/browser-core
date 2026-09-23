# @piesp/browser-core

[English](./README.md) | [日本語](./README.ja.md)

PiesP 브라우저 프로젝트에서 공유하는 TypeScript 유틸리티와 디자인 계약입니다.

이 패키지는 비공개 소스 패키지입니다. 패키지 내보내기는 `.ts` 파일을 직접
가리키며, TypeScript를 처리할 수 있는 워크스페이스 번들러가 정확한 SHA의
`packages/core` gitlink와 `file:` 의존성을 통해 사용합니다. npm에 게시하지
않으며, 네이티브 Node.js에서 사용할 수 있는 컴파일 결과물도 제공하지 않습니다.

## API

| 가져오기 경로 | 주요 내보내기 |
| --- | --- |
| `@piesp/browser-core` | 모든 런타임 내보내기 |
| `@piesp/browser-core/async` | 타이머, 디바운스, 타임아웃, 지연 프로미스 |
| `@piesp/browser-core/error` | 오류 및 취소 도우미 |
| `@piesp/browser-core/events` | `MessageBus`, `createEventEmitter` |
| `@piesp/browser-core/locale` | 로케일 감지 및 서식 지정 |
| `@piesp/browser-core/logging` | 로거 계약과 콘솔/no-op 구현 |
| `@piesp/browser-core/util` | 가드, 컬렉션, 캐시, 색상, 스케줄러 도우미 |
| `@piesp/browser-core/design` | Quiet Instruments 토큰과 상호작용 계약 |
| `@piesp/browser-core/design/tokens.css` | `.pp-design` 범위의 사용자 지정 속성 |
| `@piesp/browser-core/design/tokens.json` | DTCG 디자인 토큰 원본 |

```ts
import { sleep } from '@piesp/browser-core/async';
import { MessageBus } from '@piesp/browser-core/events';

const messages = new MessageBus<string>();
const unsubscribe = messages.subscribe(console.log);
messages.publish('ready');
unsubscribe();

await sleep(100);
```

자세한 동작은 [API 계약](./docs/API.md)과
[Quiet Instruments 디자인 계약](./docs/DESIGN.md)을 참고하세요.

## 개발

필요한 Node.js와 pnpm 버전은 [`package.json`](./package.json)에 정의되어 있습니다.

```bash
pnpm install
pnpm check
pnpm test
pnpm verify
```

소비자 저장소에서 재사용하는 CI 설정은
[`automation/README.md`](./automation/README.md)에 별도로 설명되어 있습니다.

이 프로젝트는 AI 도구의 도움을 받아 개발합니다.

## 링크

- [보안 정책](./.github/SECURITY.md)
- [이슈](https://github.com/PiesP/browser-core/issues)
- [라이선스](./LICENSE)
