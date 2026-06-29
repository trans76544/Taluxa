import { describe, expect, it } from 'vitest';
import type {
  LibraryEpisode,
  LibraryItemMediaSource,
} from '@shared/models/library';
import {
  createEpisodeSelector,
  formatEpisodeSelectorTitle,
  isFastDirectPlaybackMediaSource,
  pickPlaybackMediaSource,
} from './playbackRouteHelpers';

function createMediaSource(
  overrides: Partial<LibraryItemMediaSource> = {}
): LibraryItemMediaSource {
  return {
    audioStreams: [],
    bitrate: null,
    container: 'mp4',
    id: 'source-1',
    path: '',
    size: null,
    videoCodec: 'h264',
    videoStream: null,
    ...overrides,
  };
}

function createEpisode(overrides: Partial<LibraryEpisode> = {}): LibraryEpisode {
  return {
    id: 'episode-1',
    imageCandidates: [],
    indexNumber: 2,
    mediaSources: [],
    name: 'Chapter Two',
    overview: '',
    parentIndexNumber: 1,
    played: false,
    posterUrl: '',
    runtimeTicks: 600000000,
    serverPositionTicks: null,
    ...overrides,
  };
}

describe('playbackRouteHelpers', () => {
  it('picks a preferred media source when available', () => {
    const first = createMediaSource({ id: 'first' });
    const second = createMediaSource({ id: 'second' });

    expect(pickPlaybackMediaSource([first, second], 'second')).toBe(second);
  });

  it('falls back to the first media source', () => {
    const first = createMediaSource({ id: 'first' });
    const second = createMediaSource({ id: 'second' });

    expect(pickPlaybackMediaSource([first, second], 'missing')).toBe(first);
  });

  it('returns null when no playback media source exists', () => {
    expect(pickPlaybackMediaSource([], 'missing')).toBeNull();
  });

  it('allows direct playback for simple progressive sources only', () => {
    expect(isFastDirectPlaybackMediaSource(createMediaSource())).toBe(true);
    expect(isFastDirectPlaybackMediaSource(createMediaSource({ container: 'mkv' }))).toBe(false);
    expect(isFastDirectPlaybackMediaSource(createMediaSource({ videoCodec: 'hevc' }))).toBe(false);
  });

  it('formats and builds an mpv episode selector', () => {
    const episode = createEpisode({
      imageCandidates: [{ kind: 'thumb', url: 'https://example.test/thumb.jpg' }],
    });

    expect(formatEpisodeSelectorTitle(episode)).toBe('S1E2 - Chapter Two');
    expect(createEpisodeSelector(episode.id, [episode])).toEqual({
      currentItemId: episode.id,
      episodes: [
        {
          durationSeconds: 60,
          itemId: episode.id,
          thumbnailUrl: 'https://example.test/thumb.jpg',
          title: 'S1E2 - Chapter Two',
        },
      ],
    });
  });
});
