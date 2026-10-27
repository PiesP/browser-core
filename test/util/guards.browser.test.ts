import { describe, expect, it } from 'vite-plus/test';
import { isHTMLElement } from '../../src/util/guards.js';

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
