import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(
  repositoryRoot,
  'src/design/quiet-instruments.tokens.json',
);
const generatedDirectory = resolve(repositoryRoot, 'src/design/generated');
const generatedTypeScriptPath = resolve(generatedDirectory, 'tokens.ts');
const generatedCssPath = resolve(generatedDirectory, 'tokens.css');
const checkOnly = process.argv.includes('--check');

const extensionName = 'org.piesp.quiet-instruments';
const aliasPattern = /^\{([^{}]+)\}$/;
const tokenTypeNames = [
  'color',
  'cubicBezier',
  'dimension',
  'duration',
  'fontFamily',
  'fontWeight',
  'number',
  'shadow',
] as const;
type TokenType = (typeof tokenTypeNames)[number];
const tokenTypes: ReadonlySet<string> = new Set(tokenTypeNames);
const semanticColorRoles = [
  'canvas',
  'surface',
  'raised',
  'text',
  'muted',
  'border',
  'focus',
  'success',
  'warning',
  'danger',
  'info',
] as const;
const genericFontFamilies: ReadonlySet<string> = new Set([
  'cursive',
  'emoji',
  'fangsong',
  'fantasy',
  'math',
  'monospace',
  'sans-serif',
  'serif',
  'system-ui',
  'ui-monospace',
  'ui-rounded',
  'ui-sans-serif',
  'ui-serif',
]);

interface DimensionValue {
  readonly value: number;
  readonly unit: 'px' | 'rem';
}

interface DurationValue {
  readonly value: number;
  readonly unit: 'ms' | 's';
}

interface ColorValue {
  readonly components: readonly [number, number, number];
  readonly alpha: number | undefined;
  readonly hex: string;
}

interface ShadowValue {
  readonly color: ColorValue;
  readonly offsetX: DimensionValue;
  readonly offsetY: DimensionValue;
  readonly blur: DimensionValue;
  readonly spread: DimensionValue;
}

type ResolvedToken =
  | { readonly type: 'color'; readonly value: ColorValue }
  | {
      readonly type: 'cubicBezier';
      readonly value: readonly [number, number, number, number];
    }
  | { readonly type: 'dimension'; readonly value: DimensionValue }
  | { readonly type: 'duration'; readonly value: DurationValue }
  | {
      readonly type: 'fontFamily';
      readonly value: string | readonly string[];
    }
  | { readonly type: 'fontWeight'; readonly value: number }
  | { readonly type: 'number'; readonly value: number }
  | { readonly type: 'shadow'; readonly value: ShadowValue };

type ParsedTokenValue =
  | { readonly kind: 'alias'; readonly targetPath: string }
  | { readonly kind: 'concrete'; readonly token: ResolvedToken };

interface CollectedToken {
  readonly type: TokenType;
  readonly parsed: ParsedTokenValue;
}

interface DesignExtension {
  readonly family: 'Quiet Instruments';
  readonly version: string;
  readonly specVersion: '2025.10';
  readonly themes: readonly ['light', 'dark'];
  readonly products: readonly [string, ...string[]];
  readonly contrastPairs: unknown;
}

