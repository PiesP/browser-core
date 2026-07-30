export type OperationStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'success'
  | 'error'
  | 'cancelled';

export interface OperationProgress {
  readonly completed: number;
  readonly total: number;
}

export type OperationState<TError = unknown> =
  | { readonly status: 'idle' }
  | { readonly status: 'starting' }
  | { readonly status: 'running'; readonly progress: OperationProgress | null }
  | { readonly status: 'success' }
  | {
      readonly status: 'error';
      readonly error: TError;
      readonly retryable: boolean;
    }
  | { readonly status: 'cancelled' };

export type BusyOperationState<TError = unknown> = Extract<
  OperationState<TError>,
  { readonly status: 'starting' | 'running' }
>;

export type TerminalOperationState<TError = unknown> = Extract<
  OperationState<TError>,
  { readonly status: 'success' | 'error' | 'cancelled' }
>;

export type OperationTone = 'neutral' | 'info' | 'success' | 'danger';
export type OperationStatusIcon =
  | 'activity'
  | 'check'
  | 'alert'
  | 'cancelled'
  | null;
export type OperationAnnouncement = 'none' | 'polite' | 'assertive';

export interface OperationPresentation {
  readonly tone: OperationTone;
  readonly icon: OperationStatusIcon;
  readonly announcement: OperationAnnouncement;
  readonly busy: boolean;
  readonly terminal: boolean;
}

/**
 * State-to-presentation semantics. Localized user-facing text remains in each
 * product; this map only keeps status tone, icon timing, and announcements
 * truthful across products.
 */
export const OPERATION_PRESENTATION = {
  idle: {
    tone: 'neutral',
    icon: null,
    announcement: 'none',
    busy: false,
    terminal: false,
  },
  starting: {
    tone: 'info',
    icon: 'activity',
    announcement: 'polite',
    busy: true,
    terminal: false,
  },
  running: {
    tone: 'info',
    icon: 'activity',
    announcement: 'none',
    busy: true,
    terminal: false,
  },
  success: {
    tone: 'success',
    icon: 'check',
    announcement: 'polite',
    busy: false,
    terminal: true,
  },
  error: {
    tone: 'danger',
    icon: 'alert',
    announcement: 'assertive',
    busy: false,
    terminal: true,
  },
  cancelled: {
    tone: 'neutral',
    icon: 'cancelled',
    announcement: 'polite',
    busy: false,
    terminal: true,
  },
} as const satisfies Record<OperationStatus, OperationPresentation>;

export function getOperationPresentation(
  state: OperationState,
): OperationPresentation {
  return OPERATION_PRESENTATION[state.status];
}

export function isOperationBusy<TError>(
  state: OperationState<TError>,
): state is BusyOperationState<TError> {
  return state.status === 'starting' || state.status === 'running';
}

export function isOperationTerminal<TError>(
  state: OperationState<TError>,
): state is TerminalOperationState<TError> {
  return (
    state.status === 'success' ||
    state.status === 'error' ||
    state.status === 'cancelled'
  );
}

/**
 * Converts determinate progress to a clamped ratio. Indeterminate work should
 * use a `null` progress value instead of a synthetic percentage.
 */
export function getOperationProgressRatio(
  progress: OperationProgress,
): number {
  if (
    !Number.isFinite(progress.completed) ||
    progress.completed < 0 ||
    !Number.isFinite(progress.total) ||
    progress.total <= 0
  ) {
    throw new RangeError(
      'Operation progress requires a non-negative finite completed value and a positive finite total.',
    );
  }

  return Math.min(progress.completed / progress.total, 1);
}
