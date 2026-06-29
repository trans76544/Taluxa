import { describe, expect, it } from 'vitest';
import type { LibraryEpisode, LibraryItemDetails, LibraryItemMediaSource } from '@shared/models/library';
import { getPlaybackMediaSourcesForItem, resolvePlaybackTitle, seekVideo } from './playerAdapter';

function createSource(id: string): LibraryItemMediaSource {
  return {
    id,
    container: 'mkv',
    path: `/media/${id}.mkv`,
    size: null,
    bitrate: null,
    videoCodec: 'hevc',
    videoStream: null,
    audioStreams: [],
  };
}

function createDetails(): LibraryItemDetails {
  return {
    id: 'movie-1',
    name: 'Movie 1',
    type: 'Movie',
    overview: '',
    genres: [],
    communityRating: null,
    officialRating: '',
    productionYear: null,
    runtimeTicks: null,
    serverPositionTicks: null,
    posterUrl: '',
    imageCandidates: [],
    backdropUrl: null,
    people: [],
    studios: [],
    externalUrls: [],
    mediaSources: [createSource('movie-source')],
  };
}

function createEpisode(): LibraryEpisode {
  return {
    id: 'episode-1',
    name: 'Episode 1',
    overview: '',
    indexNumber: 1,
    parentIndexNumber: 1,
    posterUrl: null,
    imageCandidates: [],
    runtimeTicks: null,
    serverPositionTicks: null,
    mediaSources: [createSource('episode-source')],
  };
}

describe('playerAdapter', () => {
  it('keeps seeking bounded to non-negative positions', () => {
    const video = document.createElement('video');

    seekVideo(video, 12);
    expect(video.currentTime).toBe(12);

    seekVideo(video, -1);
    expect(video.currentTime).toBe(12);
  });

  it('selects media sources from details or the matching episode', () => {
    const details = createDetails();
    const episode = createEpisode();

    expect(
      getPlaybackMediaSourcesForItem({
        details,
        episodes: [episode],
        itemId: 'movie-1',
      })
    ).toEqual(details.mediaSources);
    expect(
      getPlaybackMediaSourcesForItem({
        details,
        episodes: [episode],
        itemId: 'episode-1',
      })
    ).toEqual(episode.mediaSources);
  });

  it('prefers trimmed selection titles before falling back to details title', () => {
    expect(resolvePlaybackTitle({ fallbackTitle: 'Movie 1', selectionTitle: ' Episode 1 ' })).toBe(
      'Episode 1'
    );
    expect(resolvePlaybackTitle({ fallbackTitle: 'Movie 1', selectionTitle: '   ' })).toBe(
      'Movie 1'
    );
  });
});
