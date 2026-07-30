const editableElementNames = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

interface ShortcutTarget {
  readonly nodeName?: unknown;
  readonly isContentEditable?: unknown;
  readonly closest?: unknown;
}

function toShortcutTarget(target: EventTarget | null): ShortcutTarget | null {
  return typeof target === 'object' && target !== null
    ? (target as ShortcutTarget)
    : null;
}

/**
 * Detects text-entry surfaces without depending on one DOM realm. The closest
 * lookup also covers descendants inside a contenteditable host.
 */
export function isEditableShortcutTarget(
  target: EventTarget | null,
): boolean {
  const candidate = toShortcutTarget(target);
  if (!candidate) return false;

  try {
    if (
      typeof candidate.nodeName === 'string' &&
      editableElementNames.has(candidate.nodeName.toUpperCase())
    ) {
      return true;
    }
    if (candidate.isContentEditable === true) return true;
    if (typeof candidate.closest !== 'function') return false;
    if (candidate.closest('input, select, textarea')) return true;

    const contentEditableHost = candidate.closest('[contenteditable]') as {
      readonly getAttribute?: unknown;
    } | null;
    if (
      !contentEditableHost ||
      typeof contentEditableHost.getAttribute !== 'function'
    ) {
      return false;
    }
    const value = contentEditableHost.getAttribute('contenteditable');
    return typeof value === 'string' && value.toLowerCase() !== 'false';
  } catch {
    return false;
  }
}

export type GlobalShortcutEvent = Pick<
  KeyboardEvent,
  'composedPath' | 'defaultPrevented' | 'isComposing' | 'target'
>;

/**
 * Shared guard for product-level keyboard shortcuts. Chord matching remains in
 * each product; this guard prevents interception during IME composition or
 * text entry, including targets reached through a composed event path.
 */
export function shouldHandleGlobalShortcut(
  event: GlobalShortcutEvent,
): boolean {
  if (event.defaultPrevented || event.isComposing) return false;

  let path: EventTarget[] = [];
  try {
    path = event.composedPath();
  } catch {
    // Synthetic event implementations may not expose a usable composed path.
  }
  const originalTarget = path[0] ?? event.target;
  return !isEditableShortcutTarget(originalTarget);
}
