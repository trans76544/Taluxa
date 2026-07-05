import { describe, expect, it } from 'vitest';
import type {
  LibraryEpisode,
  LibraryItemMediaSource,
} from '@shared/models/library';
import {
  choosePlaybackPreparationDecision,
  createPlaybackPreparationKey,
  createEpisodeSelector,
  formatEpisodeSelectorTitle,
  isPlaybackPreparationKeyMatch,
  isFastDirectPlaybackMediaSource,
  pickDefaultAudioStreamIndex,
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

  it('creates account and selection scoped playback preparation keys', () => {
    expect(
      createPlaybackPreparationKey({
        accountId: 'account-1',
        itemId: 'item-1',
        mediaSourceId: 'source-1',
        audioStreamIndex: 2,
        resumeTicks: 3000000000,
      })
    ).toBe('account-1::item-1::source-1::2::3000000000');

    expect(
      createPlaybackPreparationKey({
        accountId: 'account-1',
        itemId: 'item-1',
      })
    ).toBe('account-1::item-1::::::');
  });

  it('matches prepared playback candidates only for the same selection identity', () => {
    const candidateKey = createPlaybackPreparationKey({
      accountId: 'account-1',
      itemId: 'item-1',
      mediaSourceId: 'source-1',
      audioStreamIndex: 2,
      resumeTicks: 3000000000,
    });

    expect(
      isPlaybackPreparationKeyMatch(candidateKey, {
        accountId: 'account-1',
        itemId: 'item-1',
        mediaSourceId: 'source-1',
        audioStreamIndex: 2,
        resumeTicks: 3000000000,
      })
    ).toBe(true);
    expect(
      isPlaybackPreparationKeyMatch(candidateKey, {
        accountId: 'account-1',
        itemId: 'item-1',
        mediaSourceId: 'source-2',
        audioStreamIndex: 2,
        resumeTicks: 3000000000,
      })
    ).toBe(false);
  });

  it('preserves default audio stream identity for prepared playback', () => {
    expect(
      pickDefaultAudioStreamIndex(
        createMediaSource({
          audioStreams: [
            { Index: 7, DisplayTitle: 'Commentary', IsDefault: false },
            { Index: 2, DisplayTitle: 'Main', IsDefault: true },
          ],
        })
      )
    ).toBe(2);
    expect(
      pickDefaultAudioStreamIndex(
        createMediaSource({
          audioStreams: [{ DisplayTitle: 'Fallback', IsDefault: false }],
        })
      )
    ).toBe(0);
    expect(pickDefaultAudioStreamIndex(createMediaSource())).toBeNull();
  });

  it('chooses the fastest safe playback preparation decision', () => {
    const directSource = createMediaSource({
      container: 'mp4',
      id: 'direct-source',
      videoCodec: 'h264',
    });
    const slowSource = createMediaSource({
      container: 'mkv',
      id: 'slow-source',
      videoCodec: 'hevc',
    });

    expect(
      choosePlaybackPreparationDecision({
        candidateKey: null,
        expectedKey: 'key-1',
        selectedMediaSource: directSource,
      })
    ).toEqual({ kind: 'direct-source', reason: 'selected-media-source-is-direct-playable' });
    expect(
      choosePlaybackPreparationDecision({
        candidateKey: 'key-1',
        expectedKey: 'key-1',
        selectedMediaSource: slowSource,
      })
    ).toEqual({ kind: 'prepared-candidate', reason: 'prepared-candidate-key-matched' });
    expect(
      choosePlaybackPreparationDecision({
        candidateKey: 'key-2',
        expectedKey: 'key-1',
        selectedMediaSource: slowSource,
      })
    ).toEqual({ kind: 'playback-info', reason: 'no-safe-fast-path' });
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
