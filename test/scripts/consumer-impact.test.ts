import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import action from '../../automation/actions/consumer-impact/action.yaml?raw';
import notification from '../../.github/workflows/notify-consumers.yaml?raw';

const classifier = fileURLToPath(new URL('../../automation/actions/consumer-impact/classify.mjs', import.meta.url));
const fixtures: string[] = [];

function git(repository: string, ...args: string[]): string {
  return execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }).trim();
}

function write(repository: string, path: string, content: string): void {
  const destination = join(repository, path);
  mkdirSync(join(destination, '..'), { recursive: true });
  writeFileSync(destination, content);
}

function commit(repository: string): string {
  git(repository, 'add', '-A');
  git(repository, 'commit', '-qm', 'fixture');
  return git(repository, 'rev-parse', 'HEAD');
}

function fixture(): { repository: string; base: string } {
  const repository = mkdtempSync(join(tmpdir(), 'browser-core-impact-'));
  fixtures.push(repository);
  git(repository, 'init', '-q');
  git(repository, 'config', 'user.name', 'Fixture');
  git(repository, 'config', 'user.email', 'fixture@example.test');
  write(repository, 'package.json', JSON.stringify({ name: '@piesp/browser-core', exports: { '.': './src/index.ts' } }));
  write(repository, 'pnpm-lock.yaml', 'lockfileVersion: 9\n');
  write(repository, 'src/index.ts', 'export const value = 1;\n');
  return { repository, base: commit(repository) };
}

function classify(repository: string, base: string, head: string): string {
  return execFileSync('node', [classifier, repository, base, head], { encoding: 'utf8' }).trim();
}

afterEach(() => {
  for (const repository of fixtures.splice(0)) rmSync(repository, { recursive: true, force: true });
});

