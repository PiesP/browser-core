import { appendFileSync, chmodSync, closeSync, lstatSync, mkdtempSync, openSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceNames = [
  'consumer-workflow.ts',
  'strict-json.ts',
  'osv-report.ts',
  'validate-osv.ts',
] as const;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function main(args: readonly string[]): number {
  let destination: string | undefined;
  try {
    if (args.length !== 0) throw new Error('Expected no arguments');
    const runnerTemp = requiredEnv('RUNNER_TEMP');
    const githubOutput = requiredEnv('GITHUB_OUTPUT');
    const sourceDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'security');
    destination = mkdtempSync(join(runnerTemp, 'consumer-osv-helper-'));
    chmodSync(destination, 0o700);
    for (const name of sourceNames) {
      const source = join(sourceDirectory, name);
      if (!lstatSync(source).isFile()) throw new Error(`Provider OSV source is not a regular file: ${name}`);
      const bytes = readFileSync(source);
      const output = openSync(join(destination, name), 'wx', 0o600);
      try { writeFileSync(output, bytes); }
      finally { closeSync(output); }
      chmodSync(join(destination, name), 0o600);
    }
    appendFileSync(githubOutput, `helper-path=${join(destination, sourceNames[0])}\n`);
    destination = undefined; // Success transfers temporary-directory ownership to the caller.
    return 0;
  } catch (error) {
    console.error(`prepare-osv-helper: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    if (destination !== undefined) rmSync(destination, { recursive: true, force: true });
  }
}

function isCliEntry(): boolean {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
}

if (isCliEntry()) process.exitCode = main(process.argv.slice(2));
