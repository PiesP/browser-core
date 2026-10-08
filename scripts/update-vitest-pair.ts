import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const pair = ['vitest', '@vitest/coverage-v8'] as const;
const releaseAgeMs = 1440 * 60 * 1000;
const metadataLimit = 32 * 1024 * 1024;
const rehearsalBase = '0f86594bad374a3db07933919053e12fef431eef';

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stableVersion(value: string): number[] | null {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(value)) return null;
  const parts = value.split('.').map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

function compareVersions(left: string, right: string): number {
  const a = stableVersion(left);
  const b = stableVersion(right);
  if (!a || !b) throw new Error('Expected stable numeric versions');
  for (let index = 0; index < 3; index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

export function selectVitestPair(
  current: string, vitest: unknown, coverage: unknown, now = Date.now(),
): string | null {
  if (!stableVersion(current) || !Number.isFinite(now)) throw new Error('Invalid current version or clock');
  const documents = [vitest, coverage].map((value, index) => {
    const root = record(value, pair[index] ?? 'package');
    if (root.name !== pair[index]) throw new Error('Registry package name differs');
    const latest = record(root['dist-tags'], 'registry distribution tags').latest;
    if (typeof latest !== 'string' || !stableVersion(latest)) throw new Error('Registry latest must be a stable numeric version');
    return {
      versions: record(root.versions, 'registry versions'),
      time: record(root.time, 'registry publication times'),
      latest,
    };
  });
  const first = documents[0];
  const second = documents[1];
  if (!first || !second) throw new Error('Both registry documents are required');
  const candidates = Object.keys(first.versions)
    .filter((version) => stableVersion(version) && compareVersions(version, current) > 0 &&
      documents.every((document) => compareVersions(version, document.latest) <= 0))
    .sort((a, b) => compareVersions(b, a));
  for (const version of candidates) {
    if (!Object.hasOwn(second.versions, version)) continue;
    const entries = documents.map((document) => {
      const entry = record(document.versions[version], 'registry version');
      const time = document.time[version];
      const published = typeof time === 'string' ? Date.parse(time) : NaN;
      if (!Number.isFinite(published)) throw new Error(`Missing publication time for ${version}`);
      return { entry, published };
    });
    if (entries.some(({ entry, published }) => entry.deprecated || published > now - releaseAgeMs)) continue;
    for (let index = 0; index < entries.length; index++) {
      const peers = record(entries[index]?.entry.peerDependencies, 'registry peer dependencies');
      if (peers[pair[1 - index] ?? ''] !== version) {
        throw new Error(`Paired ${version} releases do not declare exact mutual peers`);
      }
    }
    return version;
  }
  // An eligible one-sided release is a registry skew, not a successful no-update operation.
  for (const document of documents) {
    for (const [version, value] of Object.entries(document.versions)) {
      if (!stableVersion(version) || compareVersions(version, current) <= 0 ||
          compareVersions(version, document.latest) > 0) continue;
      const entry = record(value, 'registry version');
      const time = document.time[version];
      const published = typeof time === 'string' ? Date.parse(time) : NaN;
      if (!Number.isFinite(published)) throw new Error(`Missing publication time for ${version}`);
      if (!entry.deprecated && published <= now - releaseAgeMs) {
        throw new Error('Eligible releases exist without a compatible cooled pair; defer the update');
      }
    }
  }
  return null;
}

async function registryMetadata(name: string): Promise<unknown> {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
    signal: AbortSignal.timeout(30_000), redirect: 'error',
  });
  if (!response.ok || !response.body) throw new Error(`Registry request failed for ${name}`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > metadataLimit) throw new Error('Registry metadata exceeds its byte limit');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8')) as unknown;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function git(root: string, args: readonly string[]): string {
  const value = execFileSync('git', [...args], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  return args[0] === 'show' ? value : value.trimEnd();
}

function digest(contents: string | Buffer): string {
  return createHash('sha256').update(contents).digest('hex');
}

export function assertPairImporter(lockfile: string, version: string): void {
  const importer = lockfile.split('\npackages:\n')[0] ?? '';
  if (!importer.includes("lockfileVersion: '9.0'") || !importer.includes('\n  .:\n    devDependencies:\n')) {
    throw new Error('Unsupported root lockfile importer');
  }
  for (const name of pair) {
    const key = name.startsWith('@') ? `'${name}'` : name;
    const block = importer.split(`\n      ${key}:\n`)[1]?.split(/\n {6}(?=\S)/u)[0];
    if (!block?.startsWith(`        specifier: ^${version}\n        version: ${version}`) ||
        !['(', '\n'].includes(block[`        specifier: ^${version}\n        version: ${version}`.length] ?? '')) {
      throw new Error(`Root lockfile importer differs for ${name}`);
    }
  }
}

export interface PrepareOptions {
  readonly root: string;
  readonly output: string;
  readonly rehearsal?: boolean;
  readonly metadata?: (name: string) => Promise<unknown>;
}

export async function prepareVitestPair(options: PrepareOptions): Promise<void> {
  const root = realpathSync(options.root);
  if (git(root, ['rev-parse', '--show-toplevel']) !== root || git(root, ['status', '--porcelain'])) {
    throw new Error('Run the updater from a clean repository root');
  }
  const helperSha = git(root, ['rev-parse', 'HEAD']);
  const baseSha = options.rehearsal ? rehearsalBase : helperSha;
  git(root, ['merge-base', '--is-ancestor', baseSha, helperSha]);
  const manifestText = git(root, ['show', `${baseSha}:package.json`]);
  const manifest = record(JSON.parse(manifestText), 'package manifest');
  if (manifest.name !== '@piesp/browser-core') throw new Error('Expected the browser-core manifest');
  const dependencies = record(manifest.devDependencies, 'development dependencies');
  const specifier = dependencies.vitest;
  if (typeof specifier !== 'string' || !specifier.startsWith('^') || !stableVersion(specifier.slice(1)) ||
      dependencies['@vitest/coverage-v8'] !== specifier) {
    throw new Error('The direct Vitest pair must have identical stable caret versions');
  }
  const pnpmPin = manifest.packageManager;
  if (typeof pnpmPin !== 'string' || !/^pnpm@\d+\.\d+\.\d+$/u.test(pnpmPin)) {
    throw new Error('An exact pnpm packageManager is required');
  }
  const pnpmVersion = execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim();
  if (pnpmPin !== `pnpm@${pnpmVersion}`) throw new Error('Use the manifest-pinned pnpm version');
  const policy = git(root, ['show', `${baseSha}:pnpm-workspace.yaml`]);
  for (const requirement of [
    'strictPeerDependencies: true', 'strictDepBuilds: true', 'blockExoticSubdeps: true',
    'minimumReleaseAge: 1440', 'minimumReleaseAgeIgnoreMissingTime: false', 'trustPolicy: no-downgrade',
  ]) {
    if (!policy.split('\n').includes(requirement)) throw new Error(`Required policy differs: ${requirement}`);
  }
  assertPairImporter(git(root, ['show', `${baseSha}:pnpm-lock.yaml`]), specifier.slice(1));
  const metadata = options.metadata ?? registryMetadata;
  const documents = await Promise.all(pair.map((name) => metadata(name)));
  const selectionDocuments = options.rehearsal ? documents.map((document) => {
    const value = record(document, 'registry document');
    const versions = record(value.versions, 'registry versions');
    return { ...value, versions: { '5.0.3': versions['5.0.3'] } };
  }) : documents;
  const target = selectVitestPair(specifier.slice(1), selectionDocuments[0], selectionDocuments[1]);
  if (options.rehearsal && target !== '5.0.3') throw new Error('Historical rehearsal requires eligible 5.0.3 releases');
  const requestedOutput = resolve(options.output);
  const output = join(realpathSync(dirname(requestedOutput)), basename(requestedOutput));
  const fromRoot = relative(root, output);
  if (!fromRoot || (fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot))) {
    throw new Error('Output must be outside the source repository');
  }
  mkdirSync(output, { mode: 0o700 });
  const receipt: Record<string, unknown> = {
    schema_version: 1, status: 'preparing', mode: options.rehearsal ? 'rehearsal' : 'candidate',
    publishable: !options.rehearsal, helper_sha: helperSha, base_sha: baseSha,
    old_version: specifier.slice(1), new_version: target, node_version: process.versions.node,
    pnpm_version: pnpmVersion, policy_sha256: digest(policy),
    registry_metadata_sha256: documents.map((document) => digest(JSON.stringify(document))), commands: [],
  };
  const receiptPath = join(output, 'receipt.json');
  const save = () => writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  const commands: { argv: readonly string[]; status: string }[] = [];
  receipt.commands = commands;
  const checkout = join(output, 'checkout');
  const run = (args: readonly string[]) => {
    const log = openSync(join(output, `command-${commands.length + 1}.log`), 'wx', 0o600);
    const command = { argv: ['pnpm', ...args], status: 'running' };
    commands.push(command);
    save();
    try {
      execFileSync('pnpm', [...args], { cwd: checkout, stdio: ['ignore', log, log], timeout: 20 * 60 * 1000 });
      command.status = 'success';
    } catch (error) {
      command.status = 'failed';
      throw error;
    } finally {
      closeSync(log);
      save();
    }
  };
  try {
    if (!target) {
      receipt.status = 'no-update';
      receipt.publishable = false;
      return;
    }
    execFileSync('git', ['clone', '--quiet', '--no-hardlinks', '--no-checkout', '--', root, checkout]);
    git(checkout, ['switch', '--quiet', '-c', `codex/vitest-pair-${target}`, baseSha]);
    run(['update', '-D', `vitest@${target}`, `@vitest/coverage-v8@${target}`, '--lockfile-only', '--no-runtime']);
    const updatedText = readFileSync(join(checkout, 'package.json'), 'utf8');
    const updated = record(JSON.parse(updatedText), 'updated manifest');
    const expected = JSON.parse(manifestText) as Record<string, unknown>;
    const expectedDependencies = record(expected.devDependencies, 'expected development dependencies');
    for (const name of pair) expectedDependencies[name] = `^${target}`;
    if (JSON.stringify(updated) !== JSON.stringify(expected)) throw new Error('Unexpected manifest change');
    assertPairImporter(readFileSync(join(checkout, 'pnpm-lock.yaml'), 'utf8'), target);
    run(['--filter', '.', 'peers', 'check']);
    const lockBefore = digest(readFileSync(join(checkout, 'pnpm-lock.yaml')));
    run(['install', '--frozen-lockfile', '--no-runtime']);
    run(['verify']);
    if (digest(readFileSync(join(checkout, 'pnpm-lock.yaml'))) !== lockBefore) throw new Error('Frozen validation changed the lockfile');
    if (readFileSync(join(checkout, 'package.json'), 'utf8') !== updatedText) throw new Error('Validation changed the manifest');
    const changed = git(checkout, ['diff', '--name-only']).split('\n').sort();
    if (JSON.stringify(changed) !== JSON.stringify(['package.json', 'pnpm-lock.yaml'])) {
      throw new Error('Candidate changed files outside the dependency pair');
    }
    const patch = git(checkout, ['diff', '--binary', '--', 'package.json', 'pnpm-lock.yaml']) + '\n';
    writeFileSync(join(output, 'vitest-pair.patch'), patch, { mode: 0o600 });
    receipt.patch_sha256 = digest(patch);
    receipt.manifest_sha256 = digest(updatedText);
    receipt.lockfile_sha256 = lockBefore;
    receipt.status = 'validated';
  } catch (error) {
    receipt.status = 'failed';
    receipt.publishable = false;
    receipt.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    save();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if ((args.length !== 2 && args.length !== 3) || args[0] !== '--output' || !args[1] ||
      (args.length === 3 && args[2] !== '--rehearsal')) {
    throw new Error('Usage: node scripts/update-vitest-pair.ts --output NEW_DIRECTORY [--rehearsal]');
  }
  await prepareVitestPair({ root: process.cwd(), output: args[1], rehearsal: args[2] === '--rehearsal' });
}

if (process.argv[1] && existsSync(process.argv[1]) &&
    realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  await main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
