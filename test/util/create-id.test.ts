import { afterEach, describe, expect, it, vi } from 'vitest';
import { createId } from '../../src/util/id.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createId', () => {
  it('returns a non-empty string', () => {
    const id = createId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('returns a supplied seed exactly, including an empty seed', () => {
    expect(createId('deterministic')).toBe('deterministic');
    expect(createId('')).toBe('');
  });

  it('returns unique values on each call', () => {
    const ids = new Set(Array.from({ length: 100 }, () => createId()));
    expect(ids.size).toBe(100);
  });

  it('matches UUID format', () => {
    const id = createId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('preserves the timestamp fallback format', () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('unavailable');
    });
    vi.spyOn(Date, 'now').mockReturnValue(1234);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.spyOn(performance, 'now').mockReturnValue(42);

    expect(createId()).toBe('1234-i-42');
  });
});
