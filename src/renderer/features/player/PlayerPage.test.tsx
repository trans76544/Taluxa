import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlayerPage } from './PlayerPage';

interface PlayerProgressEvent {
  itemId: string;
  positionSeconds: number;
  durationSeconds: number;
}

function mockPlayerBridge() {
  const listeners = new Set<(event: PlayerProgressEvent) => void>();
  const launch = vi.fn(() => new Promise<void>(() => undefined));
  const onProgress = vi.fn((listener: (event: PlayerProgressEvent) => void) => {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  });

  window.embyDesktop = {
    player: {
      launch,
      onProgress,
    },
  } as unknown as Window['embyDesktop'];

  return {
    launch,
    onProgress,
    emitProgress(event: PlayerProgressEvent) {
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PlayerPage', () => {
  it('renders the selected playback title', () => {
    mockPlayerBridge();

    render(
      <PlayerPage
        itemId="item-1"
        title="Movie 1"
        streamUrl="https://demo.emby.local/Videos/item-1/stream.mp4?static=true&api_key=token-123"
        initialPositionSeconds={42}
        onProgress={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: 'Movie 1' })).toBeInTheDocument();
    expect(screen.getByText('Desktop playback')).toBeInTheDocument();
  });

  it('launches mpv with the resolved resume position', async () => {
    const { launch } = mockPlayerBridge();

    render(
      <PlayerPage
        itemId="item-1"
        title="Movie 1"
        streamUrl="https://demo.emby.local/Videos/item-1/stream.mp4?static=true&api_key=token-123"
        initialPositionSeconds={42}
        onProgress={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(launch).toHaveBeenCalledWith({
        itemId: 'item-1',
        title: 'Movie 1',
        streamUrl:
          'https://demo.emby.local/Videos/item-1/stream.mp4?static=true&api_key=token-123',
        startSeconds: 42,
      });
    });
  });

  it('shows a ready state after mpv launch resolves', async () => {
    const deferred = createDeferred<void>();
    const { launch } = mockPlayerBridge();
    launch.mockReturnValueOnce(deferred.promise);

    render(
      <PlayerPage
        itemId="item-1"
        title="Movie 1"
        streamUrl="https://demo.emby.local/Videos/item-1/stream.mp4?static=true&api_key=token-123"
        initialPositionSeconds={42}
        onProgress={vi.fn()}
      />
    );

    expect(screen.getByText('Launching mpv...')).toBeInTheDocument();

    deferred.resolve();

    expect(await screen.findByText('mpv window opened. Keep this page open to sync progress.')).toBeInTheDocument();
    expect(screen.queryByText('Launching mpv...')).not.toBeInTheDocument();
  });

  it('shows a visible error when the mpv bridge launch rejects', async () => {
    const { launch } = mockPlayerBridge();
    launch.mockRejectedValueOnce(new Error('spawn failed'));

    render(
      <PlayerPage
        itemId="item-1"
        title="Movie 1"
        streamUrl="https://demo.emby.local/Videos/item-1/stream.mp4?static=true&api_key=token-123"
        initialPositionSeconds={42}
        onProgress={vi.fn()}
      />
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not start desktop playback. Restart the app and try again.'
    );
    expect(screen.queryByText('Launching mpv...')).not.toBeInTheDocument();
  });

  it('forwards matching bridge progress events to onProgress', async () => {
    const { emitProgress, onProgress: subscribe } = mockPlayerBridge();
    const onProgress = vi.fn();

    const { unmount } = render(
      <PlayerPage
        itemId="item-1"
        title="Movie 1"
        streamUrl="https://demo.emby.local/Videos/item-1/stream.mp4?static=true&api_key=token-123"
        initialPositionSeconds={42}
        onProgress={onProgress}
      />
    );

    expect(subscribe).toHaveBeenCalledTimes(1);

    act(() => {
      emitProgress({
        itemId: 'item-2',
        positionSeconds: 12,
        durationSeconds: 180,
      });
      emitProgress({
        itemId: 'item-1',
        positionSeconds: 24,
        durationSeconds: 180,
      });
    });

    await waitFor(() => {
      expect(onProgress).toHaveBeenCalledTimes(1);
    });
    expect(onProgress).toHaveBeenCalledWith({
      itemId: 'item-1',
      positionSeconds: 24,
      durationSeconds: 180,
    });

    unmount();

    act(() => {
      emitProgress({
        itemId: 'item-1',
        positionSeconds: 30,
        durationSeconds: 180,
      });
    });

    expect(onProgress).toHaveBeenCalledTimes(1);
  });
});
