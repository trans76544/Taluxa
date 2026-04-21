import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { AppProviders } from './providers';
import { useAuth } from '@renderer/features/auth/AuthContext';

import type { PersistedState } from '@shared/store/persistence';
import type { SavedAccount } from '@shared/models/session';

const loginMock = vi.hoisted(() => vi.fn());
const fetchViewsMock = vi.hoisted(() => vi.fn());
const fetchItemsMock = vi.hoisted(() => vi.fn());
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

function createPersistedState(overrides: PersistedStateOverrides = {}): StoredPersistedState {
  const state: StoredPersistedState = {
    accounts: overrides.accounts ?? [],
    settings:
      overrides.settings ??
      ({
        rememberSession: true,
        defaultVolume: 1,
      } satisfies PersistedState['settings']),
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
      settings: {
        rememberSession: true,
        defaultVolume: 1,
      },
      progressByItemId: {},
    });

    expect(await screen.findByRole('heading', { name: 'Your libraries' })).toBeInTheDocument();
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

    expect(await screen.findByRole('heading', { name: 'Your libraries' })).toBeInTheDocument();
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

    expect(await screen.findByRole('heading', { name: 'Your libraries' })).toBeInTheDocument();
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

    fireEvent.click(await screen.findByRole('link', { name: 'Movies' }));
    fireEvent.click(await screen.findByRole('link', { name: 'Movie 1' }));

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
        settings: {
          rememberSession: true,
          defaultVolume: 0.8,
        },
      })
    );
    storage.clearSession.mockResolvedValue({
      accounts: [createSavedAccount()],
      activeAccountId: null,
      settings: {
        rememberSession: true,
        defaultVolume: 0.8,
      },
      progressByItemId: {},
    });

    window.location.hash = '#/settings';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('https://demo.emby.local')).toBeInTheDocument();
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
});
