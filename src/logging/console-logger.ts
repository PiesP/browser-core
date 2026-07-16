import type { Logger } from './types.js';

/**
 * Create a console-prefixed logger for the given namespace.
 *
 * All three projects use this pattern:
 * - xcom: `createLogger('ModuleName')` → `[ModuleName]`
 * - yt: `createLogger(moduleName)` → `[moduleName]`
 * - wasm: `logger.{level}(category, msg, ctx)` → category-based (different)
 *
 * This implementation matches the xcom/yt pattern.
 * wasm's category-based logger is kept as a separate sink.
 */
export function createConsoleLogger(namespace: string): Logger {
  const prefix = `[${namespace}]`;
  return {
    debug: (...args) => console.debug(prefix, ...args),
    info: (...args) => console.info(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  };
}
