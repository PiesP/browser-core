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

- Dependabot monitors npm and GitHub Actions dependencies.
- OSV Scanner and Semgrep run on pull requests and scheduled/manual scans.
- CI actions are pinned to full commit SHAs.
