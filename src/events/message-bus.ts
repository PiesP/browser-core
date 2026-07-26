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
   * first error is rethrown to the publisher.
   *
   * @param message - The message to broadcast
   */
  publish(message: T): void {
    const handlers = [...this.listeners];
    let firstError: unknown;
    let hasError = false;

    for (const handler of handlers) {
      try {
        handler(message);
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
