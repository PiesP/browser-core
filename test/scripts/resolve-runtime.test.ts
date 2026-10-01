import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = resolve('automation/actions/setup-project/resolve-runtime.mjs');

function run(node: unknown, override = ''): string {
  const fixture = mkdtempSync(join(tmpdir(), 'core-runtime-'));
  try {
    writeFileSync(join(fixture, 'package.json'), JSON.stringify({ volta: { node } }));
    const output = join(fixture, 'output');
    execFileSync(process.execPath, [script], {
      cwd: fixture,
      env: { ...process.env, GITHUB_OUTPUT: output, NODE_VERSION_OVERRIDE: override },
      stdio: 'pipe',
    });
    return readFileSync(output, 'utf8');
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

describe('official runtime selection', () => {
  it('reads the exact consumer pin without duplicating its version', () => {
    expect(run('26.9.0')).toBe('version=26.9.0\n');
    expect(run('26.10.1')).toBe('version=26.10.1\n');
  });

  it('allows numeric compatibility versions only when explicitly requested', () => {
    expect(run('26.9.0', '22')).toBe('version=22\n');
    expect(run(undefined, '22')).toBe('version=22\n');
  });

  it.each([undefined, 26, '26', 'latest', '26.9.0\nextra=value']) (
    'rejects a missing, moving, or malformed official pin: %s',
    (pin) => expect(() => run(pin)).toThrow(),
  );

  it.each(['latest', 'node@26', '26\nextra=value', 'https://example.com']) (
    'rejects a nonnumeric compatibility override: %s',
    (override) => expect(() => run('26.9.0', override)).toThrow(),
  );
});
