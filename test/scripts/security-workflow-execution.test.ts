/// <reference types="node" />

import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import workflow from '../../.github/workflows/security.yaml?raw';

type Sandbox = {
  bin: string;
  candidateSha: string;
  resultDirectory: string;
  runnerTemp: string;
  root: string;
  workspace: string;
};

const sandboxes: string[] = [];
const repositoryRoot = resolve(import.meta.dirname, '../..');
const trustedSha = 'e80334d25dd4edb18703d63153ef7630daf4d04b';

function extractStepRun(name: string): string {
  const lines = workflow.split('\n');
  const start = lines.findIndex((line) => line.trim() === `- name: ${name}`);
  if (start < 0) throw new Error(`Workflow step not found: ${name}`);

  const stepIndent = lines[start]?.match(/^\s*/)?.[0].length ?? 0;
  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end] ?? '';
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    if (line.trim() && indent === stepIndent && line.trim().startsWith('- name: ')) break;
    if (line.trim() && indent < stepIndent) break;
    end += 1;
  }

  const block = lines.slice(start, end);
  const runIndex = block.findIndex((line) => line.trim().startsWith('run: '));
  if (runIndex < 0) throw new Error(`Workflow step has no run body: ${name}`);
  const inline = block[runIndex]?.trim();
  if (inline !== 'run: |') return inline?.slice('run: '.length) ?? '';
  const runIndent = (block[runIndex]?.match(/^\s*/)?.[0].length ?? 0) + 2;
  return block
    .slice(runIndex + 1)
    .map((line) => line.slice(runIndent))
    .join('\n');
}

function createSandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), 'browser-core-osv-workflow-'));
  sandboxes.push(root);
  const bin = join(root, 'bin');
  const runnerTemp = join(root, 'runner-temp');
  const resultDirectory = join(runnerTemp, 'osv-results');
  const workspace = join(root, 'workspace');
  mkdirSync(bin);
  mkdirSync(runnerTemp);
  execFileSync('git', ['clone', '--quiet', '--no-hardlinks', repositoryRoot, workspace]);
  execFileSync('git', ['-C', workspace, 'switch', '--quiet', '--detach', trustedSha]);
  execFileSync('git', ['-C', workspace, 'config', 'user.name', 'Security fixture']);
  execFileSync('git', ['-C', workspace, 'config', 'user.email', 'security@example.invalid']);
  writeFileSync(join(workspace, 'scripts/security/osv-workflow.ts'), "throw new Error('PR candidate helper ran');\n");
  execFileSync('git', ['-C', workspace, 'add', 'scripts/security/osv-workflow.ts']);
  execFileSync('git', ['-C', workspace, 'commit', '--quiet', '-m', 'test: collide with helper filename']);
  const candidateSha = execFileSync('git', ['-C', workspace, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  execFileSync('git', ['-C', workspace, 'switch', '--quiet', '--force', '--detach', trustedSha]);

  const fakeDocker = join(bin, 'docker');
  writeFileSync(
    fakeDocker,
    `#!/usr/bin/env bash
set -euo pipefail
output_name=''
for argument in "$@"; do
  case "$argument" in
    --output-file=/results/*) output_name="\${argument#--output-file=/results/}" ;;
  esac
done
if [[ -n "$output_name" && -n "\${FAKE_SCAN_SOURCE:-}" ]]; then
  cp "$FAKE_SCAN_SOURCE" "$RUNNER_TEMP/osv-results/$output_name"
fi
entrypoint=''
for argument in "$@"; do
  case "$argument" in
    --entrypoint) entrypoint='next' ;;
    /root/osv-reporter)
      if [[ "$entrypoint" == 'next' ]]; then entrypoint='/root/osv-reporter'; fi
      ;;
  esac
done
if [[ "$entrypoint" == '/root/osv-reporter' ]]; then
  if [[ " $* " == *' --fail-on-vuln=false '* ]]; then
    if [[ "\${FAKE_PARSE_ERROR:-0}" == '1' ]]; then
      echo 'failed to open new results at /results/new-results.json: failed to parse' >&2
    fi
    exit "\${FAKE_VALIDATION_STATUS:-0}"
  fi
  printf '{}\\n' > "$RUNNER_TEMP/osv-results/osv-results.sarif"
  exit "\${FAKE_REPORTER_STATUS:-0}"
fi
exit "\${FAKE_SCANNER_STATUS:-0}"
`,
  );
  chmodSync(fakeDocker, 0o755);

  return { bin, candidateSha, resultDirectory, root, runnerTemp, workspace };
}

function environment(sandbox: Sandbox, overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GITHUB_WORKSPACE: sandbox.workspace,
    OSV_SCANNER_IMAGE: 'example/osv-scanner@sha256:test',
    PATH: `${sandbox.bin}:${process.env.PATH ?? ''}`,
    RUNNER_TEMP: sandbox.runnerTemp,
    TRUSTED_HELPER_SHA: trustedSha,
    ...overrides,
  };
}