function fail(message: string): never {
  throw new Error(`Design token validation failed: ${message}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isTokenType(value: unknown): value is TokenType {
  return typeof value === 'string' && tokenTypes.has(value);
}

function validateName(name: string, parentPath: string): void {
  assert(name.length > 0, `empty token name below ${parentPath || '<root>'}`);
  assert(!name.startsWith('$'), `${parentPath}.${name} starts with "$"`);
  assert(
    !/[.{}]/.test(name),
    `${parentPath}.${name} contains a reserved character`,
  );
}

function parseDimension(value: unknown, path: string): DimensionValue {
  assert(isRecord(value), `${path} must be a dimension object`);
  assert(isFiniteNumber(value.value), `${path}.value must be finite`);
  assert(
    value.unit === 'px' || value.unit === 'rem',
    `${path}.unit must be "px" or "rem"`,
  );
  return { value: value.value, unit: value.unit };
}

function parseColor(value: unknown, path: string): ColorValue {
  assert(isRecord(value), `${path} must be a color object`);
  assert(value.colorSpace === 'srgb', `${path} must use the sRGB color space`);
  assert(
    isUnknownArray(value.components) && value.components.length === 3,
    `${path}.components must contain three channels`,
  );

  const [red, green, blue] = value.components;
  for (const component of [red, green, blue]) {
    assert(
      isFiniteNumber(component) && component >= 0 && component <= 1,
      `${path}.components must be finite values from 0 to 1`,
    );
  }
  assert(
    isFiniteNumber(red) && isFiniteNumber(green) && isFiniteNumber(blue),
    `${path}.components must be finite values from 0 to 1`,
  );
  const components: readonly [number, number, number] = [red, green, blue];

  const computedHex = `#${components
    .map((component) => Math.round(component * 255).toString(16).padStart(2, '0'))
    .join('')}`;
  if (value.hex !== undefined) {
    assert(
      typeof value.hex === 'string' && /^#[0-9a-f]{6}$/.test(value.hex),
      `${path}.hex must be a lowercase six-digit hex color`,
    );
    assert(
      value.hex === computedHex,
      `${path}.hex does not match its sRGB components`,
    );
  }

  if (value.alpha !== undefined) {
    assert(
      isFiniteNumber(value.alpha) && value.alpha >= 0 && value.alpha <= 1,
      `${path}.alpha must be a finite value from 0 to 1`,
    );
  }

  return {
    components: [red, green, blue],
    alpha: value.alpha,
    hex: computedHex,
  };
}

function parseTokenValue(
  type: TokenType,
  value: unknown,
  path: string,
): ParsedTokenValue {
  const aliasMatch =
    typeof value === 'string' ? aliasPattern.exec(value) : null;
  if (aliasMatch) {
    const targetPath = aliasMatch[1];
    assert(targetPath !== undefined, `${path} has an invalid alias`);
    return { kind: 'alias', targetPath };
  }

  switch (type) {
    case 'color':
      return { kind: 'concrete', token: { type, value: parseColor(value, path) } };
    case 'cubicBezier': {
      assert(
        isUnknownArray(value) &&
          value.length === 4 &&
          value.every(isFiniteNumber),
        `${path} must contain four finite cubic-bezier values`,
      );
      const [first, second, third, fourth] = value;
      assert(
        isFiniteNumber(first) &&
          isFiniteNumber(second) &&
          isFiniteNumber(third) &&
          isFiniteNumber(fourth),
        `${path} must contain four finite cubic-bezier values`,
      );
      assert(
        first >= 0 && first <= 1 && third >= 0 && third <= 1,
        `${path} cubic-bezier x coordinates must be from 0 to 1`,
      );
      return {
        kind: 'concrete',
        token: { type, value: [first, second, third, fourth] },
      };
    }
    case 'dimension':
      return {
        kind: 'concrete',
        token: { type, value: parseDimension(value, path) },
      };
    case 'duration': {
      assert(isRecord(value), `${path} must be a duration object`);
      assert(
        isFiniteNumber(value.value) && value.value >= 0,
        `${path}.value must be finite and non-negative`,
      );
      assert(
        value.unit === 'ms' || value.unit === 's',
        `${path}.unit must be "ms" or "s"`,
      );
      return {
        kind: 'concrete',
        token: { type, value: { value: value.value, unit: value.unit } },
      };
    }
    case 'fontFamily': {
      assert(
        (typeof value === 'string' && value.length > 0) ||
          (isUnknownArray(value) &&
            value.length > 0 &&
            value.every((item) => typeof item === 'string' && item.length > 0)),
        `${path} must be a font family or a non-empty font family list`,
      );
      if (typeof value === 'string') {
        return { kind: 'concrete', token: { type, value } };
      }
      const families = value.map((family) => {
        assert(
          typeof family === 'string' && family.length > 0,
          `${path} must be a font family or a non-empty font family list`,
        );
        return family;
      });
      return { kind: 'concrete', token: { type, value: families } };
    }
    case 'fontWeight':
      assert(
        isFiniteNumber(value) && value >= 1 && value <= 1000,
        `${path} must be a font weight from 1 to 1000`,
      );
      return { kind: 'concrete', token: { type, value } };
    case 'number':
      assert(isFiniteNumber(value), `${path} must be a finite number`);
      return { kind: 'concrete', token: { type, value } };
    case 'shadow': {
      assert(isRecord(value), `${path} must be a shadow object`);
      const color = parseColor(value.color, `${path}.color`);
      const offsetX = parseDimension(value.offsetX, `${path}.offsetX`);
      const offsetY = parseDimension(value.offsetY, `${path}.offsetY`);
      const blur = parseDimension(value.blur, `${path}.blur`);
      const spread = parseDimension(value.spread, `${path}.spread`);
      assert(blur.value >= 0, `${path}.blur must be non-negative`);
      return {
        kind: 'concrete',
        token: {
          type,
          value: { color, offsetX, offsetY, blur, spread },
        },
      };
    }
  }
}

function collectTokens(
  document: Record<string, unknown>,
): Map<string, CollectedToken> {
  const tokens = new Map<string, CollectedToken>();

  function visit(
    node: unknown,
    path: readonly string[],
    inheritedType: TokenType | undefined,
  ): void {
    const pathLabel = path.join('.');
    assert(isRecord(node), `${pathLabel || '<root>'} must be an object`);

    const ownType: unknown = node.$type;
    let effectiveType = inheritedType;
    if (ownType !== undefined) {
      assert(
        isTokenType(ownType),
        `${pathLabel || '<root>'} has unsupported $type`,
      );
      effectiveType = ownType;
    }

    if (Object.hasOwn(node, '$value')) {
      assert(path.length > 0, 'the document root cannot be a token');
      assert(effectiveType !== undefined, `${pathLabel} has no $type`);
      for (const key of Object.keys(node)) {
        assert(
          key.startsWith('$'),
          `${pathLabel} cannot contain child "${key}" beside $value`,
        );
      }
      tokens.set(pathLabel, {
        type: effectiveType,
        parsed: parseTokenValue(effectiveType, node.$value, pathLabel),
      });
      return;
    }

    for (const [name, child] of Object.entries(node)) {
      if (name.startsWith('$')) continue;
      validateName(name, pathLabel);
      visit(child, [...path, name], effectiveType);
    }
  }

  visit(document, [], undefined);
  assert(tokens.size > 0, 'the source contains no tokens');
  return tokens;
}

function resolveTokens(
  tokens: ReadonlyMap<string, CollectedToken>,
): Map<string, ResolvedToken> {
  const resolved = new Map<string, ResolvedToken>();

  function resolveToken(
    path: string,
    stack: readonly string[] = [],
  ): ResolvedToken {
    const existing = resolved.get(path);
    if (existing) return existing;

    const token = tokens.get(path);
    assert(token, `alias points to missing token "${path}"`);
    assert(!stack.includes(path), `alias cycle: ${[...stack, path].join(' -> ')}`);

    if (token.parsed.kind === 'concrete') {
      resolved.set(path, token.parsed.token);
      return token.parsed.token;
    }

    const targetPath = token.parsed.targetPath;
    const target = tokens.get(targetPath);
    assert(target, `${path} points to missing token "${targetPath}"`);
    assert(
      token.type === target.type,
      `${path} (${token.type}) aliases ${targetPath} (${target.type})`,
    );
    const value = resolveToken(targetPath, [...stack, path]);
    resolved.set(path, value);
    return value;
  }

  for (const path of tokens.keys()) resolveToken(path);
  return resolved;
}

function getExtension(document: Record<string, unknown>): DesignExtension {
  const extensions = document.$extensions;
  assert(isRecord(extensions), 'the document requires $extensions');
  const extension = extensions[extensionName];
  assert(isRecord(extension), `the document requires ${extensionName} metadata`);
  assert(extension.family === 'Quiet Instruments', 'unexpected design family');
  assert(
    typeof extension.version === 'string' && /^\d+\.\d+\.\d+$/.test(extension.version),
    'the design family version must be semantic',
  );
  assert(extension.specVersion === '2025.10', 'unexpected DTCG spec version');
  assert(
    isUnknownArray(extension.themes) &&
      extension.themes.length === 2 &&
      extension.themes[0] === 'light' &&
      extension.themes[1] === 'dark',
    'themes must be light and dark',
  );
  assert(
    isUnknownArray(extension.products) &&
      extension.products.length > 0 &&
      extension.products.every(
        (product) => typeof product === 'string' && product.length > 0,
      ),
    'products must be a non-empty string list',
  );
  const [firstProduct, ...remainingProducts] = extension.products;
  assert(
    typeof firstProduct === 'string' && firstProduct.length > 0,
    'products must be a non-empty string list',
  );
  const products = remainingProducts.map((product) => {
    assert(
      typeof product === 'string' && product.length > 0,
      'products must be a non-empty string list',
    );
    return product;
  });
  return {
    family: extension.family,
    version: extension.version,
    specVersion: extension.specVersion,
    themes: ['light', 'dark'],
    products: [firstProduct, ...products],
    contrastPairs: extension.contrastPairs,
  };
}

function colorLuminance(value: ColorValue): number {
  const [red, green, blue] = value.components.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  assert(
    red !== undefined && green !== undefined && blue !== undefined,
    'color luminance requires three channels',
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function validateFoundation(
  extension: DesignExtension,
  resolved: ReadonlyMap<string, ResolvedToken>,
): void {
  for (const group of ['reference', 'system', 'component', 'product']) {
    assert(
      [...resolved.keys()].some((path) => path.startsWith(`${group}.`)),
      `missing required ${group} token group`,
    );
  }

  for (const theme of extension.themes) {
    for (const role of semanticColorRoles) {
      assert(
        resolved.has(`system.${theme}.color.${role}`),
        `missing ${theme} semantic color "${role}"`,
      );
    }
  }

  for (const product of extension.products) {
    for (const role of [
      'accent-light',
      'on-accent-light',
      'accent-dark',
      'on-accent-dark',
    ]) {
      assert(resolved.has(`product.${product}.${role}`), `missing ${product}.${role}`);
    }
  }

  assert(
    isUnknownArray(extension.contrastPairs) && extension.contrastPairs.length > 0,
    'contrastPairs must be a non-empty list',
  );
  for (const [index, pair] of extension.contrastPairs.entries()) {
    assert(isRecord(pair), `contrastPairs[${index}] must be an object`);
    assert(
      typeof pair.foreground === 'string' && typeof pair.background === 'string',
      `contrastPairs[${index}] must name foreground and background tokens`,
    );
    assert(
      isFiniteNumber(pair.minimum) && pair.minimum >= 1 && pair.minimum <= 21,
      `contrastPairs[${index}].minimum must be from 1 to 21`,
    );
    const foreground = resolved.get(pair.foreground);
    const background = resolved.get(pair.background);
    assert(foreground, `missing contrast foreground "${pair.foreground}"`);
    assert(background, `missing contrast background "${pair.background}"`);
    assert(foreground.type === 'color', `${pair.foreground} is not a color`);
    assert(background.type === 'color', `${pair.background} is not a color`);
    const foregroundLuminance = colorLuminance(
      foreground.value,
    );
    const backgroundLuminance = colorLuminance(
      background.value,
    );
    const lighter = Math.max(foregroundLuminance, backgroundLuminance);
    const darker = Math.min(foregroundLuminance, backgroundLuminance);
    const ratio = (lighter + 0.05) / (darker + 0.05);
    assert(
      ratio + Number.EPSILON >= pair.minimum,
      `${pair.foreground} on ${pair.background} has ${ratio.toFixed(2)}:1 contrast; expected ${pair.minimum}:1`,
    );
  }
}

function dimensionToCss(value: DimensionValue | DurationValue): string {
  return `${value.value}${value.unit}`;
}

function colorToCss(value: ColorValue): string {
  const hex = value.hex;
  const alpha = value.alpha ?? 1;
  if (alpha === 1) return hex;
  const channels = value.components.map((channel) => Math.round(channel * 255));
  return `rgb(${channels.join(' ')} / ${alpha})`;
}

function fontFamilyToCss(value: string | readonly string[]): string {
  const families = typeof value === 'string' ? [value] : value;
  return families
    .map((family) =>
      genericFontFamilies.has(family)
        ? family
        : `"${family.replaceAll('"', '\\"')}"`,
    )
    .join(', ');
}

function tokenToCss(token: ResolvedToken): string {
  switch (token.type) {
    case 'color':
      return colorToCss(token.value);
    case 'cubicBezier':
      return `cubic-bezier(${token.value.join(', ')})`;
    case 'dimension':
    case 'duration':
      return dimensionToCss(token.value);
    case 'fontFamily':
      return fontFamilyToCss(token.value);
    case 'fontWeight':
    case 'number':
      return String(token.value);
    case 'shadow':
      return [
        dimensionToCss(token.value.offsetX),
        dimensionToCss(token.value.offsetY),
        dimensionToCss(token.value.blur),
        dimensionToCss(token.value.spread),
        colorToCss(token.value.color),
      ].join(' ');
  }
}

function cssVariableForPath(path: string): string {
  return `--pp-${path.replaceAll('.', '-')}`;
}

function generateTypeScript(
  extension: DesignExtension,
  resolved: ReadonlyMap<string, ResolvedToken>,
): string {
  const tokenValues: Record<string, string> = {};
  const cssVariables: Record<string, string> = {};
  for (const [path, token] of resolved) {
    tokenValues[path] = tokenToCss(token);
    cssVariables[path] = cssVariableForPath(path);
  }

  return `// Generated by scripts/generate-design-tokens.ts. Do not edit.\n\nexport const DESIGN_FAMILY = ${JSON.stringify(
    {
      name: extension.family,
      version: extension.version,
      specVersion: extension.specVersion,
    },
    null,
    2,
  )} as const;\n\nexport const DESIGN_THEMES = ${JSON.stringify(extension.themes)} as const;\n\nexport const DESIGN_PRODUCTS = ${JSON.stringify(extension.products)} as const;\n\nexport const QUIET_INSTRUMENTS_TOKENS = ${JSON.stringify(tokenValues, null, 2)} as const;\n\nexport const QUIET_INSTRUMENTS_CSS_VARIABLES = ${JSON.stringify(cssVariables, null, 2)} as const;\n\nexport type DesignTheme = (typeof DESIGN_THEMES)[number];\nexport type DesignProduct = (typeof DESIGN_PRODUCTS)[number];\nexport type QuietInstrumentsTokenPath = keyof typeof QUIET_INSTRUMENTS_TOKENS;\n`;
}

function semanticDeclarations(theme: 'light' | 'dark'): string[] {
  return semanticColorRoles.map(
    (role) =>
      `  --pp-color-${role}: var(--pp-system-${theme}-color-${role});`,
  );
}

function resolvedTokenAt(
  resolved: ReadonlyMap<string, ResolvedToken>,
  path: string,
): ResolvedToken {
  const token = resolved.get(path);
  assert(token !== undefined, `missing resolved token "${path}"`);
  return token;
}

function productDeclarations(
  product: string,
  resolved: ReadonlyMap<string, ResolvedToken>,
): string[] {
  return [
    `  --pp-product-accent-light: ${tokenToCss(resolvedTokenAt(resolved, `product.${product}.accent-light`))};`,
    `  --pp-product-on-accent-light: ${tokenToCss(resolvedTokenAt(resolved, `product.${product}.on-accent-light`))};`,
    `  --pp-product-accent-dark: ${tokenToCss(resolvedTokenAt(resolved, `product.${product}.accent-dark`))};`,
    `  --pp-product-on-accent-dark: ${tokenToCss(resolvedTokenAt(resolved, `product.${product}.on-accent-dark`))};`,
  ];
}

function generateCss(
  extension: DesignExtension,
  resolved: ReadonlyMap<string, ResolvedToken>,
): string {
  const rawDeclarations = [...resolved.entries()].map(
    ([path, token]) =>
      `  ${cssVariableForPath(path)}: ${tokenToCss(token)};`,
  );
  const defaultProduct = extension.products[0];
  const productBlocks = extension.products
    .map(
      (product) =>
        `.pp-design[data-pp-product='${product}'] {\n${productDeclarations(product, resolved).join('\n')}\n}`,
    )
    .join('\n\n');
  const darkDeclarations = [
    '  color-scheme: dark;',
    ...semanticDeclarations('dark'),
    '  --pp-color-accent: var(--pp-product-accent-dark);',
    '  --pp-color-on-accent: var(--pp-product-on-accent-dark);',
  ].join('\n');

  return `/* Generated by scripts/generate-design-tokens.ts. Do not edit. */

