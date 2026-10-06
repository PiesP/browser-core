import { spawnSync } from 'node:child_process';
import { appendFileSync, chmodSync, closeSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { constants } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseStrictJson } from './strict-json.ts';
import type { JsonValue } from './strict-json.ts';
import { validateOsvFile } from './validate-osv.ts';
import type { OsvProfile } from './osv-report.ts';

type Mode = 'scan-old' | 'scan-new' | 'scan-full' | 'report-pr' | 'report-full';
type Profile = Extract<OsvProfile, 'consumer' | 'overlay'>;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function removeStale(path: string): void {
  try { unlinkSync(path); }
  catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  }
}

function statusOf(result: ReturnType<typeof spawnSync>): number {
  if (result.error) {
    if ('code' in result.error && result.error.code === 'ENOENT') return 127;
    if ('code' in result.error && result.error.code === 'EACCES') return 126;
    throw result.error;
  }
  if (result.signal) return 128 + (constants.signals[result.signal] ?? 1);
  return result.status ?? 1;
}

function docker(arguments_: readonly string[], descriptor?: number): number {
  return statusOf(spawnSync('docker', [...arguments_], {
    stdio: descriptor === undefined ? 'inherit' : ['ignore', descriptor, descriptor],
  }));
}

function reporterArguments(directory: string, input: string, output: string, failOnVulnerability: boolean, old?: string): string[] {
  return [
    'run', '--rm', '--entrypoint', '/root/osv-reporter',
    '--volume', `${directory}:/results`, '--workdir', '/results',
    requiredEnv('OSV_SCANNER_IMAGE'),
    ...(old ? [`--old=${old}`] : []),
    ...(failOnVulnerability && !old ? [`--output-files=${output}`, `--new=${input}`] : [`--new=${input}`, `--output-files=${output}`]),
    ...(failOnVulnerability && old ? ['--output-files=gh-annotations:#stderr'] : []),
    `--fail-on-vuln=${failOnVulnerability}`,
  ];
}

// Keep the descriptor across child execution and reading: the child may replace
// the pathname, but cannot change which log we inspect. Always replay its bytes.
function loggedDocker(arguments_: readonly string[], path: string): { status: number; log: string } {
  removeStale(path);
  const descriptor = openSync(path, 'wx+', 0o600);
  try {
    const status = docker(arguments_, descriptor);
    const size = fstatSync(descriptor).size;
    const bytes = Buffer.alloc(size);
    let position = 0;
    while (position < size) {
      const count = readSync(descriptor, bytes, position, size - position, position);
      if (count === 0) throw new Error('OSV reporter log was truncated while reading');
      position += count;
    }
    process.stdout.write(bytes);
    return { status, log: bytes.toString('utf8') };
  } finally {
    closeSync(descriptor);
  }
}

function reporterRejectedInput(log: string): boolean {
  return /^failed to (open|parse) (old|new) results at /mu.test(log);
}

function resultDirectory(): string {
  return join(requiredEnv('RUNNER_TEMP'), 'osv-results');
}

