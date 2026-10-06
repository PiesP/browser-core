import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function preCommitError(branch: string): string | undefined {
  if (branch === 'master' || branch === 'main') {
    return `Direct commits on '${branch}' are blocked. Create a codex/* work branch first.`;
  }
  if (branch === '') {
    return 'Commits from a detached HEAD are blocked. Create a work branch first.';
  }
  return undefined;
}

export function prePushError(input: string): string | undefined {
  for (const line of input.split('\n')) {
    const remoteRef = line.trim().split(/\s+/)[2];
    if (remoteRef === 'refs/heads/master' || remoteRef === 'refs/heads/main') {
      return 'Direct default-branch pushes are blocked. Push a work branch and use a protected pull request.';
    }
  }
  return undefined;
}

function run(): void {
  const hook = process.argv[2];
  let error: string | undefined;
  if (hook === 'pre-commit') {
    const branch = spawnSync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).stdout?.trim() ?? '';
    error = preCommitError(branch);
  } else if (hook === 'pre-push') {
    error = prePushError(readFileSync(0, 'utf8'));
  } else {
    throw new Error(`Unknown Git hook: ${hook ?? '<missing>'}`);
  }
  if (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  run();
}
