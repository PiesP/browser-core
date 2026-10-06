import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const entry = resolve(import.meta.dirname, '../../scripts/security/osv-workflow.ts');
const fixtures: string[] = [];

interface Fixture {
  root: string;
  bin: string;
  calls: string;
  results: string;
  summary: string;
}

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'core security workflow '));
  fixtures.push(root);
  const bin = join(root, 'fake-bin');
  const results = join(root, 'osv-results');
  const calls = join(root, 'docker-calls.jsonl');
  const summary = join(root, 'step-summary.md');
  mkdirSync(bin);
  const fakeDocker = join(bin, 'docker');
  writeFileSync(fakeDocker, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.DOCKER_CALLS, JSON.stringify(args) + '\\n');
const reporter = args.includes('--entrypoint');
if (!reporter) {
  const output = args.find((arg) => arg.startsWith('--output-file=/results/'));
  if (output && process.env.FAKE_SCAN_SOURCE) {
    fs.copyFileSync(process.env.FAKE_SCAN_SOURCE, path.join(process.env.RUNNER_TEMP, 'osv-results', path.basename(output)));
  }
  process.exit(Number(process.env.FAKE_SCANNER_STATUS || '0'));
}
const preflight = args.includes('--fail-on-vuln=false');
if (preflight) {
  process.stderr.write(process.env.FAKE_VALIDATION_LOG || '');
  process.exit(Number(process.env.FAKE_VALIDATION_STATUS || '0'));
}
fs.writeFileSync(path.join(process.env.RUNNER_TEMP, 'osv-results', 'osv-results.sarif'), '{}\\n');
process.exit(Number(process.env.FAKE_REPORTER_STATUS || '0'));
`, { mode: 0o755 });
  chmodSync(fakeDocker, 0o755);
  return { root, bin, calls, results, summary };
}

function run(f: Fixture, mode: string, overrides: Record<string, string> = {}, node = process.execPath) {
  return spawnSync(node, [entry, mode], {
    cwd: f.root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${f.bin}${delimiter}${process.env.PATH ?? ''}`,
      RUNNER_TEMP: f.root,
      GITHUB_WORKSPACE: f.root,
      GITHUB_STEP_SUMMARY: f.summary,
      OSV_SCANNER_IMAGE: 'example/osv-scanner@sha256:fixture',
      DOCKER_CALLS: f.calls,
      EVENT_NAME: 'pull_request',
      OSV_PR_RESULT: 'success',
      OSV_FULL_RESULT: 'skipped',
      CODEQL_RESULT: 'success',
      SEMGREP_RESULT: 'success',
      ...overrides,
    },
  });
}

function callArguments(f: Fixture): string[][] {
  if (!existsSync(f.calls)) return [];
  return readFileSync(f.calls, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as string[]);
}

function scanArgs(f: Fixture, name: string): string[] {
  return [
    'run', '--rm', '--env', 'GOTOOLCHAIN=auto',
    '--volume', `${f.root}:/src`, '--volume', `${f.results}:/results`,
    '--workdir', '/src', 'example/osv-scanner@sha256:fixture',
    '--format=json', `--output-file=/results/${name}`,
    '-r', '--lockfile=pnpm-lock.yaml', '.',
  ];
}

function source(f: Fixture, contents: string | Uint8Array): string {
  const path = join(f.root, 'source.json');
  writeFileSync(path, contents);
  return path;
}

function reporterArgs(f: Fixture, mode: 'pr' | 'full', preflight: boolean): string[] {
  const common = [
    'run', '--rm', '--entrypoint', '/root/osv-reporter',
    '--volume', `${f.results}:/results`, '--workdir', '/results',
    'example/osv-scanner@sha256:fixture',
  ];
  if (mode === 'pr') {
    return [
      ...common, '--old=old-results.json', '--new=new-results.json',
      ...(preflight
        ? ['--output-files=sarif:/dev/null', '--fail-on-vuln=false']
        : ['--output-files=sarif:osv-results.sarif', '--output-files=gh-annotations:#stderr', '--fail-on-vuln=true']),
    ];
  }
  return preflight
    ? [...common, '--new=osv-results.json', '--output-files=sarif:/dev/null', '--fail-on-vuln=false']
    : [...common, '--output-files=sarif:osv-results.sarif', '--new=osv-results.json', '--fail-on-vuln=true'];
}

