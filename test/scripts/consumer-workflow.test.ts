import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const entry = resolve(import.meta.dirname, '../../automation/security/consumer-workflow.ts');
const fixtures: string[] = [];
const consumer = '{"results":[{"source":{"type":"lockfile","path":"pnpm-lock.yaml"},"packages":[]}]}';
const overlay = '{"results":[{"source":{"type":"lockfile","path":"pnpm-lock.yaml"},"packages":[{"package":{},"vulnerabilities":[{"id":"OSV-1","severity":[]}],"groups":[]}]}]}';
const sarif = '{"version":"2.1.0","runs":[{"tool":{"driver":{"name":"osv-scanner"}},"results":[]}]}';
const findingSarif = '{"version":"2.1.0","runs":[{"tool":{"driver":{"name":"osv-scanner"}},"results":[{}]}]}';

interface Fixture { root: string; results: string; bin: string; calls: string; output: string }

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'consumer osv '));
  fixtures.push(root);
  const bin = join(root, 'bin');
  const results = join(root, 'osv-results');
  const calls = join(root, 'calls.jsonl');
  const output = join(root, 'github-output.txt');
  mkdirSync(bin);
  const script = join(bin, 'docker');
  writeFileSync(script, `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.DOCKER_CALLS, JSON.stringify(args) + '\\n');
const results = path.join(process.env.RUNNER_TEMP, 'osv-results');
if (!args.includes('--entrypoint')) {
  const target = args.find(x => x.startsWith('--output-file=/results/'));
  if (target && process.env.FAKE_SCAN_DOCUMENT !== undefined) {
    fs.writeFileSync(path.join(results, path.basename(target)), process.env.FAKE_SCAN_DOCUMENT);
  }
  if (process.env.FAKE_SCAN_SIGNAL) process.kill(process.pid, process.env.FAKE_SCAN_SIGNAL);
  process.exit(Number(process.env.FAKE_SCAN_STATUS || 0));
}
const raw = args.includes('--fail-on-vuln=false');
const log = raw ? args.find(x => x.startsWith('--new=')).slice(6).replace('.raw.json', '.raw.reporter.log') : 'osv-reporter.log';
if (process.env.FAKE_REPLACE_LOG) {
  fs.unlinkSync(path.join(results, log));
  fs.symlinkSync(process.env.FAKE_REPLACE_LOG, path.join(results, log));
}
if (raw) {
  process.stderr.write(process.env.FAKE_RAW_LOG || '');
  if (process.env.FAKE_RAW_SIGNAL) process.kill(process.pid, process.env.FAKE_RAW_SIGNAL);
  process.exit(Number(process.env.FAKE_RAW_STATUS || 0));
}
if (process.env.FAKE_SARIF !== undefined) fs.writeFileSync(path.join(results, 'osv-results.sarif'), process.env.FAKE_SARIF);
process.stderr.write(process.env.FAKE_REPORT_LOG || '');
if (process.env.FAKE_REPORT_SIGNAL) process.kill(process.pid, process.env.FAKE_REPORT_SIGNAL);
process.exit(Number(process.env.FAKE_REPORT_STATUS || 0));
`, { mode: 0o755 });
  chmodSync(script, 0o755);
  return { root, results, bin, calls, output };
}

