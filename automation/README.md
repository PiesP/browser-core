# Browser project automation

This directory contains reusable, unprivileged automation for the browser-core
consumer repositories. It is distributed independently from the
`@piesp/browser-core` runtime package and its consumer gitlinks.

## Consumer contract

Consumers reference actions from this repository with an immutable 40-character
commit SHA:

```yaml
- name: Setup project
  uses: PiesP/browser-core/automation/actions/setup-project@0123456789abcdef0123456789abcdef01234567
```

The setup action reads the consumer's root `package.json`, installs its declared
pnpm version and exact `volta.node` runtime, enables the pnpm cache, and runs
`pnpm install --frozen-lockfile --no-runtime`. Disabling runtime installation in
the dependency step ensures the preceding pinned setup action remains the only
runtime owner. The action does not accept executable commands, paths, references,
URLs, or secrets as inputs.

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
`Notify consumers` workflow. The workflow's path filter watches source, package,
lockfile, and workspace configuration changes. The impact action then skips
development-only revisions before dispatching consumer updates.

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
