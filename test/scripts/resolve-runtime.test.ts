import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = resolve('automation/actions/setup-project/resolve-runtime.mjs');

function run(node: unknown, override = ''): string {
  return runManifest(JSON.stringify({ volta: { node } }), override);
}

function runManifest(manifest: string | undefined, override = ''): string {
  const fixture = mkdtempSync(join(tmpdir(), 'core-runtime-'));
  const manifestPath = join(fixture, 'package.json');
  const lockfilePath = join(fixture, 'pnpm-lock.yaml');
  try {
    if (manifest !== undefined) writeFileSync(manifestPath, manifest);
    writeFileSync(lockfilePath, 'consumer lockfile sentinel\n');
    const output = join(fixture, 'output');
    execFileSync(process.execPath, [script], {
      cwd: fixture,
      env: { ...process.env, GITHUB_OUTPUT: output, NODE_VERSION_OVERRIDE: override },
      stdio: 'pipe',
    });
    return readFileSync(output, 'utf8');
  } finally {
    expect(existsSync(manifestPath)).toBe(manifest !== undefined);
    if (manifest !== undefined) expect(readFileSync(manifestPath, 'utf8')).toBe(manifest);
    expect(readFileSync(lockfilePath, 'utf8')).toBe('consumer lockfile sentinel\n');
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

  it.each([undefined, '{invalid json']) (
    'fails closed on a missing or invalid consumer manifest: %s',
    (manifest) => {
      expect(() => runManifest(manifest)).toThrow();
      expect(() => runManifest(manifest, '22')).toThrow();
    },
  );
});
