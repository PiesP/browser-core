# Browser project automation

This directory contains reusable, unprivileged automation for the browser-core
consumer repositories. It is distributed independently from the
`@piesp/browser-core` runtime package and its consumer gitlinks.

## Maintained tooling catalog

| Surface and owner | Prerequisites and inputs | Output or side effect | Verification |
| --- | --- | --- | --- |
| `check:format`; `scripts/check-format.ts`, local Node CLI | Manifest-pinned Node; tracked text files | Text-hygiene diagnostics and exit status | Script fixtures and `pnpm check` |
| `generate:design`, `check:design`; `scripts/generate-design-tokens.ts`, local Node CLI | Manifest-pinned Node; `src/design/quiet-instruments.tokens.json` | Generate writes `src/design/generated/*`; check reports stale outputs without writing | Token tests and `pnpm check` |
| `check:types`, `check`; TypeScript compiler and local CLI sequence | Manifest-pinned Node/pnpm and frozen dev dependencies; browser `tsconfig.json`, NodeNext/erasable `tsconfig.scripts.json` | Read-only diagnostics; `check` runs format, design and types in order | Official and Node 22 CI quality jobs |
| `test`, `test:cov`, `test:watch`, `verify`; Vitest and local CLI sequence | Frozen dev dependencies; product and automation fixtures | Tests write disposable fixtures; coverage writes reports; watch persists; `verify` runs check and coverage | `pnpm verify` and exact-SHA CI; consumer acceptance has its own gate |
| `.githooks/pre-commit`, `.githooks/pre-push`; Bash adapters to `scripts/git-hook.ts` | Git hook opt-in, Node, current branch or pre-push stdin refs | Exit status and rejection diagnostic; no writes | `test/scripts/git-hooks.test.ts` exercises executable hooks in temporary Git repositories |
| `automation/actions/setup-project`; composite Action and runner-Node `resolve-runtime.mjs` | Consumer root manifest, optional numeric override, `GITHUB_OUTPUT`; runner Node before pinned toolchain | Resolver writes `version` to `GITHUB_OUTPUT`; Action installs pinned Node/pnpm and optionally frozen dependencies | `test/scripts/resolve-runtime.test.ts`, Action contract tests, CI setup smoke |
| `automation/actions/consumer-impact`; composite Action and runner-Node `classify.mjs` | Existing `packages/core` Git clone and two 40-character SHAs; no installed dependencies | Git subprocess reads commits; Action writes `impact` to `GITHUB_OUTPUT` | `test/scripts/consumer-impact.test.ts`, notification workflow contract tests |
| `automation/actions/prepare-osv`; input-free composite Action and pinned-Node `prepare.ts` | Immutable provider Action SHA, manifest-pinned Node already selected, trusted `RUNNER_TEMP` and `GITHUB_OUTPUT` | Copies only the four provider-owned OSV TypeScript modules into a new private runner directory and outputs `helper-path` after complete success | `test/scripts/prepare-osv-helper.test.ts` exercises the real CLI, Action metadata, fixed copy, cleanup and import behavior |
| `automation/scripts/prepare-setup-smoke.mjs`; runner-Node CI fixture helper | Checked-out `.setup-action` source, empty consumer workspace, no arguments or dependencies | Writes consumer manifest, linked package, frozen lockfile, and workspace file | Script CLI tests; CI hashes fixture files before and after setup |
| `automation/scripts/verify-setup-smoke.ts`; pinned-Node CI verifier | Phase, consumer manifest, optional `PNPM_VERSION`, linked fixture after install | Exit status only; checks selected runtime, install boundary, and dependency value | Script behavior tests; CI runs prepared, installed, and Node 22 compatibility phases |
| `automation/security/validate-osv.ts`; dependency-free Node TypeScript | Explicit input/output paths and schema profile after supported runtime setup | Read/validate JSON; optional atomic validated output, no writes on import | `test/scripts/osv-validator.test.ts`; see the OSV contract below |
| `automation/security/consumer-workflow.ts`; dependency-free Node TypeScript | Fixed scan/report mode, explicit trusted `consumer` or `overlay` profile, pinned scanner image and workflow-owned environment | Scans and raw reporter preflight produce atomic normalized OSV JSON; final reporter validates SARIF and writes `sarif-upload=true` only after a valid exit 0/1 result | `test/scripts/consumer-workflow.test.ts` uses the real CLI and fake Docker; Node 22 fixtures and the gallery pilot below |
| `scripts/notify-consumers.ts`; repository-local Node TypeScript CLI | Default-branch checkout, pinned Node, `CORE_SHA`, repository names, `gh` and `GH_TOKEN` in the invoking step | `validate` queries commit and master ancestry before appending one `core_sha` output; `dispatch` sends the fixed event to one selected consumer; imports have no side effects | `test/scripts/notify-consumers.test.ts`, `test/notify-consumers.test.ts` |
| `scripts/security/osv-workflow.ts`; repository-local pinned-Node TypeScript helper | Fixed `scan-old`, `scan-new`, `scan-full`, `report-pr`, `report-full`, or `summary` mode; immutable reviewed helper files in runner temporary storage, trusted workflow environment and existing Docker image | Scans remove stale results and validate non-empty minimal OSV JSON; reporter performs one parse preflight before one SARIF/fail-on-vuln call; summary appends the existing table then enforces event-specific jobs | `test/scripts/osv-workflow.test.ts` and `test/scripts/security-workflow-execution.test.ts` exercise the CLI and actual workflow run commands with fake Docker; hosted security jobs remain the end-to-end gate |
| `.github/workflows/ci.yaml`, `notify-consumers.yaml`, `security.yaml`; GitHub YAML and bounded shell | GitHub event, trusted checkout, job context, runner tools | Own checks, dispatch, artifacts, permissions, scanner image, and immutable-helper bootstrap. `security.yaml` retains base/head checkout and private file materialization in Bash; its three inline Python validators and scan/report/summary Bash policy have moved to the trusted TypeScript CLI. | Workflow contract and run-block fixture tests, then hosted jobs |
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
Hosted consumer pilot evidence is recorded below, separately from provider fixtures.

