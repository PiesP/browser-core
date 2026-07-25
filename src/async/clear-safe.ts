/**
 * Clear a `setTimeout` ID and return `null`.
 *
 * @param id - The timeout ID, or null
 * @returns `null` (always)
 */
export function clearSafeTimeout(id: ReturnType<typeof setTimeout> | null): null {
  if (id !== null) clearTimeout(id);
  return null;
}

/**
 * Clear a `setInterval` ID and return `null`.
 *
 * @param id - The interval ID, or null
 * @returns `null` (always)
 */
export function clearSafeInterval(id: ReturnType<typeof setInterval> | null): null {
  if (id !== null) clearInterval(id);
  return null;
}

/**
 * Clear a `requestAnimationFrame` ID and return `null`.
 *
 * @param id - The animation frame ID, or null
 * @returns `null` (always)
 */
export function clearSafeAnimationFrame(id: number | null): null {
  if (id !== null) cancelAnimationFrame(id);
  return null;
}

/**
 * Clear a timer of the given type and return `null`.
 *
 * Handles `setTimeout`, `setInterval`, and `requestAnimationFrame` IDs with
 * a single call by dispatching to the correct clearing function based on `type`.
 *
 * @param type - Timer type: `'timeout'`, `'interval'`, or `'animation-frame'`
 * @param id - The timer/RAF ID, or null
 * @returns `null` (always)
 */
export function clearSafeTimer(
  type: 'timeout' | 'interval' | 'animation-frame',
  id: ReturnType<typeof setTimeout> | null,
): null {
  if (id === null) return null;
  switch (type) {
    case 'timeout':
      clearTimeout(id);
      break;
    case 'interval':
      clearInterval(id);
      break;
    case 'animation-frame':
      cancelAnimationFrame(id as unknown as number);
      break;
  }
  return null;
}
