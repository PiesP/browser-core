import { describe, expect, it } from 'vite-plus/test';

import runtimeNotifications from '../.github/workflows/notify-consumers.yaml?raw';
import ci from '../.github/workflows/ci.yaml?raw';
import action from '../automation/actions/setup-project/action.yaml?raw';
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
  it('pins Node before installing JavaScript pnpm from the consumer manifest', () => {
    expect(action).toContain('uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1');
    expect(action).toContain('uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413');
    expect(action).toContain('node-version: ${{ steps.runtime.outputs.version }}');
    expect(action).toContain('package-manager-cache: false');
    expect(action).not.toContain('package-json-file:');
    expect(action).not.toContain('package_json_file:');
    expect(ci).not.toContain('package-json-file:');
    expect(ci).not.toContain('pnpm/setup@');
    expect(ci).toContain('uses: ./automation/actions/setup-project');
    expect(ci).toContain(
      "node-version: ${{ matrix.node-version != 'manifest' && matrix.node-version || '' }}"
    );
    expect(action).toContain('node "$GITHUB_ACTION_PATH/resolve-runtime.mjs"');
    expect(action).toContain('required: false');
    expect(action).toContain('cache: true');
    expect(action).toContain('run_install: false');
    expect(action).toContain('standalone: false');
    expect(action).not.toContain('pnpm/setup@');
  });

  it('configures the pinned runtime before optional locked dependency installation', () => {
    const inputs = action.slice(action.indexOf('inputs:'), action.indexOf('\nruns:'));
    const runtimeIndex = action.indexOf('name: Resolve the manifest-pinned runtime');
    const nodeIndex = action.indexOf('name: Install the selected Node.js runtime');
    const pnpmIndex = action.indexOf('name: Install the consumer-pinned pnpm');
    const installIndex = action.indexOf('name: Install locked dependencies');
    const installStep = action.slice(installIndex);

    expect(inputs).toMatch(/  install-dependencies:\n(?:    .+\n)*    default: 'true'/);
    expect(runtimeIndex).toBeGreaterThan(-1);
    expect(nodeIndex).toBeGreaterThan(runtimeIndex);
    expect(pnpmIndex).toBeGreaterThan(nodeIndex);
    expect(installIndex).toBeGreaterThan(pnpmIndex);
    expect(action.slice(runtimeIndex, installIndex)).not.toMatch(/^\s*if:/m);
    expect(installStep).toContain("if: ${{ inputs.install-dependencies == 'true' }}");
    expect(installStep).toContain('run: pnpm install --frozen-lockfile --no-runtime');
    expect(action).not.toMatch(/^\s*run: (?:npm|yarn) install/m);
    expect(action).not.toContain('pnpm update');
  });

  it('exposes only the runtime and dependency-install inputs and no secret surface', () => {
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
