import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import action from '../../automation/actions/prepare-scanner-pins/action.yaml?raw';

const entry = resolve(
  import.meta.dirname,
  '../../automation/actions/prepare-scanner-pins/prepare.ts'
);
const source = resolve(import.meta.dirname, '../../automation/security/scanner-pins.ts');
const roots: string[] = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'prepare scanner pins '));
  roots.push(root);
  const provider = join(root, 'immutable provider');
  const candidate = join(root, 'candidate checkout');
  const runner = join(root, 'runner temp');
  const providerEntry = join(provider, 'automation/actions/prepare-scanner-pins/prepare.ts');
  const providerSource = join(provider, 'automation/security/scanner-pins.ts');
  const output = join(root, 'github output');
  mkdirSync(dirname(providerEntry), { recursive: true });
  mkdirSync(dirname(providerSource), { recursive: true });
  mkdirSync(candidate);
  mkdirSync(runner);
  copyFileSync(entry, providerEntry);
  copyFileSync(source, providerSource);
  writeFileSync(join(candidate, 'scanner-pins.ts'), 'candidate helper\n');
  const env = { ...process.env, RUNNER_TEMP: runner, GITHUB_OUTPUT: output };
  function run(options: { args?: string[]; env?: Record<string, string>; entry?: string } = {}) {
    return spawnSync(process.execPath, [options.entry ?? providerEntry, ...(options.args ?? [])], {
      cwd: candidate,
      env: { ...env, ...options.env },
      encoding: 'utf8',
    });
  }
  function helperPath() {
    const value = readFileSync(output, 'utf8');
    expect(value.match(/^helper-path=/gm)).toHaveLength(1);
    expect(value.endsWith('\n')).toBe(true);
    return value.slice('helper-path='.length).trimEnd();
  }
  return { root, candidate, runner, providerEntry, providerSource, output, env, run, helperPath };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('prepare scanner pins action', () => {
  it('has a fixed source, no candidate inputs, and only one prepared CLI output', () => {
    expect(action).toContain('using: composite');
    expect(action).toContain('value: ${{ steps.prepare.outputs.helper-path }}');
    expect(action).toContain('run: node "$GITHUB_ACTION_PATH/prepare.ts"');
    expect(action).not.toMatch(/(?:^|\n)(?:inputs|permissions):/u);
    expect(action).not.toMatch(/\buses:|pnpm|npm|checkout|GITHUB_WORKSPACE/u);
    const f = fixture();
    const result = f.run();
    expect(result.status, result.stderr).toBe(0);
    const helper = f.helperPath();
    expect(dirname(helper).startsWith(`${f.runner}/scanner-pin-helper-`)).toBe(true);
    expect(readdirSync(dirname(helper))).toEqual(['scanner-pins.ts']);
    expect(readFileSync(helper)).toEqual(readFileSync(f.providerSource));
    expect(readFileSync(join(f.candidate, 'scanner-pins.ts'), 'utf8')).toBe('candidate helper\n');
    if (process.platform !== 'win32') {
      expect(lstatSync(dirname(helper)).mode & 0o777).toBe(0o700);
      expect(lstatSync(helper).mode & 0o777).toBe(0o600);
    }
  });

  it('rejects missing and symlinked provider source and cleans partial work', () => {
    const missing = fixture();
    rmSync(missing.providerSource);
    expect(missing.run().status).toBe(1);
    expect(readdirSync(missing.runner)).toEqual([]);
    expect(existsSync(missing.output)).toBe(false);
    const linked = fixture();
    rmSync(linked.providerSource);
    symlinkSync(join(linked.candidate, 'scanner-pins.ts'), linked.providerSource);
    expect(linked.run().status).toBe(1);
    expect(readdirSync(linked.runner)).toEqual([]);
  });

  it('rejects output failure, unexpected arguments, and missing environment', () => {
    const f = fixture();
    mkdirSync(f.output);
    expect(f.run().status).toBe(1);
    expect(readdirSync(f.runner)).toEqual([]);
    const argumentsFixture = fixture();
    expect(argumentsFixture.run({ args: ['candidate'] }).status).toBe(1);
    expect(readdirSync(argumentsFixture.runner)).toEqual([]);
    const missingEnv = fixture();
    expect(missingEnv.run({ env: { RUNNER_TEMP: '' } }).status).toBe(1);
    expect(readdirSync(missingEnv.runner)).toEqual([]);
  });

  it('reads the opened provider file if its pathname is replaced during copying', () => {
    const f = fixture();
    const preload = join(f.root, 'replace-after-open.mjs');
    writeFileSync(
      preload,
      `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const originalOpen = fs.openSync;
      fs.openSync = (path, ...args) => {
        const fd = originalOpen(path, ...args);
        if (path === ${JSON.stringify(f.providerSource)}) {
          fs.renameSync(path, path + '.opened');
          fs.writeFileSync(path, 'replacement bytes');
        }
        return fd;
      };
      syncBuiltinESMExports();
    `
    );
    const result = spawnSync(
      process.execPath,
      ['--import', pathToFileURL(preload).href, f.providerEntry],
      { cwd: f.candidate, env: f.env, encoding: 'utf8' }
    );
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(f.providerSource, 'utf8')).toBe('replacement bytes');
    expect(readFileSync(f.helperPath())).toEqual(readFileSync(`${f.providerSource}.opened`));
  });

  it('executes the prepared CLI against explicitly supplied consumer metadata', () => {
    const f = fixture();
    expect(f.run().status).toBe(0);
    const metadata = join(f.candidate, 'trusted pinned-tools.json');
    const digest = 'a'.repeat(64);
    writeFileSync(
      metadata,
      JSON.stringify({
        osv: { version: '2.6.0', image: `ghcr.io/google/osv-scanner-action@sha256:${digest}` },
        semgrep: { version: '1.178.0', image: `semgrep/semgrep:1.178.0@sha256:${digest}` },
      })
    );
    const githubEnv = join(f.root, 'github env');
    const result = spawnSync(process.execPath, [f.helperPath(), 'env', metadata], {
      cwd: f.candidate,
      env: { ...f.env, GITHUB_ENV: githubEnv },
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(githubEnv, 'utf8')).toContain(
      `OSV_SCANNER_IMAGE=ghcr.io/google/osv-scanner-action@sha256:${digest}\n`
    );
  });

  it('is import-inert and supports a symlinked action entry', () => {
    const f = fixture();
    const imported = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `await import(${JSON.stringify(pathToFileURL(f.providerEntry).href)})`,
      ],
      { cwd: f.candidate, env: f.env, encoding: 'utf8' }
    );
    expect(imported.status, imported.stderr).toBe(0);
    expect(readdirSync(f.runner)).toEqual([]);
    const link = join(f.root, 'linked prepare.ts');
    symlinkSync(f.providerEntry, link);
    const result = f.run({ entry: link });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(f.helperPath())).toEqual(readFileSync(f.providerSource));
  });
});
