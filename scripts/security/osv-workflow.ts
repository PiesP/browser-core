import { spawnSync } from 'node:child_process';
import { appendFileSync, chmodSync, closeSync, fstatSync, openSync, readSync, realpathSync, statSync, unlinkSync, mkdirSync } from 'node:fs';
import { constants } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateOsvFile } from '../../automation/security/validate-osv.ts';

type Scan = 'old' | 'new' | 'full';
type Report = 'pr' | 'full';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function resultDirectory(): string {
  return join(requiredEnv('RUNNER_TEMP'), 'osv-results');
}

function removeStaleFile(path: string): void {
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

function docker(arguments_: readonly string[], output?: number): number {
  const result = spawnSync('docker', [...arguments_], {
    stdio: output === undefined ? 'inherit' : ['ignore', output, output],
  });
  return statusOf(result);
}

function scan(mode: Scan): number {
  const directory = resultDirectory();
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const resultName = mode === 'full' ? 'osv-results.json' : `${mode}-results.json`;
  const resultPath = join(directory, resultName);
  removeStaleFile(resultPath);
  const status = docker([
    'run', '--rm',
    '--env', 'GOTOOLCHAIN=auto',
    '--volume', `${requiredEnv('GITHUB_WORKSPACE')}:/src`,
    '--volume', `${directory}:/results`,
    '--workdir', '/src',
    requiredEnv('OSV_SCANNER_IMAGE'),
    '--format=json', `--output-file=/results/${resultName}`,
    '-r', '--lockfile=pnpm-lock.yaml', '.',
  ]);
  if (status > 1) {
    console.error(`OSV scanner failed before producing a result (exit ${status}).`);
    return status;
  }
  let details;
  try { details = statSync(resultPath); }
  catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    throw new Error(`OSV scanner did not create a non-empty result: ${resultPath}`);
  }
  if (!details.isFile() || details.size === 0) {
    throw new Error(`OSV scanner did not create a non-empty result: ${resultPath}`);
  }
  validateOsvFile(resultPath, 'minimal');
  return 0;
}

function reporterArguments(mode: Report, preflight: boolean, directory: string): string[] {
  const inputs = mode === 'pr'
    ? ['--old=old-results.json', '--new=new-results.json']
    : ['--new=osv-results.json'];
  const common = [
    'run', '--rm', '--entrypoint', '/root/osv-reporter',
    '--volume', `${directory}:/results`, '--workdir', '/results',
    requiredEnv('OSV_SCANNER_IMAGE'),
  ];
  if (preflight) {
    return [...common, ...inputs, '--output-files=sarif:/dev/null', '--fail-on-vuln=false'];
  }
  if (mode === 'pr') {
    return [
      ...common, ...inputs, '--output-files=sarif:osv-results.sarif',
      '--output-files=gh-annotations:#stderr', '--fail-on-vuln=true',
    ];
  }
  return [...common, '--output-files=sarif:osv-results.sarif', ...inputs, '--fail-on-vuln=true'];
}

function report(mode: Report): number {
  const directory = resultDirectory();
  const logPath = join(directory, 'reporter-validation.log');
  removeStaleFile(logPath);
  const descriptor = openSync(logPath, 'wx+', 0o600);
  let validationStatus: number;
  let log: string;
  try {
    validationStatus = docker(reporterArguments(mode, true, directory), descriptor);
    const buffer = Buffer.alloc(fstatSync(descriptor).size);
    let position = 0;
    while (position < buffer.length) {
      const count = readSync(descriptor, buffer, position, buffer.length - position, position);
      if (count === 0) throw new Error('Reporter validation log was truncated during reading.');
      position += count;
    }
    log = buffer.toString('utf8');
  }
  finally { closeSync(descriptor); }
  const noun = mode === 'pr' ? 'inputs' : 'input';
  if (validationStatus !== 0) {
    process.stderr.write(log);
    console.error(`OSV reporter failed to validate its result ${noun} (exit ${validationStatus}).`);
    return validationStatus;
  }
  if (/failed to (open|parse) (old|new) results at /u.test(log)) {
    process.stderr.write(log);
    console.error(`OSV reporter did not parse its result ${noun}.`);
    return 1;
  }
  return docker(reporterArguments(mode, false, directory));
}

function summarize(): number {
  const event = requiredEnv('EVENT_NAME');
  const pr = process.env.OSV_PR_RESULT ?? '';
  const full = process.env.OSV_FULL_RESULT ?? '';
  const codeql = process.env.CODEQL_RESULT ?? '';
  const semgrep = process.env.SEMGREP_RESULT ?? '';
  appendFileSync(requiredEnv('GITHUB_STEP_SUMMARY'), [
    '## Security scan results', '',
    '| Check | Result |', '| --- | --- |',
    `| OSV PR diff | ${pr} |`,
    `| OSV full | ${full} |`,
    `| CodeQL | ${codeql} |`,
    `| Semgrep | ${semgrep} |`,
    '',
  ].join('\n'));

  let failed = false;
  for (const [label, value] of [['CodeQL', codeql], ['Semgrep', semgrep]]) {
    if (value !== 'success') {
      console.error(`Expected ${label} to succeed for ${event}, got: ${value}`);
      failed = true;
    }
  }
  const selected = event === 'pull_request'
    ? ['OSV PR diff', pr] :
    event === 'push' || event === 'schedule' || event === 'workflow_dispatch'
      ? ['OSV full', full] : undefined;
  if (selected === undefined) {
    console.error(`Unsupported security workflow event: ${event}`);
    failed = true;
  } else if (selected[1] !== 'success') {
    console.error(`Expected ${selected[0]} to succeed for ${event}, got: ${selected[1]}`);
    failed = true;
  }
  return failed ? 1 : 0;
}

export function main(args: readonly string[]): number {
  try {
    if (args.length !== 1) throw new Error('Expected one mode: scan-old|scan-new|scan-full|report-pr|report-full|summary');
    switch (args[0]) {
      case 'scan-old': return scan('old');
      case 'scan-new': return scan('new');
      case 'scan-full': return scan('full');
      case 'report-pr': return report('pr');
      case 'report-full': return report('full');
      case 'summary': return summarize();
      default: throw new Error(`Unknown security workflow mode: ${args[0]}`);
    }
  } catch (error) {
    console.error(`security-workflow: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

function isCliEntry(): boolean {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
}

if (isCliEntry()) process.exitCode = main(process.argv.slice(2));
