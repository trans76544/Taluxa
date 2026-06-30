import { StrictMode } from 'react';
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
  const episodeSelectListeners = new Set<(itemId: string) => void>();
  const launch = vi.fn(() => new Promise<void>(() => undefined));
  const onProgress = vi.fn((listener: (event: PlayerProgressEvent) => void) => {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  });
  const onEpisodeSelect = vi.fn((listener: (itemId: string) => void) => {
    episodeSelectListeners.add(listener);

    return () => {
      episodeSelectListeners.delete(listener);
    };
  });

  window.embyDesktop = {
    player: {
      launch,
      onEpisodeSelect,
      onProgress,
    },
  } as unknown as Window['embyDesktop'];

  return {
    launch,
    onEpisodeSelect,
    onProgress,
    emitEpisodeSelect(itemId: string) {
      for (const listener of episodeSelectListeners) {
        listener(itemId);
      }
    },
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

  it('launches mpv with episode selector data and forwards episode selections', async () => {
    const { emitEpisodeSelect, launch, onEpisodeSelect } = mockPlayerBridge();
    const handleEpisodeSelect = vi.fn();

    render(
      <PlayerPage
        httpHeaders={{}}
        itemId="episode-2"
        title="Series 1 - S1:E2 - Second Case"
        streamUrl="https://demo.emby.local/Videos/episode-2/stream.mp4?static=true&api_key=token-123"
        initialPositionSeconds={42}
        episodeSelector={{
          currentItemId: 'episode-2',
          episodes: [
            {
              itemId: 'episode-1',
              title: 'S1E1 - First Case',
              durationSeconds: 3000,
              thumbnailUrl: 'https://demo.emby.local/Items/episode-1/Images/Primary',
            },
            {
              itemId: 'episode-2',
              title: 'S1E2 - Second Case',
              durationSeconds: 2580,
              thumbnailUrl: 'https://demo.emby.local/Items/episode-2/Images/Primary',
            },
          ],
        }}
        onEpisodeSelect={handleEpisodeSelect}
        onProgress={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(launch).toHaveBeenCalledWith(
        expect.objectContaining({
          episodeSelector: {
            currentItemId: 'episode-2',
            episodes: expect.arrayContaining([
              expect.objectContaining({
                itemId: 'episode-2',
                title: 'S1E2 - Second Case',
                durationSeconds: 2580,
              }),
            ]),
          },
        })
      );
    });
    expect(onEpisodeSelect).toHaveBeenCalledTimes(1);

    act(() => {
      emitEpisodeSelect('episode-1');
    });

    expect(handleEpisodeSelect).toHaveBeenCalledWith('episode-1');
  });

  it('still launches mpv when the episode select bridge is not available', async () => {
    const { launch } = mockPlayerBridge();
    delete (window.embyDesktop.player as Partial<Window['embyDesktop']['player']>).onEpisodeSelect;

    render(
      <PlayerPage
        httpHeaders={{}}
        itemId="episode-2"
        title="Series 1 - S1:E2 - Second Case"
        streamUrl="https://demo.emby.local/Videos/episode-2/stream.mp4?static=true&api_key=token-123"
        initialPositionSeconds={42}
        episodeSelector={{
          currentItemId: 'episode-2',
          episodes: [
            {
              itemId: 'episode-2',
              title: 'S1E2 - Second Case',
              durationSeconds: 2580,
            },
          ],
        }}
        onEpisodeSelect={vi.fn()}
        onProgress={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(launch).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'episode-2',
        })
      );
    });
  });

  it('does not launch mpv twice for the same playback input', async () => {
    const { launch } = mockPlayerBridge();
    const props = {
      httpHeaders: {},
      itemId: 'item-1',
      title: 'Movie 1',
      streamUrl: 'https://demo.emby.local/Videos/item-1/stream.mp4?static=true&api_key=token-123',
      initialPositionSeconds: 42,
      onProgress: vi.fn(),
    };

    const { rerender } = render(<PlayerPage {...props} />);
    rerender(<PlayerPage {...props} />);

    await waitFor(() => {
      expect(launch).toHaveBeenCalledTimes(1);
    });
  });

  it('does not relaunch mpv when the active episode changes inside the same launch request', async () => {
    const { emitProgress, launch } = mockPlayerBridge();
    const onProgress = vi.fn();
    const sharedProps = {
      httpHeaders: {},
      initialPositionSeconds: 0,
      launchRequestId: 7,
      onProgress,
    };

    const { rerender } = render(
      <PlayerPage
        {...sharedProps}
        itemId="episode-1"
        title="Series 1 - S1E1 - First Case"
        streamUrl="https://demo.emby.local/Videos/episode-1/stream.mp4?static=true&api_key=token-123"
      />
    );

    await waitFor(() => {
      expect(launch).toHaveBeenCalledTimes(1);
    });

    rerender(
      <PlayerPage
        {...sharedProps}
        itemId="episode-2"
        title="Series 1 - S1E2 - Second Case"
        streamUrl="https://demo.emby.local/Videos/episode-2/stream.mp4?static=true&api_key=token-123"
      />
    );

    act(() => {
      emitProgress({ itemId: 'episode-2', positionSeconds: 20, durationSeconds: 1200 });
    });

    expect(launch).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({
      itemId: 'episode-2',
      positionSeconds: 20,
      durationSeconds: 1200,
    });
  });

  it('does not double launch when React StrictMode replays effects', async () => {
    const { launch } = mockPlayerBridge();

    render(
      <StrictMode>
        <PlayerPage
          httpHeaders={{}}
          itemId="item-1"
          title="Movie 1"
          streamUrl="https://demo.emby.local/Videos/item-1/stream.mp4?static=true&api_key=token-123"
          initialPositionSeconds={42}
          onProgress={vi.fn()}
        />
      </StrictMode>
    );

    await waitFor(() => {
      expect(launch).toHaveBeenCalledTimes(1);
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

  it('reports readiness only for the current launch request', async () => {
    const firstLaunch = createDeferred<void>();
    const secondLaunch = createDeferred<void>();
    const { launch } = mockPlayerBridge();
    const onLaunchReady = vi.fn();
    launch.mockReturnValueOnce(firstLaunch.promise).mockReturnValueOnce(secondLaunch.promise);

    const { rerender } = render(
      <PlayerPage
        httpHeaders={{}}
        itemId="item-1"
        launchRequestId={1}
        title="Movie 1"
        streamUrl="https://demo.emby.local/Videos/item-1/stream.mp4"
        initialPositionSeconds={0}
        onLaunchReady={onLaunchReady}
        onProgress={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(launch).toHaveBeenCalledTimes(1);
    });

    rerender(
      <PlayerPage
        httpHeaders={{}}
        itemId="item-2"
        launchRequestId={2}
        title="Movie 2"
        streamUrl="https://demo.emby.local/Videos/item-2/stream.mp4"
        initialPositionSeconds={0}
        onLaunchReady={onLaunchReady}
        onProgress={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(launch).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      firstLaunch.resolve();
      await Promise.resolve();
    });

    expect(onLaunchReady).not.toHaveBeenCalled();

    await act(async () => {
      secondLaunch.resolve();
      await Promise.resolve();
    });

    expect(onLaunchReady).toHaveBeenCalledTimes(1);
    expect(onLaunchReady).toHaveBeenCalledWith({
      itemId: 'item-2',
      launchRequestId: 2,
    });
  });

  it('ignores obsolete launch errors and reports current launch failures', async () => {
    const firstLaunch = createDeferred<void>();
    const secondLaunch = createDeferred<void>();
    const { launch } = mockPlayerBridge();
    const onLaunchFailure = vi.fn();
    launch.mockReturnValueOnce(firstLaunch.promise).mockReturnValueOnce(secondLaunch.promise);

    const { rerender } = render(
      <PlayerPage
        httpHeaders={{}}
        itemId="item-1"
        launchRequestId={1}
        title="Movie 1"
        streamUrl="https://demo.emby.local/Videos/item-1/stream.mp4"
        initialPositionSeconds={0}
        onLaunchFailure={onLaunchFailure}
        onProgress={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(launch).toHaveBeenCalledTimes(1);
    });

    rerender(
      <PlayerPage
        httpHeaders={{}}
        itemId="item-2"
        launchRequestId={2}
        title="Movie 2"
        streamUrl="https://demo.emby.local/Videos/item-2/stream.mp4"
        initialPositionSeconds={0}
        onLaunchFailure={onLaunchFailure}
        onProgress={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(launch).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      firstLaunch.reject(new Error('Old launch failed'));
      await Promise.resolve();
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onLaunchFailure).not.toHaveBeenCalled();

    await act(async () => {
      secondLaunch.reject(new Error('Current launch failed'));
      await Promise.resolve();
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Current launch failed');
    expect(onLaunchFailure).toHaveBeenCalledTimes(1);
    expect(onLaunchFailure).toHaveBeenCalledWith({
      itemId: 'item-2',
      launchRequestId: 2,
      message: 'Current launch failed',
    });
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
