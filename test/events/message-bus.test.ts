import { describe, expect, it, vi } from 'vitest';
import { MessageBus } from '../../src/events/message-bus.js';

describe('MessageBus', () => {
  it('calls every subscriber before rethrowing the first subscriber error', () => {
    const bus = new MessageBus<string>();
    const firstError = new Error('first subscriber failed');
    const laterSubscriber = vi.fn();

    bus.subscribe(() => {
      throw firstError;
    });
    bus.subscribe(laterSubscriber);

    expect(() => bus.publish('message')).toThrow(firstError);
    expect(laterSubscriber).toHaveBeenCalledOnce();
    expect(laterSubscriber).toHaveBeenCalledWith('message');
  });

  it('continues after multiple subscriber errors and rethrows the first one', () => {
    const bus = new MessageBus<string>();
    const firstError = new Error('first subscriber failed');
    const finalSubscriber = vi.fn();

    bus.subscribe(() => {
      throw firstError;
    });
    bus.subscribe(() => {
      throw new Error('second subscriber failed');
    });
    bus.subscribe(finalSubscriber);

    expect(() => bus.publish('message')).toThrow(firstError);
    expect(finalSubscriber).toHaveBeenCalledOnce();
  });

  it('delivers the current emission to subscribers removed during publish', () => {
    const bus = new MessageBus<string>();
    const removedSubscriber = vi.fn();
    let unsubscribeRemoved = (): void => {};

    bus.subscribe(() => unsubscribeRemoved());
    unsubscribeRemoved = bus.subscribe(removedSubscriber);

    bus.publish('first');
    bus.publish('second');

    expect(removedSubscriber).toHaveBeenCalledOnce();
    expect(removedSubscriber).toHaveBeenCalledWith('first');
  });

  it('defers subscribers added during publish until the next emission', () => {
    const bus = new MessageBus<string>();
    const addedSubscriber = vi.fn();

    bus.subscribe(() => bus.subscribe(addedSubscriber));

    bus.publish('first');
    expect(addedSubscriber).not.toHaveBeenCalled();

    bus.publish('second');
    expect(addedSubscriber).toHaveBeenCalledOnce();
    expect(addedSubscriber).toHaveBeenCalledWith('second');
  });

  it('rejects asynchronous subscribers from synchronous publish', () => {
    const bus = new MessageBus<string>();

    bus.subscribe(() => new Promise<void>(() => {}));

    expect(() => bus.publish('message')).toThrow(/publishAsync/);
  });

  it('consumes an asynchronous subscriber rejection from synchronous publish', async () => {
    const bus = new MessageBus<string>();

    bus.subscribe(async () => {
      throw new Error('asynchronous subscriber failed');
    });

    expect(() => bus.publish('message')).toThrow(/publishAsync/);
    await Promise.resolve();
  });

  it('awaits asynchronous subscribers and rethrows the first error', async () => {
    const bus = new MessageBus<string>();
    const firstError = new Error('first asynchronous subscriber failed');
    const finalSubscriber = vi.fn();

    bus.subscribe(async () => {
      await Promise.resolve();
      throw firstError;
    });
    bus.subscribe(async () => {
      throw new Error('second asynchronous subscriber failed');
    });
    bus.subscribe(finalSubscriber);

    await expect(bus.publishAsync('message')).rejects.toBe(firstError);
    expect(finalSubscriber).toHaveBeenCalledOnce();
  });
});
