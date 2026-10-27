import { describe, expect, it } from 'vite-plus/test';

import runtimeNotifications from '../.github/workflows/notify-consumers.yaml?raw';
import ci from '../.github/workflows/ci.yaml?raw';
import action from '../automation/actions/setup-project/action.yaml?raw';
import nodeVersion from '../.node-version?raw';
import runtimePackageJson from '../package.json?raw';

const runtimePackage = JSON.parse(runtimePackageJson) as {
  exports: Record<string, string>;
};

function parsePathFilters(workflow: string, key: 'paths' | 'paths-ignore'): string[] {
  const trigger = workflow.slice(
    workflow.indexOf('  push:'),
    workflow.indexOf('  workflow_dispatch:')
  );
  const block = trigger.match(new RegExp(`^    ${key}:\\n((?:      - .+\\n)+)`, 'm'))?.[1];
  if (!block) return [];

  return [...block.matchAll(/^      - ["']?(.+?)["']?$/gm)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]]
  );
}

function matchesPath(path: string, pattern: string): boolean {
  if (pattern.endsWith('/**')) return path.startsWith(pattern.slice(0, -2));
  if (!pattern.includes('*')) return path === pattern;
  throw new Error(`Unsupported workflow path pattern in contract test: ${pattern}`);
}

function runtimeNotificationRunsFor(path: string): boolean {
  const included = parsePathFilters(runtimeNotifications, 'paths');
  const ignored = parsePathFilters(runtimeNotifications, 'paths-ignore');
  const passesInclude =
    included.length === 0 || included.some((pattern) => matchesPath(path, pattern));
  const passesIgnore = !ignored.some((pattern) => matchesPath(path, pattern));
  return passesInclude && passesIgnore;
}

describe('central project setup action', () => {
  it('uses one immutable Vite+ setup owner with the consumer runtime pin', () => {
    expect(nodeVersion.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    expect(action).toContain(
      'uses: voidzero-dev/setup-vp@cab1ab9eaff52d4857875f4f2c016e36af8f2c76'
    );
    expect(action).toContain('version-file: pnpm-workspace.yaml');
    expect(action).toContain('name: Validate the consumer Vite+ pin');
    expect(action).toContain('node-version-file: .node-version');
    expect(action).toContain('node-version: ${{ inputs.node-version }}');
    expect(action).toContain("run-install: 'false'");
    expect(action).toContain("cache: 'false'");
    expect(action).toContain("cache-toolchain: 'false'");
    expect(action).not.toContain('actions/setup-node@');
    expect(action).not.toContain('pnpm/action-setup@');
    expect(ci).toContain('uses: ./automation/actions/setup-project');
    expect(ci).toContain(
      "node-version: ${{ matrix.node-version != 'manifest' && matrix.node-version || '' }}"
    );
    expect(ci).toContain('run: vp run check');
    expect(ci).toContain('run: pnpm exec playwright install --with-deps chromium');
    expect(ci.indexOf('run: pnpm exec playwright install --with-deps chromium')).toBeLessThan(
      ci.indexOf('run: vp run test:cov')
    );
    expect(ci).toContain('run: vp run test:cov');
  });

  it('configures the pinned runtime before optional locked dependency installation', () => {
    const inputs = action.slice(action.indexOf('inputs:'), action.indexOf('\nruns:'));
    const runtimeIndex = action.indexOf('name: Validate the consumer runtime pin');
    const vitePlusIndex = action.indexOf('name: Validate the consumer Vite+ pin');
    const setupIndex = action.indexOf('name: Install consumer Vite+, Node and package manager');
    const installIndex = action.indexOf('name: Install locked dependencies');
    const installStep = action.slice(installIndex);

    expect(inputs).toMatch(/  install-dependencies:\n(?:    .+\n)*    default: 'true'/);
    expect(runtimeIndex).toBeGreaterThan(-1);
    expect(vitePlusIndex).toBeGreaterThan(runtimeIndex);
    expect(setupIndex).toBeGreaterThan(vitePlusIndex);
    expect(installIndex).toBeGreaterThan(setupIndex);
    expect(action.slice(runtimeIndex, installIndex)).not.toMatch(/^\s*if:/m);
    expect(action).toContain('[[ -f .node-version && ! -L .node-version ]]');
    expect(action).toContain('[[ "$(cat .node-version)" =~ ^[0-9]+\\.[0-9]+\\.[0-9]+$ ]]');
    expect(installStep).toContain("if: ${{ inputs.install-dependencies == 'true' }}");
    expect(installStep).toContain('run: vp install --frozen-lockfile -- --no-runtime');
    expect(action).not.toMatch(/^\s*run: (?:npm|yarn) install/m);
    expect(action).not.toContain('pnpm update');
  });

  it('exposes only the compatibility and dependency-install inputs and no secret surface', () => {
    const inputs = action.slice(action.indexOf('inputs:'), action.indexOf('\nruns:'));
    const inputNames = [...inputs.matchAll(/^  ([a-z][a-z-]+):$/gm)].map(([, name]) => name);

    expect(inputNames).toEqual(['node-version', 'install-dependencies']);
    expect(action).not.toContain('secrets:');
    expect(action).not.toMatch(/^  (command|path|ref|script|url):$/m);
  });

  it('requires the consumer smoke job alongside both existing runtime lanes', () => {
    expect(ci).toContain("node-version: ['22.23.4', manifest]");
    expect(ci).toContain('needs: [quality, setup-smoke]');
    expect(ci).toContain('uses: ./.setup-action/automation/actions/setup-project');
    expect(ci).toContain("install-dependencies: 'false'");
    expect(ci).toContain('sha256sum package.json .node-version pnpm-lock.yaml pnpm-workspace.yaml');
    expect(ci).toContain('test "$(vp --version | head -n 1)" = \'vp v1.4.0\'');
    expect(ci).toContain('sha256sum --check fixture.sha256');
    expect(ci).toContain('node .setup-action/automation/scripts/verify-setup-smoke.ts prepared');
    expect(ci).toContain('test "$SETUP_RESULT" = success');
  });
});

describe('runtime and automation release boundaries', () => {
  it('does not expose automation through the runtime package', () => {
    expect(Object.keys(runtimePackage.exports)).not.toContain('./automation');
  });

  it('does not dispatch runtime gitlink updates for automation-only changes', () => {
    expect(parsePathFilters(runtimeNotifications, 'paths')).toEqual([]);
    expect(parsePathFilters(runtimeNotifications, 'paths-ignore')).toEqual(['automation/**']);
    expect(runtimeNotificationRunsFor('automation/actions/setup-project/action.yaml')).toBe(false);
    expect(runtimeNotificationRunsFor('src/error/get-error-message.ts')).toBe(true);
    for (const path of [
      'test/scripts/consumer-impact.test.ts',
      '.github/workflows/ci.yaml',
      'scripts/generate-design-tokens.ts',
      'tsconfig.json',
      'docs/API.md',
      'unknown.config.mjs',
    ]) {
      expect(runtimeNotificationRunsFor(path)).toBe(true);
    }
  });
});