function runBlock(step: string, sandbox: Sandbox, overrides: Record<string, string> = {}) {
  return spawnSync('bash', ['-euo', 'pipefail', '-c', extractStepRun(step)], {
    cwd: sandbox.workspace,
    encoding: 'utf8',
    env: environment(sandbox, overrides),
  });
}

function prepareTrustedHelper(sandbox: Sandbox): void {
  if (existsSync(join(sandbox.runnerTemp, 'trusted-helper'))) return;
  const result = runBlock('Materialize immutable OSV helper outside the checkout', sandbox);
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
}

function runScannerStep(
  step: string,
  sandbox: Sandbox,
  source: string | undefined,
  scannerStatus = 0,
): ReturnType<typeof spawnSync> {
  const sourcePath = join(sandbox.root, 'scanner-output.json');
  if (source !== undefined) writeFileSync(sourcePath, source);
  prepareTrustedHelper(sandbox);
  if (step === extractStepRun('Scan dependencies after the PR')) {
    const switched = runBlock('Checkout the PR result', sandbox, { GITHUB_SHA: sandbox.candidateSha });
    expect(switched.status, switched.stderr).toBe(0);
  }
  return spawnSync('bash', ['-euo', 'pipefail', '-c', step], {
    cwd: sandbox.workspace,
    encoding: 'utf8',
    env: environment(sandbox, {
      FAKE_SCANNER_STATUS: String(scannerStatus),
      ...(source === undefined ? {} : { FAKE_SCAN_SOURCE: sourcePath }),
    }),
  });
}

function runReporterStep(
  step: string,
  sandbox: Sandbox,
  reporterStatus = 0,
  newResult = JSON.stringify({ results: [] }),
  validationStatus = 0,
): ReturnType<typeof spawnSync> {
  prepareTrustedHelper(sandbox);
  mkdirSync(sandbox.resultDirectory, { recursive: true });
  writeFileSync(join(sandbox.resultDirectory, 'old-results.json'), JSON.stringify({ results: [] }));
  writeFileSync(join(sandbox.resultDirectory, 'new-results.json'), newResult);
  writeFileSync(join(sandbox.resultDirectory, 'osv-results.json'), newResult);
  return spawnSync('bash', ['-euo', 'pipefail', '-c', step], {
    cwd: sandbox.workspace,
    encoding: 'utf8',
    env: environment(sandbox, {
      FAKE_REPORTER_STATUS: String(reporterStatus),
      FAKE_VALIDATION_STATUS: String(validationStatus),
      FAKE_PARSE_ERROR: newResult.includes('not-an-array') ? '1' : '0',
    }),
  });
}

