import { execFileSync } from 'node:child_process';
import { extname } from 'node:path';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const textExtensions = new Set([
  '.css',
  '.json',
  '.md',
  '.mjs',
  '.ts',
  '.yaml',
  '.yml',
]);
export function checkFormat(): string[] {
  const textFiles: string[] = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean)
    .filter((file) => textExtensions.has(extname(file)))
    .filter(existsSync);
  const violations: string[] = [];

  for (const file of textFiles) {
    const contents = readFileSync(file, 'utf8');

    if (contents.includes('\r')) {
      violations.push(`${file}: contains CR line endings`);
    }
    if (contents.length > 0 && !contents.endsWith('\n')) {
      violations.push(`${file}: missing final newline`);
    }

    const lines = contents.split('\n');
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (line !== undefined && /[\t ]+$/.test(line)) {
        violations.push(`${file}:${index + 1}: trailing whitespace`);
      }
    }
  }
  return violations;
}

if (
  process.argv[1] && existsSync(process.argv[1]) &&
  realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
) {
  const violations = checkFormat();
  if (violations.length > 0) {
    console.error(violations.join('\n'));
    process.exitCode = 1;
  }
}
