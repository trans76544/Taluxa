import { describe, expect, it, vi } from 'vitest';
import {
  PlayerSessionManager,
  PlayerStartupCoordinator,
  type PlayerSessionEvent,
} from './playerSessionManager';

function event(playerSessionId: number, itemId = `item-${playerSessionId}`): PlayerSessionEvent {
  return {
    playerSessionId,
    itemId,
    playbackId: `${playerSessionId}:playback`,
    sequence: 1,
    phase: 'started',
    positionSeconds: 0,
    durationSeconds: 100,
  };
}

describe('PlayerSessionManager', () => {
  it('buffers an event until the matching session is registered', () => {
    const manager = new PlayerSessionManager();
    const onEvent = vi.fn();

    manager.dispatch(event(2));
    manager.register({ playerSessionId: 1, itemId: 'item-1' });
    expect(onEvent).not.toHaveBeenCalled();

    manager.register({ playerSessionId: 2, itemId: 'item-2', onEvent });

    expect(onEvent).toHaveBeenCalledWith(event(2));
  });

  it('retains independent records and routes later events to only the target', () => {
    const manager = new PlayerSessionManager();
    const first = vi.fn();
    const second = vi.fn();

    manager.register({ playerSessionId: 1, itemId: 'same-item', onEvent: first });
    manager.register({ playerSessionId: 2, itemId: 'same-item', onEvent: second });
    manager.dispatch(event(2, 'same-item'));

    expect(manager.getAll()).toHaveLength(2);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(event(2, 'same-item'));
  });

  it('removes only the requested terminal session', () => {
    const manager = new PlayerSessionManager();
    manager.register({ playerSessionId: 1, itemId: 'item-1' });
    manager.register({ playerSessionId: 2, itemId: 'item-2' });

    expect(manager.remove(1)).toBe(true);
    expect(manager.get(1)).toBeUndefined();
    expect(manager.get(2)).toEqual({ playerSessionId: 2, itemId: 'item-2' });
  });

  it('bounds unknown-session buffering and drops the oldest session identity', () => {
    const manager = new PlayerSessionManager();
    for (let playerSessionId = 1; playerSessionId <= 33; playerSessionId += 1) {
      manager.dispatch(event(playerSessionId));
    }
    const oldest = vi.fn();
    const newest = vi.fn();

    manager.register({ playerSessionId: 1, itemId: 'item-1', onEvent: oldest });
    manager.register({ playerSessionId: 33, itemId: 'item-33', onEvent: newest });

    expect(oldest).not.toHaveBeenCalled();
    expect(newest).toHaveBeenCalledWith(event(33));
  });
});

