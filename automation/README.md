# Browser project automation

This directory contains reusable, unprivileged automation for the browser-core
consumer repositories. It is distributed independently from the
`@piesp/browser-core` runtime package and its consumer gitlinks.

## Maintained tooling catalog

| Surface and owner                                                                                               | Prerequisites and inputs                                                                                                                                                                                      | Output or side effect                                                                                                                                                                                                                                                                              | Verification                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check:format`; Vite+ formatter                                                                                 | `.node-version`-selected Node; maintained text files                                                                                                                                                          | Read-only formatting diagnostics and exit status                                                                                                                                                                                                                                                   | `vp run check`                                                                                                                                                                                                 |
| `generate:design`, `check:design`; `scripts/generate-design-tokens.ts`, local Node CLI                          | `.node-version`-selected Node; `src/design/quiet-instruments.tokens.json`                                                                                                                                     | Generate writes `src/design/generated/*`; check reports stale outputs without writing                                                                                                                                                                                                              | Token tests and `vp run check`                                                                                                                                                                                 |
| `check:types`, `check`; TypeScript compiler and local CLI sequence                                              | `.node-version`-selected Node/pnpm and frozen dev dependencies; browser `tsconfig.json`, NodeNext/erasable `tsconfig.scripts.json`                                                                            | Read-only diagnostics; `check` runs Vite+ format/lint, design and both type projects                                                                                                                                                                                                               | Official and Node 22 CI quality jobs                                                                                                                                                                           |
| `test`, `test:cov`, `test:watch`, `verify`; Vite+ task scripts                                                  | Frozen dev dependencies; product and automation fixtures                                                                                                                                                      | Tests write disposable fixtures; coverage writes reports; watch persists; `verify` runs check and coverage                                                                                                                                                                                         | `vp run verify` and exact-SHA CI; consumer acceptance has its own gate                                                                                                                                         |
| `.githooks/pre-commit`, `.githooks/pre-push`; Bash adapters to `scripts/git-hook.ts`                            | Git hook opt-in, Node, current branch or pre-push stdin refs                                                                                                                                                  | Exit status and rejection diagnostic; no writes                                                                                                                                                                                                                                                    | `test/scripts/git-hooks.test.ts` exercises executable hooks in temporary Git repositories                                                                                                                      |
| `automation/actions/setup-project`; composite Action and `setup-vp`                                             | Consumer `.node-version`, `packageManager`, optional numeric override; runner trust prep                                                                                                                      | Pins Vite+ and selects Node/pnpm; optionally installs frozen dependencies                                                                                                                                                                                                                          | `test/automation-action.test.ts`, CI setup smoke                                                                                                                                                               |
| `automation/actions/consumer-impact`; composite Action and pinned-Node `classify.ts`                            | Supported Node selected by the existing setup Action; existing `packages/core` Git clone and two 40-character SHAs; no installed dependencies                                                                 | Git subprocess reads commits; Action writes `impact` to `GITHUB_OUTPUT`                                                                                                                                                                                                                            | `test/scripts/consumer-impact.test.ts`, notification workflow contract tests                                                                                                                                   |
| `automation/actions/prepare-osv`; input-free composite Action and pinned-Node `prepare.ts`                      | Immutable provider Action SHA, `.node-version`-selected Node already selected, trusted `RUNNER_TEMP` and `GITHUB_OUTPUT`                                                                                      | Copies only the four provider-owned OSV TypeScript modules into a new private runner directory and outputs `helper-path` after complete success                                                                                                                                                    | `test/scripts/prepare-osv-helper.test.ts` exercises the real CLI, Action metadata, fixed copy, cleanup and import behavior                                                                                     |
| `automation/actions/prepare-scanner-pins`; input-free composite Action and pinned-Node `prepare.ts`             | Immutable provider Action SHA, selected Node, trusted `RUNNER_TEMP` and `GITHUB_OUTPUT`                                                                                                                       | Copies the single provider-owned scanner pin CLI into a new private runner directory and outputs `helper-path` only after success                                                                                                                                                                  | `test/scripts/prepare-scanner-pins.test.ts` checks source, copy, cleanup, and import behavior                                                                                                                  |
| `automation/security/scanner-pins.ts`; dependency-free Node TypeScript                                          | Explicit absolute path to consumer-owned pinned metadata, `GITHUB_ENV` for `env` or `GH_TOKEN` for `check`, GitHub API and GHCR for `check`                                                                   | Exports validated images or checks OSV release, OSV digest, and Semgrep release independently; newer mature versions warn, while failed checks return nonzero                                                                                                                                      | `test/scripts/scanner-pins.test.ts` covers metadata, cooling, digest, independent attempts, token-safe errors, and private-copy execution                                                                      |
| `automation/scripts/prepare-setup-smoke.mjs`; runner-Node fixture                                               | Checked-out provider, empty consumer workspace                                                                                                                                                                | Writes distinct `.node-version`, pnpm manifest/lockfile, linked package and workspace policy                                                                                                                                                                                                       | Script CLI tests; CI hashes inputs before and after setup                                                                                                                                                      |
| `automation/scripts/verify-setup-smoke.ts`; pinned-Node CI verifier                                             | Phase, consumer manifest, optional `PNPM_VERSION`, linked fixture after install                                                                                                                               | Exit status only; checks selected runtime, install boundary, and dependency value                                                                                                                                                                                                                  | Script behavior tests; CI runs prepared, installed, and Node 22 compatibility phases                                                                                                                           |
| `automation/security/validate-osv.ts`; dependency-free Node TypeScript                                          | Explicit input/output paths and schema profile after supported runtime setup                                                                                                                                  | Read/validate JSON; optional atomic validated output, no writes on import                                                                                                                                                                                                                          | `test/scripts/osv-validator.test.ts`; see the OSV contract below                                                                                                                                               |
| `automation/security/consumer-workflow.ts`; dependency-free Node TypeScript                                     | Fixed scan/report mode, explicit trusted `consumer` or `overlay` profile, pinned scanner image and workflow-owned environment                                                                                 | Scans and raw reporter preflight produce atomic normalized OSV JSON; final reporter validates SARIF and writes `sarif-upload=true` only after a valid exit 0/1 result                                                                                                                              | `test/scripts/consumer-workflow.test.ts` uses the real CLI and fake Docker; Node 22 fixtures and the gallery pilot below                                                                                       |
| `scripts/notify-consumers.ts`; repository-local Node TypeScript CLI                                             | Default-branch checkout, pinned Node, `CORE_SHA`, repository names, `gh` and `GH_TOKEN` in the invoking step                                                                                                  | `validate` queries commit and master ancestry before appending one `core_sha` output; `dispatch` sends the fixed event to one selected consumer; imports have no side effects                                                                                                                      | `test/scripts/notify-consumers.test.ts`, `test/notify-consumers.test.ts`                                                                                                                                       |
| `scripts/security/osv-workflow.ts`; repository-local pinned-Node TypeScript helper                              | Fixed `scan-old`, `scan-new`, `scan-full`, `report-pr`, `report-full`, or `summary` mode; immutable reviewed helper files in runner temporary storage, trusted workflow environment and existing Docker image | Scans remove stale results and validate non-empty minimal OSV JSON; reporter performs one parse preflight before one SARIF/fail-on-vuln call; summary appends the existing table then enforces event-specific jobs                                                                                 | `test/scripts/osv-workflow.test.ts` and `test/scripts/security-workflow-execution.test.ts` exercise the CLI and actual workflow run commands with fake Docker; hosted security jobs remain the end-to-end gate |
| `.github/workflows/ci.yaml`, `notify-consumers.yaml`, `security.yaml`; GitHub YAML and bounded shell            | GitHub event, trusted checkout, job context, runner tools                                                                                                                                                     | Own checks, dispatch, artifacts, permissions, scanner image, and immutable-helper bootstrap. `security.yaml` retains base/head checkout and private file materialization in Bash; its three inline Python validators and scan/report/summary Bash policy have moved to the trusted TypeScript CLI. | Workflow contract and run-block fixture tests, then hosted jobs                                                                                                                                                |
| `test/scripts/*.test.ts`, `test/automation-action.test.ts`, `test/security-workflow.test.ts`; Vitest TypeScript | Installed test dependencies and disposable Git/workflow fixtures                                                                                                                                              | Assertions and temporary fixture writes                                                                                                                                                                                                                                                            | `vp run test`, coverage gate in `vp run verify`                                                                                                                                                                |

The setup order is runner trust preparation and checkout → exact consumer
`.node-version` validation → immutable `setup-vp` installation of Vite+, Node and
the package manager → optional `vp install --frozen-lockfile -- --no-runtime` →
consumer tool execution. `install-dependencies: 'false'` stops after toolchain
setup. The Action accepts a numeric Node override only for compatibility jobs.
Vite+ selects the consumer's package manager from `packageManager`; the provider
pins Vite+ until a reviewed provider revision qualifies another release.

`prepare-setup-smoke.mjs` is the sole raw JavaScript bootstrap exception. It
creates a distinct consumer before any project runtime or dependencies exist,
and its no-write-on-existing-path behavior is tested directly. The consumer
impact classifier and OSV helpers are dependency-free TypeScript invoked only
after supported Node setup. Bash Git hooks preserve the Git executable and stdin
boundary; `scripts/git-hook.ts` owns their branch policy. The fixed-file security
materialization steps preserve trusted source and private output handling. Review
these adapters when their execution stage or underlying platform contract changes.
Hosted CI is the authority for the runner bootstrap, Node 22 compatibility, and
the no-install, installed and override setup phases. Consumer browser and Windows
runtime acceptance remains with the owning repositories.

## Local toolchain

`vp run check` runs Vite+ formatting and type-aware lint, generated-token
freshness and both current TypeScript projects. `vite.config.ts` owns formatting,
lint, coverage and disabled task caching. Generated design outputs remain excluded
from formatting; `vp run check:design` checks their freshness. `vp run test` and
`vp run test:cov` run once and exit; `vp run test:watch` persists and reruns.
`vp run verify` performs checking and coverage tests. A restored cached result
cannot serve as fresh validation. This does not establish consumer browser or
installed-application acceptance.

| Retained checker                | Command               | Reason                                                                                                                                                                                  |
| ------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript                      | `vp run check:types`  | Checks browser/bundler and NodeNext/erasable projects separately until integrated project discovery is qualified in [browser-core#97](https://github.com/PiesP/browser-core/issues/97). |
| Design generator                | `vp run check:design` | Validates tokens and byte freshness of generated CSS/TypeScript.                                                                                                                        |
| Bootstrap and security fixtures | `vp run test`         | Check dependency-free setup boundaries, consumer source and trusted workflow execution.                                                                                                 |

For an update, select an exact stable Vite+ release that satisfies the existing
npm release-age policy, then use its pinned migrator from the repository root:
Replace `VERSION` in both commands with that selected exact release.

```sh
pnpm dlx --package=vite-plus@VERSION vp help migrate
pnpm dlx --package=vite-plus@VERSION vp migrate --no-interactive --no-agent --no-editor --no-hooks
```

Review every migration finding and the complete manifest, catalog, override and
lockfile diff. Retain compatibility aliases and align the direct upstream Vitest
and coverage entries with the selected toolchain; the upstream package identity
is still used by ambient test types. Do not accept generated release-age
exemptions, broad peer-policy relaxations, install hooks or competing runtime/hook
ownership. Keep the `.node-version` and `packageManager` authorities coherent.
Finish with a frozen `vp install`, `vp run verify`, the supported CI runtime
matrix and affected consumer acceptance. The standalone paired-updater recovery service is retired.

The managed Vite alias reports the selected Vite+ version, while its package
metadata records the bundled Vite version. Strict peer validation stays enabled.
The only peer allowances match the exact `vitest` and `@vitest/mocker` versions
in `pnpm-workspace.yaml` requesting that exact alias version; their declared Vite 8
ranges include the bundled implementation. Recheck these exact callers, the
alias and the bundled Vite against their original peer ranges on every update.
Do not widen these entries or add `allowAny`. Validate dependency resolution
with a non-frozen lockfile calculation as well as the clean frozen install;
the latter alone can reuse an unchecked migration lockfile.

Dependabot keeps Vite+ version updates visible, but does not independently update
its managed Vite alias or upstream Vitest/coverage pins. Those normal component
updates are excluded with version-update-only filters. Keep security alerts and
security updates enabled, but GitHub's pnpm 12 two-document lockfile ingestion
limitation can prevent dependency detection and those security notifications.
Use the existing OSV workflow and the shared
[monitoring and remediation policy](https://github.com/PiesP/.github/blob/master/MAINTENANCE_POLICY.md#dependency-security-monitoring)
to handle applicable findings when no automatic security PR appears. A Vite+ update PR still needs
the pinned migration above, manual catalog/peer review and the required gates
before merging. Do not merge a package-only bump as an aligned toolchain update.
See [project updates](https://viteplus.dev/guide/upgrade-project); the global
`vp upgrade` command alone does not update this project.

## Consumer contract

Consumers reference actions from this repository with an immutable 40-character
commit SHA:

```yaml
- name: Setup project
  uses: PiesP/browser-core/automation/actions/setup-project@0123456789abcdef0123456789abcdef01234567
```

The shared composite Action validates an exact consumer `.node-version` and
uses [setup-vp v1.22.0](https://github.com/voidzero-dev/setup-vp/blob/cab1ab9eaff52d4857875f4f2c016e36af8f2c76/action.yml)
to install Vite+ 1.4.0, the selected Node and the pnpm version from the consumer's
`packageManager`. It disables both dependency and toolchain caches. By default,
it runs `vp install --frozen-lockfile -- --no-runtime`; pnpm still enforces the
workspace's strict peers, engines, build approvals, release age and source
policies. The Action accepts no executable commands, paths, references, URLs or
secrets as inputs.

For tooling that must run before dependencies exist, use
`install-dependencies: 'false'`, then call the same Action again for installation:

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

An optional numeric `node-version` input belongs only to explicit compatibility
jobs. Product and release builds omit it, so the consumer's `.node-version` is
the exact Node authority. The setup Action rejects a missing, symlinked or
non-exact pin before installing Vite+. Compatibility overrides are validated
separately and may run without that pin. The provider's supported Node lines
retain the security-release floors in `package.json`; the smoke fixture uses a
distinct Node 24/pnpm 11 pair to verify consumer selection and Node 22 override.
The Vite+ and setup-vp versions are qualified as a provider revision; consumers
adopt its immutable Action SHA separately from any runtime `packages/core` gitlink.
To roll back a consumer, restore its previous reviewed Action SHA and matching
runtime pin through its protected PR path, preserving any unrelated source edits.

Project Node selection, the runner-owned Node executing JavaScript Actions
(including the package-manager bootstrap), and the selected pnpm executable are
separate concerns. A project `node --version` result does not establish the
runtime or trust behavior of every executable. Historical pnpm 11 incident
observations remain evidence for their recorded source and execution path;
this description adds no new installation, runtime, or TLS qualification.
`automation/actions/prepare-node-trust` is an input-free shell bootstrap for
Ubuntu 24.04 and Alpine 3.23. It requires the caller's job environment to select
only the OpenSSL store:

```yaml
env:
  NODE_OPTIONS: --use-openssl-ca
  SSL_CERT_FILE: /etc/ssl/certs/ca-certificates.crt
  SSL_CERT_DIR: /etc/ssl/certs
```

Invoke the published helper at a reviewed full commit SHA as the first step,
before checkout or any other JavaScript Action. Keep the environment at workflow
or job scope so Action bootstrap and post steps inherit it. GitHub forbids setting
`NODE_OPTIONS` through `GITHUB_ENV`; the helper therefore validates the caller's
settings rather than writing environment files. Additive `NODE_EXTRA_CA_CERTS`
and disabled verification are rejected.

The helper accepts only the supported distributions and upgrades the official
CA packages when their installed versions are below the incident fix floor:
Ubuntu `ca-certificates` >= `20260816ubuntu0.24.04.1`
([USN-8944-1](https://ubuntu.com/security/notices/USN-8944-1)), or Alpine
`ca-certificates` **and** `ca-certificates-bundle` >= `20261020-r0`
([Alpine package](https://pkgs.alpinelinux.org/package/v3.23/main/x86_64/ca-certificates-bundle)).
Both the bundle and hashed certificate directory must be present. Unsupported
systems, package failures, missing fixed versions, or conflicting trust settings
stop the job before later Actions. This selects remediated OS trust for the
runner-owned Node; it does not replace the runner's Node binary. Runner downloads
before job steps, container pulls, and tools with separate TLS stores retain
their own trust boundaries.

Manually dispatch CI to run the Ubuntu and pinned Semgrep Alpine `node24`
qualification jobs. The published helper runs first to protect Action bootstrap and checkout. After
checkout, each job also exercises its local candidate helper, then checks a normal
HTTPS control and one
direct plus one cross-signed incident sample in the actual JavaScript Action
process. Certificate errors establish rejection; timeouts or DNS errors leave
qualification incomplete. Ordinary push and PR CI skip live incident endpoints.
Historical bundled/old-store failures remain incident evidence rather than
mandatory failing lanes in the maintained workflow. The diagnostic's raw ESM
entry runs separately from the setup-fixture helper.
Keep historical source revisions immutable and defer network replays that select
an unqualified runtime until that exact runtime or a scoped trust mitigation has
been independently verified.

`.github/dependabot.yaml` watches both the root workflows and
`automation/actions/setup-project/action.yaml`.
For an Action SHA update, check the full commit against the official upstream
release and allow at least 24 hours from that release before review. Update the
independent allowed-SHA assertions in `test/automation-action.test.ts` and any
affected workflow contract tests in the same PR; never compute an expected SHA
from the workflow or action being tested. Keep the consumer `.node-version`/`packageManager` selection,
input allowlist, disabled caches and optional frozen-install behavior intact.
The PR-local setup smoke exercises a distinct pnpm 11 fixture, its exact Node
pin, Node 22 override and optional frozen installation.
Run the focused action/workflow tests and `vp run verify`, then review the hosted
checks at the PR head. A stale test pin calls for reviewing that specific
update, not closing every grouped Actions update. This automation-only
maintenance does not update runtime gitlinks.

After the consumer's `.node-version` setup with
`install-dependencies: 'false'`, a trusted security workflow can call
`PiesP/browser-core/automation/actions/prepare-osv@<reviewed-full-SHA>`.
The input-free Action reads its own immutable provider source, copies the fixed
OSV module closure to a new `0700` directory under `RUNNER_TEMP` with `0600`
files, and emits `helper-path` only after the copy completes. A failed copy
removes only that new directory. The caller owns scan selection, scanner image,
profile, and runner cleanup. The Action does not read the candidate workspace,
install dependencies, or update the consumer's runtime gitlink.

The scanner pin Action follows the same reviewed-source boundary and emits a
private `scanner-pins.ts` path. The consumer must copy its own reviewed
`scripts/ci/pinned-tools.json` before a checkout transition, then pass that
file's **absolute path** to `node "$HELPER" env "$PIN_METADATA"` or
`node "$HELPER" check "$PIN_METADATA"`. The helper never searches its own
directory or the current checkout for metadata. `env` appends only validated
`OSV_SCANNER_IMAGE` and `SEMGREP_IMAGE` assignments to `GITHUB_ENV`; `check`
uses the consumer's existing `GH_TOKEN` and leaves release and digest checks
independent. Workflow owners choose which trusted checkout supplies the JSON
and clean their private runner storage.

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
remaining consumers. OSV rollback depends on the adoption stage: undoing the first
adoption restores the consumer's prior validator/callers/tests, while a compatible
provider rollback updates all applicable Action references together. Follow the
consumer-owned procedure in [OSV adoption and rollback](#osv-adoption-and-rollback);
neither operation changes runtime gitlinks or authorizes publication/settings changes.

Scanner pin rollback is consumer-owned: restore its previous two local CLIs,
their reviewed metadata copy, and workflow/test callers together from that
consumer's recorded pre-adoption revision, then run its local fixtures and
hosted security jobs. A later compatible provider rollback can update the
scanner pin Action reference to a previously reviewed full SHA. Neither path
changes the consumer's `pinned-tools.json` pin data or runtime gitlink.

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
`node automation/actions/consumer-impact/classify.ts packages/core BASE_SHA HEAD_SHA`.

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

| Profile    | Contract                                                                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `minimal`  | Core's shallow object root and array of result objects; the pinned reporter separately checks nested inputs. Check-only mode does not certify Unicode serialization. |
| `consumer` | Converter/gallery source, package, vulnerability ID and group structure, with unknown fields retained.                                                               |
| `overlay`  | The consumer contract plus overlay's optional vulnerability metadata field types.                                                                                    |

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

## OSV adoption and rollback

To undo first OSV adoption, use a consumer-owned protected PR to restore its local
validator, all affected workflow callers and associated tests together from that
consumer's recorded pre-adoption revision. Use its existing
`docs/osv-workflow.md` coverage map and preserve unrelated later edits; a provider
pin alone cannot restore the prior contract, and a blanket revert of one adoption
commit is not a universal recovery procedure. The
[gallery pilot](https://github.com/PiesP/xcom-enhanced-gallery/pull/234) records one
consumer's adoption, not a shared restore revision for all consumers. Keep runtime
gitlinks, setup-project pins and independently adopted tool metadata unchanged.

For a later compatible provider rollback, update all applicable OSV Action
references (currently two per consumer) to the same previously reviewed full SHA.
Verify local workflow composition, the selected schema/profile and real CLI
fixtures, then the hosted scanner/report/upload checks under the consumer's
protected-PR gates. An incompatible provider contract may also require coordinated
caller changes. Consumer permissions and publication policy remain consumer-owned.
No rollback, publication or runtime gitlink update is performed by this document.

## Verified provider and consumer pilot

Completed in October 2026, the provider
[`prepare-osv` revision](https://github.com/PiesP/browser-core/commit/9a9471ad301e439bcd1ebc52334cf6b4399510e7)
and [gallery pilot PR](https://github.com/PiesP/xcom-enhanced-gallery/pull/234)
validated the independently pinned OSV helper, consumer fixtures, and hosted
scanner/report/upload path. The gallery tested
`ed20a2ce3402b44379a0ceead66c68e2411f1c0a` and landed as
`0183eb1b16e2d5c0912c54077f47091c401ebfa1`. The
[immutable pre-edit guide](https://github.com/PiesP/browser-core/blob/c51e78962ac388db9922db99bc6f1ab8d0c4f7ee/automation/README.md#verified-provider-and-consumer-pilot)
retains the full historical test results, independent-pin comparison, and
automation-language inventory. Those results document the completed pilot,
not a current consumer validation or pin requirement.
