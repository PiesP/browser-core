import { MessageBus } from './message-bus.js';

/**
 * A type-safe event emitter built on {@link MessageBus}.
 *
 * @typeParam E - Map of event names to their payload types
 */
export interface EventEmitter<E extends Record<string, unknown>> {
  /**
   * Register an event handler.
   *
   * @param event - The event name (key of E)
   * @param handler - Called with the event payload
   * @returns An unsubscribe function
   */
  on<K extends keyof E>(event: K, handler: (payload: E[K]) => void): () => void;

  /**
   * Remove an event handler.
   *
   * @param event - The event name (key of E)
   * @param handler - The handler previously passed to `on`
   */
  off<K extends keyof E>(event: K, handler: (payload: E[K]) => void): void;

  /**
   * Emit an event to all registered handlers.
   *
   * @param event - The event name (key of E)
   * @param payload - The event payload
   */
  emit<K extends keyof E>(event: K, payload: E[K]): void;
}

/**
 * @internal
 * Internal map type — each event key maps to a {@link MessageBus} typed for
 * that event's payload. `any` is used internally because the public API
 * ({@link EventEmitter.on}, {@link EventEmitter.off}, {@link EventEmitter.emit})
 * enforces the correct generic constraints at every call site.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BusMap<E extends Record<string, unknown>> = Map<keyof E, MessageBus<any>>;

/**
 * Create a type-safe event emitter.
 *
 * Uses a separate {@link MessageBus} instance per event name, created lazily
 * on first subscription.
 *
 * @typeParam E - Map of event names to their payload types
 * @returns An {@link EventEmitter} instance
 *
 * @example
 * ```ts
 * type AppEvents = {
 *   loggedIn: { userId: string };
 *   loggedOut: void;
 * };
 *
 * const emitter = createEventEmitter<AppEvents>();
 * const unsub = emitter.on('loggedIn', ({ userId }) => console.log(userId));
 * emitter.emit('loggedIn', { userId: 'abc' });
 * unsub();
 * ```
 */
export function createEventEmitter<E extends Record<string, unknown>>(): EventEmitter<E> {
  const buses: BusMap<E> = new Map();

  function getOrCreateBus<K extends keyof E>(event: K): MessageBus<E[K]> {
    let bus = buses.get(event);
    if (!bus) {
      bus = new MessageBus<E[K]>();
      buses.set(event, bus);
    }
    return bus;
  }

  return {
    on<K extends keyof E>(event: K, handler: (payload: E[K]) => void): () => void {
      const bus = getOrCreateBus(event);
      const unsubscribe = bus.subscribe(handler);
      return () => {
        unsubscribe();
        if (bus.subscriberCount === 0) buses.delete(event);
      };
    },

    off<K extends keyof E>(event: K, handler: (payload: E[K]) => void): void {
      const bus = buses.get(event) as MessageBus<E[K]> | undefined;
      if (!bus) return;

      bus.unsubscribe(handler);
      if (bus.subscriberCount === 0) buses.delete(event);
    },

    emit<K extends keyof E>(event: K, payload: E[K]): void {
      const bus = buses.get(event) as MessageBus<E[K]> | undefined;
      bus?.publish(payload);
    },
  };
}
