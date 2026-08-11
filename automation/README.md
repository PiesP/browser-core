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
  with:
    node-version: 26
```

The setup action reads the consumer's root `package.json`, installs its declared
pnpm version and requested Node.js runtime, enables the pnpm cache, and runs
`pnpm install --frozen-lockfile --no-runtime`. Disabling runtime installation in
the dependency step ensures the preceding pinned setup action remains the only
runtime owner. The action does not accept executable commands, paths, references,
URLs, or secrets as inputs.

## Trust boundary

Repository-local workflows continue to own events, permissions, concurrency,
job and required-check names, matrices, artifacts, environments, and secrets.
Reusable automation in this repository must not:

- request or inherit secrets;
- elevate caller permissions;
- execute pull-request-controlled code in a privileged context;
- publish releases, approve pull requests, or merge changes;
- replace trusted-base installation in secret-bearing security workflows.

Dependabot approval and merge jobs, Codex Security bootstrap and scanning, release
publication, deployment, and project-specific browser build orchestration remain
in each consumer repository.

## Versioning and rollout

Runtime gitlinks and automation references are independent pins and may point to
different browser-core commits. Automation changes are rolled out by updating the
full SHA in one consumer first, validating that consumer's final commit with its
local publication gate and required remote workflows, and then updating the
remaining consumers. Rollback is a one-line change to the previously validated
automation SHA.

Changes under `automation/**` intentionally do not trigger the runtime
`Notify consumers` workflow. Runtime notifications remain limited to source and
package dependency changes that require a gitlink update.
