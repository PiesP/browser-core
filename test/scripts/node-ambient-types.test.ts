import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const checker = resolve(repositoryRoot, 'node_modules/vite-plus/bin/vp');
const nodeTestDirectory = dirname(fileURLToPath(import.meta.url));
const positiveSource = [
  "import { readFileSync } from 'node:fs';",
  'const bytes: Buffer = Buffer.from(readFileSync(process.execPath));',
  'const controller = new AbortController();',
  'void bytes;',
  'void controller;',
].join('\n');

test('Node tooling rejects browser globals through its actual project graph', () => {
  const fixture = mkdtempSync(join(nodeTestDirectory, 'node-ambient-types-'));
  const probe = join(fixture, 'probe.ts');
  const command = [checker, 'check', '--no-fmt', '--no-lint', probe];
  try {
    writeFileSync(probe, positiveSource);
    const positive = spawnSync(process.execPath, command, {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    expect(positive.error).toBeUndefined();
    expect(positive.status).toBe(0);
    expect(positive.stdout).toContain('Found no type errors in 1 file');

    writeFileSync(probe, `${positiveSource}\ndocument.title;\nwindow.alert('unexpected');\n`);
    const negative = spawnSync(process.execPath, command, {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    expect(negative.error).toBeUndefined();
    expect(negative.status).toBe(1);
    expect(negative.stdout).toMatch(/typescript\([^)]*\):[^\n]*document/);
    expect(negative.stdout).toMatch(/typescript\([^)]*\):[^\n]*window/);
    expect(negative.stdout).not.toMatch(/typescript\([^)]*\):[^\n]*Buffer/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('Node tooling retains erasable syntax and strict optional/indexed access', () => {
  const fixture = mkdtempSync(join(nodeTestDirectory, 'node-type-options-'));
  const probe = join(fixture, 'probe.ts');
  try {
    writeFileSync(
      probe,
      [
        'enum ToolMode { Ready }',
        'void ToolMode;',
        'const optional: { enabled?: boolean } = { enabled: undefined };',
        'void optional;',
        'const first: number = [1][0];',
        'void first;',
      ].join('\n')
    );
    const result = spawnSync(process.execPath, [checker, 'check', '--no-fmt', '--no-lint', probe], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('erasableSyntaxOnly');
    expect(result.stdout).toContain('exactOptionalPropertyTypes');
    expect(result.stdout).toContain("Type 'number | undefined' is not assignable to type 'number'");
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('Node tooling requires explicit import extensions', () => {
  const fixture = mkdtempSync(join(nodeTestDirectory, 'node-import-resolution-'));
  const probe = join(fixture, 'probe.ts');
  try {
    writeFileSync(join(fixture, 'helper.ts'), 'export const helper = 1;\n');
    writeFileSync(probe, "import { helper } from './helper';\nvoid helper;\n");
    const result = spawnSync(process.execPath, [checker, 'check', '--no-fmt', '--no-lint', probe], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('TS2835');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
