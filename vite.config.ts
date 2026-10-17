import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    singleQuote: true,
    printWidth: 100,
    trailingComma: 'es5',
    ignorePatterns: ['src/design/generated/**'],
  },
  lint: {
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: false, denyWarnings: true },
    ignorePatterns: ['src/design/generated/**'],
  },
  test: {
    globals: true,
    include: ['test/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      thresholds: {
        statements: 93,
        branches: 85,
        functions: 94,
        lines: 95,
      },
    },
  },
});
