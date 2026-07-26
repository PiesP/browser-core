/**
 * Type guard: returns `true` when `value` is a plain non-null object
 * (not an array, not a function, and not `null`).
 *
 * @param value - Value to check
 * @returns `true` if the value is a record object
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard: returns `true` when `element` is an `HTMLElement`.
 *
 * Works in browser environments where `HTMLElement` is available;
 * handles cross-realm (iframe) elements via `instanceof` checks.
 *
 * @param element - Value to check
 * @returns `true` if the value is an HTMLElement
 */
export function isHTMLElement(element: unknown): element is HTMLElement {
  if (typeof element !== 'object' || element === null) return false;

  const ownerDocument = (
    element as { ownerDocument?: { defaultView?: unknown } }
  ).ownerDocument;
  const realmConstructor = (
    ownerDocument?.defaultView as { HTMLElement?: unknown } | null
  )?.HTMLElement;

  if (
    typeof realmConstructor === 'function' &&
    element instanceof realmConstructor
  ) {
    return true;
  }

  return (
    typeof HTMLElement !== 'undefined' && element instanceof HTMLElement
  );
}

/**
 * Create a type-safe event listener that receives a typed `Event` object.
 *
 * Useful as a lightweight wrapper when you want a single-argument handler
 * with a known event type without repeating the type annotation at every
 * `addEventListener` call site.
 *
 * @param handler - Callback that receives the event
 * @returns The same handler, unchanged
 *
 * @example
 * ```ts
 * el.addEventListener('click', createEventListener<MouseEvent>(e => {
 *   console.log(e.clientX);
 * }));
 * ```
 */
export function createEventListener<T extends Event>(
  handler: (event: T) => void,
): (event: T) => void {
  return handler;
}
