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
const tokenTypes = new Set([
  'color',
  'cubicBezier',
  'dimension',
  'duration',
  'fontFamily',
  'fontWeight',
  'number',
  'shadow',
]);
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
];
const genericFontFamilies = new Set([
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

function fail(message) {
  throw new Error(`Design token validation failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateName(name, parentPath) {
  assert(name.length > 0, `empty token name below ${parentPath || '<root>'}`);
  assert(!name.startsWith('$'), `${parentPath}.${name} starts with "$"`);
  assert(
    !/[.{}]/.test(name),
    `${parentPath}.${name} contains a reserved character`,
  );
}

function validateDimension(value, path) {
  assert(isRecord(value), `${path} must be a dimension object`);
  assert(isFiniteNumber(value.value), `${path}.value must be finite`);
  assert(
    value.unit === 'px' || value.unit === 'rem',
    `${path}.unit must be "px" or "rem"`,
  );
}

function colorToHex(value, path) {
  assert(isRecord(value), `${path} must be a color object`);
  assert(value.colorSpace === 'srgb', `${path} must use the sRGB color space`);
  assert(
    Array.isArray(value.components) && value.components.length === 3,
    `${path}.components must contain three channels`,
  );

  const components = value.components;
  for (const component of components) {
    assert(
      isFiniteNumber(component) && component >= 0 && component <= 1,
      `${path}.components must be finite values from 0 to 1`,
    );
  }

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

  return computedHex;
}

function validateTokenValue(type, value, path) {
  if (typeof value === 'string' && aliasPattern.test(value)) return;

  switch (type) {
    case 'color':
      colorToHex(value, path);
      return;
    case 'cubicBezier':
      assert(
        Array.isArray(value) &&
          value.length === 4 &&
          value.every(isFiniteNumber),
        `${path} must contain four finite cubic-bezier values`,
      );
      assert(
        value[0] >= 0 && value[0] <= 1 && value[2] >= 0 && value[2] <= 1,
        `${path} cubic-bezier x coordinates must be from 0 to 1`,
      );
      return;
    case 'dimension':
      validateDimension(value, path);
      return;
    case 'duration':
      assert(isRecord(value), `${path} must be a duration object`);
      assert(
        isFiniteNumber(value.value) && value.value >= 0,
        `${path}.value must be finite and non-negative`,
      );
      assert(
        value.unit === 'ms' || value.unit === 's',
        `${path}.unit must be "ms" or "s"`,
      );
      return;
    case 'fontFamily':
      assert(
        (typeof value === 'string' && value.length > 0) ||
          (Array.isArray(value) &&
            value.length > 0 &&
            value.every((item) => typeof item === 'string' && item.length > 0)),
        `${path} must be a font family or a non-empty font family list`,
      );
      return;
    case 'fontWeight':
      assert(
        isFiniteNumber(value) && value >= 1 && value <= 1000,
        `${path} must be a font weight from 1 to 1000`,
      );
      return;
    case 'number':
      assert(isFiniteNumber(value), `${path} must be a finite number`);
      return;
    case 'shadow': {
      assert(isRecord(value), `${path} must be a shadow object`);
      colorToHex(value.color, `${path}.color`);
      validateDimension(value.offsetX, `${path}.offsetX`);
      validateDimension(value.offsetY, `${path}.offsetY`);
      validateDimension(value.blur, `${path}.blur`);
      validateDimension(value.spread, `${path}.spread`);
      assert(value.blur.value >= 0, `${path}.blur must be non-negative`);
      return;
    }
    default:
      fail(`${path} uses unsupported type "${type}"`);
  }
}

function collectTokens(document) {
  const tokens = new Map();

  function visit(node, path, inheritedType) {
    const pathLabel = path.join('.');
    assert(isRecord(node), `${pathLabel || '<root>'} must be an object`);

    const ownType = node.$type;
    if (ownType !== undefined) {
      assert(
        typeof ownType === 'string' && tokenTypes.has(ownType),
        `${pathLabel || '<root>'} has unsupported $type`,
      );
    }
    const effectiveType = ownType ?? inheritedType;

    if (Object.hasOwn(node, '$value')) {
      assert(path.length > 0, 'the document root cannot be a token');
      assert(effectiveType !== undefined, `${pathLabel} has no $type`);
      for (const key of Object.keys(node)) {
        assert(
          key.startsWith('$'),
          `${pathLabel} cannot contain child "${key}" beside $value`,
        );
      }
      validateTokenValue(effectiveType, node.$value, pathLabel);
      tokens.set(pathLabel, { type: effectiveType, value: node.$value });
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

function resolveTokens(tokens) {
  const resolved = new Map();

  function resolveToken(path, stack = []) {
    const existing = resolved.get(path);
    if (existing) return existing;

    const token = tokens.get(path);
    assert(token, `alias points to missing token "${path}"`);
    assert(!stack.includes(path), `alias cycle: ${[...stack, path].join(' -> ')}`);

    const match =
      typeof token.value === 'string' ? aliasPattern.exec(token.value) : null;
    if (!match) {
      const value = { type: token.type, value: token.value };
      resolved.set(path, value);
      return value;
    }

    const targetPath = match[1];
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

function getExtension(document) {
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
    Array.isArray(extension.themes) &&
      extension.themes.length === 2 &&
      extension.themes[0] === 'light' &&
      extension.themes[1] === 'dark',
    'themes must be light and dark',
  );
  assert(
    Array.isArray(extension.products) &&
      extension.products.length > 0 &&
      extension.products.every(
        (product) => typeof product === 'string' && product.length > 0,
      ),
    'products must be a non-empty string list',
  );
  return extension;
}

function colorLuminance(value, path) {
  colorToHex(value, path);
  const channels = value.components.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function validateFoundation(extension, resolved) {
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
    Array.isArray(extension.contrastPairs) && extension.contrastPairs.length > 0,
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
      pair.foreground,
    );
    const backgroundLuminance = colorLuminance(
      background.value,
      pair.background,
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

function dimensionToCss(value) {
  return `${value.value}${value.unit}`;
}

function colorToCss(value, path) {
  const hex = colorToHex(value, path);
  const alpha = value.alpha ?? 1;
  if (alpha === 1) return hex;
  const channels = value.components.map((channel) => Math.round(channel * 255));
  return `rgb(${channels.join(' ')} / ${alpha})`;
}

function fontFamilyToCss(value) {
  const families = Array.isArray(value) ? value : [value];
  return families
    .map((family) =>
      genericFontFamilies.has(family)
        ? family
        : `"${family.replaceAll('"', '\\"')}"`,
    )
    .join(', ');
}

function tokenToCss(token, path) {
  switch (token.type) {
    case 'color':
      return colorToCss(token.value, path);
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
        colorToCss(token.value.color, `${path}.color`),
      ].join(' ');
    default:
      fail(`${path} cannot be converted to CSS`);
  }
}

function cssVariableForPath(path) {
  return `--pp-${path.replaceAll('.', '-')}`;
}

function generateTypeScript(extension, resolved) {
  const tokenValues = {};
  const cssVariables = {};
  for (const [path, token] of resolved) {
    tokenValues[path] = tokenToCss(token, path);
    cssVariables[path] = cssVariableForPath(path);
  }

  return `// Generated by scripts/generate-design-tokens.mjs. Do not edit.\n\nexport const DESIGN_FAMILY = ${JSON.stringify(
    {
      name: extension.family,
      version: extension.version,
      specVersion: extension.specVersion,
    },
    null,
    2,
  )} as const;\n\nexport const DESIGN_THEMES = ${JSON.stringify(extension.themes)} as const;\n\nexport const DESIGN_PRODUCTS = ${JSON.stringify(extension.products)} as const;\n\nexport const QUIET_INSTRUMENTS_TOKENS = ${JSON.stringify(tokenValues, null, 2)} as const;\n\nexport const QUIET_INSTRUMENTS_CSS_VARIABLES = ${JSON.stringify(cssVariables, null, 2)} as const;\n\nexport type DesignTheme = (typeof DESIGN_THEMES)[number];\nexport type DesignProduct = (typeof DESIGN_PRODUCTS)[number];\nexport type QuietInstrumentsTokenPath = keyof typeof QUIET_INSTRUMENTS_TOKENS;\n`;
}

function semanticDeclarations(theme) {
  return semanticColorRoles.map(
    (role) =>
      `  --pp-color-${role}: var(--pp-system-${theme}-color-${role});`,
  );
}

function productDeclarations(product, resolved) {
  return [
    `  --pp-product-accent-light: ${tokenToCss(resolved.get(`product.${product}.accent-light`), `product.${product}.accent-light`)};`,
    `  --pp-product-on-accent-light: ${tokenToCss(resolved.get(`product.${product}.on-accent-light`), `product.${product}.on-accent-light`)};`,
    `  --pp-product-accent-dark: ${tokenToCss(resolved.get(`product.${product}.accent-dark`), `product.${product}.accent-dark`)};`,
    `  --pp-product-on-accent-dark: ${tokenToCss(resolved.get(`product.${product}.on-accent-dark`), `product.${product}.on-accent-dark`)};`,
  ];
}

function generateCss(extension, resolved) {
  const rawDeclarations = [...resolved.entries()].map(
    ([path, token]) =>
      `  ${cssVariableForPath(path)}: ${tokenToCss(token, path)};`,
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

  return `/* Generated by scripts/generate-design-tokens.mjs. Do not edit. */

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
  .pp-design {
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

function validateGeneratedCss(css, extension) {
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
  for (const product of extension.products) {
    assert(
      css.includes(`.pp-design[data-pp-product='${product}']`),
      `generated CSS is missing the ${product} product scope`,
    );
  }
}

function checkOrWrite(path, contents) {
  if (!checkOnly) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
    return;
  }

  let existing;
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
  const document = JSON.parse(readFileSync(sourcePath, 'utf8'));
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
