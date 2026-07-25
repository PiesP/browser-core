import { describe, expect, it, vi } from 'vitest';
import {
  clearSafeTimeout,
  clearSafeInterval,
  clearSafeAnimationFrame,
  clearSafeTimer,
} from '../../src/async/clear-safe.js';

describe('clearSafeTimeout', () => {
  it('returns null when given null', () => {
    expect(clearSafeTimeout(null)).toBeNull();
  });

  it('returns null after clearing a valid timeout', () => {
    const id = setTimeout(() => {}, 10000);
    const result = clearSafeTimeout(id);
    expect(result).toBeNull();
  });

  it('does not throw for an already-cleared timeout', () => {
    const id = setTimeout(() => {}, 10000);
    clearTimeout(id);
    expect(() => clearSafeTimeout(id)).not.toThrow();
  });
});

describe('clearSafeInterval', () => {
  it('returns null when given null', () => {
    expect(clearSafeInterval(null)).toBeNull();
  });

  it('returns null after clearing a valid interval', () => {
    const id = setInterval(() => {}, 10000);
    const result = clearSafeInterval(id);
    expect(result).toBeNull();
  });

  it('does not throw for an already-cleared interval', () => {
    const id = setInterval(() => {}, 10000);
    clearInterval(id);
    expect(() => clearSafeInterval(id)).not.toThrow();
  });
});

describe('clearSafeAnimationFrame', () => {
  it('returns null when given null', () => {
    expect(clearSafeAnimationFrame(null)).toBeNull();
  });

  it('returns null after clearing a valid animation frame', () => {
    const cancelSpy = vi.fn();
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 42));
    vi.stubGlobal('cancelAnimationFrame', cancelSpy);

    const id = requestAnimationFrame(() => {});
    const result = clearSafeAnimationFrame(id);
    expect(result).toBeNull();
    expect(cancelSpy).toHaveBeenCalledWith(42);

    vi.unstubAllGlobals();
  });

  it('does not throw for an already-cleared animation frame', () => {
    const cancelSpy = vi.fn();
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 42));
    vi.stubGlobal('cancelAnimationFrame', cancelSpy);

    const id = requestAnimationFrame(() => {});
    cancelAnimationFrame(id);
    expect(() => clearSafeAnimationFrame(id)).not.toThrow();

    vi.unstubAllGlobals();
  });
});

describe('clearSafeTimer', () => {
  it('returns null for a null timeout id', () => {
    expect(clearSafeTimer('timeout', null)).toBeNull();
  });

  it('returns null for a null interval id', () => {
    expect(clearSafeTimer('interval', null)).toBeNull();
  });

  it('returns null for a null animation frame id', () => {
    expect(clearSafeTimer('animation-frame', null)).toBeNull();
  });

  it('clears a valid timeout', () => {
    const id = setTimeout(() => {}, 10000);
    expect(clearSafeTimer('timeout', id)).toBeNull();
  });

  it('clears a valid interval', () => {
    const id = setInterval(() => {}, 10000);
    expect(clearSafeTimer('interval', id)).toBeNull();
  });

  it('clears a valid animation frame', () => {
    const cancelSpy = vi.fn();
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 42));
    vi.stubGlobal('cancelAnimationFrame', cancelSpy);

    const id = requestAnimationFrame(() => {});
    expect(clearSafeTimer('animation-frame', id as unknown as ReturnType<typeof setTimeout>)).toBeNull();
    expect(cancelSpy).toHaveBeenCalledWith(42);

    vi.unstubAllGlobals();
  });

  it('does not throw for already-cleared timers', () => {
    const timeoutId = setTimeout(() => {}, 10000);
    clearTimeout(timeoutId);
    expect(() => clearSafeTimer('timeout', timeoutId)).not.toThrow();

    const intervalId = setInterval(() => {}, 10000);
    clearInterval(intervalId);
    expect(() => clearSafeTimer('interval', intervalId)).not.toThrow();

    const cancelSpy = vi.fn();
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 42));
    vi.stubGlobal('cancelAnimationFrame', cancelSpy);

    const rafId = requestAnimationFrame(() => {});
    cancelAnimationFrame(rafId);
    expect(() =>
      clearSafeTimer('animation-frame', rafId as unknown as ReturnType<typeof setTimeout>),
    ).not.toThrow();

    vi.unstubAllGlobals();
  });
});
