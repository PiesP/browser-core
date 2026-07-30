import { describe, expect, it } from 'vitest';
import {
  OPERATION_PRESENTATION,
  getOperationPresentation,
  getOperationProgressRatio,
  isOperationBusy,
  isOperationTerminal,
} from '../../src/design/index.js';
import type { OperationState } from '../../src/design/index.js';

describe('operation state contract', () => {
  it('maps every status to complete presentation semantics', () => {
    expect(Object.keys(OPERATION_PRESENTATION)).toEqual([
      'idle',
      'starting',
      'running',
      'success',
      'error',
      'cancelled',
    ]);
    expect(getOperationPresentation({ status: 'starting' })).toMatchObject({
      icon: 'activity',
      announcement: 'polite',
      busy: true,
      terminal: false,
    });
    expect(
      getOperationPresentation({ status: 'running', progress: null }),
    ).toMatchObject({
      icon: 'activity',
      announcement: 'none',
      busy: true,
      terminal: false,
    });
    expect(getOperationPresentation({ status: 'success' })).toMatchObject({
      tone: 'success',
      icon: 'check',
      terminal: true,
    });
    expect(
      getOperationPresentation({
        status: 'error',
        error: new Error('failed'),
        retryable: true,
      }),
    ).toMatchObject({
      tone: 'danger',
      icon: 'alert',
      announcement: 'assertive',
      terminal: true,
    });
    expect(
      Object.entries(OPERATION_PRESENTATION)
        .filter(([, presentation]) => presentation.icon === 'check')
        .map(([status]) => status),
    ).toEqual(['success']);
  });

  it('narrows busy and terminal operation states', () => {
    const states: OperationState<string>[] = [
      { status: 'idle' },
      { status: 'starting' },
      { status: 'running', progress: { completed: 1, total: 2 } },
      { status: 'success' },
      { status: 'error', error: 'offline', retryable: true },
      { status: 'cancelled' },
    ];

    expect(states.filter(isOperationBusy).map((state) => state.status)).toEqual([
      'starting',
      'running',
    ]);
    expect(
      states.filter(isOperationTerminal).map((state) => state.status),
    ).toEqual(['success', 'error', 'cancelled']);
  });

  it('calculates determinate progress without inventing values', () => {
    expect(getOperationProgressRatio({ completed: 1, total: 4 })).toBe(0.25);
    expect(getOperationProgressRatio({ completed: 7, total: 4 })).toBe(1);
  });

  it.each([
    { completed: -1, total: 4 },
    { completed: Number.NaN, total: 4 },
    { completed: 1, total: 0 },
    { completed: 1, total: Number.POSITIVE_INFINITY },
  ])('rejects invalid progress $completed/$total', (progress) => {
    expect(() => getOperationProgressRatio(progress)).toThrow(RangeError);
  });
});
