import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import action from '../../automation/actions/setup-project/action.yaml?raw';

const validationStep = action
  .split('    - name: Validate the consumer runtime pin\n')[1]
  ?.split('    - name: Install consumer Vite+, Node and package manager\n')[0];
if (!validationStep) throw new Error('Runtime validation step is missing');
const validationShell = [...validationStep.matchAll(/^        (.*)$/gm)]
  .map((match) => match[1])
  .join('\n');

const fixtures: string[] = [];

function validate(pin?: string, override = '', symlink = false): ReturnType<typeof spawnSync> {
  const fixture = mkdtempSync(join(tmpdir(), 'core-vp-runtime-'));
  fixtures.push(fixture);
  if (pin !== undefined) {
    if (symlink) {
      writeFileSync(join(fixture, 'target'), pin);
      symlinkSync('target', join(fixture, '.node-version'));
    } else {
      writeFileSync(join(fixture, '.node-version'), pin);
    }
  }
  return spawnSync('bash', ['-c', validationShell], {
    cwd: fixture,
    encoding: 'utf8',
    env: { ...process.env, NODE_VERSION_OVERRIDE: override },
  });
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe('consumer runtime selection before setup-vp', () => {
  it('accepts an exact official pin', () => {
    expect(validate('24.22.1\n').status).toBe(0);
  });

  it.each([undefined, '24', 'latest\n', '24.22.1\nextra\n'])(
    'rejects an absent or non-exact official pin: %s',
    (pin) => expect(validate(pin).status).toBe(1)
  );

  it('rejects a symlinked runtime pin', () => {
    expect(validate('24.22.1\n', '', true).status).toBe(1);
  });

  it('permits only numeric compatibility overrides without the official pin', () => {
    expect(validate(undefined, '22').status).toBe(0);
    expect(validate(undefined, '22.23.4').status).toBe(0);
    expect(validate(undefined, 'latest').status).toBe(1);
    expect(validate(undefined, '22\nextra').status).toBe(1);
  });
});
