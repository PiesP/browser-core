import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function prepareSetupSmoke() {
  for (const path of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'fixture-package']) {
    try {
      lstatSync(path);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    throw new Error(`Setup smoke fixture would overwrite an existing path: ${path}`);
  }
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

if (
  process.argv[1] && existsSync(process.argv[1]) &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  if (process.argv.length !== 2) {
    throw new Error('Setup smoke fixture does not accept arguments');
  }
  prepareSetupSmoke();
}
