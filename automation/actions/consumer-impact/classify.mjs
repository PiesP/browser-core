import { execFileSync } from 'node:child_process';

const [repository, base, head] = process.argv.slice(2);
const shaPattern = /^[0-9a-f]{40}$/;

if (!repository || !shaPattern.test(base ?? '') || !shaPattern.test(head ?? '')) {
  throw new Error('Expected repository path, base SHA, and head SHA (40 lowercase hex characters)');
}

function git(args) {
  return execFileSync('git', ['-C', repository, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function hasCommit(sha) {
  try {
    git(['cat-file', '-e', `${sha}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function packageAt(sha) {
  const value = JSON.parse(git(['show', `${sha}:package.json`]));
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('Invalid browser-core package.json');
  }
  return value;
}

function hasRuntimeDependencies(pkg) {
  return ['dependencies', 'peerDependencies', 'optionalDependencies', 'bundledDependencies', 'bundleDependencies'].some(
    (field) => pkg[field] !== undefined &&
      (typeof pkg[field] !== 'object' || pkg[field] === null || Object.keys(pkg[field]).length > 0),
  );
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasContractChange(previous, current) {
  const developmentFields = new Set(['devDependencies', 'volta', 'packageManager']);
  return [...new Set([...Object.keys(previous), ...Object.keys(current)])].some(
    (field) => !developmentFields.has(field) && !sameValue(previous[field], current[field]),
  );
}

function affectsConsumers() {
  if (!hasCommit(head)) throw new Error(`Head commit is unavailable: ${head}`);
  if (!hasCommit(base)) return true;
  try {
    git(['merge-base', '--is-ancestor', base, head]);
  } catch {
    return true;
  }

  const paths = git(['diff', '--no-ext-diff', '--name-only', '-z', base, head])
    .split('\0')
    .filter(Boolean);
  if (paths.length === 0) return false;
  if (paths.some((path) => path.startsWith('src/'))) return true;
  if (paths.some((path) => !path.startsWith('automation/') && path !== 'package.json' && path !== 'pnpm-lock.yaml')) return true;

  if (!paths.includes('package.json') && !paths.includes('pnpm-lock.yaml')) return false;
  try {
    const previous = packageAt(base);
    const current = packageAt(head);
    if (hasContractChange(previous, current)) return true;
    return paths.includes('pnpm-lock.yaml') &&
      (hasRuntimeDependencies(previous) || hasRuntimeDependencies(current));
  } catch {
    return true;
  }
}

process.stdout.write(`${affectsConsumers()}\n`);
