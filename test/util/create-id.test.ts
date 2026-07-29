import { describe, expect, it } from 'vitest';
import { createId } from '../../src/util/create-id.js';

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
});
