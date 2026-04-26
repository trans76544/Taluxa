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
  it('keeps the launcher bridge hidden while playback starts', () => {
    mockPlayerBridge();

    render(
      <PlayerPage
        httpHeaders={{}}
        itemId="item-1"
        title="Movie 1"
        streamUrl="https://demo.emby.local/Videos/item-1/stream.mp4?static=true&api_key=token-123"
        initialPositionSeconds={42}
        onProgress={vi.fn()}
      />
    );

    expect(screen.getByTestId('player-page')).toHaveStyle({ display: 'none' });
    expect(screen.queryByText('Movie 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Desktop playback')).not.toBeInTheDocument();
  });

  it('launches mpv with the resolved resume position and playback headers', async () => {
    const { launch } = mockPlayerBridge();

    render(
      <PlayerPage
        httpHeaders={{
          Authorization: 'MediaBrowser Token="token-123"',
        }}
        itemId="item-1"
        title="Movie 1"
        streamUrl="https://demo.emby.local/Videos/item-1/stream.mkv?MediaSourceId=source-1&api_key=token-123"
        initialPositionSeconds={42}
        onProgress={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(launch).toHaveBeenCalledWith({
        httpHeaders: {
          Authorization: 'MediaBrowser Token="token-123"',
        },
        itemId: 'item-1',
        title: 'Movie 1',
        streamUrl:
          'https://demo.emby.local/Videos/item-1/stream.mkv?MediaSourceId=source-1&api_key=token-123',
        startSeconds: 42,
      });
    });
  });

  it('stays hidden after mpv launch resolves', async () => {
    const deferred = createDeferred<void>();
    const { launch } = mockPlayerBridge();
    launch.mockReturnValueOnce(deferred.promise);

    render(
      <PlayerPage
        httpHeaders={{}}
        itemId="item-1"
        title="Movie 1"
        streamUrl="https://demo.emby.local/Videos/item-1/stream.mp4?static=true&api_key=token-123"
        initialPositionSeconds={42}
        onProgress={vi.fn()}
      />
    );

    expect(screen.getByTestId('player-page')).toHaveStyle({ display: 'none' });
    expect(screen.queryByText('Launching mpv...')).not.toBeInTheDocument();

    deferred.resolve();
    await waitFor(() => {
      expect(launch).toHaveBeenCalledTimes(1);
    });

    expect(
      screen.queryByText('mpv window opened. Keep this page open to sync progress.')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Launching mpv...')).not.toBeInTheDocument();
  });

  it('shows a visible error when the mpv bridge launch rejects', async () => {
    const { launch } = mockPlayerBridge();
    launch.mockRejectedValueOnce(new Error('Access denied'));

    render(
      <PlayerPage
        httpHeaders={{}}
        itemId="item-1"
        title="Movie 1"
        streamUrl="https://demo.emby.local/Videos/item-1/stream.mp4?static=true&api_key=token-123"
        initialPositionSeconds={42}
        onProgress={vi.fn()}
      />
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Access denied');
    expect(screen.queryByText('Launching mpv...')).not.toBeInTheDocument();
  });

  it('forwards matching bridge progress events to onProgress', async () => {
    const { emitProgress, onProgress: subscribe } = mockPlayerBridge();
    const onProgress = vi.fn();

    const { unmount } = render(
      <PlayerPage
        httpHeaders={{}}
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
