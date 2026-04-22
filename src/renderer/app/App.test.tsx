import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { AppProviders } from './providers';
import { useAuth } from '@renderer/features/auth/AuthContext';

import { createDefaultSettings } from '@shared/models/settings';
import type { PersistedState } from '@shared/store/persistence';
import type { SavedAccount } from '@shared/models/session';
import { createAccountScopedProgressKey } from '@shared/store/persistence';

const loginMock = vi.hoisted(() => vi.fn());
const fetchViewsMock = vi.hoisted(() => vi.fn());
const fetchItemsMock = vi.hoisted(() => vi.fn());
const fetchItemsByIdsMock = vi.hoisted(() => vi.fn());
const playerPageMock = vi.hoisted(() => vi.fn());

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

vi.mock('@renderer/features/player/PlayerPage', () => ({
  PlayerPage: (props: unknown) => playerPageMock(props),
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

function mockStorageRead(state: StoredPersistedState | Promise<StoredPersistedState>) {
  const read = vi.fn().mockResolvedValue(state);
  const write = vi.fn();
  const clearSession = vi.fn();

  window.embyDesktop = {
    storage: {
      read,
      write,
      clearSession,
    },
  };

  return { read, write, clearSession };
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

describe('App', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    fetchViewsMock.mockResolvedValue([]);
    fetchItemsMock.mockResolvedValue([]);
    fetchItemsByIdsMock.mockResolvedValue([]);
    playerPageMock.mockReturnValue(<div data-testid="player-page" />);
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

    expect(await screen.findByTestId('player-page')).toBeInTheDocument();
    expect(playerPageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item-1',
        title: 'Movie 1',
        initialPositionSeconds: 4,
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
        runtimeTicks: 18000000000,
        serverPositionTicks: 3000000000,
      },
      {
        id: 'bob-item',
        name: 'Bob Resume',
        posterUrl: 'https://demo.emby.local/Items/bob-item/Images/Primary',
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

  it('uses playback progress from the active account when resuming a player route', async () => {
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

    window.location.hash = '#/player/item-1';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByTestId('player-page')).toBeInTheDocument();
    await waitFor(() => {
      expect(playerPageMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          itemId: 'item-1',
          initialPositionSeconds: 120,
        })
      );
    });
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

    expect(await screen.findByTestId('player-page')).toBeInTheDocument();
    expect(playerPageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item-1',
        title: 'Movie 1',
        initialPositionSeconds: 4,
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
});
