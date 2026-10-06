import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { validateOsvReport } from '../../automation/security/osv-report.ts';
import type { OsvProfile } from '../../automation/security/osv-report.ts';
import { parseStrictJson } from '../../automation/security/strict-json.ts';

const script = resolve(import.meta.dirname, '../../automation/security/validate-osv.ts');
const fixtures: string[] = [];
const finding = {
  results: [{
    source: { type: 'lockfile', path: '/src/pnpm-lock.yaml' },
    packages: [{
      package: { ecosystem: 'npm', name: 'example', version: '1.0.0' },
      vulnerabilities: [{ id: 'GHSA-example' }],
      groups: [{ ids: ['GHSA-example'], aliases: [] }],
    }],
  }],
};

function fixture(raw: string | Uint8Array = JSON.stringify(finding)) {
  const root = mkdtempSync(join(tmpdir(), 'core osv cli '));
  fixtures.push(root);
  const input = join(root, 'raw scan.json');
  const output = join(root, 'validated scan.json');
  writeFileSync(input, raw);
  return { root, input, output };
}

function run(input: string, output?: string, profile: OsvProfile = 'consumer') {
  return spawnSync(process.execPath, [script, '--input', input,
    ...(output === undefined ? [] : ['--output', output]), '--profile', profile], {
    encoding: 'utf8',
  });
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('strict JSON parser', () => {
  it.each(['', ' ', '{', 'null true', '{"results":[],}', '[1,]', '+1', '01', '1.', '1e', 'NaN', 'Infinity', '-Infinity', '\uFEFF{}']) (
    'rejects malformed JSON %j', (raw) => expect(() => parseStrictJson(raw)).toThrow(),
  );
  it.each(['{"results":[],"results":[]}', '{"a":{"same":1,"s\\u0061me":2}}']) (
    'rejects duplicate decoded keys %s', (raw) => expect(() => parseStrictJson(raw)).toThrow(/duplicate key/),
  );
  it('preserves huge integer precision and handles special object keys without prototype mutation', () => {
    const raw = '{"__proto__":{"safe":true},"constructor":1,"integer":9007199254740993123456789}';
    const parsed = parseStrictJson(raw);
    expect(parsed).toHaveProperty('integer', 9007199254740993123456789n);
    expect(parsed).toHaveProperty('__proto__', { safe: true });
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    expect(Object.hasOwn(Object.prototype, 'safe')).toBe(false);
  });
  it('accepts Unicode, escaped separators and finite floats', () => {
    const raw = '{"text":"한글 😀 \\" \\u0061", "values":[null,true,false,-0,-2,1.5,1e-400]}';
    expect(parseStrictJson(raw)).toEqual(JSON.parse(raw));
  });
  it.each(['1e400', '-1e400', '9'.repeat(4301)])('rejects out-of-contract numeric input', (raw) => {
    expect(() => parseStrictJson(raw)).toThrow();
  });
});

describe('OSV schema profiles', () => {
  it('keeps the core shallow schema distinct from the consumer schema', () => {
    const report = parseStrictJson('{"results":[{"source":{},"packages":[]}]}');
    expect(validateOsvReport(report, 'minimal')).toEqual(report);
    expect(() => validateOsvReport(report, 'consumer')).toThrow(/source.type/);
  });
  it('keeps overlay optional vulnerability metadata checks separate', () => {
    const report = structuredClone(finding);
    Object.assign(report.results[0]?.packages[0]?.vulnerabilities[0] ?? {}, { severity: 42 });
    const value = parseStrictJson(JSON.stringify(report));
    expect(validateOsvReport(value, 'consumer')).toEqual(value);
    expect(() => validateOsvReport(value, 'overlay')).toThrow(/severity/);
  });
  it.each([
    { package: null, vulnerabilities: [], groups: [] },
    { package: { name: '' }, vulnerabilities: [], groups: [] },
    { package: { version: 1 }, vulnerabilities: [], groups: [] },
    { package: {}, vulnerabilities: null, groups: [] },
    { package: {}, vulnerabilities: [null], groups: [] },
    { package: {}, vulnerabilities: [{ id: '' }], groups: [] },
    { package: {}, vulnerabilities: [], groups: null },
    { package: {}, vulnerabilities: [], groups: [null] },
    { package: {}, vulnerabilities: [], groups: [{ ids: [] }] },
    { package: {}, vulnerabilities: [], groups: [{ ids: ['valid', 2] }] },
    { package: {}, vulnerabilities: [], groups: [{ ids: ['valid'], aliases: [null] }] },
  ])('rejects malformed nested package records %j', (packageResult) => {
    const raw = JSON.stringify({ results: [finding.results[0], {
      source: { type: 'lockfile', path: 'x' }, packages: [packageResult],
    }] });
    const { input, output } = fixture(raw);
    expect(run(input, output).status).toBe(2);
    expect(existsSync(output)).toBe(false);
  });
  it.each([
    ...['modified', 'published', 'withdrawn', 'summary', 'details', 'schema_version'].map((key) => [key, 1]),
    ...['aliases', 'related', 'affected', 'references', 'severity', 'credits'].map((key) => [key, {}]),
    ...['database_specific', 'ecosystem_specific'].map((key) => [key, []]),
  ])('preserves the overlay-only optional metadata constraint for %s', (key, value) => {
    if (typeof key !== 'string') throw new TypeError('Fixture key must be a string');
    const report = structuredClone(finding);
    Object.assign(report.results[0]?.packages[0]?.vulnerabilities[0] ?? {}, { [key]: value });
    const { input, output } = fixture(JSON.stringify(report));
    expect(run(input, output, 'consumer').status).toBe(0);
    expect(run(input, output, 'overlay').status).toBe(2);
    expect(existsSync(output)).toBe(false);
  });
});

describe('dependency-free OSV CLI', () => {
  it.each(['consumer', 'overlay', 'minimal'] as const)('validates findings with profile %s without filtering', (profile) => {
    const { input, output } = fixture();
    const result = run(input, output, profile);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe('');
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual(finding);
    if (process.platform !== 'win32') expect(statSync(output).mode & 0o777).toBe(0o600);
  });
  it('preserves unknown metadata integer lexemes exactly', () => {
    const raw = '{"results":[],"future":{"integer":9007199254740993123456789,"float":1.234567890123456789}}';
    const { input, output } = fixture(raw);
    const result = run(input, output);
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(output, 'utf8')).toBe(`${raw}\n`);
  });
  it('preserves consumer findings with nullable aliases and unknown metadata', () => {
    const report = {
      results: [{
        source: { type: 'lockfile', path: '/src/pnpm-lock.yaml' },
        packages: [{
          package: { ecosystem: 'npm', name: 'example', version: '1.0.0' },
          vulnerabilities: [{ id: 'GHSA-example', summary: 'retained' }],
          groups: [{ ids: ['GHSA-example'], aliases: null }],
        }],
      }],
      extra_metadata: { retained: true },
    };
    const { input, output } = fixture(JSON.stringify(report));
    const result = run(input, output);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual(report);
  });
  it('supports check-only without touching input or other files', () => {
    const { root, input } = fixture();
    const before = readFileSync(input);
    expect(run(input).status).toBe(0);
    expect(readFileSync(input)).toEqual(before);
    expect(readdirSync(root)).toEqual(['raw scan.json']);
  });
  it('applies consumer serialization checks in check-only mode', () => {
    const { input } = fixture('{"results":[],"future":"\\ud800"}');
    expect(run(input).status).toBe(2);
    expect(run(input, undefined, 'overlay').status).toBe(2);
    expect(run(input, undefined, 'minimal').status).toBe(0);
  });
  it.each([
    '', '{', '[]', '{}', '{"results":null}', '{"results":{}}', '{"results":[null]}',
    '{"results":[{"packages":[]}]}',
    '{"results":[{"source":{"type":"lockfile","path":"/src/a"},"packages":[{"package":{},"vulnerabilities":{},"groups":[]}]}]}',
    '{"results":[{"source":{"type":"lockfile","path":"/src/a"},"packages":[{"package":{},"vulnerabilities":[{}],"groups":[]}]}]}',
    '{"results":[{"source":{"type":"lockfile","path":"/src/a"},"packages":[{"package":{},"vulnerabilities":[],"groups":[{"ids":["x"],"aliases":42}]}]}]}',
    '{"results":[],"results":[]}', '{"results":[],"metric":NaN}',
    '{"results":[],"metric":1e400}',
    '{"results":[{"source":{},"packages":[]}]}',
    '{"results":[{"source":{"type":"lockfile","path":"x"},"packages":{}}]}',
    '{"results":[],"future":"\\ud800"}',
  ])('removes stale output on invalid input %j', (raw) => {
    const { root, input, output } = fixture(raw);
    writeFileSync(output, 'stale successful report');
    const result = run(input, output);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(existsSync(output)).toBe(false);
    expect(readdirSync(root)).toEqual(['raw scan.json']);
  });
  it('rejects invalid UTF-8 and a BOM without producing output', () => {
    for (const raw of [new Uint8Array([0xff]), new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d])]) {
      const { input, output } = fixture(raw);
      expect(run(input, output).status).toBe(2);
      expect(existsSync(output)).toBe(false);
    }
  });
  it.each(['same', 'relative', 'hardlink', 'symlink', 'parent symlink']) (
    'rejects input/output alias %s before deleting either', (kind) => {
      const { root, input, output } = fixture();
      let destination = output;
      if (kind === 'same') destination = input;
      else if (kind === 'relative') destination = join(root, '.', 'raw scan.json');
      else if (kind === 'hardlink') linkSync(input, output);
      else if (kind === 'symlink') symlinkSync(input, output);
      else {
        symlinkSync(root, join(root, 'parent alias'), 'dir');
        destination = join(root, 'parent alias', 'raw scan.json');
      }
      const before = readFileSync(input);
      const result = run(input, destination);
      expect(result.status, result.stderr).toBe(2);
      expect(readFileSync(input)).toEqual(before);
      expect(readFileSync(destination)).toEqual(before);
    },
  );
  it('removes a stale output symlink without modifying its unrelated target', () => {
    const { root, input, output } = fixture('{');
    const target = join(root, 'unrelated');
    writeFileSync(target, 'retain');
    symlinkSync(target, output);
    expect(run(input, output).status).toBe(2);
    expect(existsSync(output)).toBe(false);
    expect(readFileSync(target, 'utf8')).toBe('retain');
  });
  it('fails on missing input, missing output parent, or an output directory', () => {
    const { root, input, output } = fixture();
    writeFileSync(output, 'stale');
    expect(run(join(root, 'missing'), output).status).toBe(2);
    expect(existsSync(output)).toBe(false);
    expect(run(input, join(root, 'missing', 'result')).status).toBe(2);
    mkdirSync(output);
    expect(run(input, output).status).toBe(2);
    expect(readdirSync(root).sort()).toEqual(['raw scan.json', 'validated scan.json']);
  });
  it('imports ordinary helpers without starting a CLI or creating files', () => {
    const { root } = fixture();
    const before = readdirSync(root);
    const result = execFileSync(process.execPath, ['--input-type=module', '-e',
      `await import(${JSON.stringify(new URL('../../automation/security/validate-osv.ts', import.meta.url).href)})`], {
      cwd: root, encoding: 'utf8',
    });
    expect(result).toBe('');
    expect(readdirSync(root)).toEqual(before);
  });
  it('executes the validation CLI when invoked through a symlink', () => {
    const { root, input, output } = fixture();
    const entry = join(root, 'validator link.ts');
    symlinkSync(script, entry);
    const result = spawnSync(process.execPath, [entry, '--input', input, '--output', output], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual(finding);
  });
});
