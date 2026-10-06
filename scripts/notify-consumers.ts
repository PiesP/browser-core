import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function ghApi(arguments_: readonly string[], input?: string): string {
  return execFileSync('gh', ['api', ...arguments_], {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'inherit'],
  }).replace(/\n+$/u, '');
}

function validateRevision(): void {
  const coreSha = process.env.CORE_SHA ?? '';
  const repository = process.env.CORE_REPOSITORY ?? '';
  if (!/^[0-9a-f]{40}$/.test(coreSha)) {
    throw new Error('core_sha must be a 40-character lowercase commit SHA');
  }

  const resolvedSha = ghApi([`/repos/${repository}/commits/${coreSha}`, '--jq', '.sha']);
  if (resolvedSha !== coreSha) {
    throw new Error('core_sha does not resolve to the requested commit');
  }

  const compareStatus = ghApi([
    `/repos/${repository}/compare/${coreSha}...master`, '--jq', '.status',
  ]);
  if (compareStatus !== 'ahead' && compareStatus !== 'identical') {
    throw new Error(
      `core_sha must be reachable from browser-core master (status: ${compareStatus})`,
    );
  }

  appendFileSync(process.env.GITHUB_OUTPUT ?? '', `core_sha=${coreSha}\n`);
}

function dispatchUpdate(): void {
  const repository = process.env.CONSUMER_REPOSITORY ?? '';
  const payload = {
    event_type: 'browser-core-updated',
    client_payload: {
      core_repository: process.env.CORE_REPOSITORY ?? '',
      core_sha: process.env.CORE_SHA ?? '',
    },
  };
  ghApi(
    ['--method', 'POST', `/repos/${repository}/dispatches`, '--input', '-'],
    `${JSON.stringify(payload, null, 2)}\n`,
  );
}

function run(): void {
  const command = process.argv[2];
  try {
    if (command === 'validate') validateRevision();
    else if (command === 'dispatch') dispatchUpdate();
    else throw new Error(`Unknown notification command: ${command ?? '<missing>'}`);
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
    process.exitCode = typeof status === 'number' && status > 0 ? status : 1;
  }
}

if (
  process.argv[1] && existsSync(process.argv[1]) &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  run();
}
