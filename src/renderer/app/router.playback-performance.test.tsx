import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HashRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { SavedAccount } from '@shared/models/session';
import type { PersistedState } from '@shared/store/persistence';
import { createDefaultSettings } from '@shared/models/settings';
import { createDeferred, flushPromises } from '../../test/deferred';
import {
  createControllablePlayerBridge,
  createDirectPlaybackMediaSource,
  createLibraryEpisode,
  createLibraryItem,
  createLibraryItemDetails,
  createLibrarySeason,
  createMovieDetails,
  createPlaybackInfoFallbackMediaSource,
  createSeriesDetails,
} from '../../test/loadPerformanceFixtures';

const fetchViewsMock = vi.hoisted(() => vi.fn());
const fetchItemsMock = vi.hoisted(() => vi.fn());
const fetchItemsByIdsMock = vi.hoisted(() => vi.fn());
const fetchResumeItemsMock = vi.hoisted(() => vi.fn());
const fetchResumableItemsMock = vi.hoisted(() => vi.fn());
const fetchSearchItemsMock = vi.hoisted(() => vi.fn());
const fetchItemDetailsMock = vi.hoisted(() => vi.fn());
const fetchSimilarItemsMock = vi.hoisted(() => vi.fn());
const fetchSeasonsMock = vi.hoisted(() => vi.fn());
const fetchEpisodesMock = vi.hoisted(() => vi.fn());
const fetchPlaybackStreamSourceMock = vi.hoisted(() => vi.fn());
const reportPlaybackProgressMock = vi.hoisted(() => vi.fn());
const markItemPlayedMock = vi.hoisted(() => vi.fn());
const hideItemFromContinueWatchingMock = vi.hoisted(() => vi.fn());
const addFavoriteItemMock = vi.hoisted(() => vi.fn());
const fetchServerInfoMock = vi.hoisted(() => vi.fn());

vi.mock('@shared/api/emby/auth', () => ({
  login: vi.fn(),
}));

vi.mock('@shared/api/emby/library', () => ({
  fetchViews: fetchViewsMock,
  fetchItems: fetchItemsMock,
  fetchItemsByIds: fetchItemsByIdsMock,
  fetchResumeItems: fetchResumeItemsMock,
  fetchResumableItems: fetchResumableItemsMock,
  fetchSearchItems: fetchSearchItemsMock,
  fetchItemDetails: fetchItemDetailsMock,
  fetchSimilarItems: fetchSimilarItemsMock,
  fetchSeasons: fetchSeasonsMock,
  fetchEpisodes: fetchEpisodesMock,
}));

vi.mock('@shared/api/emby/playback', async () => {
  const actual = await vi.importActual<typeof import('@shared/api/emby/playback')>(
    '@shared/api/emby/playback'
  );

  return {
    ...actual,
    addFavoriteItem: addFavoriteItemMock,
    fetchPlaybackStreamSource: fetchPlaybackStreamSourceMock,
    hideItemFromContinueWatching: hideItemFromContinueWatchingMock,
    markItemPlayed: markItemPlayedMock,
    reportPlaybackProgress: reportPlaybackProgressMock,
  };
});

vi.mock('@shared/api/emby/system', () => ({
  fetchServerInfo: fetchServerInfoMock,
}));

type StoredPersistedState = Omit<PersistedState, 'activeAccountId'> & {
  activeAccountId?: string | null | undefined;
};

function createSavedAccount(overrides: Partial<SavedAccount> = {}): SavedAccount {
  const serverUrl = overrides.serverUrl ?? 'https://demo.emby.local';
  const userId = overrides.userId ?? 'user-1';

  return {
    accessToken: overrides.accessToken ?? 'token-123',
    id: overrides.id ?? `${serverUrl}::${userId}`,
    lastUsedAt: overrides.lastUsedAt ?? '2026-04-21T00:00:00.000Z',
    serverUrl,
    userId,
    userName: overrides.userName ?? 'Alice',
  };
}

