import { describe, expect, it } from 'vitest';
import { escapeRegExp } from '../../src/util/escape-reg-exp.js';

describe('escapeRegExp', () => {
  it('escapes regex special characters', () => {
    expect(escapeRegExp('^$.')).toBe('\\^\\$\\.');
    expect(escapeRegExp('*+?')).toBe('\\*\\+\\?');
  });

  it('escapes brackets and braces', () => {
    expect(escapeRegExp('()[]{}')).toBe('\\(\\)\\[\\]\\{\\}');
  });

  it('escapes pipe character', () => {
    expect(escapeRegExp('a|b')).toBe('a\\|b');
  });

  it('escapes backslash', () => {
    expect(escapeRegExp('\\')).toBe('\\\\');
  });

  it('returns normal string unchanged', () => {
    expect(escapeRegExp('hello world')).toBe('hello world');
    expect(escapeRegExp('abc123')).toBe('abc123');
  });

  it('escapes a complex pattern', () => {
    const input = 'hello (world) [test] *+?';
    const escaped = escapeRegExp(input);
    // Should be safe to use in a RegExp
    const regex = new RegExp(escaped);
    expect(regex.test(input)).toBe(true);
  });

  it('returns empty string for empty input', () => {
    expect(escapeRegExp('')).toBe('');
  });
});
