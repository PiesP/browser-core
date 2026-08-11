import { describe, expect, it } from 'vitest';

import runtimeNotifications from '../.github/workflows/notify-consumers.yaml?raw';
import action from '../automation/actions/setup-project/action.yaml?raw';
import runtimePackageJson from '../package.json?raw';

const runtimePackage = JSON.parse(runtimePackageJson) as {
  exports: Record<string, string>;
};

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
    expect(action).toContain('run: pnpm install --frozen-lockfile');
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
    expect(runtimeNotifications).not.toContain('automation/**');
    expect(runtimeNotifications).toContain('- "src/**"');
  });
});
