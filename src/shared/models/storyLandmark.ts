export type StoryLandmarkKind = 'chapter' | 'intro' | 'credits';

export interface StoryTimelineMarker {
  kinds: StoryLandmarkKind[];
  names: string[];
  startSeconds: number;
}

export interface PlayerStoryMarkerUpdate {
  itemId: string;
  markers: StoryTimelineMarker[];
}

const LANDMARK_KINDS = new Set<StoryLandmarkKind>(['chapter', 'intro', 'credits']);

function isStringArray(value: unknown, allowEmpty: boolean): value is string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) return false;
  const values = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string' || !entry.trim() || values.has(entry)) return false;
    values.add(entry);
  }
  return true;
}

function isStoryTimelineMarker(value: unknown): value is StoryTimelineMarker {
  if (!value || typeof value !== 'object') return false;
  const marker = value as Record<string, unknown>;
  return typeof marker.startSeconds === 'number' &&
    Number.isFinite(marker.startSeconds) && marker.startSeconds >= 0 &&
    isStringArray(marker.names, true) &&
    isStringArray(marker.kinds, false) &&
    marker.kinds.every((kind) => LANDMARK_KINDS.has(kind as StoryLandmarkKind));
}

export function isPlayerStoryMarkerUpdate(value: unknown): value is PlayerStoryMarkerUpdate {
  if (!value || typeof value !== 'object') return false;
  const update = value as Record<string, unknown>;
  return typeof update.itemId === 'string' && Boolean(update.itemId.trim()) &&
    Array.isArray(update.markers) && update.markers.every(isStoryTimelineMarker);
}
