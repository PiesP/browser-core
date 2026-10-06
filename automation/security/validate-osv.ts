import { closeSync, openSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateOsvReport } from './osv-report.ts';
import type { OsvProfile } from './osv-report.ts';
import { parseStrictJson } from './strict-json.ts';
import type { JsonValue } from './strict-json.ts';

function canonical(path: string): string {
  try { return realpathSync(path); }
  catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    const parent = dirname(resolve(path));
    if (parent === resolve(path)) return parent;
    return join(canonical(parent), basename(resolve(path)));
  }
}

function sameFile(first: string, second: string): boolean {
  if (canonical(first) === canonical(second)) return true;
  try {
    const a = statSync(first, { bigint: true });
    const b = statSync(second, { bigint: true });
    return a.dev === b.dev && a.ino === b.ino;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

function removeOutput(path: string): void {
  try { unlinkSync(path); }
  catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  }
}

function requireWritableStrings(value: JsonValue): void {
  if (typeof value === 'string') {
    // Python's ensure_ascii=False writer rejects isolated UTF-16 surrogates.
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) {
      throw new TypeError('JSON contains an isolated Unicode surrogate');
    }
  } else if (Array.isArray(value)) {
    for (const item of value) requireWritableStrings(item);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      requireWritableStrings(key);
      requireWritableStrings(item);
    }
  }
}

export function validateOsvFile(input: string, profile: OsvProfile, output?: string): void {
  if (output !== undefined) {
    if (sameFile(input, output)) throw new TypeError('output must differ from input');
    removeOutput(output);
  }
  const bytes = readFileSync(input);
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const document = validateOsvReport(parseStrictJson(text), profile);
  if (profile !== 'minimal' || output !== undefined) requireWritableStrings(document);
  if (output === undefined) return;
  const temporary = join(dirname(output), `.${basename(output)}.${randomUUID()}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    // Re-serializing through Number would round valid unknown integer metadata.
    // The strict parser has checked the entire document, so retain its lexemes.
    writeFileSync(descriptor, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, output);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    removeOutput(temporary);
  }
}

export function main(args: readonly string[]): number {
  try {
    let input: string | undefined;
    let output: string | undefined;
    let profile: OsvProfile = 'consumer';
    for (let index = 0; index < args.length; index += 2) {
      const flag = args[index];
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) throw new TypeError(`Missing value for ${flag}`);
      if (flag === '--input') input = value;
      else if (flag === '--output') output = value;
      else if (flag === '--profile' && (value === 'minimal' || value === 'consumer' || value === 'overlay')) profile = value;
      else throw new TypeError(`Unknown argument: ${flag}`);
    }
    if (!input) throw new TypeError('Expected --input PATH [--output PATH] [--profile minimal|consumer|overlay]');
    validateOsvFile(input, profile, output);
    return 0;
  } catch (error) {
    console.error(`validate-osv-results: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

function isCliEntry(): boolean {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); }
  catch { return false; }
}

if (isCliEntry()) {
  process.exitCode = main(process.argv.slice(2));
}
