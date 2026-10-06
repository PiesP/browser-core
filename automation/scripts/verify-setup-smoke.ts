import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function verifySetupSmoke(
  phase: 'prepared' | 'installed' | 'compatibility',
  nodeVersion: string,
  pnpmVersion?: string,
): void {
  if (phase === 'compatibility') {
    if (!nodeVersion.startsWith('22.')) throw new Error('Expected Node 22 compatibility runtime');
  } else if (nodeVersion !== '24.15.0') {
    throw new Error('Expected consumer-pinned Node 24.15.0 runtime');
  }

  if (phase === 'prepared') {
    const manifest: unknown = JSON.parse(readFileSync('package.json', 'utf8'));
    if (
      typeof manifest !== 'object' || manifest === null ||
      !('packageManager' in manifest) ||
      manifest.packageManager !== `pnpm@${pnpmVersion}`
    ) {
      throw new Error('Expected consumer manifest pnpm version');
    }
    if (existsSync('node_modules')) throw new Error('Dependencies were installed too early');
  } else {
    const requireFromConsumer = createRequire(resolve('package.json'));
    if (requireFromConsumer('setup-smoke-fixture') !== 42) {
      throw new Error('Frozen consumer fixture is unavailable');
    }
  }
}

if (
  process.argv[1] && existsSync(process.argv[1]) &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  const phase = process.argv[2];
  if (phase !== 'prepared' && phase !== 'installed' && phase !== 'compatibility') {
    throw new Error('Expected prepared, installed, or compatibility phase');
  }
  verifySetupSmoke(phase, process.versions.node, phase === 'prepared' ? process.env.PNPM_VERSION : undefined);
}
