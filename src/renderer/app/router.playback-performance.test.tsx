import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HashRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { SavedAccount } from '@shared/models/session';
import type { PersistedState } from '@shared/store/persistence';
import { createDefaultSettings } from '@shared/models/settings';
import { createDeferred, flushPromises } from '../../test/deferred';
import { createLibraryItemDetails } from '../../test/loadPerformanceFixtures';

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
  const launch = vi.fn().mockResolvedValue(undefined);
  const preflight = vi.fn().mockResolvedValue(undefined);

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
      launch,
      onEpisodeSelect: vi.fn(() => () => undefined),
      onProgress: vi.fn(() => () => undefined),
      preflight,
      switchEpisode: vi.fn().mockResolvedValue(undefined),
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

  return { launch, preflight };
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

  it('acknowledges play immediately while playback source resolution is delayed', async () => {
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

    expect(await screen.findByRole('status')).toHaveTextContent('Preparing playback...');
    expect(fetchPlaybackStreamSourceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'movie-1',
        mediaSourceId: 'slow-source',
      })
    );

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
  });

  it('emits playback ready timing and clears startup status when the current mpv launch resolves', async () => {
    const milestones: Array<{ name: string; result: string; surface: string }> = [];
    const listener = (event: Event) => {
      milestones.push((event as CustomEvent<{ name: string; result: string; surface: string }>).detail);
    };
    window.addEventListener('taluxa-load-timing', listener);

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
      window.removeEventListener('taluxa-load-timing', listener);
    }
  });
});
