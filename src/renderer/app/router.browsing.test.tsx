import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HashRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { createDefaultSettings } from '@shared/models/settings';
import type { SavedAccount } from '@shared/models/session';
import type { PersistedState } from '@shared/store/persistence';
import { createDeferred, flushPromises } from '../../test/deferred';
import {
  createDirectPlaybackMediaSource,
  createLibraryItem,
  createLibraryItemDetails,
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

function mockDesktopBridge(state: StoredPersistedState) {
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

function renderAuthenticatedRoute(hash: string) {
  const account = createSavedAccount();
  const bridge = mockDesktopBridge(
    createPersistedState({
      accounts: [account],
      activeAccountId: account.id,
    })
  );
  window.location.hash = hash;

  render(
    <HashRouter>
      <App />
    </HashRouter>
  );

  return bridge;
}

async function navigateTo(hash: string) {
  const nextHash = hash.startsWith('#') ? hash : `#${hash}`;

  await act(async () => {
    window.history.pushState(null, '', nextHash);
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flushPromises();
  });
}

describe('browsing route session snapshots', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.location.hash = '';
  });

  beforeEach(() => {
    vi.resetAllMocks();
    fetchViewsMock.mockResolvedValue([{ id: 'movies', name: 'Movies', collectionType: 'movies' }]);
    fetchItemsMock.mockResolvedValue([createLibraryItem({ id: 'movie-1', name: 'Movie 1' })]);
    fetchItemsByIdsMock.mockResolvedValue([]);
    fetchResumeItemsMock.mockResolvedValue([]);
    fetchResumableItemsMock.mockResolvedValue([]);
    fetchSearchItemsMock.mockResolvedValue([]);
    fetchItemDetailsMock.mockResolvedValue(createLibraryItemDetails({ id: 'movie-1' }));
    fetchSimilarItemsMock.mockResolvedValue([]);
    fetchSeasonsMock.mockResolvedValue([]);
    fetchEpisodesMock.mockResolvedValue([]);
    fetchPlaybackStreamSourceMock.mockResolvedValue({
      httpHeaders: {},
      streamUrl: 'https://demo.emby.local/Videos/movie-1/master.m3u8',
    });
    reportPlaybackProgressMock.mockResolvedValue(undefined);
    markItemPlayedMock.mockResolvedValue(undefined);
    hideItemFromContinueWatchingMock.mockResolvedValue(undefined);
    addFavoriteItemMock.mockResolvedValue(undefined);
    fetchServerInfoMock.mockResolvedValue({ serverName: null });
  });

  it('renders a same-session home snapshot before revisit refresh completes', async () => {
    renderAuthenticatedRoute('#/libraries');

    expect(await screen.findByRole('link', { name: /Movies/ })).toBeInTheDocument();

    await navigateTo('#/settings');
    expect(await screen.findByRole('heading', { name: '\u8bbe\u7f6e' })).toBeInTheDocument();

    const slowViews = createDeferred<Array<{ id: string; name: string; collectionType: string }>>();
    fetchViewsMock.mockReturnValueOnce(slowViews.promise);

    await navigateTo('#/libraries');

    expect(screen.getByRole('link', { name: /Movies/ })).toBeInTheDocument();
    expect(screen.queryByText('Loading home screen...')).not.toBeInTheDocument();

    await act(async () => {
      slowViews.resolve([{ id: 'movies', name: 'Movies', collectionType: 'movies' }]);
      await flushPromises();
    });
  });

  it('renders a same-session detail snapshot before revisit refresh completes', async () => {
    renderAuthenticatedRoute('#/item/movie-1');

    expect(await screen.findByRole('heading', { name: 'Movie 1' })).toBeInTheDocument();

    await navigateTo('#/settings');
    expect(await screen.findByRole('heading', { name: '\u8bbe\u7f6e' })).toBeInTheDocument();

    const slowDetails = createDeferred<ReturnType<typeof createLibraryItemDetails>>();
    fetchItemDetailsMock.mockReturnValueOnce(slowDetails.promise);

    await navigateTo('#/item/movie-1');

    expect(screen.getByRole('heading', { name: 'Movie 1' })).toBeInTheDocument();
    expect(screen.queryByText('Loading item details...')).not.toBeInTheDocument();

    await act(async () => {
      slowDetails.resolve(createLibraryItemDetails({ id: 'movie-1', name: 'Movie 1 Fresh' }));
      await flushPromises();
    });

    expect(await screen.findByRole('heading', { name: 'Movie 1 Fresh' })).toBeInTheDocument();
  });

  it('starts playback from visible detail primary content while supporting sections refresh', async () => {
    const slowSimilarItems = createDeferred<ReturnType<typeof createLibraryItem>[]>();
    fetchSimilarItemsMock.mockReturnValueOnce(slowSimilarItems.promise);
    fetchItemDetailsMock.mockResolvedValue(
      createLibraryItemDetails({
        id: 'movie-1',
        name: 'Movie 1',
        mediaSources: [createDirectPlaybackMediaSource({ id: 'direct-source' })],
      })
    );

    const bridge = renderAuthenticatedRoute('#/item/movie-1');

    expect(await screen.findByRole('heading', { name: 'Movie 1' })).toBeInTheDocument();
    expect(fetchSimilarItemsMock).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /\u64ad\u653e/ }));

    await waitFor(() => {
      expect(bridge.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'movie-1',
        })
      );
    });

    await act(async () => {
      slowSimilarItems.resolve([]);
      await flushPromises();
    });
  });
});