/* Custom properties are intentionally scoped to avoid host-page collisions. */
.pp-design {
  color-scheme: light;
${rawDeclarations.join('\n')}
${productDeclarations(defaultProduct, resolved).join('\n')}
${semanticDeclarations('light').join('\n')}
  --pp-color-accent: var(--pp-product-accent-light);
  --pp-color-on-accent: var(--pp-product-on-accent-light);
}

${productBlocks}

.pp-design[data-pp-theme='dark'] {
${darkDeclarations}
}

@media (prefers-color-scheme: dark) {
  .pp-design[data-pp-theme='auto'] {
${darkDeclarations
  .split('\n')
  .map((line) => `  ${line}`)
  .join('\n')}
  }
}

@media (prefers-reduced-motion: reduce) {
  .pp-design {
    --pp-component-motion-duration-fast: 0ms;
    --pp-component-motion-duration-standard: 0ms;
    --pp-component-motion-duration-deliberate: 0ms;
  }
}

@media (forced-colors: active) {
  .pp-design,
  .pp-design[data-pp-theme] {
    --pp-color-canvas: Canvas;
    --pp-color-surface: Canvas;
    --pp-color-raised: Canvas;
    --pp-color-text: CanvasText;
    --pp-color-muted: GrayText;
    --pp-color-border: CanvasText;
    --pp-color-focus: Highlight;
    --pp-color-success: CanvasText;
    --pp-color-warning: CanvasText;
    --pp-color-danger: CanvasText;
    --pp-color-info: CanvasText;
    --pp-color-accent: Highlight;
    --pp-color-on-accent: HighlightText;
  }
}
`;
}

function validateGeneratedCss(css: string, extension: DesignExtension): void {
  assert(
    !/(^|[\n,]\s*):root(?:\s|[,\{])/.test(css),
    'generated CSS must not target :root',
  );
  assert(
    !/(^|[\n,]\s*)html(?:\s|[,\{])/.test(css),
    'generated CSS must not target html',
  );
  assert(
    css.includes('@media (prefers-reduced-motion: reduce)'),
    'generated CSS requires a reduced-motion override',
  );
  assert(
    css.includes('@media (forced-colors: active)'),
    'generated CSS requires a forced-colors override',
  );
  assert(
    css.includes(
      ".pp-design,\n  .pp-design[data-pp-theme] {\n    --pp-color-canvas: Canvas;",
    ),
    'forced-colors declarations must override theme-scoped declarations',
  );
  for (const product of extension.products) {
    assert(
      css.includes(`.pp-design[data-pp-product='${product}']`),
      `generated CSS is missing the ${product} product scope`,
    );
  }
}

function checkOrWrite(path: string, contents: string): void {
  if (!checkOnly) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
    return;
  }

  let existing: string;
  try {
    existing = readFileSync(path, 'utf8');
  } catch {
    fail(`${path.slice(repositoryRoot.length + 1)} is missing; run pnpm generate:design`);
  }
  assert(
    existing === contents,
    `${path.slice(repositoryRoot.length + 1)} is stale; run pnpm generate:design`,
  );
}

try {
  const document: unknown = JSON.parse(readFileSync(sourcePath, 'utf8'));
  assert(isRecord(document), 'the source root must be an object');
  const extension = getExtension(document);
  const tokens = collectTokens(document);
  const resolved = resolveTokens(tokens);
  validateFoundation(extension, resolved);
  const generatedTypeScript = generateTypeScript(extension, resolved);
  const generatedCss = generateCss(extension, resolved);
  validateGeneratedCss(generatedCss, extension);
  checkOrWrite(generatedTypeScriptPath, generatedTypeScript);
  checkOrWrite(generatedCssPath, generatedCss);
  console.log(
    checkOnly
      ? `Design tokens are valid and current (${resolved.size} tokens).`
      : `Generated ${resolved.size} design tokens.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
