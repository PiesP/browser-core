// @piesp/browser-core — main entry
export * from './async/index.js';
export * from './error/index.js';
export * from './events/index.js';
export * from './locale/index.js';
export * from './logging/index.js';
export * from './util/index.js';

// Re-export util sub-modules for direct imports
export { cx } from './util/cx.js';
export { escapeRegExp } from './util/escape-reg-exp.js';
export { isRecord, isHTMLElement, createEventListener } from './util/guards.js';
export { computePercentage } from './util/math.js';
export { resolveNestedPath } from './util/object.js';
export { generateUniqueId, createPrefixedId } from './util/unique-id.js';
