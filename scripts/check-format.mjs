import { execFileSync } from 'node:child_process';
import { extname } from 'node:path';
import { readFileSync } from 'node:fs';

const textExtensions = new Set([
  '.json',
  '.md',
  '.mjs',
  '.ts',
  '.yaml',
  '.yml',
]);
const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean)
  .filter((file) => textExtensions.has(extname(file)));
const violations = [];

for (const file of trackedFiles) {
  const contents = readFileSync(file, 'utf8');

  if (contents.includes('\r')) {
    violations.push(`${file}: contains CR line endings`);
  }
  if (contents.length > 0 && !contents.endsWith('\n')) {
    violations.push(`${file}: missing final newline`);
  }

  const lines = contents.split('\n');
  for (let index = 0; index < lines.length; index++) {
    if (/[\t ]+$/.test(lines[index])) {
      violations.push(`${file}:${index + 1}: trailing whitespace`);
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
}
