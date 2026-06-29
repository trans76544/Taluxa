export type BrowsingSurface = 'details' | 'search' | 'library' | 'aggregate';

export type BrowsingPrimaryStatus = 'idle' | 'loading' | 'loaded' | 'failed' | 'stale';

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
  primaryData: TPrimary | null;
  optionalFailures?: BrowsingSectionFailure[];
}): BrowsingSurfaceLoadResult<TPrimary> {
  const optionalFailures = input.optionalFailures ?? [];

  return {
    surface: input.surface,
    generation: input.generation,
    primaryStatus: input.primaryStatus,
    primaryData: input.primaryData,
    optionalFailures,
    message: buildOptionalFailureMessage(optionalFailures),
  };
}
