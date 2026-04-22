// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import type { ProxySettings } from '@shared/models/settings';
import {
  applyProxySettings,
  applyProxySettingsWithFallback,
  toElectronProxyConfig,
} from './proxy';

describe('toElectronProxyConfig', () => {
  it('returns system mode config for system proxy settings', () => {
    const proxy: ProxySettings = {
      mode: 'system',
      customProxyUrl: '',
    };

    expect(toElectronProxyConfig(proxy)).toEqual({ mode: 'system' });
  });

  it('returns direct mode config for direct proxy settings', () => {
    const proxy: ProxySettings = {
      mode: 'direct',
      customProxyUrl: '',
    };

    expect(toElectronProxyConfig(proxy)).toEqual({ mode: 'direct' });
  });

  it('returns proxy rules for custom proxy settings', () => {
    const proxy: ProxySettings = {
      mode: 'custom',
      customProxyUrl: 'http://127.0.0.1:7890',
    };

    expect(toElectronProxyConfig(proxy)).toEqual({
      proxyRules: 'http://127.0.0.1:7890',
    });
  });
});

describe('applyProxySettings', () => {
  it('calls session.setProxy with the translated config', async () => {
    const proxy: ProxySettings = {
      mode: 'custom',
      customProxyUrl: 'http://127.0.0.1:7890',
    };
    const sessionLike = {
      setProxy: vi.fn().mockResolvedValue(undefined),
    };

    await applyProxySettings(sessionLike, proxy);

    expect(sessionLike.setProxy).toHaveBeenCalledWith({
      proxyRules: 'http://127.0.0.1:7890',
    });
  });

  it('falls back to system mode when persisted startup proxy application fails', async () => {
    const persistedProxy: ProxySettings = {
      mode: 'custom',
      customProxyUrl: 'http://127.0.0.1:7890',
    };
    const sessionLike = {
      setProxy: vi
        .fn()
        .mockRejectedValueOnce(new Error('persisted proxy failed'))
        .mockResolvedValueOnce(undefined),
    };

    await expect(applyProxySettingsWithFallback(sessionLike, persistedProxy)).resolves.toBeUndefined();

    expect(sessionLike.setProxy).toHaveBeenNthCalledWith(1, {
      proxyRules: 'http://127.0.0.1:7890',
    });
    expect(sessionLike.setProxy).toHaveBeenNthCalledWith(2, {
      mode: 'system',
    });
  });

  it('resolves when both the persisted and fallback startup proxy application fail', async () => {
    const persistedProxy: ProxySettings = {
      mode: 'custom',
      customProxyUrl: 'http://127.0.0.1:7890',
    };
    const sessionLike = {
      setProxy: vi
        .fn()
        .mockRejectedValueOnce(new Error('persisted proxy failed'))
        .mockRejectedValueOnce(new Error('system proxy failed')),
    };

    await expect(applyProxySettingsWithFallback(sessionLike, persistedProxy)).resolves.toBeUndefined();

    expect(sessionLike.setProxy).toHaveBeenNthCalledWith(1, {
      proxyRules: 'http://127.0.0.1:7890',
    });
    expect(sessionLike.setProxy).toHaveBeenNthCalledWith(2, {
      mode: 'system',
    });
  });
});

