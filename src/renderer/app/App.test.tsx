import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HashRouter } from 'react-router-dom';
import { App } from './App';

import type { PersistedState } from '@shared/store/persistence';

const loginMock = vi.hoisted(() => vi.fn());

vi.mock('@shared/api/emby/auth', () => ({
  login: loginMock,
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

function mockStorageRead(state: PersistedState | Promise<PersistedState>) {
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

describe('App', () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
      serverUrl: 'https://demo.emby.local',
      session: {
        userId: 'user-1',
        userName: 'Alice',
        accessToken: 'token-123',
      },
      settings: {
        rememberSession: true,
        defaultVolume: 1,
      },
      progressByItemId: {},
    });

    expect(await screen.findByRole('heading', { name: 'Libraries' })).toBeInTheDocument();
  });

  it('redirects direct library visits without a session to the login page', async () => {
    mockStorageRead({
      serverUrl: '',
      session: null,
      settings: {
        rememberSession: true,
        defaultVolume: 1,
      },
      progressByItemId: {},
    });

    window.location.hash = '#/libraries';

    render(
      <HashRouter>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('keeps auth state out of memory when session persistence fails', async () => {
    const storage = mockStorageRead({
      serverUrl: '',
      session: null,
      settings: {
        rememberSession: true,
        defaultVolume: 1,
      },
      progressByItemId: {},
    });
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
});
