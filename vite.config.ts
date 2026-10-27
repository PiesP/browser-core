import { defineConfig } from 'vite-plus';
import { playwright } from 'vite-plus/test/browser-playwright';

export default defineConfig({
  run: {
    cache: false,
    enablePrePostScripts: true,
  },
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
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          exclude: ['test/**/*.browser.test.ts'],
        },
      },
      {
        test: {
          name: 'browser',
          include: ['test/**/*.browser.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
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
