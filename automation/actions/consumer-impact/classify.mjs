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

function gitBlob(oid) {
  const bytes = execFileSync('git', ['-C', repository, 'cat-file', 'blob', oid], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
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

function isReviewedDevelopmentPath(path) {
  return path.startsWith('automation/') ||
    path.startsWith('test/') ||
    path.startsWith('docs/') ||
    path.startsWith('.github/') ||
    path.startsWith('scripts/') ||
    ['README.md', 'README.ko.md', 'README.ja.md', 'tsconfig.json', 'tsconfig.scripts.json', 'vitest.config.ts'].includes(path);
}

function hasExternalEntrypoint(pkg) {
  const targets = [
    pkg.exports,
    pkg.imports,
    pkg.main,
    pkg.module,
    pkg.types,
    pkg.typings,
    pkg.bin,
    pkg.browser,
    pkg.typesVersions,
  ];
  if (pkg.browser !== null && typeof pkg.browser === 'object' && !Array.isArray(pkg.browser)) {
    targets.push(...Object.keys(pkg.browser).filter((key) => key.startsWith('.')));
  }

  function outsideSource(value) {
    if (value === undefined || value === null) return false;
    if (typeof value === 'string') return !/^(?:\.\/)?src\//.test(value);
    if (Array.isArray(value)) return value.some(outsideSource);
    if (typeof value === 'object') return Object.values(value).some(outsideSource);
    return true;
  }

  return targets.some(outsideSource);
}

function hasInstallLifecycle(pkg) {
  const scripts = pkg.scripts;
  if (scripts === undefined) return false;
  if (scripts === null || typeof scripts !== 'object' || Array.isArray(scripts)) return true;
  return ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'prepublishOnly', 'prepack', 'postpack']
    .some((name) => Object.hasOwn(scripts, name));
}

function hasSourceEscape(sha) {
  const entries = git(['ls-tree', '-r', '-z', sha, '--', 'src']).split('\0').filter(Boolean);
  for (const entry of entries) {
    const match = /^(100644|100755) blob ([0-9a-f]{40,64})\t/.exec(entry);
    if (!match) return true;

    const source = gitBlob(match[2]);
    if (source.includes('\0')) return true;
    const decoded = source
      .replace(/\\(?:x([0-9a-f]{2})|u([0-9a-f]{4})|u\{([0-9a-f]+)\}|([./]))/gi,
        (_escape, hex, unicode, braced, identity) =>
          identity ?? String.fromCodePoint(parseInt(hex ?? unicode ?? braced, 16)))
      .replace(/\\(?:\r\n|[\n\r\u2028\u2029])/g, '');
    if (decoded.includes('../') || decoded.includes('\0')) return true;
  }
  return false;
}

function affectsConsumers() {
  if (!hasCommit(head)) throw new Error(`Head commit is unavailable: ${head}`);
  if (!hasCommit(base)) return true;
  try {
    git(['merge-base', '--is-ancestor', base, head]);
  } catch {
    return true;
  }

  const paths = git(['diff', '--no-ext-diff', '--no-renames', '--name-only', '-z', base, head])
    .split('\0')
    .filter(Boolean);
  if (paths.length === 0) return false;
  if (paths.some((path) => path.startsWith('src/'))) return true;
  if (paths.some((path) => !isReviewedDevelopmentPath(path) && path !== 'package.json' && path !== 'pnpm-lock.yaml')) return true;

  try {
    const previous = packageAt(base);
    const current = packageAt(head);
    if (hasContractChange(previous, current)) return true;
    if ([previous, current].some((pkg) => hasExternalEntrypoint(pkg) || hasInstallLifecycle(pkg))) return true;
    if (hasSourceEscape(base) || hasSourceEscape(head)) return true;
    return paths.includes('pnpm-lock.yaml') &&
      (hasRuntimeDependencies(previous) || hasRuntimeDependencies(current));
  } catch {
    return true;
  }
}

process.stdout.write(`${affectsConsumers()}\n`);