afterEach(() => {
  for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('repository-local OSV workflow CLI', () => {
  it.each([['scan-old', 'old-results.json'], ['scan-new', 'new-results.json'], ['scan-full', 'osv-results.json']])(
    '%s preserves Docker scan argv, private result root, and exit 0 or 1 reports', (mode, name) => {
      for (const status of [0, 1]) {
        const f = fixture();
        const result = run(f, mode, {
          FAKE_SCAN_SOURCE: source(f, '{"results":[{}]}'),
          FAKE_SCANNER_STATUS: String(status),
        });
        expect(result.status, result.stderr).toBe(0);
        expect(callArguments(f)).toEqual([scanArgs(f, name)]);
        expect(readFileSync(join(f.results, name), 'utf8')).toBe('{"results":[{}]}');
        if (process.platform !== 'win32') expect(statSync(f.results).mode & 0o777).toBe(0o700);
      }
    },
  );

  it.each(['scan-old', 'scan-new', 'scan-full'])('%s removes a stale result before Docker', (mode) => {
    const f = fixture();
    mkdirSync(f.results);
    const name = mode === 'scan-full' ? 'osv-results.json' : `${mode.slice(5)}-results.json`;
    writeFileSync(join(f.results, name), '{"results":[]}');
    const result = run(f, mode);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('did not create a non-empty result');
    expect(existsSync(join(f.results, name))).toBe(false);
  });

  it.each(['', '{', '[]', '{}', '{"results":null}', '{"results":[null]}',
    '{"results":[],"results":[]}', '{"results":[],"future":NaN}',
    '{"results":[],"future":1e400}'])(
    'rejects malformed, duplicate, nonfinite or wrong-shape scanner output %j', (content) => {
      const f = fixture();
      const result = run(f, 'scan-full', { FAKE_SCAN_SOURCE: source(f, content) });
      expect(result.status).toBe(1);
      expect(callArguments(f)).toHaveLength(1);
    },
  );

  it('rejects invalid UTF-8 and a scanner failure even if it writes a valid result', () => {
    const invalid = fixture();
    expect(run(invalid, 'scan-full', { FAKE_SCAN_SOURCE: source(invalid, new Uint8Array([0xff])) }).status).toBe(1);
    const failure = fixture();
    const result = run(failure, 'scan-full', {
      FAKE_SCAN_SOURCE: source(failure, '{"results":[]}'), FAKE_SCANNER_STATUS: '2',
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('OSV scanner failed before producing a result (exit 2).');
  });

  it.each(['pr', 'full'] as const)('report-%s runs exactly one parse preflight and one final reporter', (mode) => {
    const f = fixture();
    mkdirSync(f.results);
    writeFileSync(join(f.results, 'reporter-validation.log'), 'stale parse failure');
    const result = run(f, `report-${mode}`);
    expect(result.status, result.stderr).toBe(0);
    expect(callArguments(f)).toEqual([
      reporterArgs(f, mode, true), reporterArgs(f, mode, false),
    ]);
    expect(readFileSync(join(f.results, 'reporter-validation.log'), 'utf8')).toBe('');
    expect(existsSync(join(f.results, 'osv-results.sarif'))).toBe(true);
  });

  it.each(['pr', 'full'] as const)('report-%s rejects parse diagnostics even on reporter exit 0', (mode) => {
    for (const diagnostic of ['failed to open old results at /results/x', 'failed to parse new results at /results/x']) {
      const f = fixture();
      mkdirSync(f.results);
      const result = run(f, `report-${mode}`, { FAKE_VALIDATION_LOG: diagnostic });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`OSV reporter did not parse its result ${mode === 'pr' ? 'inputs' : 'input'}.`);
      expect(callArguments(f)).toEqual([reporterArgs(f, mode, true)]);
    }
  });

  it.each(['pr', 'full'] as const)('report-%s preserves preflight and final reporter failures', (mode) => {
    const validation = fixture();
    mkdirSync(validation.results);
    const preflight = run(validation, `report-${mode}`, {
      FAKE_VALIDATION_LOG: 'cannot read fixture', FAKE_VALIDATION_STATUS: '7',
    });
    expect(preflight.status).toBe(7);
    expect(preflight.stderr).toContain('cannot read fixture');
    expect(callArguments(validation)).toEqual([reporterArgs(validation, mode, true)]);

    const final = fixture();
    mkdirSync(final.results);
    expect(run(final, `report-${mode}`, { FAKE_REPORTER_STATUS: '1' }).status).toBe(1);
    expect(callArguments(final)).toEqual([
      reporterArgs(final, mode, true), reporterArgs(final, mode, false),
    ]);
    const toolFailure = fixture();
    mkdirSync(toolFailure.results);
    expect(run(toolFailure, `report-${mode}`, { FAKE_REPORTER_STATUS: '7' }).status).toBe(7);
  });

  it.each(['pull_request', 'push', 'schedule', 'workflow_dispatch'])(
    'summary writes the table before accepting the selected scans for %s', (event) => {
      const f = fixture();
      writeFileSync(f.summary, 'prior\n');
      const result = run(f, 'summary', {
        EVENT_NAME: event,
        OSV_PR_RESULT: event === 'pull_request' ? 'success' : 'skipped',
        OSV_FULL_RESULT: event === 'pull_request' ? 'skipped' : 'success',
      });
      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(f.summary, 'utf8')).toBe([
        'prior', '## Security scan results', '', '| Check | Result |', '| --- | --- |',
        `| OSV PR diff | ${event === 'pull_request' ? 'success' : 'skipped'} |`,
        `| OSV full | ${event === 'pull_request' ? 'skipped' : 'success'} |`,
        '| CodeQL | success |', '| Semgrep | success |', '',
      ].join('\n'));
      expect(callArguments(f)).toEqual([]);
    },
  );

  it.each(['pending', 'skipped', 'failure', 'cancelled', ''])(
    'summary rejects an incomplete required scan state %j after writing a table', (state) => {
      const f = fixture();
      const result = run(f, 'summary', { OSV_PR_RESULT: state, CODEQL_RESULT: state, SEMGREP_RESULT: state });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`Expected CodeQL to succeed for pull_request, got: ${state}`);
      expect(result.stderr).toContain(`Expected Semgrep to succeed for pull_request, got: ${state}`);
      expect(result.stderr).toContain(`Expected OSV PR diff to succeed for pull_request, got: ${state}`);
      expect(readFileSync(f.summary, 'utf8')).toContain(`| OSV PR diff | ${state} |`);
    },
  );

  it.each(['push', 'schedule', 'workflow_dispatch'])(
    'summary rejects a missing full scan for %s after writing the table', (event) => {
      const f = fixture();
      const result = run(f, 'summary', { EVENT_NAME: event, OSV_PR_RESULT: 'skipped', OSV_FULL_RESULT: 'skipped' });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(`Expected OSV full to succeed for ${event}, got: skipped`);
      expect(readFileSync(f.summary, 'utf8')).toContain('| OSV full | skipped |');
    },
  );

  it('summary fails closed for unsupported events after writing its table', () => {
    const f = fixture();
    const result = run(f, 'summary', { EVENT_NAME: 'merge_group' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Unsupported security workflow event: merge_group');
    expect(readFileSync(f.summary, 'utf8')).toContain('## Security scan results');
  });

  it('rejects unsupported CLI modes and has no import side effects', () => {
    const f = fixture();
    expect(run(f, 'docker run --rm').status).toBe(1);
    const imported = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import ${JSON.stringify(pathToFileURL(entry).href)};`], {
      cwd: f.root,
      encoding: 'utf8',
      env: { ...process.env, DOCKER_CALLS: f.calls, GITHUB_STEP_SUMMARY: f.summary },
    });
    expect(imported.status, imported.stderr).toBe(0);
    expect(imported.stdout).toBe('');
    expect(callArguments(f)).toEqual([]);
    expect(existsSync(f.summary)).toBe(false);
  });
});
