import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { AppProviders } from './providers';
import { AuthProvider, useAuth } from '@renderer/features/auth/AuthContext';

import { createDefaultSettings } from '@shared/models/settings';
import type { PersistedHomeCacheEntry, PersistedState } from '@shared/store/persistence';
import type { SavedAccount } from '@shared/models/session';
import { createAccountScopedProgressKey } from '@shared/store/persistence';

const DEFAULT_HOME_HEADING = 'https://demo.emby.local';
const SETTINGS_HEADING = '设置';
const HOME_NAV_LABEL = '首页';
const SETTINGS_NAV_LABEL = '设置';
const ADD_SERVER_LABEL = '添加服务器';

const loginMock = vi.hoisted(() => vi.fn());
const fetchViewsMock = vi.hoisted(() => vi.fn());
const fetchItemsMock = vi.hoisted(() => vi.fn());
const fetchItemsByIdsMock = vi.hoisted(() => vi.fn());
const fetchSearchItemsMock = vi.hoisted(() => vi.fn());
const fetchItemDetailsMock = vi.hoisted(() => vi.fn());
const fetchSimilarItemsMock = vi.hoisted(() => vi.fn());
const fetchSeasonsMock = vi.hoisted(() => vi.fn());
const fetchEpisodesMock = vi.hoisted(() => vi.fn());
const fetchPlaybackStreamSourceMock = vi.hoisted(() => vi.fn());
const reportPlaybackProgressMock = vi.hoisted(() => vi.fn());
const fetchServerInfoMock = vi.hoisted(() => vi.fn());

type StoredPersistedState = Omit<PersistedState, 'activeAccountId'> & {
  activeAccountId?: string | null | undefined;
};

vi.mock('@shared/api/emby/auth', () => ({
  login: loginMock,
}));

vi.mock('@shared/api/emby/library', () => ({
  fetchViews: fetchViewsMock,
  fetchItems: fetchItemsMock,
  fetchItemsByIds: fetchItemsByIdsMock,
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
    fetchPlaybackStreamSource: fetchPlaybackStreamSourceMock,
    reportPlaybackProgress: reportPlaybackProgressMock,
  };
});

