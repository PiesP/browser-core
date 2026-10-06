import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const entry = resolve(import.meta.dirname, '../../scripts/notify-consumers.ts');
const sha = 'a'.repeat(40);
const fixtures: string[] = [];

interface GhCall {
  args: string[];
  stdin: string;
  token: string;
}

function fixture(): { root: string; bin: string; log: string; output: string } {
  const root = mkdtempSync(join(tmpdir(), 'core notification cli '));
  fixtures.push(root);
  const bin = join(root, 'fixture-bin');
  const log = join(root, 'gh-calls.jsonl');
  const output = join(root, 'github-output');
  mkdirSync(bin);
  const gh = join(bin, 'gh');
  writeFileSync(gh, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const stdin = fs.readFileSync(0, 'utf8');
fs.appendFileSync(process.env.GH_LOG, JSON.stringify({ args, stdin, token: process.env.GH_TOKEN }) + '\\n');
const kind = args[1] === '--method' ? 'dispatch' : args[1]?.includes('/commits/') ? 'commit' : 'compare';
if (process.env.GH_FAIL_AT === kind) {
  process.stderr.write('fixture gh API error\\n');
  process.exit(23);
}
if (kind === 'commit') process.stdout.write(process.env.GH_COMMIT_SHA + '\\n');
if (kind === 'compare') process.stdout.write(process.env.GH_COMPARE_STATUS + '\\n');
`, { mode: 0o755 });
  chmodSync(gh, 0o755);
  return { root, bin, log, output };
}

function run(
  paths: ReturnType<typeof fixture>,
  command: string,
  overrides: Record<string, string> = {},
  script = entry,
) {
  return spawnSync(process.execPath, [script, command], {
    cwd: paths.root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${paths.bin}${delimiter}${process.env.PATH ?? ''}`,
      GH_LOG: paths.log,
      GH_TOKEN: 'fixture-token',
      GH_COMMIT_SHA: sha,
      GH_COMPARE_STATUS: 'ahead',
      CORE_REPOSITORY: 'PiesP/browser-core',
      CORE_SHA: sha,
      CONSUMER_REPOSITORY: 'PiesP/yt-live-chat-overlay',
      GITHUB_OUTPUT: paths.output,
      ...overrides,
    },
  });
}

function calls(log: string): GhCall[] {
  if (!existsSync(log)) return [];
  return readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as GhCall);
}

afterEach(() => {
  for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('notification CLI', () => {
  it.each(['', 'HEAD', 'A'.repeat(40), 'a'.repeat(39), 'g'.repeat(40)])(
    'rejects malformed source SHA %j before calling gh', (candidate) => {
      const paths = fixture();
      const result = run(paths, 'validate', { CORE_SHA: candidate });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('core_sha must be a 40-character lowercase commit SHA');
      expect(calls(paths.log)).toEqual([]);
      expect(existsSync(paths.output)).toBe(false);
    },
  );

  it.each(['ahead', 'identical'])('accepts %s with exact API arguments and one output', (status) => {
    const paths = fixture();
    writeFileSync(paths.output, 'existing=1\n');
    const result = run(paths, 'validate', { GH_COMPARE_STATUS: status });
    expect(result.status).toBe(0);
    expect(readFileSync(paths.output, 'utf8')).toBe(`existing=1\ncore_sha=${sha}\n`);
    expect(calls(paths.log)).toEqual([
      { args: ['api', `/repos/PiesP/browser-core/commits/${sha}`, '--jq', '.sha'], stdin: '', token: 'fixture-token' },
      { args: ['api', `/repos/PiesP/browser-core/compare/${sha}...master`, '--jq', '.status'], stdin: '', token: 'fixture-token' },
    ]);
  });

  it.each(['b'.repeat(40), ` ${sha}`, `${sha} `])(
    'rejects a non-identical resolved SHA %j before comparing or writing output', (resolved) => {
      const paths = fixture();
      const result = run(paths, 'validate', { GH_COMMIT_SHA: resolved });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('core_sha does not resolve to the requested commit');
      expect(calls(paths.log)).toHaveLength(1);
      expect(existsSync(paths.output)).toBe(false);
    },
  );

  it.each(['behind', 'diverged', 'unknown'])('rejects unreachable compare status %s', (status) => {
    const paths = fixture();
    const result = run(paths, 'validate', { GH_COMPARE_STATUS: status });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`status: ${status}`);
    expect(calls(paths.log)).toHaveLength(2);
    expect(existsSync(paths.output)).toBe(false);
  });

  it.each([['commit', 1], ['compare', 2]])('propagates %s API failure', (failure, count) => {
    const paths = fixture();
    const result = run(paths, 'validate', { GH_FAIL_AT: failure });
    expect(result.status).toBe(23);
    expect(result.stderr).toContain('fixture gh API error');
    expect(calls(paths.log)).toHaveLength(count);
    expect(existsSync(paths.output)).toBe(false);
  });

  it('fails when gh is unavailable', () => {
    const paths = fixture();
    const emptyBin = join(paths.root, 'empty-bin');
    mkdirSync(emptyBin);
    const result = run(paths, 'validate', { PATH: emptyBin });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('gh ENOENT');
    expect(existsSync(paths.output)).toBe(false);
  });

  it('sends the fixed dispatch event and JSON payload through gh stdin', () => {
    const paths = fixture();
    const result = run(paths, 'dispatch');
    expect(result.status).toBe(0);
    expect(calls(paths.log)).toEqual([{
      args: ['api', '--method', 'POST', '/repos/PiesP/yt-live-chat-overlay/dispatches', '--input', '-'],
      stdin: `${JSON.stringify({
        event_type: 'browser-core-updated',
        client_payload: { core_repository: 'PiesP/browser-core', core_sha: sha },
      }, null, 2)}\n`,
      token: 'fixture-token',
    }]);
    expect(existsSync(paths.output)).toBe(false);
  });

  it('propagates dispatch API failure', () => {
    const paths = fixture();
    const result = run(paths, 'dispatch', { GH_FAIL_AT: 'dispatch' });
    expect(result.status).toBe(23);
    expect(result.stderr).toContain('fixture gh API error');
    expect(calls(paths.log)).toHaveLength(1);
  });

  it('does nothing on import and supports a symlinked CLI entry', () => {
    const paths = fixture();
    const imported = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import ${JSON.stringify(pathToFileURL(entry).href)};`], {
      cwd: paths.root,
      encoding: 'utf8',
      env: { ...process.env, GH_LOG: paths.log, GITHUB_OUTPUT: paths.output },
    });
    expect(imported.status).toBe(0);
    expect(imported.stdout).toBe('');
    expect(imported.stderr).toBe('');
    expect(calls(paths.log)).toEqual([]);
    expect(existsSync(paths.output)).toBe(false);

    const link = join(paths.root, 'notify-linked.ts');
    symlinkSync(entry, link);
    expect(run(paths, 'validate', {}, link).status).toBe(0);
  });
});
