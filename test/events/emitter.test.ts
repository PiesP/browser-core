import { describe, expect, it, vi } from 'vitest';
import { createEventEmitter } from '../../src/events/emitter.js';

interface TestEvents extends Record<string, unknown> {
  count: number;
  message: string;
}

describe('createEventEmitter', () => {
  it('delivers only the payload for the subscribed event', () => {
    const emitter = createEventEmitter<TestEvents>();
    const countHandler = vi.fn();
    const messageHandler = vi.fn();
    emitter.on('count', countHandler);
    emitter.on('message', messageHandler);

    emitter.emit('count', 3);

    expect(countHandler).toHaveBeenCalledWith(3);
    expect(messageHandler).not.toHaveBeenCalled();
  });

  it('supports unsubscribe functions and explicit off calls', () => {
    const emitter = createEventEmitter<TestEvents>();
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();
    const unsubscribe = emitter.on('count', firstHandler);
    emitter.on('count', secondHandler);

    unsubscribe();
    emitter.off('count', secondHandler);
    emitter.emit('count', 1);

    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).not.toHaveBeenCalled();
  });

  it('treats emitting and removing unseen events as no-ops', () => {
    const emitter = createEventEmitter<TestEvents>();
    const handler = vi.fn();

    expect(() => emitter.emit('message', 'unused')).not.toThrow();
    expect(() => emitter.off('message', handler)).not.toThrow();
  });

  it('does not let a stale unsubscribe remove a replacement event bus', () => {
    const emitter = createEventEmitter<TestEvents>();
    const oldHandler = vi.fn();
    const newHandler = vi.fn();
    const unsubscribeOld = emitter.on('count', oldHandler);
    unsubscribeOld();
    emitter.on('count', newHandler);

    unsubscribeOld();
    emitter.emit('count', 2);

    expect(oldHandler).not.toHaveBeenCalled();
    expect(newHandler).toHaveBeenCalledWith(2);
  });

  it('snapshots handlers and rethrows the first delivery error', () => {
    const emitter = createEventEmitter<TestEvents>();
    const calls: string[] = [];
    emitter.on('message', () => {
      calls.push('first');
      throw new Error('delivery failed');
    });
    emitter.on('message', () => calls.push('second'));

    expect(() => emitter.emit('message', 'payload')).toThrow('delivery failed');
    expect(calls).toEqual(['first', 'second']);
  });
});