function createPersistedState(overrides: Partial<StoredPersistedState> = {}): StoredPersistedState {
  return {
    accounts: [],
    homeCacheByKey: {},
    progressByItemId: {},
    settings: createDefaultSettings(),
    ...overrides,
  };
}

function mockStorageRead(state: StoredPersistedState) {
  const player = createControllablePlayerBridge();

  window.embyDesktop = {
    auth: {
      login: vi.fn(),
    },
    imageCache: {
      clear: vi.fn().mockResolvedValue(undefined),
      configure: vi.fn().mockResolvedValue(undefined),
      resolve: vi.fn(async (sourceUrl: string) => ({
        cacheKey: 'test-image-cache-key',
        fromCache: true,
        url: sourceUrl,
      })),
      stats: vi.fn().mockResolvedValue({ count: 0, sizeBytes: 0 }),
    },
    player: {
      ...player,
    },
    storage: {
      clearSession: vi.fn(),
      read: vi.fn().mockResolvedValue(state),
      write: vi.fn(),
    },
    windowControls: {
      close: vi.fn(),
      maximize: vi.fn(),
      minimize: vi.fn(),
    },
  } as unknown as Window['embyDesktop'];

  return player;
}

function renderMovieRoute(details = createLibraryItemDetails()) {
  const account = createSavedAccount();
  const bridge = mockStorageRead(
    createPersistedState({
      accounts: [account],
      activeAccountId: account.id,
    })
  );

  fetchItemDetailsMock.mockResolvedValue(details);
  window.location.hash = `#/item/${details.id}`;

  render(
    <HashRouter>
      <App />
    </HashRouter>
  );

  return bridge;
}

function renderSeriesRoute() {
  const account = createSavedAccount();
  const bridge = mockStorageRead(
    createPersistedState({
      accounts: [account],
      activeAccountId: account.id,
    })
  );

  fetchItemDetailsMock.mockResolvedValue(createSeriesDetails());
  fetchSeasonsMock.mockResolvedValue([createLibrarySeason()]);
  fetchEpisodesMock.mockResolvedValue([
    createLibraryEpisode({
      id: 'episode-1',
      name: 'First Case',
      mediaSources: [createDirectPlaybackMediaSource({ id: 'episode-1-source' })],
    }),
    createLibraryEpisode({
      id: 'episode-2',
      name: 'Second Case',
      indexNumber: 2,
      mediaSources: [createDirectPlaybackMediaSource({ id: 'episode-2-source' })],
    }),
  ]);
  window.location.hash = '#/item/series-1';

  render(
    <HashRouter>
      <App />
    </HashRouter>
  );

  return bridge;
}

function renderHomeRoute() {
  const account = createSavedAccount();
  const bridge = mockStorageRead(
    createPersistedState({
      accounts: [account],
      activeAccountId: account.id,
    })
  );

  fetchViewsMock.mockResolvedValue([]);
  fetchResumeItemsMock.mockResolvedValue([
    createLibraryItem({
      id: 'resume-movie-1',
      name: 'Resume Movie',
      serverPositionTicks: 150000000,
    }),
  ]);
  fetchResumableItemsMock.mockResolvedValue([]);
  fetchItemDetailsMock.mockResolvedValue(
    createMovieDetails({
      id: 'resume-movie-1',
      name: 'Resume Movie',
      serverPositionTicks: 150000000,
      mediaSources: [createDirectPlaybackMediaSource({ id: 'resume-source' })],
    })
  );
  window.location.hash = '#/libraries';

  render(
    <HashRouter>
      <App />
    </HashRouter>
  );

  return bridge;
}

function collectLoadTimingMilestones() {
  const milestones: Array<{ name: string; result: string; surface: string }> = [];
  const listener = (event: Event) => {
    milestones.push((event as CustomEvent<{ name: string; result: string; surface: string }>).detail);
  };
  window.addEventListener('taluxa-load-timing', listener);

  return {
    milestones,
    cleanup: () => window.removeEventListener('taluxa-load-timing', listener),
  };
}

