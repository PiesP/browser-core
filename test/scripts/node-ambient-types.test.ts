import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const compiler = resolve(repositoryRoot, 'node_modules/typescript/bin/tsc');
const baseConfig = process.env.BROWSER_CORE_SCRIPT_TSCONFIG ?? '../tsconfig.scripts.json';
const fixtureSource = [
  "import { readFileSync } from 'node:fs';",
  'const bytes: Buffer = Buffer.from(readFileSync(process.execPath));',
  'const controller = new AbortController();',
  'void bytes;',
  'void controller;',
  'document.title;',
  "window.alert('unexpected browser global');",
].join('\n');

test('Node tooling rejects browser globals through its actual project graph', () => {
  const fixture = mkdtempSync(join(repositoryRoot, '.node-ambient-types-'));
  try {
    writeFileSync(join(fixture, 'probe.ts'), fixtureSource);
    writeFileSync(join(fixture, 'tsconfig.json'), JSON.stringify({
      extends: baseConfig,
      files: ['./probe.ts'],
    }));
    const result = spawnSync(process.execPath, [
      compiler,
      '--project', join(fixture, 'tsconfig.json'),
      '--pretty', 'false',
    ], { cwd: repositoryRoot, encoding: 'utf8' });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toBe('');
    const diagnostics = result.stdout.trim().split('\n');
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]).toMatch(/probe\.ts\(6,1\): error TS2584: Cannot find name 'document'/);
    expect(diagnostics[1]).toMatch(/probe\.ts\(7,1\): error TS2304: Cannot find name 'window'/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
