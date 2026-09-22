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
