import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../src/logging/types.js';
import { createConsoleLogger } from '../../src/logging/console-logger.js';
import { createNoopLogger } from '../../src/logging/noop-logger.js';

describe('ConsoleLogger', () => {
  it('creates a logger with all four methods', () => {
    const log = createConsoleLogger('Test');
    expect(typeof log.debug).toBe('function');
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
  });

  it('prefixes messages with [namespace]', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const log = createConsoleLogger('MyModule');
    log.info('hello');
    expect(spy).toHaveBeenCalledWith('[MyModule]', 'hello');
    spy.mockRestore();
  });

  it('methods do not throw', () => {
    const log = createConsoleLogger('NoThrow');
    expect(() => log.debug('debug msg')).not.toThrow();
    expect(() => log.info('info msg')).not.toThrow();
    expect(() => log.warn('warn msg')).not.toThrow();
    expect(() => log.error('error msg')).not.toThrow();
  });
});

describe('NoopLogger', () => {
  it('creates a logger with all four methods', () => {
    const log = createNoopLogger();
    expect(typeof log.debug).toBe('function');
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
  });

  it('methods do not throw and produce no output', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const log = createNoopLogger();
    expect(() => log.debug('test')).not.toThrow();
    expect(() => log.info('test')).not.toThrow();
    expect(() => log.warn('test')).not.toThrow();
    expect(() => log.error('test')).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('Logger interface', () => {
  it('createConsoleLogger satisfies Logger type', () => {
    const log: Logger = createConsoleLogger('T');
    log.debug('x');
    log.info('x');
    log.warn('x');
    log.error('x');
  });

  it('createNoopLogger satisfies Logger type', () => {
    const log: Logger = createNoopLogger();
    log.debug('x');
    log.info('x');
    log.warn('x');
    log.error('x');
  });
});
