import { appendFileSync, readFileSync } from 'node:fs';

// The override is reserved for compatibility jobs. Product builds use the
// consumer's existing exact pin rather than a moving major or a second file.
const override = process.env.NODE_VERSION_OVERRIDE ?? '';
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const version = override || manifest.volta?.node;
const pattern = override ? /^\d+(?:\.\d+){0,2}$/ : /^\d+\.\d+\.\d+$/;
if (typeof version !== 'string' || !pattern.test(version)) {
  throw new Error('Expected an exact volta.node pin or a numeric compatibility override');
}
if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required');
appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
