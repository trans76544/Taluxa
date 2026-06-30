import type {
  LibraryEpisode,
  LibraryItemMediaSource,
} from '@shared/models/library';

export type PlayerEpisodeSelector = NonNullable<
  Parameters<Window['embyDesktop']['player']['launch']>[0]['episodeSelector']
>;

export function pickPlaybackMediaSource(
  mediaSources: LibraryItemMediaSource[],
  preferredMediaSourceId?: string | null
): LibraryItemMediaSource | null {
  if (mediaSources.length === 0) {
    return null;
  }

  const preferredId = preferredMediaSourceId?.trim();
  return (
    (preferredId ? mediaSources.find((source) => source.id === preferredId) : null) ??
    mediaSources[0]
  );
}

export interface PlaybackPreparationKeyInput {
  accountId: string | null | undefined;
  audioStreamIndex?: number | null;
  itemId: string;
  mediaSourceId?: string | null;
  resumeTicks?: number | null;
}

export function createPlaybackPreparationKey({
  accountId,
  audioStreamIndex,
  itemId,
  mediaSourceId,
  resumeTicks,
}: PlaybackPreparationKeyInput): string {
  return [
    accountId?.trim() ?? '',
    itemId.trim(),
    mediaSourceId?.trim() ?? '',
    typeof audioStreamIndex === 'number' ? String(audioStreamIndex) : '',
    typeof resumeTicks === 'number' ? String(resumeTicks) : '',
  ].join('::');
}

export function isPlaybackPreparationKeyMatch(
  candidateKey: string | null | undefined,
  input: PlaybackPreparationKeyInput
): boolean {
  return candidateKey === createPlaybackPreparationKey(input);
}

export function pickDefaultAudioStreamIndex(
  mediaSource: LibraryItemMediaSource | null | undefined
): number | null {
  if (!mediaSource?.audioStreams.length) {
    return null;
  }

  const defaultAudioIndex = mediaSource.audioStreams.findIndex((audio) => audio.IsDefault);
  const selectedIndex = defaultAudioIndex >= 0 ? defaultAudioIndex : 0;
  const audio = mediaSource.audioStreams[selectedIndex];

  return typeof audio.Index === 'number' ? audio.Index : selectedIndex;
}

export function isFastDirectPlaybackMediaSource(mediaSource: LibraryItemMediaSource): boolean {
  const container = mediaSource.container.toLowerCase();
  const videoCodec = mediaSource.videoCodec.toLowerCase();
  const hasProgressiveContainer = ['mp4', 'm4v', 'mov'].some((value) =>
    container.split(',').map((part) => part.trim()).includes(value)
  );
  const needsSeekHeavyDemuxing =
    container.includes('mkv') ||
    container.includes('matroska') ||
    container.includes('webm') ||
    videoCodec === 'hevc' ||
    videoCodec === 'h265';

  return hasProgressiveContainer && !needsSeekHeavyDemuxing;
}

export function formatEpisodeSelectorTitle(episode: LibraryEpisode): string {
  return `S${episode.parentIndexNumber}E${episode.indexNumber} - ${episode.name}`;
}

function runtimeTicksToSeconds(runtimeTicks: number | null): number | null {
  if (typeof runtimeTicks !== 'number' || runtimeTicks <= 0) {
    return null;
  }

  return Math.round(runtimeTicks / 10000000);
}

function pickEpisodeThumbnailUrl(episode: LibraryEpisode): string | null {
  return (
    episode.imageCandidates?.find((image) => image.kind === 'thumb')?.url ??
    episode.posterUrl ??
    episode.imageCandidates?.find((image) => image.kind === 'primary')?.url ??
    episode.imageCandidates?.find((image) => image.kind === 'backdrop')?.url ??
    null
  );
}

export function createEpisodeSelector(
  currentItemId: string,
  episodes: LibraryEpisode[]
): PlayerEpisodeSelector | undefined {
  if (episodes.length === 0 || !episodes.some((episode) => episode.id === currentItemId)) {
    return undefined;
  }

  return {
    currentItemId,
    episodes: episodes.map((episode) => ({
      durationSeconds: runtimeTicksToSeconds(episode.runtimeTicks),
      itemId: episode.id,
      thumbnailUrl: pickEpisodeThumbnailUrl(episode),
      title: formatEpisodeSelectorTitle(episode),
    })),
  };
}
