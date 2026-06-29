import type { LibraryEpisode, LibraryItemDetails, LibraryItemMediaSource } from '@shared/models/library';

export function seekVideo(video: HTMLVideoElement, positionSeconds: number): void {
  if (positionSeconds >= 0) {
    video.currentTime = positionSeconds;
  }
}

export function getPlaybackMediaSourcesForItem(input: {
  details: LibraryItemDetails | null;
  episodes: LibraryEpisode[];
  itemId: string;
}): LibraryItemMediaSource[] {
  if (input.details?.id === input.itemId) {
    return input.details.mediaSources;
  }

  return input.episodes.find((episode) => episode.id === input.itemId)?.mediaSources ?? [];
}

export function resolvePlaybackTitle(input: {
  fallbackTitle: string;
  selectionTitle?: string | null;
}): string {
  return input.selectionTitle?.trim() || input.fallbackTitle;
}
