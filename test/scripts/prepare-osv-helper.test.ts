import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import action from '../../automation/actions/prepare-osv/action.yaml?raw';

const entry = resolve(import.meta.dirname, '../../automation/actions/prepare-osv/prepare.ts');
const sourceDirectory = resolve(import.meta.dirname, '../../automation/security');
const names = ['consumer-workflow.ts', 'strict-json.ts', 'osv-report.ts', 'validate-osv.ts'] as const;
const fixtures: string[] = [];

interface Fixture { root: string; workspace: string; runner: string; providerEntry: string; source: string; output: string }

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'prepare osv action '));
  fixtures.push(root);
  const workspace = join(root, 'candidate-workspace');
  const runner = join(root, 'runner-temp');
  const source = join(root, 'immutable-provider', 'automation', 'security');
  const providerEntry = join(root, 'immutable-provider', 'automation', 'actions', 'prepare-osv', 'prepare.ts');
  const output = join(root, 'github-output.txt');
  mkdirSync(workspace);
  mkdirSync(runner);
  mkdirSync(source, { recursive: true });
  mkdirSync(dirname(providerEntry), { recursive: true });
  writeFileSync(join(root, 'immutable-provider', 'package.json'), '{"type":"module"}\n');
  copyFileSync(entry, providerEntry);
  for (const name of names) writeFileSync(join(source, name), `trusted provider ${name}\n`);
  return { root, workspace, runner, providerEntry, source, output };
}

function run(f: Fixture, options: { entry?: string; args?: string[]; env?: Record<string, string> } = {}) {
  return spawnSync(process.execPath, [options.entry ?? f.providerEntry, ...(options.args ?? [])], {
    cwd: f.workspace, encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_WORKSPACE: f.workspace,
      GITHUB_ACTION_PATH: dirname(f.providerEntry),
      RUNNER_TEMP: f.runner,
      GITHUB_OUTPUT: f.output,
      ...options.env,
    },
  });
}

function helperPath(f: Fixture): string {
  const output = readFileSync(f.output, 'utf8');
  expect(output.match(/^helper-path=/gm)).toHaveLength(1);
  expect(output.endsWith('\n')).toBe(true);
  return output.slice('helper-path='.length).trimEnd();
}

afterEach(() => { for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe('prepare OSV helper action', () => {
  it('has no inputs, permissions, install, checkout, or candidate-path command', () => {
    expect(action).toContain('name: Prepare consumer OSV helper');
    expect(action).toContain('using: composite');
    expect(action).toContain('value: ${{ steps.prepare.outputs.helper-path }}');
    expect(action).toContain('run: node "$GITHUB_ACTION_PATH/prepare.ts"');
    expect(action).not.toMatch(/(?:^|\n)(?:inputs|permissions):/u);
    expect(action).not.toMatch(/\buses:|pnpm|npm|checkout|GITHUB_WORKSPACE|\$\{\{\s*inputs\./u);
  });

  it('copies exactly the fixed provider closure into a new private runner directory', () => {
    const f = fixture();
    const colliding = join(f.workspace, 'automation', 'security');
    mkdirSync(colliding, { recursive: true });
    for (const name of names) writeFileSync(join(colliding, name), `candidate ${name}\n`);
    const result = run(f);
    expect(result.status, result.stderr).toBe(0);
    const helper = helperPath(f);
    const directory = dirname(helper);
    expect(helper).toBe(join(directory, 'consumer-workflow.ts'));
    expect(directory.startsWith(`${f.runner}/consumer-osv-helper-`)).toBe(true);
    expect(readdirSync(directory).sort()).toEqual([...names].sort());
    expect(readdirSync(f.runner)).toHaveLength(1);
    for (const name of names) {
      expect(readFileSync(join(directory, name), 'utf8')).toBe(`trusted provider ${name}\n`);
      expect(readFileSync(join(colliding, name), 'utf8')).toBe(`candidate ${name}\n`);
      if (process.platform !== 'win32') expect(lstatSync(join(directory, name)).mode & 0o777).toBe(0o600);
    }
    if (process.platform !== 'win32') expect(lstatSync(directory).mode & 0o777).toBe(0o700);
  });

  it.each(names)('fails closed and removes only the new directory when %s is missing', name => {
    const f = fixture();
    rmSync(join(f.source, name));
    writeFileSync(join(f.runner, 'preexisting-candidate'), 'keep');
    const result = run(f);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(name);
    expect(existsSync(f.output)).toBe(false);
    expect(readdirSync(f.runner)).toEqual(['preexisting-candidate']);
  });

  it('rejects a provider symlink and cleans its partial copy', () => {
    const f = fixture();
    const source = join(f.source, 'validate-osv.ts');
    rmSync(source);
    symlinkSync(join(f.workspace, 'candidate.ts'), source);
    const result = run(f);
    expect(result.status).toBe(1);
    expect(existsSync(f.output)).toBe(false);
    expect(readdirSync(f.runner)).toEqual([]);
  });

  it('does not authorize a partial copy when output writing fails', () => {
    const f = fixture();
    mkdirSync(f.output);
    const result = run(f);
    expect(result.status).toBe(1);
    expect(readdirSync(f.runner)).toEqual([]);
    expect(readdirSync(f.output)).toEqual([]);
  });

  it('rejects arguments and missing environment without creating any directory', () => {
    const argumentsFixture = fixture();
    expect(run(argumentsFixture, { args: ['candidate-path'] }).status).toBe(1);
    expect(readdirSync(argumentsFixture.runner)).toEqual([]);
    expect(existsSync(argumentsFixture.output)).toBe(false);
    const envFixture = fixture();
    expect(run(envFixture, { env: { GITHUB_OUTPUT: '' } }).status).toBe(1);
    expect(readdirSync(envFixture.runner)).toEqual([]);
    const missingRunner = fixture();
    expect(run(missingRunner, { env: { RUNNER_TEMP: '' } }).status).toBe(1);
    expect(existsSync(missingRunner.output)).toBe(false);
  });

  it('is import-inert and follows a realpath symlink entrypoint', () => {
    const f = fixture();
    const imported = spawnSync(process.execPath, ['--input-type=module', '-e',
      `await import(${JSON.stringify(pathToFileURL(f.providerEntry).href)})`], {
      cwd: f.workspace, encoding: 'utf8',
      env: { ...process.env, RUNNER_TEMP: f.runner, GITHUB_OUTPUT: f.output },
    });
    expect(imported.status, imported.stderr).toBe(0);
    expect(readdirSync(f.runner)).toEqual([]);
    expect(existsSync(f.output)).toBe(false);
    const link = join(f.root, 'linked-prepare.ts');
    symlinkSync(f.providerEntry, link);
    const result = run(f, { entry: link });
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(helperPath(f))).toBe(true);
  });

  it('copies the authentic provider module closure byte for byte', () => {
    const f = fixture();
    const result = run(f, { entry });
    expect(result.status, result.stderr).toBe(0);
    const destination = dirname(helperPath(f));
    for (const name of names) expect(readFileSync(join(destination, name))).toEqual(readFileSync(join(sourceDirectory, name)));
  });
});