vi.mock('@shared/api/emby/system', () => ({
  fetchServerInfo: fetchServerInfoMock,
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

async function flushAsyncQueue() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}

interface PlayerProgressEvent {
  itemId: string;
  positionSeconds: number;
  durationSeconds: number;
}

function mockStorageRead(state: StoredPersistedState | Promise<StoredPersistedState>) {
  const progressListeners = new Set<(event: PlayerProgressEvent) => void>();
  const launch = vi.fn().mockResolvedValue(undefined);
  const preflight = vi.fn().mockResolvedValue(undefined);
  const onProgress = vi.fn((listener: (event: PlayerProgressEvent) => void) => {
    progressListeners.add(listener);

    return () => {
      progressListeners.delete(listener);
    };
  });
  const read = vi.fn().mockResolvedValue(state);
  const write = vi.fn();
  const clearSession = vi.fn();
  const statsImageCache = vi.fn().mockResolvedValue({ count: 0, sizeBytes: 0 });
  const clearImageCache = vi.fn().mockResolvedValue(undefined);
  const configureImageCache = vi.fn().mockResolvedValue(undefined);
  const resolveImage = vi.fn(async (sourceUrl: string) => ({
    cacheKey: 'test-image-cache-key',
    fromCache: true,
    url: sourceUrl,
  }));

  window.embyDesktop = {
    windowControls: {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
    },
    player: {
      launch,
      preflight,
      onProgress,
    },
    storage: {
      read,
      write,
      clearSession,
    },
    imageCache: {
      resolve: resolveImage,
      stats: statsImageCache,
      clear: clearImageCache,
      configure: configureImageCache,
    },
  } as unknown as Window['embyDesktop'];

  return {
    launch,
    preflight,
    onProgress,
    read,
    write,
    clearSession,
    resolveImage,
    statsImageCache,
    clearImageCache,
    configureImageCache,
    emitProgress(event: PlayerProgressEvent) {
      for (const listener of progressListeners) {
        listener(event);
      }
    },
  };
}

type PersistedStateOverrides = {
  accounts?: SavedAccount[];
  activeAccountId?: string | null | undefined;
  settings?: PersistedState['settings'];
  progressByItemId?: PersistedState['progressByItemId'];
  homeCacheByKey?: PersistedState['homeCacheByKey'];
};

function createSavedAccount(overrides: Partial<SavedAccount> = {}): SavedAccount {
  const serverUrl = overrides.serverUrl ?? 'https://demo.emby.local';
  const userId = overrides.userId ?? 'user-1';

  return {
    id: overrides.id ?? `${serverUrl}::${userId}`,
    serverUrl,
    userId,
    userName: overrides.userName ?? 'Alice',
    accessToken: overrides.accessToken ?? 'token-123',
    lastUsedAt: overrides.lastUsedAt ?? '2026-04-21T00:00:00.000Z',
  };
}

function createSettings(overrides: Partial<PersistedState['settings']> = {}): PersistedState['settings'] {
  return {
    ...createDefaultSettings(),
    ...overrides,
  };
}

function createMovieDetails(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    name: 'Movie 1',
    posterUrl: 'https://demo.emby.local/Items/movie-1/Images/Primary',
    imageCandidates: [],
    runtimeTicks: 600000000,
    serverPositionTicks: null,
    communityRating: null,
    productionYear: 2026,
    type: 'Movie',
    overview: 'A test movie.',
    genres: [],
    officialRating: '',
    people: [],
    studios: [],
    externalUrls: [],
    mediaSources: [],
    backdropUrl: null,
    ...overrides,
  };
}

function createPersistedState(overrides: PersistedStateOverrides = {}): StoredPersistedState {
  const state: StoredPersistedState = {
    accounts: overrides.accounts ?? [],
    settings: overrides.settings ?? createDefaultSettings(),
    progressByItemId: overrides.progressByItemId ?? {},
    homeCacheByKey: overrides.homeCacheByKey ?? {},
  };

  if (Object.prototype.hasOwnProperty.call(overrides, 'activeAccountId')) {
    state.activeAccountId = overrides.activeAccountId;
  }

  return state;
}

function createCachedHomeEntry(
  overrides: Partial<PersistedHomeCacheEntry> = {}
): PersistedHomeCacheEntry {
  return {
    cachedAt: '2026-03-01T08:00:00.000Z',
    accountLabel: 'Cached Server',
    continueWatching: [],
    libraries: [
      {
        id: 'cached-library',
        title: 'Cached Library',
        posterUrl: 'https://demo.emby.local/Items/cached-library/Images/Primary',
        imageCandidates: [],
        href: '/libraries/cached-library',
        state: {
          libraryName: 'Cached Library',
        },
      },
    ],
    featuredRows: [
      {
        id: 'cached-row',
        title: 'Cached Movies',
        href: '/libraries/cached-library',
        state: {
          libraryName: 'Cached Movies',
        },
        items: [
          {
            id: 'cached-movie',
            title: 'Cached Movie',
            subtitle: '88 min',
            posterUrl: 'https://demo.emby.local/Items/cached-movie/Images/Primary',
            imageCandidates: [],
            href: '/item/cached-movie',
            state: {
              title: 'Cached Movie',
              serverPositionTicks: null,
            },
          },
        ],
      },
    ],
    ...overrides,
  };
}

function AuthHarness() {
  const { accounts, activeAccount, activeAccountId, isHydrated, setActiveAccountId } = useAuth();

  if (!isHydrated) {
    return <p>Hydrating...</p>;
  }

  return (
    <div>
      <p data-testid="active-account-id">{activeAccountId ?? 'none'}</p>
      <p data-testid="active-account-name">{activeAccount?.userName ?? 'none'}</p>
      {accounts.map((account) => (
        <button key={account.id} type="button" onClick={() => setActiveAccountId(account.id)}>
          Switch to {account.userName}
        </button>
      ))}
    </div>
  );
}

function ServerNameRetryHarness() {
  const { getServerDisplayName, isHydrated, setAuthState } = useAuth();
  const serverUrl = 'https://demo.emby.local';

  if (!isHydrated) {
    return <p>Hydrating...</p>;
  }

  return (
    <div>
      <p data-testid="server-display-name">{getServerDisplayName(serverUrl)}</p>
      <button
        type="button"
        onClick={() =>
          setAuthState({
            serverUrl,
            session: {
              userId: 'user-1',
              userName: 'Alice',
              accessToken: 'token-456',
            },
          })
        }
      >
        Reauthenticate
      </button>
    </div>
  );
}

describe('App', () => {
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
    fetchItemDetailsMock.mockImplementation(async (_serverUrl: string, _userId: string, itemId: string) =>
      createMovieDetails({ id: itemId })
    );
    fetchSimilarItemsMock.mockResolvedValue([]);
    fetchSeasonsMock.mockResolvedValue([]);
    fetchEpisodesMock.mockResolvedValue([]);
    fetchPlaybackStreamSourceMock.mockImplementation(
      async ({
        serverUrl,
        itemId,
        accessToken,
      }: {
        serverUrl: string;
        itemId: string;
        accessToken: string;
      }) => ({
        streamUrl: `${serverUrl}/Videos/${itemId}/stream.mp4?static=true&api_key=${accessToken}`,
        httpHeaders: {},
      })
    );
    reportPlaybackProgressMock.mockResolvedValue(undefined);
    fetchServerInfoMock.mockResolvedValue({ serverName: null });
    window.location.hash = '';
  });

  it('waits for persisted auth before redirecting from the home route', async () => {
    const deferred = createDeferred<PersistedState>();
    mockStorageRead(deferred.promise);

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();

    deferred.resolve({
      accounts: [createSavedAccount()],
      activeAccountId: 'https://demo.emby.local::user-1',
      settings: createSettings(),
      progressByItemId: {},
      homeCacheByKey: {},
    });

    expect(await screen.findByRole('heading', { name: DEFAULT_HOME_HEADING })).toBeInTheDocument();
  });

  it('hydrates the first saved account when activeAccountId is missing', async () => {
    mockStorageRead(
      createPersistedState({
        accounts: [
          createSavedAccount(),
          createSavedAccount({
            id: 'https://backup.emby.local::user-2',
            serverUrl: 'https://backup.emby.local',
            userId: 'user-2',
            userName: 'Bob',
            accessToken: 'token-456',
            lastUsedAt: '2026-04-21T01:00:00.000Z',
          }),
        ],
      })
    );

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('heading', { name: DEFAULT_HOME_HEADING })).toBeInTheDocument();
    expect(fetchViewsMock).toHaveBeenCalledWith(
      'https://demo.emby.local',
      'user-1',
      'token-123'
    );
  });

  it('hydrates the first saved account when activeAccountId is undefined', async () => {
    mockStorageRead(
      createPersistedState({
        accounts: [
          createSavedAccount(),
          createSavedAccount({
            id: 'https://backup.emby.local::user-2',
            serverUrl: 'https://backup.emby.local',
            userId: 'user-2',
            userName: 'Bob',
            accessToken: 'token-456',
            lastUsedAt: '2026-04-21T01:00:00.000Z',
          }),
        ],
        activeAccountId: undefined,
      })
    );

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('heading', { name: DEFAULT_HOME_HEADING })).toBeInTheDocument();
    expect(fetchViewsMock).toHaveBeenCalledWith(
      'https://demo.emby.local',
      'user-1',
      'token-123'
    );
  });

  it('stays signed out when activeAccountId is null', async () => {
    mockStorageRead(
      createPersistedState({
        accounts: [
          createSavedAccount(),
          createSavedAccount({
            id: 'https://backup.emby.local::user-2',
            serverUrl: 'https://backup.emby.local',
            userId: 'user-2',
            userName: 'Bob',
            accessToken: 'token-456',
            lastUsedAt: '2026-04-21T01:00:00.000Z',
          }),
        ],
        activeAccountId: null,
      })
    );

    render(
      <AppProviders>
        <AuthHarness />
      </AppProviders>
    );

    expect(await screen.findByTestId('active-account-id')).toHaveTextContent('none');
    expect(screen.getByTestId('active-account-name')).toHaveTextContent('none');
  });

  it('redirects direct library visits without a session to the login page', async () => {
    mockStorageRead(createPersistedState());

    window.location.hash = '#/libraries';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('redirects direct item visits without a session to the login page', async () => {
    mockStorageRead(createPersistedState());

    window.location.hash = '#/item/item-1';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('keeps auth state out of memory when session persistence fails', async () => {
    const storage = mockStorageRead(createPersistedState());
    loginMock.mockResolvedValue({
      userId: 'user-1',
      userName: 'Alice',
      accessToken: 'token-123',
    });
    storage.write.mockRejectedValue(new Error('disk full'));

    window.location.hash = '#/login';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    fireEvent.change(screen.getByLabelText('Server URL'), {
      target: { value: 'demo.emby.local' },
    });
    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'alice' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your session');

    window.location.hash = '#/';
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    });
  });

  it('shows a bridge-specific error when desktop storage is unavailable', async () => {
    loginMock.mockResolvedValue({
      userId: 'user-1',
      userName: 'Alice',
      accessToken: 'token-123',
    });

    // Simulate a renderer where the preload bridge failed to load.
    delete (window as Partial<Window>).embyDesktop;
    window.location.hash = '#/login';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    fireEvent.change(screen.getByLabelText('Server URL'), {
      target: { value: 'demo.emby.local' },
    });
    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'alice' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Desktop integration is unavailable. Restart the app and try again.'
    );
  });

  it('adds a second saved account on the same server and activates it after login', async () => {
    const existingAccount = createSavedAccount();
    const storage = mockStorageRead(
      createPersistedState({
        accounts: [existingAccount],
        activeAccountId: existingAccount.id,
      })
    );
    loginMock.mockResolvedValue({
      userId: 'user-2',
      userName: 'Bob',
      accessToken: 'token-456',
    });

    window.location.hash = '#/login';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    fireEvent.change(await screen.findByLabelText('Server URL'), {
      target: { value: 'demo.emby.local' },
    });
    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'bob' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(storage.write).toHaveBeenCalledWith({
        accounts: [
          expect.objectContaining({
            id: 'https://demo.emby.local::user-1',
            serverUrl: 'https://demo.emby.local',
            userId: 'user-1',
            userName: 'Alice',
            accessToken: 'token-123',
            lastUsedAt: expect.any(String),
          }),
          expect.objectContaining({
            id: 'https://demo.emby.local::user-2',
            serverUrl: 'https://demo.emby.local',
            userId: 'user-2',
            userName: 'Bob',
            accessToken: 'token-456',
            lastUsedAt: expect.any(String),
          }),
        ],
        activeAccountId: 'https://demo.emby.local::user-2',
      });
    });

    expect(await screen.findByRole('heading', { name: DEFAULT_HOME_HEADING })).toBeInTheDocument();
    expect(fetchViewsMock).toHaveBeenCalledWith(
      'https://demo.emby.local',
      'user-2',
      'token-456'
    );
  });

  it('passes server resume ticks through to the player route', async () => {
    const storage = mockStorageRead(
      createPersistedState({
        accounts: [createSavedAccount()],
        activeAccountId: 'https://demo.emby.local::user-1',
      })
    );
    fetchPlaybackStreamSourceMock.mockResolvedValue({
      streamUrl:
        'https://demo.emby.local/Videos/item-1/stream.mkv?MediaSourceId=source-1&api_key=token-123',
      httpHeaders: {
        Authorization: 'MediaBrowser Token="token-123"',
      },
    });

    fetchViewsMock.mockResolvedValue([
      {
        id: 'movies',
        name: 'Movies',
        collectionType: 'movies',
      },
    ]);
    fetchItemsMock.mockResolvedValue([
      {
        id: 'item-1',
        name: 'Movie 1',
        posterUrl: 'https://demo.emby.local/Items/item-1/Images/Primary',
        imageCandidates: [],
        runtimeTicks: 600000000,
        serverPositionTicks: 42000000,
      },
    ]);
    fetchItemDetailsMock.mockResolvedValueOnce(
      createMovieDetails({ id: 'item-1', serverPositionTicks: 42000000 })
    );

    window.location.hash = '#/libraries';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    fireEvent.click(await screen.findByRole('link', { name: /Movies/ }));
    fireEvent.click(await screen.findByRole('link', { name: /Movie 1/ }));
    fireEvent.click(await screen.findByRole('button', { name: /播放/ }));

    await waitFor(() => {
      expect(storage.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item-1',
          title: 'Movie 1',
          startSeconds: 4,
        })
      );
    });
    expect(storage.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        httpHeaders: {
          Authorization: 'MediaBrowser Token="token-123"',
        },
        itemId: 'item-1',
        title: 'Movie 1',
        streamUrl:
          'https://demo.emby.local/Videos/item-1/stream.mkv?MediaSourceId=source-1&api_key=token-123',
      })
    );
    expect(storage.preflight).toHaveBeenCalledWith({
      streamUrl:
        'https://demo.emby.local/Videos/item-1/stream.mkv?MediaSourceId=source-1&api_key=token-123',
      httpHeaders: {
        Authorization: 'MediaBrowser Token="token-123"',
      },
    });
  });

  it('shows playback stream preflight failures before launching mpv', async () => {
    const storage = mockStorageRead(
      createPersistedState({
        accounts: [createSavedAccount()],
        activeAccountId: 'https://demo.emby.local::user-1',
      })
    );
    storage.preflight.mockRejectedValueOnce(
      new Error(
        'Playback stream preflight failed (403 Forbidden) for https://demo.emby.local/Videos/item-1/stream.mp4?api_key=[redacted]'
      )
    );
    fetchViewsMock.mockResolvedValue([
      {
        id: 'movies',
        name: 'Movies',
        collectionType: 'movies',
      },
    ]);
    fetchItemsMock.mockResolvedValue([
      {
        id: 'item-1',
        name: 'Movie 1',
        posterUrl: 'https://demo.emby.local/Items/item-1/Images/Primary',
        imageCandidates: [],
        runtimeTicks: 600000000,
        serverPositionTicks: 0,
      },
    ]);

    window.location.hash = '#/libraries';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    fireEvent.click(await screen.findByRole('link', { name: /Movies/ }));
    fireEvent.click(await screen.findByRole('link', { name: /Movie 1/ }));
    fireEvent.click(await screen.findByRole('button', { name: /播放/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not prepare desktop playback.'
    );
    expect(storage.launch).not.toHaveBeenCalled();
  });

  it('launches mpv when playback stream preflight is still pending after a short wait', async () => {
    const storage = mockStorageRead(
      createPersistedState({
        accounts: [createSavedAccount()],
        activeAccountId: 'https://demo.emby.local::user-1',
      })
    );
    storage.preflight.mockReturnValueOnce(new Promise(() => undefined));
    fetchViewsMock.mockResolvedValue([
      {
        id: 'movies',
        name: 'Movies',
        collectionType: 'movies',
      },
    ]);
    fetchItemsMock.mockResolvedValue([
      {
        id: 'item-1',
        name: 'Movie 1',
        posterUrl: 'https://demo.emby.local/Items/item-1/Images/Primary',
        imageCandidates: [],
        runtimeTicks: 600000000,
        serverPositionTicks: 0,
      },
    ]);

    window.location.hash = '#/libraries';

    const { container } = render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    fireEvent.click(await screen.findByRole('link', { name: /Movies/ }));
    fireEvent.click(await screen.findByRole('link', { name: /Movie 1/ }));
    await screen.findByRole('heading', { name: 'Movie 1' });
    const playButton = container.querySelector<HTMLButtonElement>('.btn-play');
    expect(playButton).not.toBeNull();

    vi.useFakeTimers();
    fireEvent.click(playButton!);

    await flushAsyncQueue();
    expect(storage.preflight).toHaveBeenCalled();
    expect(storage.launch).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
      await flushAsyncQueue();
    });

    expect(storage.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item-1',
        title: 'Movie 1',
      })
    );
  });

  it('launches mpv from item media source metadata without waiting for PlaybackInfo', async () => {
    const storage = mockStorageRead(
      createPersistedState({
        accounts: [createSavedAccount()],
        activeAccountId: 'https://demo.emby.local::user-1',
      })
    );
    fetchPlaybackStreamSourceMock.mockReturnValueOnce(new Promise(() => undefined));
    fetchViewsMock.mockResolvedValue([
      {
        id: 'movies',
        name: 'Movies',
        collectionType: 'movies',
      },
    ]);
    fetchItemsMock.mockResolvedValue([
      {
        id: 'item-1',
        name: 'Movie 1',
        posterUrl: 'https://demo.emby.local/Items/item-1/Images/Primary',
        imageCandidates: [],
        runtimeTicks: 600000000,
        serverPositionTicks: 0,
      },
    ]);
    fetchItemDetailsMock.mockResolvedValueOnce(
      createMovieDetails({
        id: 'item-1',
        mediaSources: [
          {
            id: 'source-1',
            path: 'Movie 1.mkv',
            container: 'mkv',
            size: null,
            bitrate: null,
            videoCodec: 'hevc',
            videoStream: null,
            audioStreams: [{ Index: 2, DisplayTitle: 'Japanese AAC', IsDefault: true }],
          },
        ],
      })
    );

    window.location.hash = '#/libraries';

    const { container } = render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    fireEvent.click(await screen.findByRole('link', { name: /Movies/ }));
    fireEvent.click(await screen.findByRole('link', { name: /Movie 1/ }));
    await screen.findByRole('heading', { name: 'Movie 1' });
    const playButton = container.querySelector<HTMLButtonElement>('.btn-play');
    expect(playButton).not.toBeNull();
    fireEvent.click(playButton!);

    await waitFor(() => {
      expect(storage.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item-1',
          title: 'Movie 1',
          streamUrl:
            'https://demo.emby.local/Videos/item-1/stream?static=true&api_key=token-123&DeviceId=emby-player-desktop&MediaSourceId=source-1&AudioStreamIndex=2',
        })
      );
    });
  });

  it('loads continue watching items from non-featured libraries when local progress exists', async () => {
    const aliceAccount = createSavedAccount();
    const bobAccount = createSavedAccount({
      id: 'https://backup.emby.local::user-2',
      serverUrl: 'https://backup.emby.local',
      userId: 'user-2',
      userName: 'Bob',
      accessToken: 'token-456',
      lastUsedAt: '2026-04-21T01:00:00.000Z',
    });

    mockStorageRead(
      createPersistedState({
        accounts: [aliceAccount, bobAccount],
        activeAccountId: aliceAccount.id,
        progressByItemId: {
          [createAccountScopedProgressKey(aliceAccount.id, 'doc-item')]: {
            itemId: 'doc-item',
            positionSeconds: 300,
            durationSeconds: 1800,
            updatedAt: '2026-04-22T08:00:00.000Z',
          },
          [createAccountScopedProgressKey(bobAccount.id, 'bob-item')]: {
            itemId: 'bob-item',
            positionSeconds: 420,
            durationSeconds: 2400,
            updatedAt: '2026-04-22T09:00:00.000Z',
          },
        },
      })
    );

    fetchViewsMock.mockResolvedValue([
      {
        id: 'movies',
        name: 'Movies',
        collectionType: 'movies',
      },
      {
        id: 'shows',
        name: 'Shows',
        collectionType: 'tvshows',
      },
      {
        id: 'anime',
        name: 'Anime',
        collectionType: 'movies',
      },
      {
        id: 'docs',
        name: 'Documentaries',
        collectionType: 'movies',
      },
    ]);
    fetchItemsByIdsMock.mockResolvedValue([
      {
        id: 'doc-item',
        name: 'Planet Earth',
        posterUrl: 'https://demo.emby.local/Items/doc-item/Images/Primary',
        imageCandidates: [],
        runtimeTicks: 18000000000,
        serverPositionTicks: 3000000000,
      },
      {
        id: 'bob-item',
        name: 'Bob Resume',
        posterUrl: 'https://demo.emby.local/Items/bob-item/Images/Primary',
        imageCandidates: [],
        runtimeTicks: 12000000000,
        serverPositionTicks: 4200000000,
      },
    ]);
    fetchItemsMock.mockImplementation(async (_serverUrl: string, _userId: string, parentId: string) => {
      return [
        {
          id: `${parentId}-item`,
          name: `${parentId} item`,
          posterUrl: `https://demo.emby.local/Items/${parentId}-item/Images/Primary`,
          imageCandidates: [],
          runtimeTicks: 600000000,
          serverPositionTicks: null,
        },
      ];
    });

    window.location.hash = '#/libraries';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('heading', { name: '继续观看' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Planet Earth/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Bob Resume/ })).not.toBeInTheDocument();
    await waitFor(() => expect(fetchItemsMock).toHaveBeenCalledTimes(4));
    expect(fetchItemsByIdsMock).toHaveBeenCalledWith(
      'https://demo.emby.local',
      'user-1',
      ['doc-item'],
      'token-123'
    );
  });

  it('renders cached home data before delayed network refresh resolves', async () => {
    const account = createSavedAccount();
    const homeCacheKey = `home-cache::${account.id}::latest_added`;
    const viewsDeferred = createDeferred<
      Array<{ id: string; name: string; collectionType: string }>
    >();

    mockStorageRead(
      createPersistedState({
        accounts: [account],
        activeAccountId: account.id,
        homeCacheByKey: {
          [homeCacheKey]: createCachedHomeEntry(),
        },
      })
    );
    fetchViewsMock.mockReturnValue(viewsDeferred.promise);
    fetchItemsMock.mockResolvedValue([
      {
        id: 'fresh-movie',
        name: 'Fresh Movie',
        posterUrl: 'https://demo.emby.local/Items/fresh-movie/Images/Primary',
        imageCandidates: [],
        runtimeTicks: 600000000,
        serverPositionTicks: null,
      },
    ]);

    window.location.hash = '#/libraries';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Cached Server' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Cached Movie/ })).toBeInTheDocument();
    expect(screen.queryByText('Loading home screen...')).not.toBeInTheDocument();
    expect(fetchItemsMock).not.toHaveBeenCalled();

    viewsDeferred.resolve([
      {
        id: 'movies',
        name: 'Movies',
        collectionType: 'movies',
      },
    ]);

    await waitFor(() => {
      expect(fetchItemsMock).toHaveBeenCalledWith(
        'https://demo.emby.local',
        'user-1',
        'movies',
        'token-123',
        {
          limit: 8,
          sortMode: 'latest_added',
        }
      );
    });
  });

  it('replaces cached home label when a friendly server name becomes available', async () => {
    const account = createSavedAccount();
    const homeCacheKey = `home-cache::${account.id}::latest_added`;
    const serverInfoDeferred = createDeferred<{ serverName: string | null }>();

    fetchServerInfoMock.mockReturnValue(serverInfoDeferred.promise);
    mockStorageRead(
      createPersistedState({
        accounts: [account],
        activeAccountId: account.id,
        homeCacheByKey: {
          [homeCacheKey]: createCachedHomeEntry({
            cachedAt: new Date(Date.now()).toISOString(),
          }),
        },
      })
    );

    window.location.hash = '#/libraries';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Cached Server' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Cached Movie/ })).toBeInTheDocument();
    expect(fetchViewsMock).not.toHaveBeenCalled();

    serverInfoDeferred.resolve({ serverName: 'Living Room Server' });

    expect(
      await screen.findByRole('heading', { name: 'Living Room Server' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cached Server' })).not.toBeInTheDocument();
  });

  it('does not restart home refresh when a friendly server name becomes available', async () => {
    const account = createSavedAccount();
    const serverInfoDeferred = createDeferred<{ serverName: string | null }>();
    const viewsDeferred = createDeferred<
      Array<{ id: string; name: string; collectionType: string }>
    >();

    fetchServerInfoMock.mockReturnValue(serverInfoDeferred.promise);
    fetchViewsMock.mockReturnValue(viewsDeferred.promise);
    mockStorageRead(
      createPersistedState({
        accounts: [account],
        activeAccountId: account.id,
      })
    );

    window.location.hash = '#/libraries';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    await waitFor(() => {
      expect(fetchViewsMock).toHaveBeenCalledTimes(1);
    });

    serverInfoDeferred.resolve({ serverName: 'Living Room Server' });

    expect(await screen.findByRole('button', { name: /Living Room Server/ })).toBeInTheDocument();
    await flushAsyncQueue();

    expect(fetchViewsMock).toHaveBeenCalledTimes(1);

    viewsDeferred.resolve([
      {
        id: 'movies',
        name: 'Movies',
        collectionType: 'movies',
      },
    ]);
  });

  it('writes a home cache snapshot after refreshing absent cached data', async () => {
    const account = createSavedAccount();
    const storage = mockStorageRead(
      createPersistedState({
        accounts: [account],
        activeAccountId: account.id,
      })
    );

    fetchViewsMock.mockResolvedValue([
      {
        id: 'movies',
        name: 'Movies',
        collectionType: 'movies',
      },
    ]);
    fetchItemsMock.mockResolvedValue([
      {
        id: 'item-1',
        name: 'Movie 1',
        posterUrl: 'https://demo.emby.local/Items/item-1/Images/Primary',
        imageCandidates: [],
        runtimeTicks: 600000000,
        serverPositionTicks: null,
      },
    ]);

    window.location.hash = '#/libraries';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('link', { name: /Movie 1/ })).toBeInTheDocument();

    await waitFor(() => {
      expect(storage.write).toHaveBeenCalledWith({
        homeCacheByKey: {
          [`home-cache::${account.id}::latest_added`]: expect.objectContaining({
            accountLabel: 'https://demo.emby.local',
            cachedAt: expect.any(String),
            continueWatching: [],
            libraries: [
              expect.objectContaining({
                id: 'movies',
                title: 'Movies',
              }),
            ],
            featuredRows: [
              expect.objectContaining({
                id: 'movies',
                title: 'Movies',
                items: [
                  expect.objectContaining({
                    id: 'item-1',
                    title: 'Movie 1',
                  }),
                ],
              }),
            ],
          }),
        },
      });
    });
  });

  it('keeps refreshed home content visible when cache snapshot write throws synchronously', async () => {
    const account = createSavedAccount();
    const storage = mockStorageRead(
      createPersistedState({
        accounts: [account],
        activeAccountId: account.id,
      })
    );
    storage.write.mockImplementation(() => {
      throw new Error('disk full');
    });

    fetchViewsMock.mockResolvedValue([
      {
        id: 'movies',
        name: 'Movies',
        collectionType: 'movies',
      },
    ]);
    fetchItemsMock.mockResolvedValue([
      {
        id: 'item-1',
        name: 'Movie 1',
        posterUrl: 'https://demo.emby.local/Items/item-1/Images/Primary',
        imageCandidates: [],
        runtimeTicks: 600000000,
        serverPositionTicks: null,
      },
    ]);

    window.location.hash = '#/libraries';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('link', { name: /Movie 1/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(storage.write).toHaveBeenCalledWith({
        homeCacheByKey: {
          [`home-cache::${account.id}::latest_added`]: expect.any(Object),
        },
      });
    });
    await flushAsyncQueue();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Movie 1/ })).toBeInTheDocument();
  });

  it('refreshes incomplete home cache entries and writes a repaired snapshot', async () => {
    const account = createSavedAccount();
    const homeCacheKey = `home-cache::${account.id}::latest_added`;
    const storage = mockStorageRead(
      createPersistedState({
        accounts: [account],
        activeAccountId: account.id,
        homeCacheByKey: {
          [homeCacheKey]: createCachedHomeEntry({
            accountLabel: '',
            cachedAt: new Date(Date.now()).toISOString(),
          }),
        },
      })
    );

    fetchViewsMock.mockResolvedValue([
      {
        id: 'movies',
        name: 'Movies',
        collectionType: 'movies',
      },
    ]);
    fetchItemsMock.mockResolvedValue([
      {
        id: 'item-1',
        name: 'Movie 1',
        posterUrl: 'https://demo.emby.local/Items/item-1/Images/Primary',
        imageCandidates: [],
        runtimeTicks: 600000000,
        serverPositionTicks: null,
      },
    ]);

    window.location.hash = '#/libraries';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('link', { name: /Movie 1/ })).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchViewsMock).toHaveBeenCalledWith(
        'https://demo.emby.local',
        'user-1',
        'token-123'
      );
    });
    await waitFor(() => {
      expect(storage.write).toHaveBeenCalledWith({
        homeCacheByKey: {
          [homeCacheKey]: expect.objectContaining({
            accountLabel: 'https://demo.emby.local',
            cachedAt: expect.any(String),
            libraries: [
              expect.objectContaining({
                id: 'movies',
                title: 'Movies',
              }),
            ],
            featuredRows: [
              expect.objectContaining({
                id: 'movies',
                title: 'Movies',
                items: [
                  expect.objectContaining({
                    id: 'item-1',
                    title: 'Movie 1',
                  }),
                ],
              }),
            ],
          }),
        },
      });
    });
  });

  it('keeps cached home content visible when background refresh fails', async () => {
    const account = createSavedAccount();
    const homeCacheKey = `home-cache::${account.id}::latest_added`;

    mockStorageRead(
      createPersistedState({
        accounts: [account],
        activeAccountId: account.id,
        homeCacheByKey: {
          [homeCacheKey]: createCachedHomeEntry(),
        },
      })
    );
    fetchViewsMock.mockRejectedValue(new Error('offline'));

    window.location.hash = '#/libraries';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('link', { name: /Cached Movie/ })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not refresh home data. Showing saved content.'
    );
    expect(screen.getByRole('link', { name: /Cached Movie/ })).toBeInTheDocument();
  });

  it('loads aggregate continue watching rows for every saved account', async () => {
    const aliceAccount = createSavedAccount();
    const bobAccount = createSavedAccount({
      id: 'https://backup.emby.local::user-2',
      serverUrl: 'https://backup.emby.local',
      userId: 'user-2',
      userName: 'Bob',
      accessToken: 'token-456',
      lastUsedAt: '2026-04-21T01:00:00.000Z',
    });

    mockStorageRead(
      createPersistedState({
        accounts: [aliceAccount, bobAccount],
        activeAccountId: aliceAccount.id,
        progressByItemId: {
          [createAccountScopedProgressKey(aliceAccount.id, 'alice-item')]: {
            itemId: 'alice-item',
            positionSeconds: 120,
            durationSeconds: 1800,
            updatedAt: '2026-04-22T10:00:00.000Z',
          },
          [createAccountScopedProgressKey(bobAccount.id, 'bob-item')]: {
            itemId: 'bob-item',
            positionSeconds: 240,
            durationSeconds: 2400,
            updatedAt: '2026-04-22T11:00:00.000Z',
          },
        },
      })
    );

    fetchServerInfoMock.mockImplementation(async (serverUrl: string) => ({
      serverName:
        serverUrl === aliceAccount.serverUrl ? 'Shrek' : 'OkEmby',
    }));
    fetchItemsByIdsMock.mockImplementation(async (serverUrl: string) =>
      serverUrl === aliceAccount.serverUrl
        ? [
            {
              id: 'alice-item',
              name: '黑夜告白',
              posterUrl: 'https://demo.emby.local/Items/alice-item/Images/Primary',
              imageCandidates: [],
              runtimeTicks: 18000000000,
              serverPositionTicks: 1200000000,
              communityRating: null,
              productionYear: 2026,
            },
          ]
        : [
            {
              id: 'bob-item',
              name: '怪奇物语',
              posterUrl: 'https://backup.emby.local/Items/bob-item/Images/Primary',
              imageCandidates: [],
              runtimeTicks: 24000000000,
              serverPositionTicks: 2400000000,
              communityRating: null,
              productionYear: 2016,
            },
          ]
    );

    window.location.hash = '#/aggregate';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('navigation', { name: '聚合视界' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Shrek' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'OkEmby' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /黑夜告白/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /怪奇物语/ })).toBeInTheDocument();

    expect(fetchItemsByIdsMock).toHaveBeenCalledWith(
      aliceAccount.serverUrl,
      aliceAccount.userId,
      ['alice-item'],
      aliceAccount.accessToken
    );
    expect(fetchItemsByIdsMock).toHaveBeenCalledWith(
      bobAccount.serverUrl,
      bobAccount.userId,
      ['bob-item'],
      bobAccount.accessToken
    );
  });

  it('opens item details when a featured home item is clicked', async () => {
    const account = createSavedAccount();

    mockStorageRead(
      createPersistedState({
        accounts: [account],
        activeAccountId: account.id,
      })
    );

    fetchViewsMock.mockResolvedValue([
      {
        id: 'movies',
        name: 'Movies',
        collectionType: 'movies',
      },
    ]);
    fetchItemsByIdsMock.mockResolvedValue([]);
    fetchItemsMock.mockResolvedValue([
      {
        id: 'movie-1',
        name: 'Movie 1',
        posterUrl: 'https://demo.emby.local/Items/movie-1/Images/Primary',
        imageCandidates: [],
        runtimeTicks: 600000000,
        serverPositionTicks: null,
        communityRating: null,
        productionYear: 2026,
      },
    ]);

    window.location.hash = '#/libraries';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    fireEvent.click(await screen.findByRole('link', { name: /Movie 1/ }));

    await waitFor(() => {
      expect(fetchItemDetailsMock).toHaveBeenCalledWith(
        'https://demo.emby.local',
        'user-1',
        'movie-1',
        'token-123'
      );
    });
    expect(await screen.findByRole('heading', { name: 'Movie 1' })).toBeInTheDocument();
  });

  it('keeps item details visible after starting desktop playback from the details page', async () => {
    const account = createSavedAccount();
    const storage = mockStorageRead(
      createPersistedState({
        accounts: [account],
        activeAccountId: account.id,
      })
    );
    fetchPlaybackStreamSourceMock.mockResolvedValue({
      streamUrl:
        'https://demo.emby.local/Videos/movie-1/master.m3u8?MediaSourceId=source-1&api_key=token-123',
      httpHeaders: {},
    });

    window.location.hash = '#/item/movie-1';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Movie 1' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /播放/ }));

    await waitFor(() => {
      expect(storage.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'movie-1',
          title: 'Movie 1',
        })
      );
    });
    expect(screen.getByRole('heading', { name: 'Movie 1' })).toBeInTheDocument();
  });

  it('selects a series episode before launching it with the episode title and id', async () => {
    const account = createSavedAccount();
    const storage = mockStorageRead(
      createPersistedState({
        accounts: [account],
        activeAccountId: account.id,
      })
    );

    fetchItemDetailsMock.mockResolvedValue({
      id: 'series-1',
      name: 'Series 1',
      posterUrl: 'https://demo.emby.local/Items/series-1/Images/Primary',
      imageCandidates: [],
      runtimeTicks: null,
      serverPositionTicks: null,
      communityRating: null,
      productionYear: 2026,
      type: 'Series',
      overview: 'A test series.',
      genres: [],
      officialRating: '',
      people: [],
      studios: [],
      externalUrls: [],
      mediaSources: [],
      backdropUrl: null,
    });
    fetchSeasonsMock.mockResolvedValue([
      {
        id: 'season-1',
        name: 'Season 1',
        indexNumber: 1,
        posterUrl: null,
      },
    ]);
    fetchEpisodesMock.mockResolvedValue([
      {
        id: 'episode-1',
        name: 'First Case',
        overview: '',
        indexNumber: 1,
        parentIndexNumber: 1,
        posterUrl: null,
        runtimeTicks: 600000000,
        serverPositionTicks: null,
        mediaSources: [],
      },
      {
        id: 'episode-2',
        name: 'Second Case',
        overview: '',
        indexNumber: 2,
        parentIndexNumber: 1,
        posterUrl: null,
        runtimeTicks: 600000000,
        serverPositionTicks: null,
        mediaSources: [],
      },
    ]);

    window.location.hash = '#/item/series-1';

    const { container } = render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    fireEvent.click(await screen.findByRole('link', { name: /2\. Second Case/ }));

    expect(storage.launch).not.toHaveBeenCalled();
    expect(screen.getByText('S1:E2 - Second Case')).toBeInTheDocument();

    const playButton = container.querySelector<HTMLButtonElement>('.btn-play');
    expect(playButton).not.toBeNull();
    fireEvent.click(playButton!);

    await waitFor(() => {
      expect(storage.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'episode-2',
          title: 'Series 1 - S1:E2 - Second Case',
        })
      );
    });
  });

  it('loads featured rows with the persisted home-screen sort mode', async () => {
    const account = createSavedAccount();
    mockStorageRead(
      createPersistedState({
        accounts: [account],
        activeAccountId: account.id,
        settings: createSettings({ librarySortMode: 'latest_added' }),
      })
    );

    fetchViewsMock.mockResolvedValue([
      {
        id: 'movies',
        name: 'Movies',
        collectionType: 'movies',
      },
    ]);
    fetchItemsMock.mockResolvedValue([
      {
        id: 'item-1',
        name: 'Movie 1',
        posterUrl: 'https://demo.emby.local/Items/item-1/Images/Primary',
        imageCandidates: [],
        runtimeTicks: 600000000,
        serverPositionTicks: null,
      },
    ]);

    window.location.hash = '#/libraries';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('heading', { name: DEFAULT_HOME_HEADING })).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchItemsMock).toHaveBeenCalledWith(
        'https://demo.emby.local',
        'user-1',
        'movies',
        'token-123',
        {
          limit: 8,
          sortMode: 'latest_added',
        }
      );
    });

    expect(screen.queryByRole('button', { name: 'Release Date' })).not.toBeInTheDocument();
  });

  it('persists library-route sort changes and refetches that library with premiere-date ordering', async () => {
    const account = createSavedAccount();
    const storage = mockStorageRead(
      createPersistedState({
        accounts: [account],
        activeAccountId: account.id,
        settings: createSettings({ librarySortMode: 'latest_added' }),
      })
    );
    storage.write.mockResolvedValue(
      createPersistedState({
        accounts: [account],
        activeAccountId: account.id,
        settings: createSettings({ librarySortMode: 'premiere_date' }),
      })
    );
    fetchItemsMock.mockResolvedValue([
      {
        id: 'item-1',
        name: 'Movie 1',
        posterUrl: 'https://demo.emby.local/Items/item-1/Images/Primary',
        imageCandidates: [],
        runtimeTicks: 600000000,
        serverPositionTicks: null,
      },
    ]);

    window.location.hash = '#/libraries/movies';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('link', { name: /Movie 1/ })).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchItemsMock).toHaveBeenCalledWith(
        'https://demo.emby.local',
        'user-1',
        'movies',
        'token-123',
        {
          sortMode: 'latest_added',
        }
      );
    });

    fireEvent.click(screen.getByText(/更新日期/));
    fireEvent.click(await screen.findByRole('button', { name: /首映日期/ }));

    await waitFor(() => {
      expect(storage.write).toHaveBeenCalledWith({
        settings: {
          librarySortMode: 'premiere_date',
        },
      });
    });
    await waitFor(() => {
      expect(fetchItemsMock).toHaveBeenLastCalledWith(
        'https://demo.emby.local',
        'user-1',
        'movies',
        'token-123',
        {
          sortMode: 'premiere_date',
        }
      );
    });
  });

  it('keeps saved accounts visible when the active account home request fails', async () => {
    mockStorageRead(
      createPersistedState({
        accounts: [createSavedAccount()],
        activeAccountId: 'https://demo.emby.local::user-1',
      })
    );
    fetchViewsMock.mockRejectedValue(new Error('offline'));

    window.location.hash = '#/libraries';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load this account. Check the server and try again.'
    );
    expect(screen.getByRole('button', { name: /Alice/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /设置/ })).toBeInTheDocument();
    expect(screen.queryByText('Nothing to resume yet.')).not.toBeInTheDocument();
    expect(screen.queryByText('No libraries found.')).not.toBeInTheDocument();
  });

  it('waits for resume lookup before first player launch and uses active account progress', async () => {
    const aliceAccount = createSavedAccount();
    const bobAccount = createSavedAccount({
      id: 'https://backup.emby.local::user-2',
      serverUrl: 'https://backup.emby.local',
      userId: 'user-2',
      userName: 'Bob',
      accessToken: 'token-456',
      lastUsedAt: '2026-04-21T01:00:00.000Z',
    });
    const deferred = createDeferred<StoredPersistedState>();

    const storage = mockStorageRead(deferred.promise);

    window.location.hash = '#/item/item-1';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(storage.launch).not.toHaveBeenCalled();

    deferred.resolve(
      createPersistedState({
        accounts: [aliceAccount, bobAccount],
        activeAccountId: aliceAccount.id,
        progressByItemId: {
          [createAccountScopedProgressKey(aliceAccount.id, 'item-1')]: {
            itemId: 'item-1',
            positionSeconds: 120,
            durationSeconds: 3600,
            updatedAt: '2026-04-22T08:00:00.000Z',
          },
          [createAccountScopedProgressKey(bobAccount.id, 'item-1')]: {
            itemId: 'item-1',
            positionSeconds: 480,
            durationSeconds: 3600,
            updatedAt: '2026-04-22T09:00:00.000Z',
          },
        },
      })
    );

    expect(await screen.findByRole('heading', { name: 'Movie 1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /播放/ }));

    await waitFor(() => {
      expect(storage.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item-1',
          startSeconds: 120,
        })
      );
    });
    expect(storage.launch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item-1',
        startSeconds: 0,
      })
    );
  });

  it('persists and reports throttled progress from mpv bridge events at the route layer', async () => {
    let nowMs = Date.parse('2026-04-22T08:00:00.000Z');
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs);
    const account = createSavedAccount();
    const storage = mockStorageRead(
      createPersistedState({
        accounts: [account],
        activeAccountId: account.id,
      })
    );

    window.location.hash = '#/item/item-1';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Movie 1' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /播放/ }));

    await waitFor(() => {
      expect(storage.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item-1',
          startSeconds: 0,
        })
      );
    });

    storage.emitProgress({
      itemId: 'item-1',
      positionSeconds: 12.7,
      durationSeconds: 180,
    });

    await flushAsyncQueue();

    expect(storage.write).toHaveBeenCalledWith({
      clearHomeCache: true,
      progressByItemId: {
        [createAccountScopedProgressKey(account.id, 'item-1')]: {
          itemId: 'item-1',
          positionSeconds: 12,
          durationSeconds: 180,
          updatedAt: expect.any(String),
        },
      },
    });
    expect(reportPlaybackProgressMock).toHaveBeenCalledWith({
      serverUrl: 'https://demo.emby.local',
      accessToken: 'token-123',
      itemId: 'item-1',
      positionSeconds: 12,
    });

    nowMs = Date.parse('2026-04-22T08:00:01.000Z');
    storage.emitProgress({
      itemId: 'item-1',
      positionSeconds: 13.2,
      durationSeconds: 180,
    });

    await flushAsyncQueue();

    expect(storage.write).toHaveBeenCalledTimes(1);
    expect(reportPlaybackProgressMock).toHaveBeenCalledTimes(1);

    nowMs = Date.parse('2026-04-22T08:00:06.000Z');
    storage.emitProgress({
      itemId: 'item-1',
      positionSeconds: 13.2,
      durationSeconds: 180,
    });

    await flushAsyncQueue();

    expect(storage.write).toHaveBeenCalledTimes(2);
    expect(reportPlaybackProgressMock).toHaveBeenCalledTimes(2);
    expect(reportPlaybackProgressMock).toHaveBeenLastCalledWith({
      serverUrl: 'https://demo.emby.local',
      accessToken: 'token-123',
      itemId: 'item-1',
      positionSeconds: 13,
    });

    nowMs = Date.parse('2026-04-22T08:00:12.000Z');
    storage.emitProgress({
      itemId: 'item-1',
      positionSeconds: 13.9,
      durationSeconds: 180,
    });

    await flushAsyncQueue();

    expect(storage.write).toHaveBeenCalledTimes(2);
    expect(reportPlaybackProgressMock).toHaveBeenCalledTimes(2);
  });

  it('preserves library name when opening a library from the home screen', async () => {
    mockStorageRead(
      createPersistedState({
        accounts: [createSavedAccount()],
        activeAccountId: 'https://demo.emby.local::user-1',
      })
    );

    fetchViewsMock.mockResolvedValue([
      {
        id: 'movies',
        name: 'Movies',
        collectionType: 'movies',
      },
    ]);
    fetchItemsMock.mockResolvedValue([
      {
        id: 'item-1',
        name: 'Movie 1',
        posterUrl: 'https://demo.emby.local/Items/item-1/Images/Primary',
        imageCandidates: [],
        runtimeTicks: 600000000,
        serverPositionTicks: 42000000,
      },
    ]);
    fetchItemDetailsMock.mockResolvedValueOnce(
      createMovieDetails({ id: 'item-1', serverPositionTicks: 42000000 })
    );

    window.location.hash = '#/libraries';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    fireEvent.click(await screen.findByRole('link', { name: /Movies/ }));

    expect(await screen.findByRole('link', { name: /Movie 1/ })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/libraries/movies');
    expect(screen.queryByText('Library')).not.toBeInTheDocument();
  });

  it('passes title and resume metadata when opening playback from the home screen', async () => {
    const storage = mockStorageRead(
      createPersistedState({
        accounts: [createSavedAccount()],
        activeAccountId: 'https://demo.emby.local::user-1',
      })
    );

    fetchViewsMock.mockResolvedValue([
      {
        id: 'movies',
        name: 'Movies',
        collectionType: 'movies',
      },
    ]);
    fetchItemsMock.mockResolvedValue([
      {
        id: 'item-1',
        name: 'Movie 1',
        posterUrl: 'https://demo.emby.local/Items/item-1/Images/Primary',
        imageCandidates: [],
        runtimeTicks: 600000000,
        serverPositionTicks: 42000000,
      },
    ]);
    fetchItemDetailsMock.mockResolvedValueOnce(
      createMovieDetails({ id: 'item-1', serverPositionTicks: 42000000 })
    );

    window.location.hash = '#/libraries';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    fireEvent.click(await screen.findByRole('link', { name: /Movie 1/ }));
    fireEvent.click(await screen.findByRole('button', { name: /播放/ }));

    await waitFor(() => {
      expect(storage.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: 'item-1',
          title: 'Movie 1',
          startSeconds: 4,
        })
      );
    });
    expect(storage.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item-1',
        title: 'Movie 1',
        streamUrl:
          'https://demo.emby.local/Videos/item-1/stream.mp4?static=true&api_key=token-123',
      })
    );
  });

  it('clears the persisted session when signing out from settings', async () => {
    const storage = mockStorageRead(
      createPersistedState({
        accounts: [createSavedAccount()],
        activeAccountId: 'https://demo.emby.local::user-1',
        settings: createSettings({ defaultVolume: 0.8 }),
      })
    );
    storage.clearSession.mockResolvedValue({
      accounts: [createSavedAccount()],
      activeAccountId: null,
      settings: createSettings({ defaultVolume: 0.8 }),
      progressByItemId: {},
    });

    window.location.hash = '#/settings';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('heading', { name: SETTINGS_HEADING })).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getAllByText('https://demo.emby.local').length).toBeGreaterThan(0);
    expect(screen.getByText('80%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(storage.clearSession).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('clears image cache when saving a different image cache resolution', async () => {
    const storage = mockStorageRead(
      createPersistedState({
        accounts: [createSavedAccount()],
        activeAccountId: 'https://demo.emby.local::user-1',
        settings: createSettings({
          cache: {
            ...createDefaultSettings().cache,
            imageCacheResolution: 'original',
          },
        }),
      })
    );

    window.location.hash = '#/settings';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    fireEvent.change(await screen.findByLabelText('Image cache resolution'), {
      target: { value: '720' },
    });

    await waitFor(() => {
      expect(storage.clearImageCache).toHaveBeenCalledTimes(1);
    });
    expect(storage.write).toHaveBeenCalledWith({
      settings: {
        cache: {
          ...createDefaultSettings().cache,
          imageCacheResolution: 720,
        },
      },
    });
    expect(storage.configureImageCache).toHaveBeenCalledWith({
      enabled: true,
      maxDimension: 720,
      maxBytes: 524288000,
    });
    expect(storage.clearImageCache.mock.invocationCallOrder[0]).toBeLessThan(
      storage.configureImageCache.mock.invocationCallOrder[0]
    );
  });

  it('keeps image cache files when saving cache options without changing resolution', async () => {
    const storage = mockStorageRead(
      createPersistedState({
        accounts: [createSavedAccount()],
        activeAccountId: 'https://demo.emby.local::user-1',
        settings: createSettings({
          cache: {
            ...createDefaultSettings().cache,
            imageCacheResolution: 720,
          },
        }),
      })
    );

    window.location.hash = '#/settings';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    fireEvent.change(await screen.findByLabelText('Image cache limit'), {
      target: { value: '104857600' },
    });

    await waitFor(() => {
      expect(storage.configureImageCache).toHaveBeenCalledWith({
        enabled: true,
        maxDimension: 720,
        maxBytes: 104857600,
      });
    });
    expect(storage.clearImageCache).not.toHaveBeenCalled();
  });

  it('shows the fetched server display name before the raw url in the authenticated shell', async () => {
    fetchServerInfoMock.mockResolvedValue({ serverName: 'Living Room Server' });

    mockStorageRead(
      createPersistedState({
        accounts: [createSavedAccount()],
        activeAccountId: 'https://demo.emby.local::user-1',
      })
    );

    window.location.hash = '#/libraries';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Living Room Server' })).toBeInTheDocument();

    const displayName = await screen.findByRole('heading', { name: 'Living Room Server' });

    expect(fetchServerInfoMock).toHaveBeenCalledWith('https://demo.emby.local', 'token-123');
    expect(screen.queryByText('https://demo.emby.local')).not.toBeInTheDocument();
  });

  it('shows the fetched server name in the authenticated shell', async () => {
    fetchServerInfoMock.mockResolvedValue({ serverName: 'Living Room Server' });

    mockStorageRead(
      createPersistedState({
        accounts: [createSavedAccount()],
        activeAccountId: 'https://demo.emby.local::user-1',
      })
    );

    fetchViewsMock.mockResolvedValue([
      {
        id: 'movies',
        name: 'Movies',
        collectionType: 'movies',
      },
    ]);
    fetchItemsMock.mockResolvedValue([]);

    window.location.hash = '#/libraries';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Living Room Server' })).toBeInTheDocument();
    expect(fetchItemsMock).toHaveBeenCalledWith(
      'https://demo.emby.local',
      'user-1',
      'movies',
      'token-123',
      {
        limit: 8,
        sortMode: 'latest_added',
      }
    );
  });

  it('fetches friendly server names for saved sidebar servers during hydration, not only the active account', async () => {
    fetchServerInfoMock.mockImplementation(async (serverUrl: string) => ({
      serverName:
        serverUrl === 'https://demo.emby.local' ? 'Living Room Server' : 'Bedroom Server',
    }));

    mockStorageRead(
      createPersistedState({
        accounts: [
          createSavedAccount(),
          createSavedAccount({
            id: 'https://backup.emby.local::user-2',
            serverUrl: 'https://backup.emby.local',
            userId: 'user-2',
            userName: 'Bob',
            accessToken: 'token-456',
            lastUsedAt: '2026-04-21T01:00:00.000Z',
          }),
        ],
        activeAccountId: 'https://demo.emby.local::user-1',
      })
    );

    window.location.hash = '#/libraries';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Living Room Server' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Bedroom Server/ })).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchServerInfoMock).toHaveBeenCalledTimes(2);
    });
    expect(fetchServerInfoMock).toHaveBeenCalledWith('https://demo.emby.local', 'token-123');
    expect(fetchServerInfoMock).toHaveBeenCalledWith('https://backup.emby.local', 'token-456');
  });

  it('prefers a better same-server saved account token during hydration when the first account token is stale', async () => {
    fetchServerInfoMock.mockImplementation(async (_serverUrl: string, accessToken: string) => {
      if (accessToken === 'token-stale') {
        throw new Error('stale token');
      }

      return { serverName: 'Living Room Server' };
    });

    mockStorageRead(
      createPersistedState({
        accounts: [
          createSavedAccount({
            id: 'https://demo.emby.local::user-1',
            userId: 'user-1',
            userName: 'Alice',
            accessToken: 'token-stale',
            lastUsedAt: '2026-04-21T00:00:00.000Z',
          }),
          createSavedAccount({
            id: 'https://demo.emby.local::user-2',
            userId: 'user-2',
            userName: 'Bob',
            accessToken: 'token-fresh',
            lastUsedAt: '2026-04-21T01:00:00.000Z',
          }),
        ],
        activeAccountId: 'https://demo.emby.local::user-2',
      })
    );

    window.location.hash = '#/libraries';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Living Room Server' })).toBeInTheDocument();
    expect(fetchServerInfoMock).toHaveBeenCalledWith('https://demo.emby.local', 'token-fresh');
  });

  it('retries fetching a friendly server name after a failed attempt when the same server is re-authenticated', async () => {
    fetchServerInfoMock
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({ serverName: 'Living Room Server' });

    render(
      <AuthProvider
        initialState={{
          accounts: [createSavedAccount()],
          activeAccountId: 'https://demo.emby.local::user-1',
          settings: createSettings(),
        }}
      >
        <ServerNameRetryHarness />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(fetchServerInfoMock).toHaveBeenCalledTimes(1);
    });
    expect(fetchServerInfoMock).toHaveBeenCalledWith('https://demo.emby.local', 'token-123');
    expect(screen.getByTestId('server-display-name')).toHaveTextContent('https://demo.emby.local');

    fireEvent.click(screen.getByRole('button', { name: 'Reauthenticate' }));

    await waitFor(() => {
      expect(fetchServerInfoMock).toHaveBeenCalledTimes(2);
    });
    expect(fetchServerInfoMock).toHaveBeenLastCalledWith('https://demo.emby.local', 'token-456');
    await waitFor(() => {
      expect(screen.getByTestId('server-display-name')).toHaveTextContent('Living Room Server');
    });
  });

  it('switches the active account through the provider action used by account list UIs', async () => {
    mockStorageRead(
      createPersistedState({
        accounts: [
          createSavedAccount(),
          createSavedAccount({
            id: 'https://backup.emby.local::user-2',
            serverUrl: 'https://backup.emby.local',
            userId: 'user-2',
            userName: 'Bob',
            accessToken: 'token-456',
            lastUsedAt: '2026-04-21T01:00:00.000Z',
          }),
        ],
        activeAccountId: 'https://demo.emby.local::user-1',
      })
    );

    render(
      <AppProviders>
        <AuthHarness />
      </AppProviders>
    );

    expect(await screen.findByTestId('active-account-name')).toHaveTextContent('Alice');

    fireEvent.click(screen.getByRole('button', { name: 'Switch to Bob' }));

    await waitFor(() => {
      expect(screen.getByTestId('active-account-id')).toHaveTextContent(
        'https://backup.emby.local::user-2'
      );
    });
    expect(screen.getByTestId('active-account-name')).toHaveTextContent('Bob');
  });

  it('renders the account sidebar on authenticated routes and switches libraries when a user is selected', async () => {
    mockStorageRead(
      createPersistedState({
        accounts: [
          createSavedAccount(),
          createSavedAccount({
            id: 'https://backup.emby.local::user-2',
            serverUrl: 'https://backup.emby.local',
            userId: 'user-2',
            userName: 'Bob',
            accessToken: 'token-456',
            lastUsedAt: '2026-04-21T01:00:00.000Z',
          }),
        ],
        activeAccountId: 'https://demo.emby.local::user-1',
      })
    );

    window.location.hash = '#/libraries';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('heading', { name: DEFAULT_HOME_HEADING })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Alice/ })).toHaveClass('is-active');
    expect(screen.getByRole('link', { name: /添加服务器/ })).toHaveAttribute('href', '#/login');

    fireEvent.click(screen.getByRole('button', { name: /Bob/ }));

    await waitFor(() => {
      expect(fetchViewsMock).toHaveBeenLastCalledWith(
        'https://backup.emby.local',
        'user-2',
        'token-456'
      );
    });
    expect(screen.getByRole('button', { name: /Bob/ })).toHaveClass('is-active');
  });

  it('persists the selected account and returns to libraries when switching from settings', async () => {
    const bobAccount = createSavedAccount({
      id: 'https://backup.emby.local::user-2',
      serverUrl: 'https://backup.emby.local',
      userId: 'user-2',
      userName: 'Bob',
      accessToken: 'token-456',
      lastUsedAt: '2026-04-21T01:00:00.000Z',
    });
    const storage = mockStorageRead(
      createPersistedState({
        accounts: [createSavedAccount(), bobAccount],
        activeAccountId: 'https://demo.emby.local::user-1',
        settings: createSettings({ defaultVolume: 0.8 }),
      })
    );

    window.location.hash = '#/settings';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('heading', { name: SETTINGS_HEADING })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /首页/ })).toHaveAttribute('href', '#/libraries');

    fireEvent.click(screen.getByRole('button', { name: /Bob/ }));

    await waitFor(() => {
      expect(storage.write).toHaveBeenCalledWith({
        activeAccountId: bobAccount.id,
      });
    });
    expect(await screen.findByRole('heading', { name: bobAccount.serverUrl })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/libraries');
    expect(fetchViewsMock).toHaveBeenLastCalledWith(
      'https://backup.emby.local',
      'user-2',
      'token-456'
    );
  });

  it('persists a manual server display name override from the server context menu', async () => {
    fetchServerInfoMock.mockResolvedValue({ serverName: 'Living Room Server' });
    const storage = mockStorageRead(
      createPersistedState({
        accounts: [createSavedAccount()],
        activeAccountId: 'https://demo.emby.local::user-1',
        settings: createSettings({ defaultVolume: 0.8 }),
      })
    );

    window.location.hash = '#/settings';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument();

    fireEvent.contextMenu(await screen.findByRole('button', { name: /Living Room Server/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '修改备注' }));
    fireEvent.change(screen.getByLabelText('服务器备注'), {
      target: { value: 'Projector Server' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存服务器备注' }));

    await waitFor(() => {
      expect(storage.write).toHaveBeenCalledWith({
        settings: {
          serverPreferencesByUrl: {
            'https://demo.emby.local': {
              displayNameOverride: 'Projector Server',
            },
          },
        },
      });
    });
    expect(await screen.findByRole('button', { name: /Projector Server/ })).toBeInTheDocument();
    expect(screen.getAllByText('https://demo.emby.local').length).toBeGreaterThan(0);
  });

  it('persists custom proxy settings from the settings page', async () => {
    const storage = mockStorageRead(
      createPersistedState({
        accounts: [createSavedAccount()],
        activeAccountId: 'https://demo.emby.local::user-1',
        settings: createSettings({ defaultVolume: 0.8 }),
      })
    );

    window.location.hash = '#/settings';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('heading', { name: SETTINGS_HEADING })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Custom proxy'));
    fireEvent.change(screen.getByLabelText('Custom proxy URL'), {
      target: { value: 'http://127.0.0.1:7890' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save proxy settings' }));

    await waitFor(() => {
      expect(storage.write).toHaveBeenCalledWith({
        settings: {
          proxy: {
            mode: 'custom',
            customProxyUrl: 'http://127.0.0.1:7890',
          },
        },
      });
    });
  });

  it('rejects invalid custom proxy settings before persistence at the route layer', async () => {
    const storage = mockStorageRead(
      createPersistedState({
        accounts: [createSavedAccount()],
        activeAccountId: 'https://demo.emby.local::user-1',
        settings: createSettings({ defaultVolume: 0.8 }),
      })
    );

    window.location.hash = '#/settings';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('heading', { name: SETTINGS_HEADING })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Custom proxy'));
    fireEvent.change(screen.getByLabelText('Custom proxy URL'), {
      target: { value: '127.0.0.1:7890' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save proxy settings' }));

    await waitFor(() => {
      expect(storage.write).not.toHaveBeenCalledWith({
        settings: {
          proxy: {
            mode: 'custom',
            customProxyUrl: '127.0.0.1:7890',
          },
        },
      });
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save proxy settings. Check the proxy URL and try again.'
    );
  });

  it('shows an inline error when persisting a manual server display name override fails', async () => {
    const storage = mockStorageRead(
      createPersistedState({
        accounts: [createSavedAccount()],
        activeAccountId: 'https://demo.emby.local::user-1',
        settings: createSettings({ defaultVolume: 0.8 }),
      })
    );
    storage.write.mockRejectedValue(new Error('disk full'));

    window.location.hash = '#/settings';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('heading', { name: '设置' })).toBeInTheDocument();

    fireEvent.contextMenu(await screen.findByRole('button', { name: /https:\/\/demo\.emby\.local/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '修改备注' }));
    fireEvent.change(screen.getByLabelText('服务器备注'), {
      target: { value: 'Projector Server' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存服务器备注' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '无法保存服务器备注，请稍后重试。'
    );
  });
});