function scan(mode: Extract<Mode, 'scan-old' | 'scan-new' | 'scan-full'>, profile: Profile): number {
  const directory = resultDirectory();
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const name = mode === 'scan-full' ? 'osv-results' : mode === 'scan-old' ? 'old-results' : 'new-results';
  const rawName = `${name}.raw.json`;
  const rawPath = join(directory, rawName);
  const normalizedPath = join(directory, `${name}.json`);
  const logPath = join(directory, `${name}.raw.reporter.log`);
  removeStale(rawPath);
  removeStale(normalizedPath);
  removeStale(logPath);
  // The policy and image come from the trusted workflow, never from the scanned checkout.
  const configPath = join(directory, 'osv-empty.toml');
  removeStale(configPath);
  writeFileSync(configPath, '', { flag: 'wx', mode: 0o600 });
  const status = docker([
    'run', '--rm', '--env', 'GOTOOLCHAIN=auto',
    '--volume', `${requiredEnv('GITHUB_WORKSPACE')}:/src`,
    '--volume', `${directory}:/results`, '--workdir', '/src',
    requiredEnv('OSV_SCANNER_IMAGE'), '--config=/results/osv-empty.toml',
    '--format=json', `--output-file=/results/${rawName}`,
    '-r', '--lockfile=pnpm-lock.yaml', '.',
  ]);
  if (status > 1) return status;
  const rawReport = loggedDocker(
    reporterArguments(directory, rawName, 'json:/dev/null', false), logPath,
  );
  if (reporterRejectedInput(rawReport.log)) {
    console.error('OSV reporter rejected the raw scanner output.');
    return 2;
  }
  if (rawReport.status !== 0) return rawReport.status;
  const details = statSync(rawPath);
  if (!details.isFile() || details.size === 0) throw new Error(`OSV scanner did not create a non-empty result: ${rawPath}`);
  validateOsvFile(rawPath, profile, normalizedPath);
  return 0;
}

function object(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateSarif(path: string, reportStatus: number): void {
  const bytes = readFileSync(path);
  const value = parseStrictJson(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
  if (!object(value) || value.version !== '2.1.0') throw new Error('reporter output is not SARIF 2.1.0');
  const runs = value.runs;
  if (!Array.isArray(runs) || runs.length !== 1) throw new Error('reporter SARIF must contain exactly one run');
  const run = runs[0];
  if (!object(run)) throw new Error('reporter SARIF run must be an object');
  const tool = run.tool;
  const driver = object(tool) ? tool.driver : undefined;
  if (!object(driver) || driver.name !== 'osv-scanner') throw new Error('reporter SARIF tool identity is invalid');
  const results = run.results;
  if (!Array.isArray(results) || !results.every(object)) throw new Error('reporter SARIF results must be an array of objects');
  if (reportStatus === 1 && results.length === 0) throw new Error('reporter failed for vulnerabilities but emitted no SARIF results');
}

function report(mode: Extract<Mode, 'report-pr' | 'report-full'>, profile: Profile): number {
  const directory = resultDirectory();
  const old = mode === 'report-pr' ? 'old-results.json' : undefined;
  const input = mode === 'report-pr' ? 'new-results.json' : 'osv-results.json';
  const sarifPath = join(directory, 'osv-results.sarif');
  const logPath = join(directory, 'osv-reporter.log');
  removeStale(sarifPath);
  removeStale(logPath);
  if (old) validateOsvFile(join(directory, old), profile);
  validateOsvFile(join(directory, input), profile);
  const result = loggedDocker(
    reporterArguments(directory, input, 'sarif:osv-results.sarif', true, old), logPath,
  );
  if (reporterRejectedInput(result.log)) {
    console.error('OSV reporter rejected an input document.');
    return 2;
  }
  if (result.status > 1) return result.status;
  validateSarif(sarifPath, result.status);
  appendFileSync(requiredEnv('GITHUB_OUTPUT'), 'sarif-upload=true\n');
  return result.status;
}

export function main(args: readonly string[]): number {
  try {
    if (args.length !== 2 || (args[1] !== 'consumer' && args[1] !== 'overlay')) {
      throw new Error('Expected MODE consumer|overlay');
    }
    const profile = args[1];
    switch (args[0]) {
      case 'scan-old': return scan('scan-old', profile);
      case 'scan-new': return scan('scan-new', profile);
      case 'scan-full': return scan('scan-full', profile);
      case 'report-pr': return report('report-pr', profile);
      case 'report-full': return report('report-full', profile);
      default: throw new Error(`Unknown consumer OSV workflow mode: ${args[0]}`);
    }
  } catch (error) {
    console.error(`consumer-osv-workflow: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

function isCliEntry(): boolean {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
}

if (isCliEntry()) process.exitCode = main(process.argv.slice(2));
