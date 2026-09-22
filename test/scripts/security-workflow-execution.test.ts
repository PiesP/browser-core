/// <reference types="node" />

import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import workflow from '../../.github/workflows/security.yaml?raw';

type Sandbox = {
  bin: string;
  resultDirectory: string;
  runnerTemp: string;
  root: string;
};

const sandboxes: string[] = [];

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
  const runIndex = block.findIndex((line) => line.trim() === 'run: |');
  if (runIndex < 0) throw new Error(`Workflow step has no multiline run body: ${name}`);
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
  mkdirSync(bin);
  mkdirSync(resultDirectory, { recursive: true });

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
  if grep -q '"packages":"not-an-array"' "$RUNNER_TEMP/osv-results/new-results.json" \
    || grep -q '"packages":"not-an-array"' "$RUNNER_TEMP/osv-results/osv-results.json"; then
    echo 'failed to open new results at /results/new-results.json: failed to parse' >&2
  fi
  exit "\${FAKE_REPORTER_STATUS:-0}"
fi
exit "\${FAKE_SCANNER_STATUS:-0}"
`,
  );
  chmodSync(fakeDocker, 0o755);

  return { bin, resultDirectory, root, runnerTemp };
}

function runScannerStep(
  step: string,
  sandbox: Sandbox,
  source: string | undefined,
  scannerStatus = 0,
): ReturnType<typeof spawnSync> {
  const sourcePath = join(sandbox.root, 'scanner-output.json');
  if (source !== undefined) writeFileSync(sourcePath, source);
  const path = `${sandbox.bin}:${process.env.PATH ?? ''}`;
  return spawnSync('bash', ['-euo', 'pipefail', '-c', step], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FAKE_SCANNER_STATUS: String(scannerStatus),
      ...(source === undefined ? {} : { FAKE_SCAN_SOURCE: sourcePath }),
      GITHUB_WORKSPACE: sandbox.root,
      OSV_SCANNER_IMAGE: 'example/osv-scanner@sha256:test',
      PATH: path,
      RUNNER_TEMP: sandbox.runnerTemp,
    },
  });
}

function runReporterStep(
  step: string,
  sandbox: Sandbox,
  reporterStatus = 0,
  newResult = JSON.stringify({ results: [] }),
): ReturnType<typeof spawnSync> {
  writeFileSync(join(sandbox.resultDirectory, 'old-results.json'), JSON.stringify({ results: [] }));
  writeFileSync(join(sandbox.resultDirectory, 'new-results.json'), newResult);
  writeFileSync(join(sandbox.resultDirectory, 'osv-results.json'), newResult);
  const path = `${sandbox.bin}:${process.env.PATH ?? ''}`;
  return spawnSync('bash', ['-euo', 'pipefail', '-c', step], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FAKE_REPORTER_STATUS: String(reporterStatus),
      GITHUB_WORKSPACE: sandbox.root,
      OSV_SCANNER_IMAGE: 'example/osv-scanner@sha256:test',
      PATH: path,
      RUNNER_TEMP: sandbox.runnerTemp,
    },
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
});
