import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { AppProviders } from './providers';
import { AuthProvider, useAuth } from '@renderer/features/auth/AuthContext';

import { createDefaultSettings } from '@shared/models/settings';
import type { PersistedState } from '@shared/store/persistence';
import type { SavedAccount } from '@shared/models/session';
import { createAccountScopedProgressKey } from '@shared/store/persistence';

const loginMock = vi.hoisted(() => vi.fn());
const fetchViewsMock = vi.hoisted(() => vi.fn());
const fetchItemsMock = vi.hoisted(() => vi.fn());
const fetchItemsByIdsMock = vi.hoisted(() => vi.fn());
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
}));

vi.mock('@shared/api/emby/playback', async () => {
  const actual = await vi.importActual<typeof import('@shared/api/emby/playback')>(
    '@shared/api/emby/playback'
  );

  return {
    ...actual,
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
  const onProgress = vi.fn((listener: (event: PlayerProgressEvent) => void) => {
    progressListeners.add(listener);

    return () => {
      progressListeners.delete(listener);
    };
  });
  const read = vi.fn().mockResolvedValue(state);
  const write = vi.fn();
  const clearSession = vi.fn();

  window.embyDesktop = {
    player: {
      launch,
      onProgress,
    },
    storage: {
      read,
      write,
      clearSession,
    },
  } as Window['embyDesktop'];

  return {
    launch,
    onProgress,
    read,
    write,
    clearSession,
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

function createPersistedState(overrides: PersistedStateOverrides = {}): StoredPersistedState {
  const state: StoredPersistedState = {
    accounts: overrides.accounts ?? [],
    settings: overrides.settings ?? createDefaultSettings(),
    progressByItemId: overrides.progressByItemId ?? {},
  };

  if (Object.prototype.hasOwnProperty.call(overrides, 'activeAccountId')) {
    state.activeAccountId = overrides.activeAccountId;
  }

  return state;
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
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
    fetchViewsMock.mockResolvedValue([]);
    fetchItemsMock.mockResolvedValue([]);
    fetchItemsByIdsMock.mockResolvedValue([]);
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
    });

    expect(await screen.findByRole('heading', { name: 'Libraries' })).toBeInTheDocument();
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

    expect(await screen.findByRole('heading', { name: 'Libraries' })).toBeInTheDocument();
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

    expect(await screen.findByRole('heading', { name: 'Libraries' })).toBeInTheDocument();
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

  it('redirects direct player visits without a session to the login page', async () => {
    mockStorageRead(createPersistedState());

    window.location.hash = '#/player/item-1';

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

    expect(await screen.findByRole('heading', { name: 'Libraries' })).toBeInTheDocument();
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

    window.location.hash = '#/libraries';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    fireEvent.click(await screen.findByRole('link', { name: /Movies/ }));
    fireEvent.click(await screen.findByRole('link', { name: /Movie 1/ }));

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

    expect(await screen.findByRole('heading', { name: 'Continue Watching' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Planet Earth/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Bob Resume/ })).not.toBeInTheDocument();
    await waitFor(() => expect(fetchItemsMock).toHaveBeenCalledTimes(3));
    expect(fetchItemsByIdsMock).toHaveBeenCalledWith(
      'https://demo.emby.local',
      'user-1',
      ['doc-item'],
      'token-123'
    );
  });

  it('requests release-date sorting and persists it when the user switches sort mode on the home screen', async () => {
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
        settings: createSettings({ librarySortMode: 'release_date' }),
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

    expect(await screen.findByRole('heading', { name: 'Libraries' })).toBeInTheDocument();

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

    fireEvent.click(screen.getByRole('button', { name: 'Release Date' }));

    await waitFor(() => {
      expect(storage.write).toHaveBeenCalledWith({
        settings: {
          librarySortMode: 'release_date',
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
          limit: 8,
          sortMode: 'release_date',
        }
      );
    });
  });

  it('persists library-route sort changes and refetches that library with release-date ordering', async () => {
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
        settings: createSettings({ librarySortMode: 'release_date' }),
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

    expect(await screen.findByRole('heading', { name: 'Browse items' })).toBeInTheDocument();

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

    fireEvent.click(screen.getByRole('button', { name: 'Release Date' }));

    await waitFor(() => {
      expect(storage.write).toHaveBeenCalledWith({
        settings: {
          librarySortMode: 'release_date',
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
          sortMode: 'release_date',
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
    expect(screen.getByRole('button', { name: 'Alice' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
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

    window.location.hash = '#/player/item-1';

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

    window.location.hash = '#/player/item-1';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

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

    window.location.hash = '#/libraries';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    fireEvent.click(await screen.findByRole('link', { name: /Movies/ }));

    expect(await screen.findByText('Movies')).toBeInTheDocument();
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

    window.location.hash = '#/libraries';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    fireEvent.click(await screen.findByRole('link', { name: /Movie 1/ }));

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

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('Active account').nextElementSibling).toHaveTextContent('Alice');
    expect(screen.getByText('Server URL').nextElementSibling).toHaveTextContent(
      'https://demo.emby.local'
    );
    expect(screen.getAllByText('https://demo.emby.local')).toHaveLength(2);
    expect(screen.getByText('80%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(storage.clearSession).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
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

    expect(await screen.findByRole('heading', { name: 'Libraries' })).toBeInTheDocument();

    const displayName = await screen.findByRole('heading', { name: 'Living Room Server' });
    const rawUrl = screen.getByText('https://demo.emby.local');

    expect(fetchServerInfoMock).toHaveBeenCalledWith('https://demo.emby.local', 'token-123');
    expect(displayName.compareDocumentPosition(rawUrl) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('shows the fetched server name and featured sort controls in the authenticated shell', async () => {
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

    expect(await screen.findByRole('heading', { name: 'Libraries' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Living Room Server' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Featured sort controls' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recently Added' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Release Date' })).toBeInTheDocument();
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

    expect(await screen.findByRole('heading', { name: 'Libraries' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Living Room Server' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Bedroom Server' })).toBeInTheDocument();

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

    expect(await screen.findByRole('heading', { name: 'Libraries' })).toBeInTheDocument();
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

    expect(await screen.findByRole('heading', { name: 'Libraries' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alice' })).toHaveClass('is-active');
    expect(screen.getByRole('link', { name: 'Add account' })).toHaveAttribute('href', '#/login');

    fireEvent.click(screen.getByRole('button', { name: 'Bob' }));

    await waitFor(() => {
      expect(fetchViewsMock).toHaveBeenLastCalledWith(
        'https://backup.emby.local',
        'user-2',
        'token-456'
      );
    });
    expect(screen.getByRole('button', { name: 'Bob' })).toHaveClass('is-active');
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

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Libraries' })).toHaveAttribute('href', '#/libraries');

    fireEvent.click(screen.getByRole('button', { name: 'Bob' }));

    await waitFor(() => {
      expect(storage.write).toHaveBeenCalledWith({
        activeAccountId: bobAccount.id,
      });
    });
    expect(await screen.findByRole('heading', { name: 'Libraries' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/libraries');
    expect(fetchViewsMock).toHaveBeenLastCalledWith(
      'https://backup.emby.local',
      'user-2',
      'token-456'
    );
  });

  it('persists a manual server display name override from settings', async () => {
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

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Living Room Server')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Server display name'), {
      target: { value: 'Projector Server' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save server name' }));

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
    expect(await screen.findByRole('heading', { name: 'Projector Server' })).toBeInTheDocument();
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

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();

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

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Server display name'), {
      target: { value: 'Projector Server' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save server name' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save the server name. Try again.'
    );
  });
});
