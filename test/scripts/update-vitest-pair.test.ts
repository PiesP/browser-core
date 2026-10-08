import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertPairImporter, prepareVitestPair, selectVitestPair } from '../../scripts/update-vitest-pair.ts';

const entry = resolve(import.meta.dirname, '../../scripts/update-vitest-pair.ts');
const now = Date.parse('2026-10-08T00:00:00Z');
const old = '2026-09-30T00:00:00Z';
const paths: string[] = [];

function metadata(name: string, version = '5.0.3', time = old) {
  const peer = name === 'vitest' ? '@vitest/coverage-v8' : 'vitest';
  return { name, 'dist-tags': { latest: version }, versions: { [version]: { peerDependencies: { [peer]: version } } }, time: { [version]: time } };
}

function lock(version: string): string {
  return `lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    devDependencies:\n      '@vitest/coverage-v8':\n        specifier: ^${version}\n        version: ${version}(vitest@${version})\n      vitest:\n        specifier: ^${version}\n        version: ${version}(@vitest/coverage-v8@${version})\n\npackages:\n`;
}

function fixture() {
  const parent = mkdtempSync(join(tmpdir(), 'core-vitest-pair-'));
  paths.push(parent);
  const root = join(parent, 'source');
  const output = join(parent, 'artifacts');
  const bin = join(parent, 'bin');
  const log = join(parent, 'pnpm.jsonl');
  mkdirSync(root);
  mkdirSync(bin);
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: '@piesp/browser-core', packageManager: 'pnpm@11.26.0',
    devDependencies: { vitest: '^5.0.2', '@vitest/coverage-v8': '^5.0.2', other: '^1.0.0' },
  }, null, 2) + '\n');
  writeFileSync(join(root, 'pnpm-lock.yaml'), lock('5.0.2'));
  writeFileSync(join(root, 'pnpm-workspace.yaml'), readFileSync(resolve(import.meta.dirname, '../../pnpm-workspace.yaml')));
  execFileSync('git', ['init', '--quiet', '-b', 'master'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'fixture'], { cwd: root });
  writeFileSync(join(bin, 'pnpm'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('11.26.0'); process.exit(0); }
fs.appendFileSync(process.env.PAIR_TEST_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'update') {
  const version = args[2].slice('vitest@'.length);
  if (args[3] !== '@vitest/coverage-v8@' + version) process.exit(71);
  const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  manifest.devDependencies.vitest = '^' + version;
  manifest.devDependencies['@vitest/coverage-v8'] = '^' + version;
  if (process.env.PAIR_TEST_EXTRA === 'true') manifest.devDependencies.other = '^2.0.0';
  fs.writeFileSync('package.json', JSON.stringify(manifest, null, 2) + '\\n');
  fs.writeFileSync('pnpm-lock.yaml', fs.readFileSync('pnpm-lock.yaml', 'utf8').replaceAll('5.0.2', version));
}
if (args.includes(process.env.PAIR_TEST_FAILURE)) process.exit(72);
if (args[0] === 'install' && process.env.PAIR_TEST_LOCK_DRIFT === 'true') fs.appendFileSync('pnpm-lock.yaml', '# changed\\n');
if (args[0] === 'install' && process.env.PAIR_TEST_STAGED_POLICY === 'true') {
  fs.appendFileSync('pnpm-workspace.yaml', '# changed policy\\n');
  require('node:child_process').execFileSync('git', ['add', 'pnpm-workspace.yaml']);
}
if (args[0] === 'verify' && process.env.PAIR_TEST_STAGED_SOURCE === 'true') {
  fs.writeFileSync('unexpected.ts', 'export const changed = true;\\n');
  require('node:child_process').execFileSync('git', ['add', 'unexpected.ts']);
}
`, { mode: 0o755 });
  vi.stubEnv('PATH', `${bin}${delimiter}${process.env.PATH ?? ''}`);
  vi.stubEnv('PAIR_TEST_LOG', log);
  return { root, output, log };
}

function calls(path: string): string[][] {
  return existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n').map((line: string) => JSON.parse(line) as string[]) : [];
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('eligible paired release selection', () => {
  it('requires both cooled releases and exact mutual peers', () => {
    expect(selectVitestPair('5.0.2', metadata('vitest'), metadata('@vitest/coverage-v8'), now)).toBe('5.0.3');
    expect(selectVitestPair('5.0.3', metadata('vitest'), metadata('@vitest/coverage-v8'), now)).toBeNull();
    expect(selectVitestPair('5.0.2', metadata('vitest', '5.0.3', '2026-10-07T00:00:00Z'), metadata('@vitest/coverage-v8'), now)).toBe('5.0.3');
    expect(selectVitestPair('5.0.2', metadata('vitest', '5.0.3', '2026-10-07T00:00:00.001Z'), metadata('@vitest/coverage-v8', '5.0.3', '2026-10-07T00:00:00.001Z'), now)).toBeNull();
  });

  it('selects numeric stable versions rather than prerelease or lexical order', () => {
    const a = metadata('vitest', '5.10.0');
    const b = metadata('@vitest/coverage-v8', '5.10.0');
    for (const [name, target] of [['vitest', a], ['@vitest/coverage-v8', b]] as const) {
      Object.assign(target.versions, metadata(name, '5.9.0').versions, metadata(name, '6.0.0-beta.1').versions);
      Object.assign(target.time, metadata(name, '5.9.0').time, metadata(name, '6.0.0-beta.1').time);
    }
    expect(selectVitestPair('5.0.2', a, b, now)).toBe('5.10.0');
  });

  it('excludes numeric releases published only on a trial channel', () => {
    const a = metadata('vitest');
    const b = metadata('@vitest/coverage-v8');
    for (const [name, target] of [['vitest', a], ['@vitest/coverage-v8', b]] as const) {
      Object.assign(target.versions, metadata(name, '6.0.0').versions);
      Object.assign(target.time, metadata(name, '6.0.0').time);
      Object.assign(target['dist-tags'], { next: '6.0.0' });
    }
    expect(selectVitestPair('5.0.2', a, b, now)).toBe('5.0.3');
    expect(selectVitestPair('5.0.3', a, b, now)).toBeNull();
  });

  it('defers eligible one-sided releases and missing publication times', () => {
    expect(() => selectVitestPair('5.0.2', metadata('vitest'), metadata('@vitest/coverage-v8', '5.0.2'), now)).toThrow('without a compatible cooled pair');
    expect(() => selectVitestPair('5.0.2', metadata('vitest', '5.0.3', ''), metadata('@vitest/coverage-v8'), now)).toThrow('Missing publication time');
  });

  it('rejects skewed peers, wrong package documents and malformed versions', () => {
    const b = metadata('@vitest/coverage-v8');
    b.versions['5.0.3']!.peerDependencies.vitest = '^5.0.3';
    expect(() => selectVitestPair('5.0.2', metadata('vitest'), b, now)).toThrow('exact mutual peers');
    expect(() => selectVitestPair('5.0.2', metadata('other'), b, now)).toThrow('package name differs');
    expect(() => selectVitestPair('5.00.2', metadata('vitest'), b, now)).toThrow('Invalid current version');
  });

  it('does not update to deprecated releases or downgrade', () => {
    const a = metadata('vitest');
    Object.assign(a.versions['5.0.3']!, { deprecated: 'withdrawn' });
    expect(() => selectVitestPair('5.0.2', a, metadata('@vitest/coverage-v8'), now)).toThrow('defer the update');
    expect(selectVitestPair('6.0.0', metadata('vitest'), metadata('@vitest/coverage-v8'), now)).toBeNull();
  });
});

describe('isolated updater transaction', () => {
  it('updates both packages in one argv and validates without changing source', async () => {
    const f = fixture();
    const original = readFileSync(join(f.root, 'package.json'));
    await prepareVitestPair({ ...f, metadata: async (name) => metadata(name) });
    expect(calls(f.log)).toEqual([
      ['update', '-D', 'vitest@5.0.3', '@vitest/coverage-v8@5.0.3', '--lockfile-only', '--no-runtime'],
      ['--filter', '.', 'peers', 'check'], ['install', '--frozen-lockfile', '--no-runtime'], ['verify'],
    ]);
    expect(readFileSync(join(f.root, 'package.json'))).toEqual(original);
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: f.root, encoding: 'utf8' })).toBe('');
    const receipt = JSON.parse(readFileSync(join(f.output, 'receipt.json'), 'utf8'));
    expect(receipt).toMatchObject({ status: 'validated', mode: 'candidate', publishable: true, old_version: '5.0.2', new_version: '5.0.3' });
    expect(receipt.base_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(receipt.patch_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(join(f.output, 'vitest-pair.patch'), 'utf8')).toContain('+        version: 5.0.3(vitest@5.0.3)');
  });

  it.each(['peers', 'install', 'verify'])('preserves a failed %s receipt and withholds a patch', async (failure) => {
    const f = fixture();
    vi.stubEnv('PAIR_TEST_FAILURE', failure);
    await expect(prepareVitestPair({ ...f, metadata: async (name) => metadata(name) })).rejects.toThrow();
    expect(JSON.parse(readFileSync(join(f.output, 'receipt.json'), 'utf8'))).toMatchObject({ status: 'failed', publishable: false });
    expect(existsSync(join(f.output, 'vitest-pair.patch'))).toBe(false);
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: f.root, encoding: 'utf8' })).toBe('');
  });

  it.each(['PAIR_TEST_EXTRA', 'PAIR_TEST_LOCK_DRIFT', 'PAIR_TEST_STAGED_POLICY', 'PAIR_TEST_STAGED_SOURCE'])('rejects unexpected %s writes', async (setting) => {
    const f = fixture();
    vi.stubEnv(setting, 'true');
    await expect(prepareVitestPair({ ...f, metadata: async (name) => metadata(name) })).rejects.toThrow();
    expect(existsSync(join(f.output, 'vitest-pair.patch'))).toBe(false);
  });

  it('records no-update without executing dependency commands', async () => {
    const f = fixture();
    await prepareVitestPair({ ...f, metadata: async (name) => metadata(name, '5.0.2') });
    expect(calls(f.log)).toEqual([]);
    expect(JSON.parse(readFileSync(join(f.output, 'receipt.json'), 'utf8'))).toMatchObject({ status: 'no-update', publishable: false });
    expect(existsSync(join(f.output, 'checkout'))).toBe(false);
  });

  it.each(['network', 'selection'])('retains a source-bound %s failure before dependency execution', async (phase) => {
    const f = fixture();
    await expect(prepareVitestPair({ ...f, metadata: async (name) => {
      if (phase === 'network') throw new Error('Registry unavailable');
      return metadata(name, '5.0.3', '');
    } })).rejects.toThrow();
    const receipt = JSON.parse(readFileSync(join(f.output, 'receipt.json'), 'utf8'));
    expect(receipt).toMatchObject({ status: 'failed', publishable: false, commands: [] });
    expect(receipt.base_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(existsSync(join(f.output, 'vitest-pair.patch'))).toBe(false);
    expect(calls(f.log)).toEqual([]);
  });

  it('rejects dirty source, an existing output, and an inconsistent importer', async () => {
    const f = fixture();
    writeFileSync(join(f.root, 'dirty'), 'keep');
    await expect(prepareVitestPair({ ...f })).rejects.toThrow('clean repository');
    expect(existsSync(f.output)).toBe(false);
    expect(() => assertPairImporter(lock('5.0.2').replace('version: 5.0.2(vitest', 'version: 5.0.3(vitest'), '5.0.2')).toThrow('importer differs');
    expect(() => assertPairImporter(lock('5.0.20'), '5.0.2')).toThrow('importer differs');
    rmSync(join(f.root, 'dirty'));
    mkdirSync(f.output);
    await expect(prepareVitestPair({ ...f, metadata: async (name) => metadata(name) })).rejects.toThrow();
    expect(calls(f.log)).toEqual([]);
  });

  it('has no import side effects and rejects unknown CLI arguments', () => {
    const f = fixture();
    const imported = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(entry).href)})`], { cwd: f.root, encoding: 'utf8' });
    expect(imported.status).toBe(0);
    expect(imported.stdout + imported.stderr).toBe('');
    const result = spawnSync(process.execPath, [entry, '--help'], { cwd: f.root, encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage:');
    expect(calls(f.log)).toEqual([]);
  });
});

it('keeps scheduled preparation credentialless and publication separate', () => {
  const workflow = readFileSync(resolve(import.meta.dirname, '../../.github/workflows/update-vitest-pair.yaml'), 'utf8');
  expect(workflow).toContain('contents: read');
  expect(workflow).toContain('ref: master');
  expect(workflow).toContain('persist-credentials: false');
  expect(workflow).toContain("install-dependencies: 'false'");
  expect(workflow).toContain('--rehearsal');
  expect(workflow).not.toMatch(/secrets\.|GH_TOKEN|pull-requests: write|contents: write|gh pr|git push/);
});
