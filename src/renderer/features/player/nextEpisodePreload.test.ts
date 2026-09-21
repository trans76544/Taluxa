import { describe, expect, it, vi } from 'vitest';
import type { PlayerPlaybackEvent } from '@shared/models/playback';
import { NextEpisodePreloadCoordinator } from './nextEpisodePreload';

type ActivePlaybackEvent = Extract<PlayerPlaybackEvent, { phase: 'started' | 'progress' }>;

function playbackEvent(overrides: Partial<ActivePlaybackEvent> = {}): ActivePlaybackEvent {
  return {
    playerSessionId: 1,
    playbackId: '1:1',
    sequence: 1,
    phase: 'progress',
    itemId: 'episode-1',
    positionSeconds: 85,
    durationSeconds: 100,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function createCoordinator() {
  const coordinator = new NextEpisodePreloadCoordinator<{ streamUrl: string }>();
  const prepare = vi.fn().mockResolvedValue({ streamUrl: 'https://media.example/episode-2' });
  coordinator.register({
    playerSessionId: 1,
    currentItemId: 'episode-1',
    targetItemId: 'episode-2',
    fingerprint: 'account::server::episode-2',
    prepare,
  });
  return { coordinator, prepare };
}

describe('NextEpisodePreloadCoordinator', () => {
  it('starts preparation once when progress first reaches or exceeds 85 percent', async () => {
    const { coordinator, prepare } = createCoordinator();

    coordinator.handleEvent(playbackEvent({ positionSeconds: 84 }));
    coordinator.handleEvent(playbackEvent({ positionSeconds: 85 }));
    coordinator.handleEvent(playbackEvent({ positionSeconds: 96 }));

    await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce());
    await expect(coordinator.consume({
      playerSessionId: 1,
      currentItemId: 'episode-1',
      targetItemId: 'episode-2',
      fingerprint: 'account::server::episode-2',
    })).resolves.toEqual({ streamUrl: 'https://media.example/episode-2' });
  });

  it('starts preparation when a progress event jumps from below to above the threshold', async () => {
    const { coordinator, prepare } = createCoordinator();

    coordinator.handleEvent(playbackEvent({ positionSeconds: 12 }));
    coordinator.handleEvent(playbackEvent({ positionSeconds: 91 }));

    await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce());
  });

  it('does not start preparation for a missing duration or a different playback identity', () => {
    const { coordinator, prepare } = createCoordinator();

    coordinator.handleEvent(playbackEvent({ phase: 'started', positionSeconds: 0 }));
    coordinator.handleEvent(playbackEvent({ durationSeconds: 0 }));
    coordinator.handleEvent(playbackEvent({ playbackId: '1:stale', positionSeconds: 96 }));

    expect(prepare).not.toHaveBeenCalled();
  });

  it('returns the in-flight preparation for the exact next-episode selection', async () => {
    const coordinator = new NextEpisodePreloadCoordinator<{ streamUrl: string }>();
    const source = deferred<{ streamUrl: string }>();
    const prepare = vi.fn(() => source.promise);
    coordinator.register({
      playerSessionId: 1,
      currentItemId: 'episode-1',
      targetItemId: 'episode-2',
      fingerprint: 'fingerprint',
      prepare,
    });
    coordinator.handleEvent(playbackEvent());

    const candidate = coordinator.consume({
      playerSessionId: 1,
      currentItemId: 'episode-1',
      targetItemId: 'episode-2',
      fingerprint: 'fingerprint',
    });
    expect(candidate).not.toBeNull();
    expect(prepare).toHaveBeenCalledOnce();

    source.resolve({ streamUrl: 'https://media.example/episode-2' });
    await expect(candidate).resolves.toEqual({ streamUrl: 'https://media.example/episode-2' });
  });

  it('does not return a candidate for another target and releases the session on close', async () => {
    const { coordinator, prepare } = createCoordinator();
    coordinator.handleEvent(playbackEvent());
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce());

    expect(coordinator.consume({
      playerSessionId: 1,
      currentItemId: 'episode-1',
      targetItemId: 'episode-3',
      fingerprint: 'account::server::episode-3',
    })).toBeNull();

    coordinator.releaseSession(1);
    expect(coordinator.consume({
      playerSessionId: 1,
      currentItemId: 'episode-1',
      targetItemId: 'episode-2',
      fingerprint: 'account::server::episode-2',
    })).toBeNull();
  });

  it('falls back after a preparation failure without retaining the failure detail', async () => {
    const coordinator = new NextEpisodePreloadCoordinator<{ streamUrl: string }>();
    coordinator.register({
      playerSessionId: 1,
      currentItemId: 'episode-1',
      targetItemId: 'episode-2',
      fingerprint: 'fingerprint',
      prepare: vi.fn().mockRejectedValue(new Error('https://secret.example/video?api_key=secret')),
    });
    coordinator.handleEvent(playbackEvent());

    await vi.waitFor(() => expect(coordinator.getState(1)).toBe('failed'));
    expect(coordinator.consume({
      playerSessionId: 1,
      currentItemId: 'episode-1',
      targetItemId: 'episode-2',
      fingerprint: 'fingerprint',
    })).toBeNull();
  });
});
