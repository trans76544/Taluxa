import { describe, expect, it } from 'vitest';
import {
  isPlayerLoadInput,
  isPlayerOpenInput,
  isPlayerStartupFailureInput,
  isPlayerRetryRequest,
  isPlayerStartupEvent,
  type PlayerStartupPhase,
} from './playerStartup';

describe('player startup contracts', () => {
  it('accepts positive launch, session, and load identities', () => {
    expect(isPlayerOpenInput({ launchRequestId: 1, itemId: 'movie-1', title: 'Movie 1' })).toBe(true);
    expect(isPlayerLoadInput({
      playerSessionId: 2,
      launchRequestId: 1,
      loadRequestId: 3,
      itemId: 'movie-1',
      title: 'Movie 1',
      streamUrl: 'https://media.example/video.mp4',
      startSeconds: 12,
      httpHeaders: { Authorization: 'MediaBrowser token' },
    })).toBe(true);
    expect(isPlayerRetryRequest({
      playerSessionId: 2,
      launchRequestId: 1,
      itemId: 'movie-1',
      failedLoadRequestId: 3,
    })).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects invalid identity value %s', (identity) => {
    expect(isPlayerOpenInput({ launchRequestId: identity, itemId: 'movie-1', title: 'Movie 1' })).toBe(false);
    expect(isPlayerLoadInput({
      playerSessionId: 1,
      launchRequestId: 1,
      loadRequestId: identity,
      itemId: 'movie-1',
      title: 'Movie 1',
      streamUrl: 'https://media.example/video.mp4',
    })).toBe(false);
  });

  it.each<PlayerStartupPhase>([
    'surface-ready',
    'media-loading',
    'media-ready',
    'first-frame',
    'failed',
    'closed',
  ])('accepts the %s startup phase', (phase) => {
    const event = {
      playerSessionId: 2,
      launchRequestId: 1,
      itemId: 'movie-1',
      phase,
      ...(phase === 'surface-ready' || phase === 'closed' ? {} : { loadRequestId: 3 }),
      ...(phase === 'failed' ? { message: 'Unable to load this video.', retryable: true } : {}),
    };
    expect(isPlayerStartupEvent(event)).toBe(true);
  });

  it('requires a load generation only for media-specific phases', () => {
    expect(isPlayerStartupEvent({
      playerSessionId: 2,
      launchRequestId: 1,
      itemId: 'movie-1',
      phase: 'surface-ready',
    })).toBe(true);
    expect(isPlayerStartupEvent({
      playerSessionId: 2,
      launchRequestId: 1,
      itemId: 'movie-1',
      phase: 'media-ready',
    })).toBe(false);
  });

  it('rejects failure payloads that expose credentials or raw locations', () => {
    const base = {
      playerSessionId: 2,
      launchRequestId: 1,
      loadRequestId: 3,
      itemId: 'movie-1',
      phase: 'failed' as const,
      retryable: true,
    };
    expect(isPlayerStartupEvent({ ...base, message: 'Unable to load this video.' })).toBe(true);
    expect(isPlayerStartupEvent({ ...base, message: 'https://media.example/video?api_key=secret' })).toBe(false);
    expect(isPlayerStartupEvent({ ...base, message: 'Authorization: Bearer secret' })).toBe(false);
    expect(isPlayerStartupFailureInput({
      playerSessionId: 2,
      launchRequestId: 1,
      loadRequestId: 3,
      itemId: 'movie-1',
      message: 'Unable to prepare this video.',
    })).toBe(true);
    expect(isPlayerStartupFailureInput({
      playerSessionId: 2,
      launchRequestId: 1,
      loadRequestId: 3,
      itemId: 'movie-1',
      message: 'https://media.example/video?api_key=secret',
    })).toBe(false);
  });
});
