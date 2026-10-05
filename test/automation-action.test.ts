import { describe, expect, it } from 'vitest';

import runtimeNotifications from '../.github/workflows/notify-consumers.yaml?raw';
import ci from '../.github/workflows/ci.yaml?raw';
import action from '../automation/actions/setup-project/action.yaml?raw';
import runtimePackageJson from '../package.json?raw';

const runtimePackage = JSON.parse(runtimePackageJson) as {
  exports: Record<string, string>;
};

function parsePathFilters(workflow: string, key: 'paths' | 'paths-ignore'): string[] {
  const trigger = workflow.slice(workflow.indexOf('  push:'), workflow.indexOf('  workflow_dispatch:'));
  const block = trigger.match(new RegExp(`^    ${key}:\\n((?:      - .+\\n)+)`, 'm'))?.[1];
  if (!block) return [];

  return [...block.matchAll(/^      - ["']?(.+?)["']?$/gm)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
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
  const passesInclude = included.length === 0 || included.some((pattern) => matchesPath(path, pattern));
  const passesIgnore = !ignored.some((pattern) => matchesPath(path, pattern));
  return passesInclude && passesIgnore;
}

describe('central project setup action', () => {
  it('uses an immutable toolchain action and the consumer package manifest', () => {
    expect(action).toContain(
      'uses: pnpm/setup@703c52620218391530e48b9e8870d5c0082e1b9b',
    );
    expect(action).toContain('working-directory: .');
    expect(action).not.toContain('package-json-file:');
    expect(ci).toContain('working-directory: .');
    expect(ci).not.toContain('package-json-file:');
    expect(action).toContain('runtime: "node@${{ steps.runtime.outputs.version }}"');
    expect(action).toContain('node "$GITHUB_ACTION_PATH/resolve-runtime.mjs"');
    expect(action).toContain('required: false');
    expect(action).toContain('cache: true');
    expect(action).toContain('install: false');
  });

  it('configures the pinned runtime before optional locked dependency installation', () => {
    const inputs = action.slice(action.indexOf('inputs:'), action.indexOf('\nruns:'));
    const runtimeIndex = action.indexOf('name: Resolve the manifest-pinned runtime');
    const setupIndex = action.indexOf('name: Install pnpm and Node.js');
    const installIndex = action.indexOf('name: Install locked dependencies');
    const installStep = action.slice(installIndex);

    expect(inputs).toMatch(/  install-dependencies:\n(?:    .+\n)*    default: 'true'/);
    expect(runtimeIndex).toBeGreaterThan(-1);
    expect(setupIndex).toBeGreaterThan(runtimeIndex);
    expect(installIndex).toBeGreaterThan(setupIndex);
    expect(action.slice(runtimeIndex, installIndex)).not.toMatch(/^\s*if:/m);
    expect(installStep).toContain("if: ${{ inputs.install-dependencies == 'true' }}");
    expect(installStep).toContain('run: pnpm install --frozen-lockfile --no-runtime');
    expect(action).not.toMatch(/^\s*run: (?:npm|yarn) install/m);
    expect(action).not.toContain('pnpm update');
  });

  it('exposes only the runtime and dependency-install inputs and no secret surface', () => {
    const inputs = action.slice(action.indexOf('inputs:'), action.indexOf('\nruns:'));
    const inputNames = [...inputs.matchAll(/^  ([a-z][a-z-]+):$/gm)].map(
      ([, name]) => name,
    );

    expect(inputNames).toEqual(['node-version', 'install-dependencies']);
    expect(action).not.toContain('secrets:');
    expect(action).not.toMatch(/^  (command|path|ref|script|url):$/m);
  });

  it('requires the consumer smoke job alongside both existing runtime lanes', () => {
    expect(ci).toContain('node-version: [22, manifest]');
    expect(ci).toContain('needs: [quality, setup-smoke]');
    expect(ci).toContain('uses: ./.setup-action/automation/actions/setup-project');
    expect(ci).toContain("install-dependencies: 'false'");
    expect(ci).toContain('sha256sum --check fixture.sha256');
    expect(ci).toContain('test ! -e node_modules');
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
      'scripts/check-format.ts',
      'tsconfig.json',
      'docs/API.md',
      'unknown.config.mjs',
    ]) {
      expect(runtimeNotificationRunsFor(path)).toBe(true);
    }
  });
});