describe('PlayerStartupCoordinator', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
    return { promise, resolve };
  }

  it('creates a record synchronously and starts surface open and preparation in parallel', async () => {
    const opened = deferred<{ launchRequestId: number; playerSessionId: number }>();
    const prepared = deferred<{ streamUrl: string }>();
    const bridge = { open: vi.fn(() => opened.promise), load: vi.fn().mockResolvedValue(undefined) };
    const prepare = vi.fn(() => prepared.promise);
    const coordinator = new PlayerStartupCoordinator(bridge);

    const record = coordinator.start({
      launchRequestId: 3, itemId: 'movie-1', title: 'Movie 1', prepare,
    });

    expect(record).toEqual(expect.objectContaining({ launchRequestId: 3, state: 'opening-and-preparing' }));
    expect(bridge.open).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(bridge.load).not.toHaveBeenCalled();

    opened.resolve({ launchRequestId: 3, playerSessionId: 8 });
    await Promise.resolve();
    expect(bridge.load).not.toHaveBeenCalled();
    prepared.resolve({ streamUrl: 'https://media.example/video.mp4' });
    await vi.waitFor(() => expect(bridge.load).toHaveBeenCalledWith(expect.objectContaining({
      launchRequestId: 3, playerSessionId: 8, loadRequestId: 1, itemId: 'movie-1',
    })));
  });

  it('survives route-owner release and deduplicates StrictMode replay', async () => {
    const bridge = {
      open: vi.fn().mockResolvedValue({ launchRequestId: 5, playerSessionId: 9 }),
      load: vi.fn().mockResolvedValue(undefined),
    };
    const prepare = vi.fn().mockResolvedValue({ streamUrl: 'https://media.example/video.mp4' });
    const coordinator = new PlayerStartupCoordinator(bridge);
    const request = { launchRequestId: 5, itemId: 'movie-1', title: 'Movie 1', prepare };

    const first = coordinator.start(request);
    coordinator.releaseOwner(5);
    const replay = coordinator.start(request);

    expect(replay).toBe(first);
    await vi.waitFor(() => expect(bridge.load).toHaveBeenCalledTimes(1));
    expect(bridge.open).toHaveBeenCalledTimes(1);
    expect(coordinator.get(5)).toBe(first);
  });

  it('retries a failed generation in the same surface and rejects stale retry requests', async () => {
    const bridge = {
      open: vi.fn().mockResolvedValue({ launchRequestId: 6, playerSessionId: 12 }),
      load: vi.fn().mockResolvedValue(undefined),
    };
    const prepare = vi.fn().mockResolvedValue({ streamUrl: 'https://media.example/video.mp4' });
    const coordinator = new PlayerStartupCoordinator(bridge);
    coordinator.start({ launchRequestId: 6, itemId: 'movie-1', title: 'Movie 1', prepare });
    await vi.waitFor(() => expect(bridge.load).toHaveBeenCalledTimes(1));
    coordinator.handleStartupEvent({
      playerSessionId: 12, launchRequestId: 6, loadRequestId: 1, itemId: 'movie-1',
      phase: 'failed', retryable: true, message: 'Unable to load this video.',
    });

    expect(coordinator.retry({
      playerSessionId: 12, launchRequestId: 6, failedLoadRequestId: 1, itemId: 'movie-1',
    })).toBe(true);
    await vi.waitFor(() => expect(bridge.load).toHaveBeenCalledTimes(2));
    expect(bridge.load).toHaveBeenLastCalledWith(expect.objectContaining({
      playerSessionId: 12, loadRequestId: 2,
    }));
    expect(coordinator.retry({
      playerSessionId: 12, launchRequestId: 6, failedLoadRequestId: 1, itemId: 'movie-1',
    })).toBe(false);
  });

  it('publishes terminal close state, removes the attempt, and rejects later retries', async () => {
    const bridge = {
      open: vi.fn().mockResolvedValue({ launchRequestId: 7, playerSessionId: 13 }),
      load: vi.fn().mockResolvedValue(undefined),
    };
    const changes = vi.fn();
    const coordinator = new PlayerStartupCoordinator(bridge, changes);
    coordinator.start({
      launchRequestId: 7,
      itemId: 'movie-1',
      title: 'Movie 1',
      prepare: vi.fn().mockResolvedValue({ streamUrl: 'https://media.example/video.mp4' }),
    });
    await vi.waitFor(() => expect(bridge.load).toHaveBeenCalledOnce());

    coordinator.handleStartupEvent({
      playerSessionId: 13,
      launchRequestId: 7,
      loadRequestId: 1,
      itemId: 'movie-1',
      phase: 'closed',
    });

    expect(changes).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'closed' }));
    expect(coordinator.get(7)).toBeUndefined();
    expect(coordinator.retry({
      playerSessionId: 13,
      launchRequestId: 7,
      failedLoadRequestId: 1,
      itemId: 'movie-1',
    })).toBe(false);
  });

  it('reports a redacted preparation failure to the surface even when open finishes later', async () => {
    const opened = deferred<{ launchRequestId: number; playerSessionId: number }>();
    const bridge = {
      open: vi.fn(() => opened.promise),
      load: vi.fn().mockResolvedValue(undefined),
      reportFailure: vi.fn().mockResolvedValue(undefined),
    };
    const coordinator = new PlayerStartupCoordinator(bridge);
    coordinator.start({
      launchRequestId: 8,
      itemId: 'movie-1',
      title: 'Movie 1',
      prepare: vi.fn().mockRejectedValue(new Error('https://secret.example/video?api_key=abc')),
    });
    await vi.waitFor(() => expect(coordinator.get(8)?.state).toBe('failed'));

    opened.resolve({ launchRequestId: 8, playerSessionId: 14 });

    await vi.waitFor(() => expect(bridge.reportFailure).toHaveBeenCalledWith({
      playerSessionId: 14,
      launchRequestId: 8,
      loadRequestId: 1,
      itemId: 'movie-1',
      message: 'Unable to prepare this video.',
    }));
    expect(coordinator.get(8)).toEqual(expect.objectContaining({ state: 'failed', playerSessionId: 14 }));
  });
});
