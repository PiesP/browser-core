import { describe, expect, it } from 'vitest';

import runtimeNotifications from '../.github/workflows/notify-consumers.yaml?raw';
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
      'uses: pnpm/setup@84cb39b217b10273981911c288cd62326dc7c6d2',
    );
    expect(action).toContain('package-json-file: package.json');
    expect(action).toContain('runtime: "node@${{ inputs.node-version }}"');
    expect(action).toContain('cache: true');
    expect(action).toContain('install: false');
  });

  it('installs exactly the locked consumer dependency graph', () => {
    expect(action).toContain('run: pnpm install --frozen-lockfile --no-runtime');
    expect(action).not.toMatch(/^\s*run: (?:npm|yarn) install/m);
    expect(action).not.toContain('pnpm update');
  });

  it('exposes only the typed runtime-version input and no secret surface', () => {
    const inputs = action.slice(action.indexOf('inputs:'), action.indexOf('\nruns:'));
    const inputNames = [...inputs.matchAll(/^  ([a-z][a-z-]+):$/gm)].map(
      ([, name]) => name,
    );

    expect(inputNames).toEqual(['node-version']);
    expect(action).not.toContain('secrets:');
    expect(action).not.toMatch(/^  (command|path|ref|script|url):$/m);
  });
});

describe('runtime and automation release boundaries', () => {
  it('does not expose automation through the runtime package', () => {
    expect(Object.keys(runtimePackage.exports)).not.toContain('./automation');
  });

  it('does not dispatch runtime gitlink updates for automation-only changes', () => {
    expect(runtimeNotificationRunsFor('automation/actions/setup-project/action.yaml')).toBe(false);
    expect(runtimeNotificationRunsFor('src/error/get-error-message.ts')).toBe(true);
  });
});
