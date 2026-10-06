# Browser project automation

This directory contains reusable, unprivileged automation for the browser-core
consumer repositories. It is distributed independently from the
`@piesp/browser-core` runtime package and its consumer gitlinks.

## Maintained tooling catalog

| Surface and owner | Prerequisites and inputs | Output or side effect | Verification |
| --- | --- | --- | --- |
| `package.json` commands: `check`, `check:format`, `check:design`, `check:types`, `generate:design`, `test`, `test:cov`, `verify`; Node-direct TypeScript in `scripts/` | Manifest-pinned Node/pnpm and installed dev dependencies; source, token JSON, and test files | Exit status and diagnostics; only `generate:design` writes generated TS/CSS. `tsconfig.scripts.json` checks Node-direct TypeScript separately from browser source. | `pnpm check`, focused script tests, `pnpm verify` |
| `.githooks/pre-commit`, `.githooks/pre-push`; Bash adapters to `scripts/git-hook.ts` | Git hook opt-in, Node, current branch or pre-push stdin refs | Exit status and rejection diagnostic; no writes | `test/scripts/git-hooks.test.ts` exercises executable hooks in temporary Git repositories |
| `automation/actions/setup-project`; composite Action and runner-Node `resolve-runtime.mjs` | Consumer root manifest, optional numeric override, `GITHUB_OUTPUT`; runner Node before pinned toolchain | Resolver writes `version` to `GITHUB_OUTPUT`; Action installs pinned Node/pnpm and optionally frozen dependencies | `test/scripts/resolve-runtime.test.ts`, Action contract tests, CI setup smoke |
| `automation/actions/consumer-impact`; composite Action and runner-Node `classify.mjs` | Existing `packages/core` Git clone and two 40-character SHAs; no installed dependencies | Git subprocess reads commits; Action writes `impact` to `GITHUB_OUTPUT` | `test/scripts/consumer-impact.test.ts`, notification workflow contract tests |
| `automation/scripts/prepare-setup-smoke.mjs`; runner-Node CI fixture helper | Checked-out `.setup-action` source, empty consumer workspace, no arguments or dependencies | Writes consumer manifest, linked package, frozen lockfile, and workspace file | Script CLI tests; CI hashes fixture files before and after setup |
| `automation/scripts/verify-setup-smoke.ts`; pinned-Node CI verifier | Phase, consumer manifest, optional `PNPM_VERSION`, linked fixture after install | Exit status only; checks selected runtime, install boundary, and dependency value | Script behavior tests; CI runs prepared, installed, and Node 22 compatibility phases |
| `.github/workflows/ci.yaml`, `notify-consumers.yaml`, `security.yaml`; GitHub YAML and shell | GitHub event, trusted checkout, job context, runner tools | Own checks, dispatch, artifacts, permissions, and scanner orchestration | Workflow contract tests and hosted jobs; `security.yaml` has three inline Python result validators pending separate contract and trust review |
| `test/scripts/*.test.ts`, `test/automation-action.test.ts`, `test/security-workflow.test.ts`; Vitest TypeScript | Installed test dependencies and disposable Git/workflow fixtures | Assertions and temporary fixture writes | `pnpm test`, coverage gate in `pnpm verify` |

The setup order is runner-provided Node → manifest/override resolution → pinned
Node and pnpm installation → optional frozen dependency installation → consumer
tool execution. `install-dependencies: 'false'` stops after toolchain setup.
The pre-runtime `.mjs` files must not import project dependencies or require
TypeScript execution. Review each exception if a caller moves after guaranteed
pin selection, the supported runner Node contract changes, or the Node 22/24
compatibility matrix changes. A conversion must pass a clean bootstrap with no
`node_modules` and the existing compatibility jobs first.
The three retained `.mjs` files receive a Node syntax check under the local
official pin; their CLI fixtures cover runtime behavior. Hosted CI remains the
authority for the runner's bootstrap Node and the Node 22 compatibility lane.
This catalog leaves security-validator extraction and consumer pilot evidence
open for the later issue stages.

## Consumer contract

Consumers reference actions from this repository with an immutable 40-character
commit SHA:

```yaml
- name: Setup project
  uses: PiesP/browser-core/automation/actions/setup-project@0123456789abcdef0123456789abcdef01234567
```

The setup action reads the consumer's root `package.json`, installs its declared
pnpm version and exact `volta.node` runtime, enables the pnpm cache, and by
default runs `pnpm install --frozen-lockfile --no-runtime`. Disabling runtime
installation in the dependency step ensures the preceding pinned setup action
remains the only runtime owner. The action does not accept executable commands,
paths, references, URLs, or secrets as inputs.

For tooling that must run before the dependency install, such as deep-cache
marker checks, set `install-dependencies: 'false'` and call the action again with
the default after those checks. The runtime and package manager are configured
before the first action returns, independently of the later dependency install:

```yaml
- name: Setup pinned runtime
  uses: PiesP/browser-core/automation/actions/setup-project@0123456789abcdef0123456789abcdef01234567
  with:
    install-dependencies: 'false'
- name: Check cache marker
  run: node scripts/check-cache-marker.ts
- name: Setup project dependencies
  uses: PiesP/browser-core/automation/actions/setup-project@0123456789abcdef0123456789abcdef01234567
```

An optional numeric `node-version` input is reserved for explicitly identified
compatibility jobs. Product CI, deep analysis, and release builds omit it so
the existing consumer manifest remains the single official version source.
Official builds fail before dependency installation when the manifest pin is
missing or non-exact. Compatibility overrides intentionally select a separate
numeric runtime without requiring that official pin.

## Trust boundary

Repository-local workflows continue to own events, permissions, concurrency,
job and required-check names, matrices, artifacts, environments, and secrets.
Reusable automation in this repository must not:

- request or inherit secrets;
- elevate caller permissions;
- execute pull-request-controlled code in a privileged context;
- publish releases, approve pull requests, or merge changes;
- replace trusted-base installation in secret-bearing security workflows.

Dependabot approval and merge jobs, release publication, deployment, and
project-specific browser build orchestration remain
in each consumer repository.

## Versioning and rollout

Runtime gitlinks and automation references are independent pins and may point to
different browser-core commits. Automation changes are rolled out by updating the
full SHA in one consumer first, validating that consumer's final commit with its
local publication gate and required remote workflows, and then updating the
remaining consumers. Rollback is a one-line change to the previously validated
automation SHA.

Changes under `automation/**` intentionally do not trigger the runtime
`Notify consumers` workflow when they are the only changed paths. All other
pushes reach the impact action so changes to runtime targets outside `src/`
cannot be missed. The action skips reviewed development-only revisions before
dispatching consumer updates.

The `consumer-impact` action compares two browser-core commits in an existing
`packages/core` clone and outputs `impact=true` when source, package contract,
runtime dependencies, or unknown configuration could affect consumers. It
returns `false` for automation-only changes and for reviewed development-only
paths, package fields, and tool pins when no package entrypoint or install hook
consumes those files. Lockfile changes are skipped only when the package has no
runtime dependencies. Unknown paths and configuration remain impactful. An
unavailable or unrelated base commit returns `true` to preserve orphaned-gitlink
recovery.
Source symlinks and parent-relative source references conservatively make
development-path changes impactful. The classifier does not resolve arbitrary
dynamic imports or custom path aliases; adding one requires extending this
policy before its target can be safely skipped.
The CLI is also callable as
`node automation/actions/consumer-impact/classify.mjs packages/core BASE_SHA HEAD_SHA`.
