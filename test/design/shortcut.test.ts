// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  isEditableShortcutTarget,
  shouldHandleGlobalShortcut,
} from '../../src/design/index.js';

function handlesKeydown(target: HTMLElement, init?: KeyboardEventInit): boolean {
  let result = true;
  target.addEventListener(
    'keydown',
    (event) => {
      result = shouldHandleGlobalShortcut(event);
    },
    { once: true },
  );
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      bubbles: true,
      composed: true,
      key: 'k',
      ...init,
    }),
  );
  return result;
}

describe('global shortcut guard', () => {
  it.each(['input', 'select', 'textarea'])('protects <%s> input', (tagName) => {
    const element = document.createElement(tagName);
    expect(isEditableShortcutTarget(element)).toBe(true);
    expect(handlesKeydown(element)).toBe(false);
  });

  it('protects descendants of contenteditable hosts', () => {
    const editor = document.createElement('div');
    const child = document.createElement('span');
    editor.setAttribute('contenteditable', 'true');
    editor.append(child);
    document.body.append(editor);

    try {
      expect(isEditableShortcutTarget(child)).toBe(true);
      expect(handlesKeydown(child)).toBe(false);
    } finally {
      editor.remove();
    }
  });

  it('respects a nearer non-editable contenteditable boundary', () => {
    const editor = document.createElement('div');
    const excluded = document.createElement('div');
    const child = document.createElement('span');
    editor.setAttribute('contenteditable', 'true');
    excluded.setAttribute('contenteditable', 'false');
    excluded.append(child);
    editor.append(excluded);
    document.body.append(editor);

    try {
      expect(isEditableShortcutTarget(child)).toBe(false);
      expect(handlesKeydown(child)).toBe(true);
    } finally {
      editor.remove();
    }
  });

  it('allows non-editable product surfaces', () => {
    const surface = document.createElement('div');
    expect(isEditableShortcutTarget(surface)).toBe(false);
    expect(handlesKeydown(surface)).toBe(true);
  });

  it('does not intercept composing or already handled events', () => {
    const surface = document.createElement('div');
    expect(handlesKeydown(surface, { isComposing: true })).toBe(false);

    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'k',
    });
    event.preventDefault();
    expect(shouldHandleGlobalShortcut(event)).toBe(false);
  });

  it('uses the original target across a shadow boundary', () => {
    const host = document.createElement('div');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const input = document.createElement('input');
    shadowRoot.append(input);
    document.body.append(host);
    let result = true;
    host.addEventListener('keydown', (event) => {
      result = shouldHandleGlobalShortcut(event);
    });

    try {
      input.dispatchEvent(
        new KeyboardEvent('keydown', {
          bubbles: true,
          composed: true,
          key: 'k',
        }),
      );
      expect(result).toBe(false);
    } finally {
      host.remove();
    }
  });

  it('fails open for non-DOM and hostile synthetic targets', () => {
    expect(isEditableShortcutTarget(null)).toBe(false);
    const target = {
      closest: () => {
        throw new Error('cross-origin target');
      },
    } as unknown as EventTarget;
    expect(isEditableShortcutTarget(target)).toBe(false);

    const throwingTarget = Object.defineProperty({}, 'nodeName', {
      get: () => {
        throw new Error('cross-origin target');
      },
    }) as EventTarget;
    expect(isEditableShortcutTarget(throwingTarget)).toBe(false);
  });
});
