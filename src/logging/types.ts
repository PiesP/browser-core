/** Shared contract for all loggers across projects. */
export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

/** Factory function signature for creating named logger instances. */
export type LoggerFactory = (namespace: string) => Logger;
