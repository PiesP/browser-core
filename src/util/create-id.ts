/**
 * Generate a collision-resistant UUID using `crypto.randomUUID()`.
 * Available in all modern browsers and Node.js 19+.
 */
export function createId(): string {
  return crypto.randomUUID();
}
