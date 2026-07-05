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

export interface TimingSegmentDefinition {
  avoidable: boolean;
  from: string;
  name: string;
  to: string;
}

export interface TimingSegment {
  avoidable: boolean;
  durationMs: number;
  endMilestone: string;
  name: string;
  startMilestone: string;
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

export function getTimingSegments(
  milestones: LoadTimingMilestone[],
  definitions: TimingSegmentDefinition[]
): TimingSegment[] {
  const milestoneByName = new Map<string, LoadTimingMilestone>();

  for (const milestone of milestones) {
    milestoneByName.set(milestone.name, milestone);
  }

  return definitions.reduce<TimingSegment[]>((segments, definition) => {
    const start = milestoneByName.get(definition.from);
    const end = milestoneByName.get(definition.to);

    if (!start || !end) {
      return segments;
    }

    segments.push({
      avoidable: definition.avoidable,
      durationMs: Math.max(0, end.elapsedMs - start.elapsedMs),
      endMilestone: definition.to,
      name: definition.name,
      startMilestone: definition.from,
    });

    return segments;
  }, []);
}
