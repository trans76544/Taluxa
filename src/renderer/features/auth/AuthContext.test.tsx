import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import { createDefaultSettings } from '@shared/models/settings';
import type { SettingsSyncEvent } from '@shared/store/persistence';

const fetchServerInfoMock = vi.hoisted(() => vi.fn());

vi.mock('@shared/api/emby/system', () => ({
  fetchServerInfo: fetchServerInfoMock,
}));

function SettingsProbe() {
  const { settings } = useAuth();

  return (
    <>
      <p data-testid="scale-mode">{settings.playback.scaleMode}</p>
      <p data-testid="theme-mode">{settings.themeMode}</p>
    </>
  );
}

function LastPlayedProbe({ accountId }: { accountId: string }) {
  const { lastPlayedAtByAccountId } = useAuth();
  return <p data-testid="last-played-at">{lastPlayedAtByAccountId[accountId] ?? 'missing'}</p>;
}

function RecordLastPlayedProbe({ accountId }: { accountId: string }) {
  const { recordLastPlayedAt } = useAuth();
  return <>
    <button onClick={() => void recordLastPlayedAt(accountId, '2026-09-27T10:00:00.000Z')}>Record play</button>
    <LastPlayedProbe accountId={accountId} />
  </>;
}

function ServerDisplayNameProbe() {
  const { getServerDisplayName, serverUrl } = useAuth();

  return <p data-testid="server-display-name">{getServerDisplayName(serverUrl)}</p>;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

describe('AuthProvider settings sync events', () => {
  it('hydrates a saved account playback timestamp without using its login time', () => {
    fetchServerInfoMock.mockResolvedValue({ serverName: null });
    const accountId = 'https://demo.emby.local::user-1';
    render(
      <AuthProvider initialState={{
        accounts: [{ id: accountId, serverUrl: 'https://demo.emby.local', userId: 'user-1', userName: 'Alice', accessToken: 'token', lastUsedAt: '2026-09-27T00:00:00.000Z' }],
        activeAccountId: accountId,
        lastPlayedAtByAccountId: { [accountId]: '2026-09-21T08:00:00.000Z' },
      }}>
        <LastPlayedProbe accountId={accountId} />
      </AuthProvider>
    );
    expect(screen.getByTestId('last-played-at')).toHaveTextContent('2026-09-21T08:00:00.000Z');
  });

  it('updates the displayed account time and persists only its timestamp key', async () => {
    fetchServerInfoMock.mockResolvedValue({ serverName: null });
    const accountId = 'https://demo.emby.local::user-1';
    const write = vi.fn().mockResolvedValue(undefined);
    window.embyDesktop = { storage: { write } } as unknown as Window['embyDesktop'];
    render(<AuthProvider initialState={{
      accounts: [{ id: accountId, serverUrl: 'https://demo.emby.local', userId: 'user-1', userName: 'Alice', accessToken: 'secret', lastUsedAt: '2026-09-25T00:00:00.000Z' }],
      activeAccountId: accountId,
    }}><RecordLastPlayedProbe accountId={accountId} /></AuthProvider>);
    act(() => screen.getByRole('button', { name: 'Record play' }).click());
    expect(screen.getByTestId('last-played-at')).toHaveTextContent('2026-09-27T10:00:00.000Z');
    await waitFor(() => expect(write).toHaveBeenCalledWith({
      lastPlayedAtByAccountId: { [accountId]: '2026-09-27T10:00:00.000Z' },
    }));
  });

  it('keeps an inactive account date through switching and re-login while rejecting older dates', async () => {
    fetchServerInfoMock.mockResolvedValue({ serverName: null });
    const first = { id: 'https://demo.local::one', serverUrl: 'https://demo.local', userId: 'one', userName: 'One', accessToken: 'secret', lastUsedAt: '2026-09-01T00:00:00.000Z' };
    const second = { ...first, id: 'https://demo.local::two', userId: 'two', userName: 'Two' };
    const pendingWrite = createDeferred<void>();
    const write = vi.fn(() => pendingWrite.promise);
    window.embyDesktop = { storage: { write } } as unknown as Window['embyDesktop'];
    let auth!: ReturnType<typeof useAuth>;
    function Probe() { auth = useAuth(); return <p data-testid="dates">{JSON.stringify(auth.lastPlayedAtByAccountId)}</p>; }
    render(<AuthProvider initialState={{ accounts: [first, second], activeAccountId: second.id }}><Probe /></AuthProvider>);
    act(() => { void auth.recordLastPlayedAt(first.id, '2026-09-27T10:00:00.000Z'); });
    expect(auth.lastPlayedAtByAccountId[first.id]).toBe('2026-09-27T10:00:00.000Z');
    act(() => { void auth.recordLastPlayedAt(first.id, '2026-09-26T10:00:00.000Z'); void auth.recordLastPlayedAt('unknown', '2026-09-28T10:00:00.000Z'); auth.setActiveAccountId(first.id); auth.upsertAccount({ ...first, lastUsedAt: '2026-09-28T00:00:00.000Z' }); });
    expect(auth.lastPlayedAtByAccountId).toEqual({ [first.id]: '2026-09-27T10:00:00.000Z' });
    expect(write).toHaveBeenCalledTimes(1);
    act(() => pendingWrite.resolve());
  });

  afterEach(() => {
    delete (window as Partial<Window>).embyDesktop;
    fetchServerInfoMock.mockReset();
  });

  it('merges saved player-originated settings patches into renderer state', async () => {
    let listener: ((event: SettingsSyncEvent) => void) | null = null;
    const unsubscribe = vi.fn();
    window.embyDesktop = {
      storage: {
        onSettingsSync: vi.fn((nextListener: (event: SettingsSyncEvent) => void) => {
          listener = nextListener;
          return unsubscribe;
        }),
      },
    } as unknown as Window['embyDesktop'];

    render(
      <AuthProvider
        initialState={{
          accounts: [],
          activeAccountId: null,
          settings: createDefaultSettings(),
        }}
      >
        <SettingsProbe />
      </AuthProvider>
    );

    expect(screen.getByTestId('scale-mode')).toHaveTextContent('fit');

    act(() => {
      listener?.({
        origin: 'player',
        patch: {
          playback: {
            scaleMode: 'crop',
          },
        },
        persistedAt: '2026-06-29T00:00:00.000Z',
        status: 'saved',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('scale-mode')).toHaveTextContent('crop');
    });
  });

  it('merges saved theme settings patches without dropping nested settings', async () => {
    let listener: ((event: SettingsSyncEvent) => void) | null = null;
    window.embyDesktop = {
      storage: {
        onSettingsSync: vi.fn((nextListener: (event: SettingsSyncEvent) => void) => {
          listener = nextListener;
          return vi.fn();
        }),
      },
    } as unknown as Window['embyDesktop'];

    render(
      <AuthProvider
        initialState={{
          accounts: [],
          activeAccountId: null,
          settings: createDefaultSettings(),
        }}
      >
        <SettingsProbe />
      </AuthProvider>
    );

    expect(screen.getByTestId('scale-mode')).toHaveTextContent('fit');
    expect(screen.getByTestId('theme-mode')).toHaveTextContent('daily');

    act(() => {
      listener?.({
        origin: 'renderer-settings',
        patch: {
          themeMode: 'eye',
        },
        persistedAt: '2026-07-09T00:00:00.000Z',
        status: 'saved',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('theme-mode')).toHaveTextContent('eye');
      expect(screen.getByTestId('scale-mode')).toHaveTextContent('fit');
    });
  });

  it('ignores stale server display name responses after a newer account token wins', async () => {
    const staleInfo = createDeferred<{ serverName: string | null }>();
    const freshInfo = createDeferred<{ serverName: string | null }>();
    fetchServerInfoMock
      .mockReturnValueOnce(staleInfo.promise)
      .mockReturnValueOnce(freshInfo.promise);

    const initialState = {
      accounts: [
        {
          id: 'account-1',
          serverUrl: 'https://demo.emby.local',
          userId: 'user-1',
          userName: 'Alice',
          accessToken: 'token-stale',
          lastUsedAt: '2026-06-29T00:00:00.000Z',
        },
      ],
      activeAccountId: 'account-1',
      settings: createDefaultSettings(),
    };
    const { rerender } = render(
      <AuthProvider initialState={initialState}>
        <ServerDisplayNameProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(fetchServerInfoMock).toHaveBeenCalledWith(
        'https://demo.emby.local',
        'token-stale'
      );
    });

    rerender(
      <AuthProvider
        initialState={{
          ...initialState,
          accounts: [
            {
              ...initialState.accounts[0],
              accessToken: 'token-fresh',
              lastUsedAt: '2026-06-29T00:01:00.000Z',
            },
          ],
        }}
      >
        <ServerDisplayNameProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(fetchServerInfoMock).toHaveBeenCalledWith(
        'https://demo.emby.local',
        'token-fresh'
      );
    });

    act(() => {
      freshInfo.resolve({ serverName: 'Fresh Server' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('server-display-name')).toHaveTextContent('Fresh Server');
    });

    act(() => {
      staleInfo.resolve({ serverName: 'Stale Server' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('server-display-name')).toHaveTextContent('Fresh Server');
    });
  });
});
