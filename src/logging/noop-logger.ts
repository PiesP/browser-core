import type { Logger } from './types.js';

/** Logger that silently discards all messages (production strip). */
export function createNoopLogger(): Logger {
  const noop = (): void => {};
  return { debug: noop, info: noop, warn: noop, error: noop };
}
