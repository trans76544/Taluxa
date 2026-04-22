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
});
