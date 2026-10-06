import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function prepareSetupSmoke() {
  const core = JSON.parse(readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'));
  if (core.packageManager === 'pnpm@11.25.0' || core.volta.node === '24.15.0') {
    throw new Error('Smoke fixture toolchain must differ from browser-core');
  }
  writeFileSync('package.json', JSON.stringify({
    private: true, packageManager: 'pnpm@11.25.0',
    volta: { node: '24.15.0' },
    dependencies: { 'setup-smoke-fixture': 'link:./fixture-package' },
  }) + '\n');
  mkdirSync('fixture-package');
  writeFileSync('fixture-package/package.json', JSON.stringify({
    name: 'setup-smoke-fixture', version: '1.0.0', main: 'index.cjs',
  }) + '\n');
  writeFileSync('fixture-package/index.cjs', 'module.exports = 42;\n');
  writeFileSync('pnpm-lock.yaml', `lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\nimporters:\n  .:\n    dependencies:\n      setup-smoke-fixture:\n        specifier: link:./fixture-package\n        version: link:fixture-package\n`);
  copyFileSync(fileURLToPath(new URL('../../pnpm-workspace.yaml', import.meta.url)), 'pnpm-workspace.yaml');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  prepareSetupSmoke();
}
