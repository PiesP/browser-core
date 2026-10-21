import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import action from '../../automation/actions/prepare-node-trust/action.yaml?raw';

const source = readFileSync(
  resolve(import.meta.dirname, '../../automation/actions/prepare-node-trust/prepare.sh'),
  'utf8'
);
const roots: string[] = [];

function fixture(id: string, release: string) {
  const root = mkdtempSync(join(tmpdir(), 'node-trust-'));
  roots.push(root);
  const osRelease = join(root, 'os-release');
  const script = join(root, 'prepare.sh');
  writeFileSync(osRelease, `ID=${id}\nVERSION_ID=${release}\n`);
  writeFileSync(script, source.replaceAll('/etc/os-release', osRelease));
  writeFileSync(join(root, 'ca-version'), 'old');
  writeFileSync(join(root, 'bundle-version'), 'old');

  function command(name: string, body: string) {
    const path = join(root, name);
    writeFileSync(path, `#!/bin/sh\nset -eu\n${body}\n`);
    chmodSync(path, 0o755);
  }
  command('id', 'test "$1" = -u; printf "%s\\n" "${MOCK_UID:-0}"');
  command('dpkg-query', 'cat "$MOCK_ROOT/ca-version"');
  command('dpkg', '[ "$1" = --compare-versions ] && [ "$2" = 20260816ubuntu0.24.04.1 ]');
  command(
    'apt-get',
    'printf "%s\\n" "$*" >> "$MOCK_ROOT/commands"; if [ "$1" = install ] && [ "${MOCK_KEEP_OLD:-0}" != 1 ]; then printf 20260816ubuntu0.24.04.1 > "$MOCK_ROOT/ca-version"; fi'
  );
  command(
    'apk',
    `case "$1" in
  info)
    package=$3
    case "$package" in
      ca-certificates) package_file="$MOCK_ROOT/ca-version" ;;
      ca-certificates-bundle) package_file="$MOCK_ROOT/bundle-version" ;;
      *) exit 1 ;;
    esac
    [ -f "$package_file" ] || exit 1
    version=$(cat "$package_file")
    [ "$2" = -e ] || printf '%s-%s\\n' "$package" "$version"
    ;;
  version) [ "$3" = 20261020-r0 ]; if [ "$2" = old ]; then printf '<\\n'; else printf '=\\n'; fi ;;
  add)
    printf '%s\\n' "$*" >> "$MOCK_ROOT/commands"
    if [ "$MOCK_KEEP_OLD" != 1 ]; then
      printf 20261020-r0 > "$MOCK_ROOT/ca-version"
      printf 20261020-r0 > "$MOCK_ROOT/bundle-version"
    fi
    ;;
  *) exit 1 ;;
esac`
  );
  const {
    NODE_EXTRA_CA_CERTS: _extra,
    NODE_TLS_REJECT_UNAUTHORIZED: _insecure,
    ...safeEnv
  } = process.env;
  const env = {
    ...safeEnv,
    PATH: `${root}:${process.env.PATH}`,
    MOCK_ROOT: root,
    MOCK_KEEP_OLD: '0',
    NODE_OPTIONS: '--use-openssl-ca',
    SSL_CERT_FILE: '/etc/ssl/certs/ca-certificates.crt',
    SSL_CERT_DIR: '/etc/ssl/certs',
  };
  function run(override: Record<string, string> = {}) {
    return spawnSync('sh', [script], { env: { ...env, ...override }, encoding: 'utf8' });
  }
  function commands() {
    return readFileSync(join(root, 'commands'), 'utf8').trim().split('\n');
  }
  return { root, run, commands };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('prepare Node trust action', () => {
  it('is a shell-only action with no checkout, runtime, package-manager, or input step', () => {
    expect(action).toContain('using: composite');
    expect(action).toContain('shell: sh');
    expect(action).toContain('sh "$GITHUB_ACTION_PATH/prepare.sh"');
    expect(action).not.toMatch(
      /(?:^|\n)(?:inputs|outputs|permissions):|\buses:|node |pnpm|npm|checkout/u
    );
  });

  it('fails before package mutation on unsupported OS or a TLS override', () => {
    const unsupported = fixture('debian', '12');
    const result = unsupported.run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Only Ubuntu 24.04 and Alpine 3.23');
    const overridden = fixture('ubuntu', '24.04');
    const extra = overridden.run({ NODE_EXTRA_CA_CERTS: '/tmp/extra.pem' });
    expect(extra.status).toBe(1);
    expect(extra.stderr).toContain('NODE_EXTRA_CA_CERTS overrides');
    expect(() => overridden.commands()).toThrow();
  });

  it('updates only the Ubuntu certificate package and verifies its resulting version', () => {
    const f = fixture('ubuntu', '24.04');
    const result = f.run();
    expect(result.status, result.stderr).toBe(0);
    expect(f.commands()).toEqual(['update -qq', 'install -y --only-upgrade ca-certificates']);
    expect(result.stdout).toContain('ca-certificates=20260816ubuntu0.24.04.1');
    const current = f.run();
    expect(current.status, current.stderr).toBe(0);
    expect(f.commands()).toHaveLength(2);
    const stale = fixture('ubuntu', '24.04');
    expect(stale.run({ MOCK_KEEP_OLD: '1' }).stderr).toContain('below 20260816ubuntu0.24.04.1');
  });

  it('updates both Alpine certificate packages and rejects a package left below the floor', () => {
    const f = fixture('alpine', '3.23.3');
    const result = f.run();
    expect(result.status, result.stderr).toBe(0);
    expect(f.commands()).toEqual([
      'add --upgrade --no-cache ca-certificates ca-certificates-bundle',
    ]);
    expect(result.stdout).toContain('ca-certificates-bundle=20261020-r0');
    const nonroot = fixture('alpine', '3.23.3');
    expect(nonroot.run({ MOCK_UID: '1000' }).stderr).toContain('Root is required');
    expect(() => nonroot.commands()).toThrow();
    const stale = fixture('alpine', '3.23.3');
    expect(stale.run({ MOCK_KEEP_OLD: '1' }).stderr).toContain('below 20261020-r0');
  });

  it('installs the missing Alpine certificate package when the image contains only the bundle', () => {
    const f = fixture('alpine', '3.23.3');
    unlinkSync(join(f.root, 'ca-version'));
    const result = f.run();
    expect(result.status, result.stderr).toBe(0);
    expect(f.commands()).toEqual([
      'add --upgrade --no-cache ca-certificates ca-certificates-bundle',
    ]);
    expect(result.stdout).toContain('ca-certificates=20261020-r0');
    const unavailable = fixture('alpine', '3.23.3');
    unlinkSync(join(unavailable.root, 'ca-version'));
    expect(unavailable.run({ MOCK_KEEP_OLD: '1' }).stderr).toContain(
      'Alpine ca-certificates is missing'
    );
  });
});
