// @vitest-environment jsdom

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
  it('does not throw for an ordinary non-element object', () => {
    expect(() => isHTMLElement({})).not.toThrow();
  });

  it('returns false for non-element objects', () => {
    expect(isHTMLElement({})).toBe(false);
    expect(isHTMLElement(null)).toBe(false);
    expect(isHTMLElement('div')).toBe(false);
  });

  it('recognizes an actual HTMLElement created in an iframe realm', () => {
    const iframe = document.createElement('iframe');
    document.body.append(iframe);

    try {
      const iframeDocument = iframe.contentDocument;
      const iframeWindow = iframe.contentWindow;
      if (!iframeDocument || !iframeWindow) {
        throw new Error('iframe realm was not created');
      }
      const iframeGlobal = iframeWindow as Window & typeof globalThis;

      const iframeElement = iframeDocument.createElement('div');
      expect(iframeElement).toBeInstanceOf(iframeGlobal.HTMLElement);
      expect(iframeElement).not.toBeInstanceOf(HTMLElement);
      expect(isHTMLElement(iframeElement)).toBe(true);
    } finally {
      iframe.remove();
    }
  });

  it('rejects an object that supplies its own HTMLElement constructor', () => {
    class FakeHTMLElement {}
    const spoof = new FakeHTMLElement() as FakeHTMLElement & {
      ownerDocument: { defaultView: { HTMLElement: typeof FakeHTMLElement } };
    };
    spoof.ownerDocument = {
      defaultView: { HTMLElement: FakeHTMLElement },
    };

    expect(isHTMLElement(spoof)).toBe(false);
  });

  it('returns false when candidate property access throws', () => {
    const throwingCandidate = Object.defineProperty({}, 'ownerDocument', {
      get: () => {
        throw new Error('property access denied');
      },
    });

    expect(() => isHTMLElement(throwingCandidate)).not.toThrow();
    expect(isHTMLElement(throwingCandidate)).toBe(false);
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