The retained languages have explicit stage boundaries:

| Exception or adapter | Reason | Review trigger |
| --- | --- | --- |
| `resolve-runtime.mjs` and the CI matrix's short override adapter | They select the runtime under runner-provided Node before the pinned runtime exists. | Every supported bootstrap runner proves dependency-free direct TypeScript execution, including a clean workspace and the compatibility lane. |
| `classify.mjs` and `prepare-setup-smoke.mjs` | Action consumers and setup fixtures can invoke them before consumer runtime selection; raw ESM has no project-loader dependency. | All actual callers move after verified pin selection and Action metadata, imports and clean-bootstrap tests can change together. |
| Two executable Bash Git-hook launchers | Git supplies the executable-file boundary and stdin; maintained branch/ref policy lives in `scripts/git-hook.ts`. | Hook installation guarantees the same direct Node entry and argument/stdin contract on every supported Git host. |
| Three fixed-file Bash security materialization steps | They obtain the reviewed core-local helper before executing it, refuse an existing destination, and preserve private storage across checkout changes. | An immutable provider Action owns the same fixed core-local closure and its trusted-source, permissions, missing-file and checkout-transition fixtures pass. |
| Semgrep, checkout and package-command launch adapters | Workflow-owned tool arguments, environment and lifecycle ordering remain beside their jobs; maintained scan/report/summary decisions are TypeScript. | A launcher acquires parsing, branching or publication decisions that need their own tested local module. |

Host runtimes are the manifest-selected Node/pnpm, the existing Node 22
compatibility lane, runner-provided bootstrap Node, Git/Bash and the selected
Docker/Semgrep/CodeQL tools. No Python runtime remains in core's maintained
automation. Consumer browser/Windows runtimes are verified by their owners.
Runtime checking, type checking and hosted Action execution are separate checks.

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