function run(f: Fixture, mode: string, profile = 'consumer', overrides: Record<string, string> = {}) {
  return spawnSync(process.execPath, ['--experimental-strip-types', entry, mode, profile], {
    cwd: f.root, encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${f.bin}${delimiter}${process.env.PATH ?? ''}`,
      RUNNER_TEMP: f.root, GITHUB_WORKSPACE: f.root,
      GITHUB_OUTPUT: f.output, OSV_SCANNER_IMAGE: 'osv@sha256:fixture',
      DOCKER_CALLS: f.calls, ...overrides,
    },
  });
}

function calls(f: Fixture): string[][] {
  return existsSync(f.calls) ? readFileSync(f.calls, 'utf8').trim().split('\n').map(x => JSON.parse(x) as string[]) : [];
}

function save(f: Fixture, name: string, contents: string): void {
  mkdirSync(f.results, { recursive: true });
  writeFileSync(join(f.results, name), contents);
}

afterEach(() => { for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe('shared consumer OSV workflow CLI', () => {
  it.each([['scan-old', 'old-results'], ['scan-new', 'new-results'], ['scan-full', 'osv-results']] as const)(
    '%s preserves pinned Docker scan and raw preflight argv and normalizes exit 0 or 1', (mode, name) => {
      for (const status of [0, 1]) {
        const f = fixture();
        const result = run(f, mode, 'consumer', { FAKE_SCAN_DOCUMENT: consumer, FAKE_SCAN_STATUS: String(status) });
        expect(result.status, result.stderr).toBe(0);
        expect(calls(f)).toEqual([
          ['run', '--rm', '--env', 'GOTOOLCHAIN=auto', '--volume', `${f.root}:/src`,
            '--volume', `${f.results}:/results`, '--workdir', '/src', 'osv@sha256:fixture',
            '--config=/results/osv-empty.toml', '--format=json', `--output-file=/results/${name}.raw.json`,
            '-r', '--lockfile=pnpm-lock.yaml', '.'],
          ['run', '--rm', '--entrypoint', '/root/osv-reporter', '--volume', `${f.results}:/results`,
            '--workdir', '/results', 'osv@sha256:fixture', `--new=${name}.raw.json`,
            '--output-files=json:/dev/null', '--fail-on-vuln=false'],
        ]);
        expect(readFileSync(join(f.results, `${name}.json`), 'utf8')).toBe(`${consumer}\n`);
        expect(readFileSync(join(f.results, 'osv-empty.toml'), 'utf8')).toBe('');
        if (process.platform !== 'win32') {
          expect(statSync(f.results).mode & 0o777).toBe(0o700);
          expect(statSync(join(f.results, 'osv-empty.toml')).mode & 0o777).toBe(0o600);
        }
      }
    },
  );

  it('uses the overlay schema and removes stale normalized results before scanning', () => {
    const f = fixture();
    save(f, 'new-results.json', 'stale');
    const good = run(f, 'scan-new', 'overlay', { FAKE_SCAN_DOCUMENT: overlay });
    expect(good.status, good.stderr).toBe(0);
    expect(readFileSync(join(f.results, 'new-results.json'), 'utf8')).toBe(`${overlay}\n`);
    const bad = run(f, 'scan-new', 'overlay', { FAKE_SCAN_DOCUMENT: '{' });
    expect(bad.status).toBe(2);
    expect(existsSync(join(f.results, 'new-results.json'))).toBe(false);
  });

  it('keeps the consumer and overlay profile distinction', () => {
    const f = fixture();
    const invalidOverlay = overlay.replace('"severity":[]', '"severity":{}');
    expect(run(f, 'scan-full', 'consumer', { FAKE_SCAN_DOCUMENT: invalidOverlay }).status).toBe(0);
    expect(run(f, 'scan-full', 'overlay', { FAKE_SCAN_DOCUMENT: invalidOverlay }).status).toBe(2);
    expect(existsSync(join(f.results, 'osv-results.json'))).toBe(false);
  });

  it('propagates scanner and raw reporter failures, detects parse log on exit zero, and rejects missing output', () => {
    const failed = fixture();
    expect(run(failed, 'scan-full', 'consumer', { FAKE_SCAN_STATUS: '2' }).status).toBe(2);
    expect(calls(failed)).toHaveLength(1);
    const raw = fixture();
    expect(run(raw, 'scan-full', 'consumer', { FAKE_SCAN_DOCUMENT: consumer, FAKE_RAW_STATUS: '7' }).status).toBe(7);
    for (const verb of ['open', 'parse']) {
      const parse = fixture();
      const parseResult = run(parse, 'scan-full', 'consumer', { FAKE_SCAN_DOCUMENT: consumer, FAKE_RAW_LOG: `failed to ${verb} new results at /results/x\n` });
      expect(parseResult.status).toBe(2);
      expect(parseResult.stdout).toContain(`failed to ${verb} new results`);
    }
    const missing = fixture();
    expect(run(missing, 'scan-full').status).toBe(2);
    for (const document of ['', '{', '{"results":[],"results":[]}']) {
      const malformed = fixture();
      const result = run(malformed, 'scan-full', 'consumer', { FAKE_SCAN_DOCUMENT: document });
      expect(result.status).toBe(2);
      expect(existsSync(join(malformed.results, 'osv-results.json'))).toBe(false);
      expect(existsSync(malformed.output)).toBe(false);
    }
  });

  it('propagates a child signal and keeps the raw log available', () => {
    const scan = fixture();
    expect(run(scan, 'scan-full', 'consumer', { FAKE_SCAN_SIGNAL: 'SIGTERM' }).status).toBe(143);
    const raw = fixture();
    const result = run(raw, 'scan-full', 'consumer', {
      FAKE_SCAN_DOCUMENT: consumer, FAKE_RAW_SIGNAL: 'SIGTERM', FAKE_RAW_LOG: 'raw reporter warning\n',
    });
    expect(result.status).toBe(143);
    expect(result.stdout).toContain('raw reporter warning');
    expect(readFileSync(join(raw.results, 'osv-results.raw.reporter.log'), 'utf8')).toBe('raw reporter warning\n');
  });

  it('reads the originally opened raw log if Docker replaces its pathname', () => {
    const f = fixture();
    const replacement = join(f.root, 'replacement');
    writeFileSync(replacement, 'benign');
    const result = run(f, 'scan-full', 'consumer', {
      FAKE_SCAN_DOCUMENT: consumer, FAKE_REPLACE_LOG: replacement,
      FAKE_RAW_LOG: 'failed to open new results at /results/x\n',
    });
    expect(result.status).toBe(2);
    expect(readFileSync(replacement, 'utf8')).toBe('benign');
  });

  it.each(['pr', 'full'] as const)('report-%s validates inputs, preserves reporter argv, and authorizes valid SARIF', mode => {
    const f = fixture();
    save(f, 'osv-results.json', consumer);
    save(f, 'old-results.json', consumer);
    save(f, 'new-results.json', consumer);
    const result = run(f, `report-${mode}`, 'consumer', { FAKE_SARIF: sarif });
    expect(result.status, result.stderr).toBe(0);
    expect(calls(f)).toEqual([[
      'run', '--rm', '--entrypoint', '/root/osv-reporter', '--volume', `${f.results}:/results`,
      '--workdir', '/results', 'osv@sha256:fixture',
      ...(mode === 'pr'
        ? ['--old=old-results.json', '--new=new-results.json', '--output-files=sarif:osv-results.sarif']
        : ['--output-files=sarif:osv-results.sarif', '--new=osv-results.json']),
      ...(mode === 'pr' ? ['--output-files=gh-annotations:#stderr'] : []), '--fail-on-vuln=true',
    ]]);
    expect(readFileSync(f.output, 'utf8')).toBe('sarif-upload=true\n');
  });

  it('accepts status 1 with SARIF findings and rejects empty or malformed SARIF without upload authorization', () => {
    const good = fixture();
    save(good, 'osv-results.json', consumer);
    expect(run(good, 'report-full', 'consumer', { FAKE_SARIF: findingSarif, FAKE_REPORT_STATUS: '1' }).status).toBe(1);
    expect(readFileSync(good.output, 'utf8')).toBe('sarif-upload=true\n');
    for (const document of [sarif, '{', '{"version":"2.1.0","version":"2.1.0"}',
      '{"version":"2.1.0","runs":[]}', '{"version":"2.1.0","runs":[{"tool":{"driver":{"name":"other"}},"results":[]}]}']) {
      const f = fixture();
      save(f, 'osv-results.json', consumer);
      expect(run(f, 'report-full', 'consumer', { FAKE_SARIF: document, FAKE_REPORT_STATUS: '1' }).status).toBe(1);
      expect(existsSync(f.output)).toBe(false);
    }
  });

  it('does not invoke reporter for invalid normalized input and propagates reporter failures', () => {
    const invalid = fixture();
    save(invalid, 'osv-results.json', '{');
    expect(run(invalid, 'report-full').status).toBe(1);
    expect(calls(invalid)).toEqual([]);
    const failure = fixture();
    save(failure, 'osv-results.json', consumer);
    expect(run(failure, 'report-full', 'consumer', { FAKE_REPORT_STATUS: '7', FAKE_SARIF: sarif }).status).toBe(7);
    expect(existsSync(failure.output)).toBe(false);
    for (const verb of ['open', 'parse']) {
      const rejected = fixture();
      save(rejected, 'osv-results.json', consumer);
      expect(run(rejected, 'report-full', 'consumer', { FAKE_REPORT_LOG: `failed to ${verb} new results at /results/x\n`, FAKE_SARIF: sarif }).status).toBe(2);
      expect(existsSync(rejected.output)).toBe(false);
    }
  });

  it('does not authorize a failed output write or trust a replaced final log pathname', () => {
    const outputFailure = fixture();
    save(outputFailure, 'osv-results.json', consumer);
    mkdirSync(outputFailure.output);
    expect(run(outputFailure, 'report-full', 'consumer', { FAKE_SARIF: sarif }).status).toBe(1);
    const replaced = fixture();
    save(replaced, 'osv-results.json', consumer);
    const replacement = join(replaced.root, 'replacement');
    writeFileSync(replacement, 'benign');
    const result = run(replaced, 'report-full', 'consumer', {
      FAKE_REPLACE_LOG: replacement, FAKE_SARIF: sarif,
      FAKE_REPORT_LOG: 'failed to open new results at /results/x\n',
    });
    expect(result.status).toBe(2);
    expect(existsSync(replaced.output)).toBe(false);
    expect(readFileSync(replacement, 'utf8')).toBe('benign');
  });

  it('rejects stale SARIF, unsupported modes, and a missing Docker executable', () => {
    const stale = fixture();
    save(stale, 'osv-results.json', consumer);
    save(stale, 'osv-results.sarif', sarif);
    expect(run(stale, 'report-full').status).toBe(1);
    expect(existsSync(stale.output)).toBe(false);
    const mode = fixture();
    expect(run(mode, 'summary').status).toBe(1);
    expect(calls(mode)).toEqual([]);
    const missing = fixture();
    save(missing, 'osv-results.json', consumer);
    expect(run(missing, 'report-full', 'consumer', { PATH: '' }).status).toBe(127);
  });

  it('is import-inert and works through a symlink entrypoint', () => {
    const f = fixture();
    const imported = spawnSync(process.execPath, ['--input-type=module', '-e',
      `await import(${JSON.stringify(pathToFileURL(entry).href)})`], { cwd: f.root, encoding: 'utf8' });
    expect(imported.status, imported.stderr).toBe(0);
    expect(calls(f)).toEqual([]);
    const link = join(f.root, 'workflow.ts');
    symlinkSync(entry, link);
    const result = spawnSync(process.execPath, [link, 'scan-full', 'consumer'], {
      cwd: f.root, encoding: 'utf8',
      env: { ...process.env, PATH: `${f.bin}${delimiter}${process.env.PATH ?? ''}`, RUNNER_TEMP: f.root,
        GITHUB_WORKSPACE: f.root, GITHUB_OUTPUT: f.output, OSV_SCANNER_IMAGE: 'osv@sha256:fixture',
        DOCKER_CALLS: f.calls, FAKE_SCAN_DOCUMENT: consumer },
    });
    expect(result.status, result.stderr).toBe(0);
  });
});
