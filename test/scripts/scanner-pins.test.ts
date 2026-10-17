import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vite-plus/test';

const source = resolve(import.meta.dirname, '../../automation/security/scanner-pins.ts');
const supportedRuntimes = [
  ...new Set([process.env.CORE_COMPAT_NODE_22, process.env.CORE_COMPAT_NODE_24, process.execPath]),
].filter((path): path is string => typeof path === 'string' && existsSync(path));
const roots: string[] = [];
const now = Date.parse('2026-10-17T12:00:00Z');
const pins = {
  osv: {
    version: '2.6.0',
    image: `ghcr.io/google/osv-scanner-action@sha256:${'a'.repeat(64)}`,
  },
  semgrep: {
    version: '1.178.0',
    image: `semgrep/semgrep:1.178.0@sha256:${'b'.repeat(64)}`,
  },
};

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'scanner pins cli '));
  roots.push(root);
  const trusted = join(root, 'trusted provider');
  const candidate = join(root, 'candidate checkout');
  const bin = join(root, 'bin');
  mkdirSync(trusted);
  mkdirSync(candidate);
  mkdirSync(bin);
  const helper = join(trusted, 'scanner-pins.ts');
  const metadata = join(trusted, 'pinned-tools.json');
  copyFileSync(source, helper);
  writeFileSync(metadata, JSON.stringify(pins));
  writeFileSync(join(candidate, 'pinned-tools.json'), '{}');
  const mock = join(bin, 'mock');
  writeFileSync(
    mock,
    `#!${process.execPath}
import fs from 'node:fs';
import path from 'node:path';
const file = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const scenario = process.env.SCENARIO ?? '';
fs.appendFileSync(process.env.CALLS, JSON.stringify({file, args}) + '\\n');
if (file === 'gh') {
  if (scenario === 'api-fail' && args[1].includes('google/osv-scanner')) process.exit(7);
  if (scenario === 'malformed-api') { process.stdout.write('{}'); process.exit(0); }
  const version = args[1].includes('google/osv-scanner') ? '2.6.0' : '1.178.0';
  const age = scenario === 'too-young' ? 23 : 24;
  const published_at = new Date(Number(process.env.NOW_MS) - age * 3600000).toISOString();
  const releases = [{draft:false,prerelease:false,tag_name:'v' + (scenario === 'newer' ? '9.9.9' : version),published_at}];
  process.stdout.write(JSON.stringify(releases));
} else if (file === 'curl') {
  if (args.some(arg => arg.includes('ghcr.io/token'))) {
    process.stdout.write(JSON.stringify(scenario === 'missing-token' ? {} : {token:'secret-bearer-token'}));
  } else {
    if (scenario === 'manifest-fail') {
      process.stderr.write('secret-bearer-token must not appear in diagnostics\\n');
      process.exit(7);
    }
    const digest = '${pins.osv.image.split('@')[1]}';
    if (scenario === 'duplicate-digest') process.stdout.write('Docker-Content-Digest: ' + digest + '\\r\\nDocker-Content-Digest: ' + digest + '\\r\\n');
    else if (scenario === 'missing-digest') process.stdout.write('HTTP/2 200\\r\\n');
    else process.stdout.write('Docker-Content-Digest: ' + (scenario === 'mismatch-digest' ? 'sha256:' + '0'.repeat(64) : digest) + '\\r\\n');
  }
}
`
  );
  chmodSync(mock, 0o755);
  for (const name of ['gh', 'curl']) copyFileSync(mock, join(bin, name));
  const output = join(root, 'github env');
  const calls = join(root, 'calls.jsonl');
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH ?? ''}`,
    GITHUB_ENV: output,
    GH_TOKEN: 'fixture-gh-token',
    CALLS: calls,
    NOW_MS: String(Date.now()),
  };
  function run(
    args: string[],
    options: {
      scenario?: string;
      entry?: string;
      env?: Record<string, string>;
      runtime?: string;
    } = {}
  ) {
    const result = spawnSync(
      options.runtime ?? process.execPath,
      [options.entry ?? helper, ...args],
      {
        cwd: candidate,
        encoding: 'utf8',
        env: { ...env, SCENARIO: options.scenario ?? '', ...options.env },
      }
    );
    const invoked = existsSync(calls)
      ? readFileSync(calls, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line) as { file: string; args: string[] })
      : [];
    return { result, invoked };
  }
  return { root, trusted, candidate, helper, metadata, output, env, calls, run };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('reviewed scanner pin CLI', () => {
  it('uses only the explicit metadata and writes validated images', () => {
    const f = fixture();
    writeFileSync(f.output, 'EXISTING=value\n');
    const { result, invoked } = f.run(['env', f.metadata]);
    expect(result.status, result.stderr).toBe(0);
    expect(invoked).toEqual([]);
    expect(readFileSync(f.output, 'utf8')).toBe(
      `EXISTING=value\nOSV_SCANNER_IMAGE=${pins.osv.image}\nSEMGREP_IMAGE=${pins.semgrep.image}\n`
    );
  });

  it('rejects missing, relative, malformed, and injected metadata before output or calls', () => {
    for (const value of [
      '{}',
      '{',
      JSON.stringify({ ...pins, osv: { ...pins.osv, image: `${pins.osv.image}\nINJECTED=1` } }),
    ]) {
      const f = fixture();
      writeFileSync(f.metadata, value);
      expect(f.run(['env', f.metadata]).result.status).toBe(1);
      expect(existsSync(f.output)).toBe(false);
      expect(f.run(['check', f.metadata]).invoked).toEqual([]);
    }
    const f = fixture();
    expect(f.run(['env', 'pinned-tools.json']).result.status).toBe(1);
    expect(f.run(['env']).result.status).toBe(1);
    expect(f.run(['check', f.metadata], { env: { GH_TOKEN: '' } }).result.status).toBe(1);
    expect(f.run(['env', f.metadata], { env: { GITHUB_ENV: '' } }).result.status).toBe(1);
    expect(existsSync(f.output)).toBe(false);
  });

  it('checks the release, digest, and second release independently at the 24-hour boundary', () => {
    const f = fixture();
    const invoked = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { main } from ${JSON.stringify(pathToFileURL(f.helper).href)}; process.exitCode = main(['check', ${JSON.stringify(f.metadata)}], ${now});`,
      ],
      { cwd: f.candidate, encoding: 'utf8', env: { ...f.env, NOW_MS: String(now) } }
    );
    expect(invoked.status, invoked.stderr).toBe(0);
    expect(invoked.stdout).toContain('osv-scanner 2.6.0 is current');
    const calls = readFileSync(f.calls, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { file: string; args: string[] });
    expect(calls.map((call) => call.file)).toEqual(['gh', 'curl', 'curl', 'gh']);
    expect(calls[0]!.args).toEqual(['api', 'repos/google/osv-scanner/releases?per_page=100']);
    expect(calls[3]!.args).toEqual(['api', 'repos/semgrep/semgrep/releases?per_page=100']);
    expect(calls[2]!.args).toContain('Authorization: Bearer secret-bearer-token');
  });

  it('warns for mature new versions, and fails while still checking later pins', () => {
    const update = fixture();
    const warned = update.run(['check', update.metadata], { scenario: 'newer' });
    expect(warned.result.status, warned.result.stderr).toBe(0);
    expect(warned.result.stdout).toContain('::warning title=semgrep update available::');
    const failed = fixture();
    const response = failed.run(['check', failed.metadata], { scenario: 'api-fail' });
    expect(response.result.status).toBe(1);
    expect(response.invoked.map((call) => call.file)).toEqual(['gh', 'curl', 'curl', 'gh']);
  });

  for (const scenario of [
    'too-young',
    'malformed-api',
    'missing-token',
    'missing-digest',
    'mismatch-digest',
    'duplicate-digest',
    'manifest-fail',
  ]) {
    it(`fails safely for ${scenario}`, () => {
      const f = fixture();
      const { result } = f.run(['check', f.metadata], { scenario });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('check-pinned-tools:');
      expect(`${result.stdout}${result.stderr}`).not.toContain('secret-bearer-token');
    });
  }

  it('is import-inert and executes through a symlink outside the checkout', () => {
    const f = fixture();
    const imported = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `await import(${JSON.stringify(pathToFileURL(f.helper).href)})`,
      ],
      { cwd: f.candidate, encoding: 'utf8', env: f.env }
    );
    expect(imported.status, imported.stderr).toBe(0);
    expect(existsSync(f.calls)).toBe(false);
    expect(existsSync(f.output)).toBe(false);
    const link = join(f.root, 'scanner linked.ts');
    symlinkSync(f.helper, link);
    expect(f.run(['env', f.metadata], { entry: link }).result.status).toBe(0);
  });

  it.each(supportedRuntimes)('executes and imports from private paths on %s', (runtime) => {
    const f = fixture();
    const imported = spawnSync(
      runtime,
      [
        '--input-type=module',
        '-e',
        `await import(${JSON.stringify(pathToFileURL(f.helper).href)})`,
      ],
      { cwd: f.candidate, encoding: 'utf8', env: f.env }
    );
    expect(imported.status, imported.stderr).toBe(0);
    expect(existsSync(f.output)).toBe(false);
    const link = join(f.root, 'scanner linked.ts');
    symlinkSync(f.helper, link);
    const output = f.run(['env', f.metadata], { runtime, entry: link });
    expect(output.result.status, output.result.stderr).toBe(0);
    expect(readFileSync(f.output, 'utf8')).toContain(`OSV_SCANNER_IMAGE=${pins.osv.image}\n`);
    const checked = f.run(['check', f.metadata], { runtime });
    expect(checked.result.status, checked.result.stderr).toBe(0);
  });
});
