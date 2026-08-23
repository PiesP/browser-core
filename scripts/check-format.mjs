import { execFileSync } from 'node:child_process';
import { extname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const textExtensions = new Set([
  '.css',
  '.json',
  '.md',
  '.mjs',
  '.ts',
  '.yaml',
  '.yml',
]);
const textFiles = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean)
  .filter((file) => textExtensions.has(extname(file)))
  .filter(existsSync);
const violations = [];

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
    if (/[\t ]+$/.test(lines[index])) {
      violations.push(`${file}:${index + 1}: trailing whitespace`);
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
}