afterEach(() => {
  for (const sandbox of sandboxes.splice(0)) {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

describe('OSV scanner workflow result boundary', () => {
  const scannerSteps = [
    'Scan dependencies before the PR',
    'Scan dependencies after the PR',
    'Run OSV scan',
  ];

  it.each(scannerSteps)('accepts a valid empty result for %s', (name) => {
    const sandbox = createSandbox();
    const result = runScannerStep(
      extractStepRun(name),
      sandbox,
      JSON.stringify({ results: [] }),
    );

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });

  it.each(scannerSteps)('accepts a valid vulnerability result for %s', (name) => {
    const sandbox = createSandbox();
    const result = runScannerStep(
      extractStepRun(name),
      sandbox,
      JSON.stringify({ results: [{ source: {}, packages: [] }] }),
      1,
    );

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });

  it.each(scannerSteps)('rejects a missing or malformed result for %s', (name) => {
    const sandbox = createSandbox();
    const missing = runScannerStep(extractStepRun(name), sandbox, undefined);
    expect(missing.status).not.toBe(0);

    const malformed = runScannerStep(extractStepRun(name), sandbox, '{');
    expect(malformed.status).not.toBe(0);
  });

  it.each(scannerSteps)('preserves scanner execution failures for %s', (name) => {
    const sandbox = createSandbox();
    const result = runScannerStep(
      extractStepRun(name),
      sandbox,
      JSON.stringify({ results: [] }),
      127,
    );

    expect(result.status).toBe(127);
  });

  it.each(scannerSteps)('fails before parsing a result when the scanner exits 2 for %s', (name) => {
    const sandbox = createSandbox();
    const result = runScannerStep(extractStepRun(name), sandbox, JSON.stringify({ results: [] }), 2);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('OSV scanner failed before producing a result');
  });

  it('keeps the immutable helper unchanged when the PR head collides with its filename', () => {
    const sandbox = createSandbox();
    const result = runScannerStep(
      extractStepRun('Scan dependencies after the PR'), sandbox, JSON.stringify({ results: [] }),
    );
    expect(result.status, String(result.stderr)).toBe(0);
    expect(readFileSync(join(sandbox.workspace, 'scripts/security/osv-workflow.ts'), 'utf8'))
      .toContain('PR candidate helper ran');
    const privateHelper = join(sandbox.runnerTemp, 'trusted-helper/scripts/security/osv-workflow.ts');
    const reviewed = execFileSync('git', [
      '-C', sandbox.workspace, 'show', `${trustedSha}:scripts/security/osv-workflow.ts`,
    ]);
    expect(readFileSync(privateHelper)).toEqual(reviewed);
    expect(statSync(join(sandbox.runnerTemp, 'trusted-helper')).mode & 0o777).toBe(0o700);
  });

  it('does not fall back to the candidate when the reviewed helper commit is unavailable', () => {
    const sandbox = createSandbox();
    const result = runBlock('Materialize immutable OSV helper outside the checkout', sandbox, {
      TRUSTED_HELPER_SHA: 'f'.repeat(40),
    });
    expect(result.status).not.toBe(0);
    expect(existsSync(join(sandbox.runnerTemp, 'trusted-helper/scripts/security/osv-workflow.ts')))
      .toBe(false);
  });
});

describe('OSV reporter input boundary', () => {
  const reporterSteps = [
    'Report newly introduced vulnerabilities',
    'Convert OSV results to SARIF and enforce the vulnerability gate',
  ];

  it.each(reporterSteps)('accepts valid reporter input for %s', (name) => {
    const sandbox = createSandbox();
    const result = runReporterStep(extractStepRun(name), sandbox);

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });

  it.each(reporterSteps)('rejects malformed nested input even when the reporter exits successfully for %s', (name) => {
    const sandbox = createSandbox();
    const result = runReporterStep(
      extractStepRun(name),
      sandbox,
      0,
      JSON.stringify({ results: [{ packages: 'not-an-array' }] }),
    );

    expect(result.status, `${result.stdout}\n${result.stderr}`).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain('OSV reporter did not parse its result');
  });

  it.each(reporterSteps)('preserves reporter execution failures for %s', (name) => {
    const sandbox = createSandbox();
    const result = runReporterStep(extractStepRun(name), sandbox, 127);

    expect(result.status).toBe(127);
  });

  it.each(reporterSteps)('preserves reporter preflight exit 7 for %s', (name) => {
    const sandbox = createSandbox();
    const result = runReporterStep(extractStepRun(name), sandbox, 0, JSON.stringify({ results: [] }), 7);
    expect(result.status).toBe(7);
    expect(result.stderr).toContain('OSV reporter failed to validate its result');
    expect(existsSync(join(sandbox.resultDirectory, 'osv-results.sarif'))).toBe(false);
  });
});

describe('security summary workflow boundary', () => {
  const goodResults = {
    OSV_PR_RESULT: 'success', OSV_FULL_RESULT: 'success',
    CODEQL_RESULT: 'success', SEMGREP_RESULT: 'success',
  };

  it.each(['pull_request', 'push', 'schedule', 'workflow_dispatch'])(
    'accepts all event-specific successful jobs for %s', (eventName) => {
      const sandbox = createSandbox();
      prepareTrustedHelper(sandbox);
      const summary = join(sandbox.root, 'summary.md');
      const result = runBlock('Summarize and validate event-specific scans', sandbox, {
        ...goodResults, EVENT_NAME: eventName, GITHUB_STEP_SUMMARY: summary,
      });
      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(summary, 'utf8')).toContain('| CodeQL | success |');
    },
  );

  it.each([
    ['pull_request', 'OSV_PR_RESULT'],
    ['push', 'OSV_FULL_RESULT'],
    ['schedule', 'OSV_FULL_RESULT'],
    ['workflow_dispatch', 'OSV_FULL_RESULT'],
    ['pull_request', 'CODEQL_RESULT'],
    ['push', 'SEMGREP_RESULT'],
  ])('fails %s when %s is unsuccessful', (eventName, failingJob) => {
    const sandbox = createSandbox();
    prepareTrustedHelper(sandbox);
    const summary = join(sandbox.root, 'summary.md');
    const result = runBlock('Summarize and validate event-specific scans', sandbox, {
      ...goodResults, [failingJob]: 'failure', EVENT_NAME: eventName,
      GITHUB_STEP_SUMMARY: summary,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Expected');
    expect(readFileSync(summary, 'utf8')).toContain('| CodeQL |');
  });

  it('fails closed for an unsupported event after writing the summary table', () => {
    const sandbox = createSandbox();
    prepareTrustedHelper(sandbox);
    const summary = join(sandbox.root, 'summary.md');
    const result = runBlock('Summarize and validate event-specific scans', sandbox, {
      ...goodResults, EVENT_NAME: 'merge_group', GITHUB_STEP_SUMMARY: summary,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unsupported security workflow event');
    expect(readFileSync(summary, 'utf8')).toContain('## Security scan results');
  });
});
