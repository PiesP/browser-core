/**
 * A typed publish/subscribe message bus.
 *
 * Subscribe handlers to receive messages, publish messages to all subscribers,
 * and unsubscribe when no longer needed.
 *
 * @typeParam T - The message payload type
 */
export class MessageBus<T> {
  private readonly listeners = new Set<(message: T) => void>();

  /**
   * Subscribe a handler to receive published messages.
   *
   * @param handler - Called with each published message
   * @returns An unsubscribe function — call it to remove the handler
   */
  subscribe(handler: (message: T) => void): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  /**
   * Publish a message to all current subscribers.
   *
   * Handlers are called synchronously in subscription order.
   * The subscriber set is snapshotted before delivery, so subscriptions added
   * or removed by a handler affect only later publications. Errors thrown by a
   * handler do not prevent other handlers from running; after delivery, the
   * first error is rethrown to the publisher. Promise-returning handlers are
   * consumed to prevent unhandled rejections, then reported as a `TypeError`;
   * use `publishAsync` when subscribers perform asynchronous work.
   *
   * @param message - The message to broadcast
   */
  publish(message: T): void {
    const handlers = [...this.listeners];
    let firstError: unknown;
    let hasError = false;

    for (const handler of handlers) {
      try {
        const result = handler(message) as unknown;
        if (isPromiseLike(result)) {
          void Promise.resolve(result).catch(() => undefined);
          if (!hasError) {
            firstError = new TypeError(
              'MessageBus.publish does not accept asynchronous subscribers; use publishAsync instead.',
            );
            hasError = true;
          }
        }
      } catch (error) {
        if (!hasError) {
          firstError = error;
          hasError = true;
        }
      }
    }

    if (hasError) {
      throw firstError;
    }
  }

  /**
   * Publish a message and wait for all synchronous or asynchronous subscribers.
   *
   * The subscriber set is snapshotted before delivery. Every handler is invoked
   * synchronously in subscription order before returned promises are awaited.
   * After all handlers settle, the first error in subscription order is
   * rethrown to the publisher.
   *
   * @param message - The message to broadcast
   */
  async publishAsync(message: T): Promise<void> {
    const handlers = [...this.listeners];
    const outcomes: Promise<unknown>[] = [];

    for (const handler of handlers) {
      try {
        outcomes.push(Promise.resolve(handler(message) as unknown));
      } catch (error) {
        outcomes.push(Promise.reject(error));
      }
    }

    const results = await Promise.allSettled(outcomes);
    for (const result of results) {
      if (result.status === 'rejected') {
        throw result.reason;
      }
    }
  }

  /**
   * Remove a specific handler from the bus.
   *
   * @param handler - The handler previously passed to `subscribe`
   */
  unsubscribe(handler: (message: T) => void): void {
    this.listeners.delete(handler);
  }

  /** Current number of active subscribers. */
  get subscriberCount(): number {
    return this.listeners.size;
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  if (
    (typeof value !== 'object' || value === null) &&
    typeof value !== 'function'
  ) {
    return false;
  }
  return typeof (value as { then?: unknown }).then === 'function';
}