After the consumer's manifest-pinned Node setup with
`install-dependencies: 'false'`, a trusted security workflow can call
`PiesP/browser-core/automation/actions/prepare-osv@<reviewed-full-SHA>`.
The input-free Action reads its own immutable provider source, copies the fixed
OSV module closure to a new `0700` directory under `RUNNER_TEMP` with `0600`
files, and emits `helper-path` only after the copy completes. A failed copy
removes only that new directory. The caller owns scan selection, scanner image,
profile, and runner cleanup. The Action does not read the candidate workspace,
install dependencies, or update the consumer's runtime gitlink.

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

## OSV result validation

`automation/security/validate-osv.ts` is a dependency-free Node-direct CLI:

```sh
node automation/security/validate-osv.ts --input raw.json --output validated.json --profile consumer
node automation/security/validate-osv.ts --input validated.json --profile overlay
```

The maintained Node matrix supports direct erasable TypeScript. The CLI reads
only its explicit input, writes an optional validated output, and returns `2`
on parse, schema or I/O failure. Importing its modules does not run the CLI.
`test/scripts/osv-validator.test.ts` exercises the production entrypoint,
including symlink invocation, malformed/mixed records, integer precision,
input/output aliases, stale outputs and replacement failures. Node-specific
type checking belongs to `tsconfig.scripts.json`.

`strict-json.ts` rejects malformed JSON, duplicate decoded keys, non-finite
constants and overflowing floats. It preserves integers beyond Number's exact
range as `bigint` and retains the original validated JSON lexemes in file
outputs. Unknown metadata is preserved; formatting is not canonicalized.
The integer conversion limit matches the existing Python validator's default
4300-digit bound. `osv-report.ts` owns only document/schema checks:

| Profile | Contract |
| --- | --- |
| `minimal` | Core's shallow object root and array of result objects; the pinned reporter separately checks nested inputs. Check-only mode does not certify Unicode serialization. |
| `consumer` | Converter/gallery source, package, vulnerability ID and group structure, with unknown fields retained. |
| `overlay` | The consumer contract plus overlay's optional vulnerability metadata field types. |

Consumer/overlay check-only calls apply the same Unicode serialization checks
as output mode. Output mode rejects input/output aliases before removing an
old output, including symlinks and hardlinks; invalid input removes a stale
distinct output. Successful replacement uses an exclusively created private
temporary file in the output directory, then an atomic rename. No successful
distinct output is created from malformed report data. Callers retain responsibility for
their scanner exit status, reporter/SARIF gates and isolated result directory.

Each consumer owns its workflow adoption and trusted manifest selection. Core's
`security.yaml` now runs the repository-local helper from the reviewed
`e80334d25dd4edb18703d63153ef7630daf4d04b` commit. Each OSV or summary job
materializes the four required TypeScript files with fixed `git show` paths into
`$RUNNER_TEMP/trusted-helper` at mode `0700`; no executable helper is placed
under `GITHUB_WORKSPACE`. The PR job first checks out its base SHA and configures
the pinned runtime from that root manifest, then scans the base and PR result
with the same private helper. The full job fetches the immutable commit while
keeping its event checkout as the scan target; the always-running summary job
checks out the immutable manifest before runtime setup. Missing trusted blobs
fail the job without a candidate fallback. The minimal parser rejects non-finite
values in unknown JSON metadata that Python's permissive default accepted.
This is intentional fail-closed hardening. Workflow jobs still own event and
scan selection, permissions, scanner image, SARIF upload, and job result inputs;
the helper owns local scan/report/summary execution only. Runtime gitlinks,
secrets and publication remain outside this helper's contract.

