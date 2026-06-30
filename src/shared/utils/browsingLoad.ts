export type BrowsingSurface = 'details' | 'search' | 'library' | 'aggregate';

export type BrowsingPrimaryStatus = 'idle' | 'loading' | 'loaded' | 'failed' | 'stale';
export type BrowsingSupportingStatus =
  | 'idle'
  | 'loading'
  | 'loaded'
  | 'failed'
  | 'partial-failure';

export type BrowsingSectionFailureReason =
  | 'network'
  | 'timeout'
  | 'unauthorized'
  | 'unavailable'
  | 'unknown';

export interface BrowsingSectionFailure {
  section: string;
  label: string;
  reason: BrowsingSectionFailureReason;
  serverId?: string;
}

export interface BrowsingSurfaceLoadResult<TPrimary> {
  surface: BrowsingSurface;
  generation: number;
  primaryStatus: BrowsingPrimaryStatus;
  supportingStatus?: BrowsingSupportingStatus;
  primaryData: TPrimary | null;
  optionalFailures: BrowsingSectionFailure[];
  message?: string;
}

export interface RequestGenerationGuard {
  readonly current: number;
  next: () => number;
  isCurrent: (generation: number) => boolean;
}

export function createRequestGenerationGuard(initialGeneration = 0): RequestGenerationGuard {
  let currentGeneration = initialGeneration;

  return {
    get current() {
      return currentGeneration;
    },
    next() {
      currentGeneration += 1;
      return currentGeneration;
    },
    isCurrent(generation: number) {
      return generation === currentGeneration;
    },
  };
}

export function classifyBrowsingFailure(error: unknown): BrowsingSectionFailureReason {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'unavailable';
  }

  if (error instanceof Error) {
    const message = error.message.toLocaleLowerCase();

    if (message.includes('timeout') || message.includes('timed out')) {
      return 'timeout';
    }

    if (message.includes('401') || message.includes('403') || message.includes('unauthorized')) {
      return 'unauthorized';
    }

    if (message.includes('network') || message.includes('fetch')) {
      return 'network';
    }
  }

  return 'unknown';
}

export function createBrowsingSectionFailure(input: {
  section: string;
  label: string;
  error?: unknown;
  reason?: BrowsingSectionFailureReason;
  serverId?: string;
}): BrowsingSectionFailure {
  return {
    section: input.section,
    label: input.label,
    reason: input.reason ?? classifyBrowsingFailure(input.error),
    ...(input.serverId ? { serverId: input.serverId } : {}),
  };
}

export function buildOptionalFailureMessage(failures: BrowsingSectionFailure[]): string | undefined {
  if (failures.length === 0) {
    return undefined;
  }

  const labels = Array.from(
    new Set(
      failures
        .map((failure) => failure.label.trim())
        .filter((label) => label.length > 0)
    )
  );

  if (labels.length === 0) {
    return 'Some secondary content could not be loaded.';
  }

  return `Some secondary content could not be loaded: ${labels.join(', ')}.`;
}

export function createBrowsingLoadResult<TPrimary>(input: {
  surface: BrowsingSurface;
  generation: number;
  primaryStatus: BrowsingPrimaryStatus;
  supportingStatus?: BrowsingSupportingStatus;
  primaryData: TPrimary | null;
  optionalFailures?: BrowsingSectionFailure[];
}): BrowsingSurfaceLoadResult<TPrimary> {
  const optionalFailures = input.optionalFailures ?? [];

  return {
    surface: input.surface,
    generation: input.generation,
    primaryStatus: input.primaryStatus,
    ...(input.supportingStatus ? { supportingStatus: input.supportingStatus } : {}),
    primaryData: input.primaryData,
    optionalFailures,
    message: buildOptionalFailureMessage(optionalFailures),
  };
}

export function createSurfaceLoadState<TPrimary>(input: {
  surface: BrowsingSurface;
  generation: number;
  primaryData?: TPrimary | null;
}): BrowsingSurfaceLoadResult<TPrimary> {
  return createBrowsingLoadResult({
    surface: input.surface,
    generation: input.generation,
    primaryStatus: input.primaryData ? 'loaded' : 'loading',
    supportingStatus: 'idle',
    primaryData: input.primaryData ?? null,
  });
}

export function markPrimaryReady<TPrimary>(
  state: BrowsingSurfaceLoadResult<TPrimary>,
  primaryData: TPrimary
): BrowsingSurfaceLoadResult<TPrimary> {
  return createBrowsingLoadResult({
    ...state,
    primaryStatus: 'loaded',
    primaryData,
    optionalFailures: state.optionalFailures,
    supportingStatus: state.supportingStatus ?? 'idle',
  });
}

export function markSupportingLoading<TPrimary>(
  state: BrowsingSurfaceLoadResult<TPrimary>
): BrowsingSurfaceLoadResult<TPrimary> {
  return createBrowsingLoadResult({
    ...state,
    optionalFailures: state.optionalFailures,
    supportingStatus: 'loading',
  });
}

export function markSupportingFailure<TPrimary>(
  state: BrowsingSurfaceLoadResult<TPrimary>,
  failures: BrowsingSectionFailure[]
): BrowsingSurfaceLoadResult<TPrimary> {
  return createBrowsingLoadResult({
    ...state,
    optionalFailures: failures,
    supportingStatus: state.primaryStatus === 'loaded' ? 'partial-failure' : 'failed',
  });
}
