export type LoadTimingResult = 'failure' | 'partial' | 'success';

export interface LoadTimingMilestone {
  attemptId: number;
  elapsedMs: number;
  name: string;
  result: LoadTimingResult;
  surface: string;
}

export interface LoadTimingRecorder {
  readonly milestones: LoadTimingMilestone[];
  mark: (name: string, result?: LoadTimingResult) => LoadTimingMilestone;
}

export function createLoadTimingRecorder({
  attemptId,
  now = () => Date.now(),
  surface,
}: {
  attemptId: number;
  now?: () => number;
  surface: string;
}): LoadTimingRecorder {
  const startedAtMs = now();
  const milestones: LoadTimingMilestone[] = [];

  return {
    get milestones() {
      return [...milestones];
    },
    mark(name, result = 'success') {
      const milestone = {
        attemptId,
        elapsedMs: Math.max(0, now() - startedAtMs),
        name,
        result,
        surface,
      };

      milestones.push(milestone);
      return milestone;
    },
  };
}
