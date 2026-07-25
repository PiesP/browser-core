import { describe, expect, it, vi } from 'vitest';
import { isRecord, isHTMLElement, createEventListener } from '../../src/util/guards.js';

describe('isRecord', () => {
  it('returns true for plain objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1, b: 'hello' })).toBe(true);
  });

  it('returns false for arrays', () => {
    expect(isRecord([])).toBe(false);
    expect(isRecord([1, 2, 3])).toBe(false);
  });

  it('returns false for null', () => {
    expect(isRecord(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isRecord(undefined)).toBe(false);
  });

  it('returns false for functions', () => {
    expect(isRecord(() => {})).toBe(false);
    expect(isRecord(function () {})).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isRecord('hello')).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(true)).toBe(false);
    expect(isRecord(false)).toBe(false);
    expect(isRecord(Symbol('test'))).toBe(false);
  });

  it('type narrowing works at runtime', () => {
    const value: unknown = { key: 'val' };
    if (isRecord(value)) {
      expect(value.key).toBe('val');
    }
  });
});

describe('isHTMLElement', () => {
  it('returns false when window is undefined (node environment)', () => {
    // In vitest (node environment), HTMLElement may not be available
    // or the test runs in jsdom where window is defined.
    // We only test that it doesn't throw.
    expect(() => isHTMLElement({})).not.toThrow();
  });

  it('returns false for non-element objects', () => {
    expect(isHTMLElement({})).toBe(false);
    expect(isHTMLElement(null)).toBe(false);
    expect(isHTMLElement('div')).toBe(false);
  });
});

describe('createEventListener', () => {
  it('returns the same handler function', () => {
    const handler = vi.fn();
    const wrapped = createEventListener(handler);
    expect(wrapped).toBe(handler);
  });

  it('passes through event arguments', () => {
    const handler = vi.fn();
    const wrapped = createEventListener(handler);
    const event = new Event('click');
    wrapped(event);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('works with typed events', () => {
    let receivedEvent: Event | null = null;
    const handler = (e: Event) => {
      receivedEvent = e;
    };
    const wrapped = createEventListener<Event>(handler);
    const event = new Event('custom');
    wrapped(event);
    expect(receivedEvent).toBe(event);
  });
});
