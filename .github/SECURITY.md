# Security Policy

This document describes how security issues are handled for **@piesp/browser-core**.

## Supported versions

Security support is provided for the latest version on the `master` branch.

## Reporting a vulnerability

Please do not disclose vulnerabilities publicly.

1. Preferred: use [GitHub Security Advisories](https://github.com/PiesP/browser-core/security/advisories/new).
2. If that is unavailable, open a minimal GitHub issue requesting a private channel without technical details.

Include, where possible:

- Short description and impact
- Steps to reproduce
- Affected commit or consumer project
- Relevant test or console output

## Security model

- This is a shared TypeScript utility package for browser projects.
- It has no runtime network access and does not process user files itself.
- Consumer projects execute the resulting browser code in their own security contexts.
- The project does not use `eval()` or similar dynamic code execution.

## Development security

- Dependabot monitors direct npm and GitHub Actions dependencies according to
  [`.github/dependabot.yaml`](dependabot.yaml).
- The [Security Scanning workflow](workflows/security.yaml) runs OSV Scanner,
  CodeQL, and Semgrep on the event types appropriate to each scanner, including
  pull requests, pushes to `master`, scheduled runs, and manual runs.
- GitHub Actions and scanner container images use immutable commit or digest
  references.
- [`pnpm-workspace.yaml`](../pnpm-workspace.yaml) rejects undeclared dependency
  build scripts and exotic transitive sources; its allowlist is the source of
  truth for permitted dependency builds.
