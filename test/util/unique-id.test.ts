import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateUniqueId, createPrefixedId } from '../../src/util/unique-id.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('generateUniqueId', () => {
  it('returns a non-empty string', () => {
    const id = generateUniqueId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('returns unique values on each call', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateUniqueId()));
    expect(ids.size).toBe(100);
  });

  it('returns a string without dashes', () => {
    const id = generateUniqueId();
    expect(id).not.toContain('-');
  });

  it('matches UUID-without-dashes format', () => {
    const id = generateUniqueId();
    // UUID without dashes: 32 hex characters
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('generates unique IDs in a tight loop', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateUniqueId());
    }
    expect(ids.size).toBe(1000);
  });

  it('keeps the fallback ID dash-free', () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('unavailable');
    });
    vi.spyOn(Date, 'now').mockReturnValue(1234);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    expect(generateUniqueId()).toMatch(/^[a-z0-9]+$/);
    expect(generateUniqueId()).not.toContain('-');
  });
});

describe('createPrefixedId', () => {
  it('creates a prefixed ID with default separator', () => {
    const id = createPrefixedId('btn');
    expect(id).toMatch(/^btn-[0-9a-f]{32}$/);
  });

  it('creates a prefixed ID with custom separator', () => {
    const id = createPrefixedId('btn', '_');
    expect(id).toMatch(/^btn_[0-9a-f]{32}$/);
  });

  it('creates a prefixed ID with empty separator', () => {
    const id = createPrefixedId('prefix', '');
    expect(id).toMatch(/^prefix[0-9a-f]{32}$/);
  });

  it('creates unique prefixed IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => createPrefixedId('id')));
    expect(ids.size).toBe(100);
  });

  it('preserves prefix exactly', () => {
    const id = createPrefixedId('my-component');
    expect(id.startsWith('my-component-')).toBe(true);
  });
});
