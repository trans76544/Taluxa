import type { StoryLandmarkKind, StoryMarkerDiagnostic, StoryTimelineMarker } from '@shared/models/storyLandmark';
import { createEmbyRequest, type EmbyFetch } from './client';

interface ChapterInfo { MarkerType?: unknown; Name?: unknown; StartPositionTicks?: unknown }
interface MediaSourceInfo { Id?: unknown; Chapters?: unknown }
interface ItemInfo { Chapters?: unknown; MediaSources?: unknown }

export interface FetchStoryTimelineMarkersInput {
  accessToken: string;
  durationSeconds?: number | null;
  fetcher?: EmbyFetch;
  itemId: string;
  mediaSourceId?: string | null;
  onDiagnostic?: (diagnostic: StoryMarkerDiagnostic) => void;
  serverUrl: string;
  userId: string;
}

function mapKind(markerType: unknown): StoryLandmarkKind | null {
  if (markerType === undefined || markerType === null || markerType === '' || markerType === 'Chapter') return 'chapter';
  if (markerType === 'IntroStart') return 'intro';
  if (markerType === 'CreditsStart') return 'credits';
  return null;
}

function normalizeChapter(value: unknown, duration: number | null | undefined): StoryTimelineMarker | null {
  if (!value || typeof value !== 'object') return null;
  const chapter = value as ChapterInfo;
  const kind = mapKind(chapter.MarkerType);
  const ticks = chapter.StartPositionTicks;
  if (!kind || typeof ticks !== 'number' || !Number.isFinite(ticks) || ticks < 0) return null;
  const startSeconds = ticks / 10_000_000;
  if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0 && startSeconds > duration) return null;
  const suppliedName = typeof chapter.Name === 'string' ? chapter.Name.trim() : '';
  const fallback = kind === 'intro' ? '片头' : kind === 'credits' ? '片尾' : '';
  const name = suppliedName || fallback;
  return { startSeconds, names: name ? [name] : [], kinds: [kind] };
}

function mergeMarkers(markers: StoryTimelineMarker[]): StoryTimelineMarker[] {
  const merged: StoryTimelineMarker[] = [];
  for (const marker of markers.sort((a, b) => a.startSeconds - b.startSeconds)) {
    const current = merged.at(-1);
    if (!current || marker.startSeconds - current.startSeconds > 1) {
      merged.push({ ...marker, names: [...marker.names], kinds: [...marker.kinds] });
      continue;
    }
    for (const name of marker.names) if (!current.names.includes(name)) current.names.push(name);
    for (const kind of marker.kinds) if (!current.kinds.includes(kind)) current.kinds.push(kind);
  }
  return merged;
}

export function normalizeEmbyStoryTimelineMarkers(
  chapters: unknown,
  durationSeconds?: number | null
): StoryTimelineMarker[] {
  if (!Array.isArray(chapters)) return [];
  return mergeMarkers(chapters
    .map((chapter) => normalizeChapter(chapter, durationSeconds))
    .filter((marker): marker is StoryTimelineMarker => marker !== null));
}

interface ChapterSelection {
  chapters: unknown[];
  itemChapterCount: number;
  mediaSourceCount: number;
  selectedMediaSourceChapterCount: number;
}

function selectChapters(item: ItemInfo, mediaSourceId?: string | null): ChapterSelection {
  const itemChapters = Array.isArray(item.Chapters) && item.Chapters.length > 0 ? item.Chapters : null;
  const mediaSources = Array.isArray(item.MediaSources) ? item.MediaSources as MediaSourceInfo[] : [];
  let selectedMediaSourceChapterCount = 0;
  let chapters: unknown[] = [];
  if (mediaSourceId) {
    const selected = mediaSources.find((source) => source?.Id === mediaSourceId);
    selectedMediaSourceChapterCount = selected && Array.isArray(selected.Chapters) ? selected.Chapters.length : 0;
    chapters = selectedMediaSourceChapterCount > 0 ? selected!.Chapters as unknown[] : itemChapters ?? [];
  } else if (itemChapters) {
    chapters = itemChapters;
  } else {
    const sourceChapterSets = mediaSources
      .map((source) => source?.Chapters)
      .filter((sourceChapters): sourceChapters is unknown[] => Array.isArray(sourceChapters) && sourceChapters.length > 0);
    chapters = sourceChapterSets.length === 1 ? sourceChapterSets[0] : [];
  }
  return {
    chapters,
    itemChapterCount: itemChapters?.length ?? 0,
    mediaSourceCount: mediaSources.length,
    selectedMediaSourceChapterCount,
  };
}

function emitDiagnostic(input: FetchStoryTimelineMarkersInput, diagnostic: StoryMarkerDiagnostic): void {
  try { input.onDiagnostic?.(diagnostic); } catch { /* diagnostics must not affect playback */ }
}

export async function fetchStoryTimelineMarkers(input: FetchStoryTimelineMarkersInput): Promise<StoryTimelineMarker[]> {
  const path = `/Users/${encodeURIComponent(input.userId)}/Items/${encodeURIComponent(input.itemId)}`;
  let response: Response;
  try {
    response = await createEmbyRequest(input.serverUrl, path, { accessToken: input.accessToken, fetcher: input.fetcher, method: 'GET', operation: 'library' });
  } catch (error) {
    emitDiagnostic(input, { stage: 'request-error' });
    throw error;
  }
  if (!response.ok) {
    emitDiagnostic(input, { stage: 'response', status: response.status, itemChapterCount: 0, mediaSourceCount: 0, selectedMediaSourceChapterCount: 0 });
    throw new Error(`Failed to load Emby story landmarks (${response.status})`);
  }
  const payload = await response.json() as unknown;
  const item = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as ItemInfo : {};
  const selection = selectChapters(item, input.mediaSourceId);
  emitDiagnostic(input, {
    stage: 'response', status: response.status, itemChapterCount: selection.itemChapterCount,
    mediaSourceCount: selection.mediaSourceCount,
    selectedMediaSourceChapterCount: selection.selectedMediaSourceChapterCount,
  });
  const markers = normalizeEmbyStoryTimelineMarkers(selection.chapters, input.durationSeconds);
  emitDiagnostic(input, { stage: 'normalized', chapterCount: selection.chapters.length, markerCount: markers.length });
  return markers;
}