describe('browser-core consumer impact', () => {
  it('skips automation-only revisions', () => {
    const { repository, base } = fixture();
    write(repository, 'automation/actions/setup-project/action.yaml', 'name: Setup\n');
    expect(classify(repository, base, commit(repository))).toBe('false');
  });

  it('skips development dependency, lockfile, and tool pin changes without runtime dependencies', () => {
    const { repository, base } = fixture();
    write(repository, 'package.json', JSON.stringify({
      name: '@piesp/browser-core',
      exports: { '.': './src/index.ts' },
      devDependencies: { vitest: '5.0.0' },
      packageManager: 'pnpm@11.26.0',
      volta: { node: '26.9.0' },
    }));
    write(repository, 'pnpm-lock.yaml', 'lockfileVersion: 9\n# development graph changed\n');
    expect(classify(repository, base, commit(repository))).toBe('false');
  });

  it('skips a lockfile-only change without runtime dependencies', () => {
    const { repository, base } = fixture();
    write(repository, 'pnpm-lock.yaml', 'lockfileVersion: 9\n# development resolution changed\n');
    expect(classify(repository, base, commit(repository))).toBe('false');
  });

  it('skips mixed development tooling, tests, and docs changes', () => {
    const { repository, base } = fixture();
    write(repository, 'package.json', JSON.stringify({
      name: '@piesp/browser-core',
      exports: { '.': './src/index.ts' },
      devDependencies: { vitest: '5.0.0' },
    }));
    write(repository, 'pnpm-lock.yaml', 'lockfileVersion: 9\n# development graph changed\n');
    write(repository, 'test/util.test.ts', 'test("development", () => {});\n');
    write(repository, '.github/workflows/ci.yaml', 'name: CI\n');
    write(repository, 'scripts/check-format.ts', 'export {};\n');
    write(repository, 'tsconfig.json', '{}\n');
    write(repository, 'vitest.config.ts', 'export default {};\n');
    write(repository, 'docs/API.md', 'Development notes\n');
    write(repository, 'README.md', 'Documentation\n');
    expect(classify(repository, base, commit(repository))).toBe('false');
  });

  it('detects source and mixed changes', () => {
    const { repository, base } = fixture();
    write(repository, 'src/index.ts', 'export const value = 2;\n');
    write(repository, 'automation/README.md', 'Updated setup instructions\n');
    expect(classify(repository, base, commit(repository))).toBe('true');
  });

  it('detects a source file moved into automation', () => {
    const { repository, base } = fixture();
    mkdirSync(join(repository, 'automation'), { recursive: true });
    git(repository, 'mv', 'src/index.ts', 'automation/index.ts');
    expect(classify(repository, base, commit(repository))).toBe('true');
  });

  it.each([
    ['exports', { '.': './src/index.ts', './fixture': './test/runtime-entry.ts' }, 'test/runtime-entry.ts'],
    ['bin', { browserCore: './scripts/entry.mjs' }, 'scripts/entry.mjs'],
    ['imports', { '#runtime': './scripts/runtime.mjs' }, 'scripts/runtime.mjs'],
  ])('detects changed development paths used by %s', (field, value, path) => {
    const { repository } = fixture();
    write(repository, 'package.json', JSON.stringify({
      name: '@piesp/browser-core',
      exports: { '.': './src/index.ts' },
      [field]: value,
    }));
    write(repository, path, 'export const value = 1;\n');
    const base = commit(repository);
    write(repository, path, 'export const value = 2;\n');
    expect(classify(repository, base, commit(repository))).toBe('true');
  });

  it('detects development files when a package lifecycle script runs during installation', () => {
    const { repository } = fixture();
    write(repository, 'package.json', JSON.stringify({
      name: '@piesp/browser-core',
      exports: { '.': './src/index.ts' },
      scripts: { install: 'node scripts/install.mjs' },
    }));
    write(repository, 'scripts/install.mjs', 'process.stdout.write("old");\n');
    const base = commit(repository);
    write(repository, 'scripts/install.mjs', 'process.stdout.write("new");\n');
    expect(classify(repository, base, commit(repository))).toBe('true');
  });

  it('detects a changed target of a source symlink', () => {
    const { repository } = fixture();
    write(repository, 'test/runtime-entry.ts', 'export const value = 1;\n');
    symlinkSync('../test/runtime-entry.ts', join(repository, 'src/linked.ts'));
    const base = commit(repository);
    write(repository, 'test/runtime-entry.ts', 'export const value = 2;\n');
    expect(classify(repository, base, commit(repository))).toBe('true');
  });

  it('detects a changed relative import outside the source tree', () => {
    const { repository } = fixture();
    write(repository, 'src/index.ts', "export { value } from '../test/runtime-entry.ts';\n");
    write(repository, 'test/runtime-entry.ts', 'export const value = 1;\n');
    const base = commit(repository);
    write(repository, 'test/runtime-entry.ts', 'export const value = 2;\n');
    expect(classify(repository, base, commit(repository))).toBe('true');
  });

  it.each([
    ['Unicode escapes', String.raw`export { value } from '\u002e\u002e\u002ftest/runtime-entry.ts';`],
    ['braced Unicode escapes', String.raw`export { value } from '\u{2e}\u{2e}\u{2f}test/runtime-entry.ts';`],
    ['7-digit braced Unicode escapes', String.raw`export { value } from '\u{000002e}\u{000002e}\u{000002f}test/runtime-entry.ts';`],
    ['8-digit braced Unicode escapes', String.raw`export { value } from '\u{0000002e}\u{0000002e}\u{0000002f}test/runtime-entry.ts';`],
    ['12-digit braced Unicode escapes', String.raw`export { value } from '\u{00000000002e}\u{00000000002e}\u{00000000002f}test/runtime-entry.ts';`],
    ['hex escapes', String.raw`export { value } from '\x2e\x2e\x2ftest/runtime-entry.ts';`],
    ['identity escapes', String.raw`export { value } from '\.\.\/test/runtime-entry.ts';`],
    ['line continuations', "export { value } from '.\\\n.\\\n/test/runtime-entry.ts';"],
    ['dynamic import', String.raw`export const load = () => import('\u002e\u002e\u002ftest/runtime-entry.ts');`],
  ])('detects a changed target of a source reference using %s', (_label, reference) => {
    const { repository } = fixture();
    write(repository, 'src/index.ts', `${reference}\n`);
    write(repository, 'test/runtime-entry.ts', 'export const value = 1;\n');
    const base = commit(repository);
    write(repository, 'test/runtime-entry.ts', 'export const value = 2;\n');
    expect(classify(repository, base, commit(repository))).toBe('true');
  });

  it.each([
    ['out-of-range', String.raw`export { value } from '\u{110000}test/runtime-entry.ts';`],
    ['zero code point', String.raw`export { value } from '\u{0000000}test/runtime-entry.ts';`],
  ])('treats %s source escape syntax as potentially impactful', (_label, reference) => {
    const { repository } = fixture();
    write(repository, 'src/index.ts', reference);
    write(repository, 'test/runtime-entry.ts', 'export const value = 1;\n');
    const base = commit(repository);
    write(repository, 'test/runtime-entry.ts', 'export const value = 2;\n');
    expect(classify(repository, base, commit(repository))).toBe('true');
  });

  it('treats invalid UTF-8 source as potentially impactful', () => {
    const { repository } = fixture();
    writeFileSync(join(repository, 'src/index.ts'), Buffer.from([0xff]));
    write(repository, 'test/runtime-entry.ts', 'export const value = 1;\n');
    const base = commit(repository);
    write(repository, 'test/runtime-entry.ts', 'export const value = 2;\n');
    expect(classify(repository, base, commit(repository))).toBe('true');
  });

  it('detects lockfile changes when an exported development path may use the changed graph', () => {
    const { repository } = fixture();
    write(repository, 'package.json', JSON.stringify({
      name: '@piesp/browser-core',
      exports: { '.': './test/runtime-entry.ts' },
    }));
    write(repository, 'test/runtime-entry.ts', 'export const value = 1;\n');
    const base = commit(repository);
    write(repository, 'pnpm-lock.yaml', 'lockfileVersion: 9\n# graph changed\n');
    expect(classify(repository, base, commit(repository))).toBe('true');
  });

  it('detects development dependencies when an install hook may use them', () => {
    const { repository } = fixture();
    write(repository, 'package.json', JSON.stringify({
      name: '@piesp/browser-core',
      exports: { '.': './src/index.ts' },
      scripts: { prepare: 'node scripts/prepare.mjs' },
    }));
    const base = commit(repository);
    write(repository, 'package.json', JSON.stringify({
      name: '@piesp/browser-core',
      exports: { '.': './src/index.ts' },
      scripts: { prepare: 'node scripts/prepare.mjs' },
      devDependencies: { generator: '1.0.0' },
    }));
    expect(classify(repository, base, commit(repository))).toBe('true');
  });

  it.each([
    [{ exports: { '.': './src/other.ts' } }, 'export map'],
    [{ main: './src/other.ts' }, 'main entrypoint'],
    [{ types: './src/other.ts' }, 'type entrypoint'],
    [{ engines: { node: '>=28' } }, 'supported engines'],
    [{ dependencies: { runtime: '1.0.0' } }, 'runtime dependency'],
    [{ peerDependencies: { runtime: '^1.0.0' } }, 'peer dependency'],
    [{ optionalDependencies: { runtime: '^1.0.0' } }, 'optional dependency'],
    [{ pnpm: { overrides: { runtime: '1.0.1' } } }, 'pnpm controls'],
    [{ sideEffects: false }, 'unknown package field'],
  ])('detects %s changes (%s)', (change, _label) => {
    const { repository, base } = fixture();
    write(repository, 'package.json', JSON.stringify({
      name: '@piesp/browser-core',
      exports: { '.': './src/index.ts' },
      ...change,
    }));
    expect(classify(repository, base, commit(repository))).toBe('true');
  });

  it('treats a changed lockfile as impactful when runtime dependencies exist', () => {
    const { repository } = fixture();
    write(repository, 'package.json', JSON.stringify({ name: '@piesp/browser-core', dependencies: { runtime: '1.0.0' } }));
    const base = commit(repository);
    write(repository, 'pnpm-lock.yaml', 'lockfileVersion: 9\n# resolution changed\n');
    expect(classify(repository, base, commit(repository))).toBe('true');
  });

  it('treats unknown configuration and unavailable bases conservatively', () => {
    const { repository, base } = fixture();
    write(repository, 'pnpm-workspace.yaml', 'packages: []\n');
    const head = commit(repository);
    expect(classify(repository, base, head)).toBe('true');
    expect(classify(repository, '0'.repeat(40), head)).toBe('true');
  });

  it('treats an unreviewed tool configuration as impactful', () => {
    const { repository, base } = fixture();
    write(repository, 'eslint.config.mjs', 'export default [];\n');
    expect(classify(repository, base, commit(repository))).toBe('true');
  });

  it('treats a divergent base as impactful even when only development files differ', () => {
    const { repository, base } = fixture();
    git(repository, 'checkout', '-qb', 'other');
    write(repository, 'automation/README.md', 'Other branch\n');
    const divergent = commit(repository);
    git(repository, 'checkout', '-q', '-');
    write(repository, 'automation/README.md', 'Current branch\n');
    const head = commit(repository);
    expect(classify(repository, divergent, head)).toBe('true');
    expect(classify(repository, base, head)).toBe('false');
  });
});

describe('consumer impact action and notifier', () => {
  it('uses only fixed clone and commit inputs and gates dispatch', () => {
    expect(action).toContain('node "$GITHUB_ACTION_PATH/classify.mjs" packages/core "$BASE_SHA" "$HEAD_SHA"');
    const inputs = action.slice(action.indexOf('inputs:'), action.indexOf('\noutputs:'));
    expect(inputs.match(/^  [a-z-]+:\n    description:/gm)).toHaveLength(2);
    expect(notification).toContain('uses: ./automation/actions/consumer-impact');
    expect(notification).toContain("if: ${{ needs.validate.outputs.impact == 'true' }}");
  });
});