describe('playback performance route behavior', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.location.hash = '';
  });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
    fetchViewsMock.mockResolvedValue([]);
    fetchItemsMock.mockResolvedValue([]);
    fetchItemsByIdsMock.mockResolvedValue([]);
    fetchResumeItemsMock.mockResolvedValue([]);
    fetchResumableItemsMock.mockResolvedValue([]);
    fetchSearchItemsMock.mockResolvedValue([]);
    fetchSimilarItemsMock.mockResolvedValue([]);
    fetchSeasonsMock.mockResolvedValue([]);
    fetchEpisodesMock.mockResolvedValue([]);
    fetchPlaybackStreamSourceMock.mockResolvedValue({
      httpHeaders: {},
      streamUrl: 'https://demo.emby.local/Videos/item-1/master.m3u8',
    });
    reportPlaybackProgressMock.mockResolvedValue(undefined);
    markItemPlayedMock.mockResolvedValue(undefined);
    hideItemFromContinueWatchingMock.mockResolvedValue(undefined);
    addFavoriteItemMock.mockResolvedValue(undefined);
    fetchServerInfoMock.mockResolvedValue({ serverName: null });
  });

  it('keeps playback startup logs off the detail page while source resolution is delayed', async () => {
    const sourceDeferred = createDeferred<{
      httpHeaders: Record<string, string>;
      streamUrl: string;
    }>();

    fetchPlaybackStreamSourceMock.mockReturnValue(sourceDeferred.promise);
    renderMovieRoute(
      createLibraryItemDetails({
        id: 'movie-1',
        mediaSources: [
          {
            audioStreams: [],
            bitrate: null,
            container: 'mkv',
            id: 'slow-source',
            path: '/movies/movie-1.mkv',
            size: null,
            videoCodec: 'hevc',
            videoStream: null,
          },
        ],
      })
    );

    expect(await screen.findByRole('heading', { name: 'Movie 1' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /播放/ }));

    await waitFor(() => {
      expect(fetchPlaybackStreamSourceMock).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'movie-1',
          mediaSourceId: 'slow-source',
        })
      );
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText('Preparing playback...')).not.toBeInTheDocument();
    expect(screen.queryByText('Starting playback...')).not.toBeInTheDocument();

    await act(async () => {
      sourceDeferred.resolve({
        httpHeaders: {},
        streamUrl: 'https://demo.emby.local/Videos/movie-1/master.m3u8',
      });
      await flushPromises();
    });
  });

  it('ignores obsolete playback preflight results after a newer play attempt', async () => {
    const bridge = renderMovieRoute(createLibraryItemDetails({ id: 'movie-1' }));
    const firstPreflight = createDeferred<void>();
    bridge.preflight.mockReturnValueOnce(firstPreflight.promise).mockResolvedValueOnce(undefined);

    expect(await screen.findByRole('heading', { name: 'Movie 1' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /播放/ }));
    await waitFor(() => {
      expect(bridge.preflight).toHaveBeenCalledTimes(1);
    });
    fireEvent.click(screen.getByRole('button', { name: /播放/ }));

    await waitFor(() => {
      expect(bridge.preflight).toHaveBeenCalledTimes(2);
      expect(bridge.launch).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      firstPreflight.resolve();
      await flushPromises();
    });

    expect(bridge.launch).toHaveBeenCalledTimes(1);
  });

  it('does not block player launch on a slow preflight beyond the fast budget', async () => {
    const bridge = renderMovieRoute(createLibraryItemDetails({ id: 'movie-1' }));
    bridge.preflight.mockReturnValueOnce(new Promise(() => undefined));

    expect(await screen.findByRole('heading', { name: 'Movie 1' })).toBeInTheDocument();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /\u64ad\u653e/ }));

    await act(async () => {
      await flushPromises();
    });

    expect(bridge.preflight).toHaveBeenCalledTimes(1);
    expect(bridge.launch).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
      await flushPromises();
    });

    expect(bridge.launch).toHaveBeenCalledTimes(1);
  });

  it('launches direct-play media without waiting for PlaybackInfo source resolution', async () => {
    fetchPlaybackStreamSourceMock.mockReturnValueOnce(new Promise(() => undefined));
    const bridge = renderMovieRoute(
      createMovieDetails({
        id: 'movie-1',
        mediaSources: [createDirectPlaybackMediaSource({ id: 'direct-source' })],
      })
    );
    const { cleanup: cleanupMilestones, milestones } = collectLoadTimingMilestones();

    try {
      expect(await screen.findByRole('heading', { name: 'Movie 1' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /\u64ad\u653e/ }));

      await waitFor(() => {
        expect(bridge.launch).toHaveBeenCalledWith(
          expect.objectContaining({
            itemId: 'movie-1',
            streamUrl:
              'https://demo.emby.local/Videos/movie-1/stream?static=true&DeviceId=emby-player-desktop&MediaSourceId=direct-source',
          })
        );
      });
      expect(fetchPlaybackStreamSourceMock).not.toHaveBeenCalled();
      expect(milestones.map((milestone) => milestone.name)).toEqual(
        expect.arrayContaining([
          'play-acknowledged',
          'playback-source-ready',
          'player-launch-requested',
          'playback-ready',
        ])
      );
    } finally {
      cleanupMilestones();
    }
  });

  it('emits fast startup milestones when launching a selected series episode', async () => {
    const bridge = renderSeriesRoute();
    const { cleanup: cleanupMilestones, milestones } = collectLoadTimingMilestones();

    try {
      fireEvent.click(await screen.findByRole('link', { name: /2\. Second Case/ }));
      fireEvent.click(screen.getByRole('button', { name: /\u64ad\u653e/ }));

      await waitFor(() => {
        expect(bridge.launch).toHaveBeenCalledWith(
          expect.objectContaining({
            itemId: 'episode-2',
            title: 'Series 1 - S1:E2 - Second Case',
          })
        );
      });
      expect(milestones.map((milestone) => milestone.name)).toEqual(
        expect.arrayContaining([
          'play-acknowledged',
          'playback-source-ready',
          'player-launch-requested',
          'playback-ready',
        ])
      );
    } finally {
      cleanupMilestones();
    }
  });

  it('uses continue-watching resume state without adding pre-launch delay', async () => {
    const bridge = renderHomeRoute();
    const { cleanup: cleanupMilestones, milestones } = collectLoadTimingMilestones();

    try {
      fireEvent.click(await screen.findByRole('link', { name: /Resume Movie/ }));
      expect(await screen.findByRole('heading', { name: 'Resume Movie' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /\u64ad\u653e/ }));

      await waitFor(() => {
        expect(bridge.launch).toHaveBeenCalledWith(
          expect.objectContaining({
            itemId: 'resume-movie-1',
            startSeconds: 15,
          })
        );
      });
      expect(milestones.map((milestone) => milestone.name)).toEqual(
        expect.arrayContaining([
          'play-acknowledged',
          'playback-source-ready',
          'player-launch-requested',
          'playback-ready',
        ])
      );
    } finally {
      cleanupMilestones();
    }
  });

  it('reuses a prepared playback candidate when the current play request matches it', async () => {
    const details = createLibraryItemDetails({
      id: 'movie-1',
      mediaSources: [
        {
          audioStreams: [{ DisplayTitle: 'Main', Index: 2, IsDefault: true }],
          bitrate: null,
          container: 'mkv',
          id: 'slow-source',
          path: '/movies/movie-1.mkv',
          size: null,
          videoCodec: 'hevc',
          videoStream: null,
        },
      ],
    });
    const bridge = renderMovieRoute(details);
    const { cleanup: cleanupMilestones, milestones } = collectLoadTimingMilestones();

    try {
      await waitFor(() => {
        expect(fetchPlaybackStreamSourceMock).toHaveBeenCalledTimes(1);
      });

      fireEvent.click(screen.getByRole('button', { name: /播放/ }));

      await waitFor(() => {
        expect(bridge.launch).toHaveBeenCalledWith(
          expect.objectContaining({
            itemId: 'movie-1',
            streamUrl: 'https://demo.emby.local/Videos/item-1/master.m3u8',
          })
        );
      });
      expect(fetchPlaybackStreamSourceMock).toHaveBeenCalledTimes(1);
      expect(milestones.map((milestone) => milestone.name)).toEqual(
        expect.arrayContaining([
          'play-acknowledged',
          'playback-source-ready',
          'player-launch-requested',
          'playback-ready',
        ])
      );
    } finally {
      cleanupMilestones();
    }
  });

  it('emits playback ready timing without showing startup status when the current mpv launch resolves', async () => {
    const { cleanup: cleanupMilestones, milestones } = collectLoadTimingMilestones();

    try {
      renderMovieRoute(createLibraryItemDetails({ id: 'movie-1' }));

      expect(await screen.findByRole('heading', { name: 'Movie 1' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /\u64ad\u653e/ }));

      await waitFor(() => {
        expect(milestones.map((milestone) => milestone.name)).toContain('playback-ready');
      });
      expect(milestones).toContainEqual(
        expect.objectContaining({
          name: 'playback-ready',
          result: 'success',
          surface: 'playback',
        })
      );
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    } finally {
      cleanupMilestones();
    }
  });

  it('reports redacted recoverable failure timing for the current launch failure', async () => {
    const bridge = renderMovieRoute(
      createMovieDetails({
        id: 'movie-1',
        mediaSources: [createPlaybackInfoFallbackMediaSource()],
      })
    );
    const { cleanup: cleanupMilestones, milestones } = collectLoadTimingMilestones();
    bridge.launch.mockRejectedValueOnce(
      new Error(
        'mpv failed for https://demo.emby.local/Videos/movie-1/stream.mp4?api_key=token-123'
      )
    );

    try {
      expect(await screen.findByRole('heading', { name: 'Movie 1' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /\u64ad\u653e/ }));

      await waitFor(() => {
        expect(screen.getAllByRole('alert')).toHaveLength(2);
      });
      for (const alert of screen.getAllByRole('alert')) {
        expect(alert).toHaveTextContent(
          'mpv failed for https://demo.emby.local/Videos/movie-1/stream.mp4?api_key=[redacted]'
        );
        expect(alert).not.toHaveTextContent('token-123');
      }
      expect(milestones).toContainEqual(
        expect.objectContaining({
          name: 'playback-recoverable-failure',
          result: 'failure',
          surface: 'playback',
        })
      );
    } finally {
      cleanupMilestones();
    }
  });

  it('reports startup critical-path segments after playback is ready', async () => {
    const launchDeferred = createDeferred<void>();
    const bridge = renderMovieRoute(createLibraryItemDetails({ id: 'movie-1' }));
    const segments: Array<{ durationMs: number; name: string }> = [];
    const listener = (event: Event) => {
      segments.push((event as CustomEvent<{ durationMs: number; name: string }>).detail);
    };
    bridge.launch.mockReturnValueOnce(launchDeferred.promise);
    window.addEventListener('taluxa-load-timing-segment', listener);

    try {
      expect(await screen.findByRole('heading', { name: 'Movie 1' })).toBeInTheDocument();

      vi.useFakeTimers();
      fireEvent.click(screen.getByRole('button', { name: /\u64ad\u653e/ }));

      await act(async () => {
        await flushPromises();
      });
      expect(bridge.launch).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(750);
        launchDeferred.resolve();
        await flushPromises();
      });

      expect(segments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'source-resolution' }),
          expect.objectContaining({ name: 'preflight-budget' }),
          expect.objectContaining({
            durationMs: 750,
            name: 'player-readiness',
          }),
        ])
      );
      expect(
        segments.reduce((largest, segment) =>
          segment.durationMs > largest.durationMs ? segment : largest
        ).name
      ).toBe('player-readiness');
    } finally {
      window.removeEventListener('taluxa-load-timing-segment', listener);
    }
  });
});
