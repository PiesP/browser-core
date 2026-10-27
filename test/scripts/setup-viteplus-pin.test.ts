import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import action from '../../automation/actions/setup-project/action.yaml?raw';

const validationStep = action
  .split('    - name: Validate the consumer Vite+ pin\n')[1]
  ?.split('    - name: Install consumer Vite+, Node and package manager\n')[0];
if (!validationStep) throw new Error('Vite+ validation step is missing');
const validationShell = [...validationStep.matchAll(/^        (.*)$/gm)]
  .map((match) => match[1])
  .join('\n');

const fixtures: string[] = [];

function validate(workspace?: string, symlink = false): ReturnType<typeof spawnSync> {
  const fixture = mkdtempSync(join(tmpdir(), 'core-vp-version-'));
  fixtures.push(fixture);
  if (workspace !== undefined) {
    if (symlink) {
      writeFileSync(join(fixture, 'target'), workspace);
      symlinkSync('target', join(fixture, 'pnpm-workspace.yaml'));
    } else {
      writeFileSync(join(fixture, 'pnpm-workspace.yaml'), workspace);
    }
  }
  return spawnSync('bash', ['-c', validationShell], {
    cwd: fixture,
    encoding: 'utf8',
  });
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe('consumer Vite+ selection before setup-vp', () => {
  it.each(['1.4.0', '1.5.2'])('accepts a consumer-owned exact catalog version: %s', (version) =>
    expect(validate(`catalog:\n  vite-plus: ${version}\n`).status).toBe(0)
  );

  it.each([
    undefined,
    'catalog:\n',
    'catalog:\n  vite-plus: latest\n',
    'catalog:\n  vite-plus: ^1.4.0\n',
  ])('rejects an absent or moving catalog pin: %s', (workspace) =>
    expect(validate(workspace).status).toBe(1)
  );

  it('rejects a symlinked catalog', () => {
    expect(validate('catalog:\n  vite-plus: 1.4.0\n', true).status).toBe(1);
  });
});