The consumer helper is called as
`node automation/security/consumer-workflow.ts scan-old consumer` (or
`scan-new`, `scan-full`, `report-pr`, `report-full` with `consumer` or `overlay`).
It uses `RUNNER_TEMP/osv-results`, `GITHUB_WORKSPACE`, the trusted pinned
`OSV_SCANNER_IMAGE`, and `GITHUB_OUTPUT`; it creates the empty policy file in
the private results directory. Scan status 0/1 requires raw reporter parsing
and a nonempty, schema-valid normalized output. A final report validates the
normalized inputs before Docker, checks a single OSV SARIF 2.1.0 run, and
authorizes upload only after a valid reporter exit 0/1. Reporter parse/open
diagnostics return 2 even if Docker returns 0; other nonzero Docker statuses
propagate. Reporter logs retain their original file descriptor while the child
runs and are replayed byte-for-byte after completion, including annotations.
The shared strict JSON parser also rejects duplicate keys and non-finite
numbers anywhere in SARIF; the old inline Python SARIF parser rejected duplicate
keys but allowed non-finite numbers in otherwise ignored fields. This is an
intentional fail-closed tightening. Caller workflows still select scan jobs,
the immutable helper SHA, artifacts and upload policy.

## Verified provider and consumer pilot

Provider Action `prepare-osv` is published at
`9a9471ad301e439bcd1ebc52334cf6b4399510e7`. Its final implementation passed
732 tests across 48 files, real validator/workflow/private-copy fixtures on
Node 22, and official/compatibility hosted checks. The provider owns no consumer
merge, release or deployment operation.

The [gallery pilot PR](https://github.com/PiesP/xcom-enhanced-gallery/pull/234)
tested `ed20a2ce3402b44379a0ceead66c68e2411f1c0a` and landed as
`0183eb1b16e2d5c0912c54077f47091c401ebfa1`. Its local `pnpm verify:full`
passed 905 unit tests, 59 Playwright fixture checks and four direct Firefox
runtime checks. The [PR security run](https://github.com/PiesP/xcom-enhanced-gallery/actions/runs/37410643917)
executed the provider Action, both actual dependency scans, reporting and SARIF
upload. Exact landed [CI](https://github.com/PiesP/xcom-enhanced-gallery/actions/runs/37410964944)
and [security checks](https://github.com/PiesP/xcom-enhanced-gallery/actions/runs/37410964931)
also completed successfully. Local fake-Docker fixtures, hosted scanner jobs
and browser fixtures establish different contracts; these results do not claim
Windows visual, authenticated live-site or release acceptance. The optional AI
review of the pilot could not run because its service quota was exhausted;
it is not counted as a completed review.

| Independent consumer pin | Before pilot | Verified pilot |
| --- | --- | --- |
| Runtime `packages/core` | `5af10d3d6832507ce81d88164bc0af6bba4edb10` | Same gitlink |
| `setup-project` Action | `279124fa998847bd0184d2de12bdaadcd6d2f969` | Same Action |
| OSV helper | Trusted-base local Python validator and inline workflow policy | `prepare-osv@9a9471ad301e439bcd1ebc52334cf6b4399510e7` |

The first-adoption rollback is a protected PR reverting the gallery's OSV
adoption commit and restoring the validator, callers and tests together. Keep
the runtime gitlink and the independently adopted setup/tool metadata pins.
For later provider updates, replace both OSV Action references with the previous
verified full SHA and run the consumer's required gates before landing.
No rollback, publication or runtime gitlink update is performed by this document.

The same reviewed inventory method counts maintained automation files,
executable configuration, profile assets and subprocess-test callers, with
inline bodies counted separately. From initial core commit
`279124fa998847bd0184d2de12bdaadcd6d2f969` to the provider revision above,
TypeScript files changed from 8 to 22, raw JavaScript from 2 to 3, and Bash hook
files remained 2. The added JavaScript is the pre-runtime setup-smoke fixture
producer. Three inline Python validators were retired; three private Bash
materialization steps retain the documented trust boundary, while matrix and
vendor command adapters remain visible. Generated tokens, runtime library
source, third-party tools and YAML/JSON data are excluded from these language
counts. This is a source inventory, not a line-count or performance target.