describe('writePersistedStatePatch', () => {
  it('rejects settings writes without mutating the store when onSettingsChanged fails', async () => {
    vi.resetModules();
    vi.doMock('electron', () => ({
      ipcMain: {
        handle: vi.fn(),
      },
    }));
    vi.doMock('electron-store', () => {
      class FakeStore<T> {
        store: T;

        constructor(options: { defaults: T }) {
          this.store = options.defaults;
        }
      }

      return {
        default: FakeStore,
      };
    });

    const { writePersistedStatePatch } = await import('../ipc/storage');

    const initialState = {
      accounts: [],
      activeAccountId: null,
      settings: {
        rememberSession: true,
        defaultVolume: 1,
        librarySortMode: 'latest_added' as const,
        proxy: {
          mode: 'system' as const,
          customProxyUrl: '',
        },
        serverPreferencesByUrl: {},
      },
      progressByItemId: {},
    };
    const storeLike = {
      store: initialState,
    };

    await expect(
      writePersistedStatePatch(
        storeLike,
        {
          settings: {
            proxy: {
              mode: 'custom',
              customProxyUrl: 'http://127.0.0.1:7890',
            },
          },
        },
        {
          onSettingsChanged: async () => {
            throw new Error('proxy failed');
          },
        }
      )
    ).rejects.toThrow('proxy failed');

    expect(storeLike.store).toEqual(initialState);
  });

  it('serializes overlapping writes so older settings do not overwrite newer state', async () => {
    vi.resetModules();
    vi.doMock('electron', () => ({
      ipcMain: {
        handle: vi.fn(),
      },
    }));
    vi.doMock('electron-store', () => {
      class FakeStore<T> {
        store: T;

        constructor(options: { defaults: T }) {
          this.store = options.defaults;
        }
      }

      return {
        default: FakeStore,
      };
    });

    const { writePersistedStatePatch } = await import('../ipc/storage');

    const storeLike = {
      store: {
        accounts: [],
        activeAccountId: null,
        settings: {
          rememberSession: true,
          defaultVolume: 1,
          librarySortMode: 'latest_added' as const,
          proxy: {
            mode: 'system' as const,
            customProxyUrl: '',
          },
          serverPreferencesByUrl: {},
        },
        progressByItemId: {},
      },
    };

    let releaseFirstWrite: (() => void) | null = null;
    const firstWriteReady = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const onSettingsChanged = vi
      .fn()
      .mockImplementationOnce(() => firstWriteReady)
      .mockResolvedValue(undefined);

    const firstWrite = writePersistedStatePatch(
      storeLike,
      {
        settings: {
          proxy: {
            mode: 'custom',
            customProxyUrl: 'http://127.0.0.1:7890',
          },
        },
      },
      { onSettingsChanged }
    );
    const secondWrite = writePersistedStatePatch(
      storeLike,
      {
        settings: {
          rememberSession: false,
        },
      },
      { onSettingsChanged }
    );

    await vi.waitFor(() => {
      expect(onSettingsChanged).toHaveBeenCalledTimes(1);
    });

    releaseFirstWrite?.();

    await Promise.all([firstWrite, secondWrite]);

    expect(onSettingsChanged).toHaveBeenCalledTimes(2);
    expect(storeLike.store).toEqual({
      accounts: [],
      activeAccountId: null,
      settings: {
        rememberSession: false,
        defaultVolume: 1,
        librarySortMode: 'latest_added',
        proxy: {
          mode: 'custom',
          customProxyUrl: 'http://127.0.0.1:7890',
        },
        serverPreferencesByUrl: {},
      },
      progressByItemId: {},
    });
  });

  it('serializes clear-session behind queued writes so stale snapshots do not restore the active account', async () => {
    vi.resetModules();
    vi.doMock('electron', () => ({
      ipcMain: {
        handle: vi.fn(),
      },
    }));
    vi.doMock('electron-store', () => {
      class FakeStore<T> {
        store: T;

        constructor(options: { defaults: T }) {
          this.store = options.defaults;
        }
      }

      return {
        default: FakeStore,
      };
    });

    const { clearPersistedSession, writePersistedStatePatch } = await import('../ipc/storage');

    const storeLike = {
      store: {
        accounts: [],
        activeAccountId: 'account-1',
        settings: {
          rememberSession: true,
          defaultVolume: 1,
          librarySortMode: 'latest_added' as const,
          proxy: {
            mode: 'system' as const,
            customProxyUrl: '',
          },
          serverPreferencesByUrl: {},
        },
        progressByItemId: {},
      },
    };

    let releaseFirstWrite: (() => void) | null = null;
    const firstWriteReady = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });

    const firstWrite = writePersistedStatePatch(
      storeLike,
      {
        settings: {
          rememberSession: false,
        },
      },
      {
        onSettingsChanged: vi.fn().mockImplementationOnce(() => firstWriteReady),
      }
    );

    await vi.waitFor(() => {
      expect(storeLike.store.activeAccountId).toBe('account-1');
    });

    const clearSession = clearPersistedSession(storeLike);

    releaseFirstWrite?.();

    await Promise.all([firstWrite, clearSession]);

    expect(storeLike.store).toEqual({
      accounts: [],
      activeAccountId: null,
      settings: {
        rememberSession: false,
        defaultVolume: 1,
        librarySortMode: 'latest_added',
        proxy: {
          mode: 'system',
          customProxyUrl: '',
        },
        serverPreferencesByUrl: {},
      },
      progressByItemId: {},
    });
  });
});
