import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const checkFormatScript = resolve(repositoryRoot, 'scripts/check-format.ts');
const generateDesignTokensScript = resolve(
  repositoryRoot,
  'scripts/generate-design-tokens.ts',
);
const sourceTokens = resolve(
  repositoryRoot,
  'src/design/quiet-instruments.tokens.json',
);
const fixtureDirectories: string[] = [];

interface ScriptResult {
  readonly status: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

function createFixtureRepository(): string {
  const fixture = mkdtempSync(join(tmpdir(), 'browser-core-tooling-'));
  fixtureDirectories.push(fixture);
  execFileSync('git', ['init', '--quiet'], { cwd: fixture });
  return fixture;
}

function runScript(
  script: string,
  cwd: string,
  arguments_: readonly string[] = [],
): ScriptResult {
  const result = spawnSync(process.execPath, [script, ...arguments_], {
    cwd,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

function createDesignFixture(): string {
  const fixture = createFixtureRepository();
  const fixtureScript = join(fixture, 'scripts/generate-design-tokens.ts');
  const fixtureTokens = join(
    fixture,
    'src/design/quiet-instruments.tokens.json',
  );
  mkdirSync(dirname(fixtureScript), { recursive: true });
  mkdirSync(dirname(fixtureTokens), { recursive: true });
  copyFileSync(generateDesignTokensScript, fixtureScript);
  copyFileSync(sourceTokens, fixtureTokens);
  return fixture;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordAt(root: unknown, path: readonly string[]): Record<string, unknown> {
  let current = root;
  for (const segment of path) {
    if (!isRecord(current)) {
      throw new TypeError(`${path.join('.')} is not an object path`);
    }
    current = current[segment];
  }
  if (!isRecord(current)) {
    throw new TypeError(`${path.join('.')} is not an object`);
  }
  return current;
}

function mutateFixtureTokens(
  fixture: string,
  mutate: (document: Record<string, unknown>) => void,
): void {
  const path = join(fixture, 'src/design/quiet-instruments.tokens.json');
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isRecord(parsed)) throw new TypeError('fixture root must be an object');
  mutate(parsed);
  writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`);
}

afterEach(() => {
  for (const fixture of fixtureDirectories.splice(0)) {
    rmSync(fixture, { recursive: true, force: true });
  }
});

describe('format checker CLI', () => {
  test('reports each observable text hygiene violation', () => {
    const fixture = createFixtureRepository();
    writeFileSync(join(fixture, 'tracked.ts'), 'const value = 1;\r\n');
    writeFileSync(join(fixture, 'untracked.json'), '{"value": 1} ');
    execFileSync('git', ['add', 'tracked.ts'], { cwd: fixture });

    const result = runScript(checkFormatScript, fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('tracked.ts: contains CR line endings');
    expect(result.stderr).toContain('untracked.json: missing final newline');
    expect(result.stderr).toContain('untracked.json:1: trailing whitespace');
  });

  test('accepts clean files and ignores deleted tracked files', () => {
    const fixture = createFixtureRepository();
    writeFileSync(join(fixture, 'clean.ts'), 'export const clean = true;\n');
    writeFileSync(join(fixture, 'deleted.md'), 'tracked before deletion\n');
    execFileSync('git', ['add', 'deleted.md'], { cwd: fixture });
    unlinkSync(join(fixture, 'deleted.md'));

    const result = runScript(checkFormatScript, fixture);

    expect(result).toEqual({ status: 0, stderr: '', stdout: '' });
  });
});

describe('design token generator CLI', () => {
  test('generates known token values and accepts its current output', () => {
    const fixture = createDesignFixture();

    const generated = runScript(
      join(fixture, 'scripts/generate-design-tokens.ts'),
      fixture,
    );
    const generatedTypeScript = readFileSync(
      join(fixture, 'src/design/generated/tokens.ts'),
      'utf8',
    );
    const generatedCss = readFileSync(
      join(fixture, 'src/design/generated/tokens.css'),
      'utf8',
    );
    const checked = runScript(
      join(fixture, 'scripts/generate-design-tokens.ts'),
      fixture,
      ['--check'],
    );

    expect(generated).toEqual({
      status: 0,
      stderr: '',
      stdout: 'Generated 109 design tokens.\n',
    });
    expect(generatedTypeScript).toContain(
      '"system.light.color.canvas": "#f7f8fa"',
    );
    expect(generatedCss).toContain(
      '  --pp-system-light-color-canvas: #f7f8fa;',
    );
    expect(generatedCss).toContain(".pp-design[data-pp-theme='dark']");
    expect(checked).toEqual({
      status: 0,
      stderr: '',
      stdout: 'Design tokens are valid and current (109 tokens).\n',
    });
  });

  test('rejects generated output that is stale', () => {
    const fixture = createDesignFixture();
    const fixtureScript = join(fixture, 'scripts/generate-design-tokens.ts');
    expect(runScript(fixtureScript, fixture).status).toBe(0);
    writeFileSync(
      join(fixture, 'src/design/generated/tokens.ts'),
      '// stale output\n',
    );

    const result = runScript(fixtureScript, fixture, ['--check']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'src/design/generated/tokens.ts is stale; run pnpm generate:design',
    );
  });

  test('rejects alias cycles with the complete cycle path', () => {
    const fixture = createDesignFixture();
    mutateFixtureTokens(fixture, (document) => {
      recordAt(document, ['system', 'light', 'color', 'canvas']).$value =
        '{system.light.color.surface}';
      recordAt(document, ['system', 'light', 'color', 'surface']).$value =
        '{system.light.color.canvas}';
    });

    const result = runScript(
      join(fixture, 'scripts/generate-design-tokens.ts'),
      fixture,
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'alias cycle: system.light.color.canvas -> system.light.color.surface -> system.light.color.canvas',
    );
  });

  test('rejects malformed color channels', () => {
    const fixture = createDesignFixture();
    mutateFixtureTokens(fixture, (document) => {
      const value = recordAt(document, [
        'reference',
        'color',
        'light-canvas',
        '$value',
      ]);
      if (!Array.isArray(value.components)) {
        throw new TypeError('fixture color components must be an array');
      }
      value.components[0] = 2;
    });

    const result = runScript(
      join(fixture, 'scripts/generate-design-tokens.ts'),
      fixture,
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'reference.color.light-canvas.components must be finite values from 0 to 1',
    );
  });
});
