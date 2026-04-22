// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import type { ProxySettings } from '@shared/models/settings';
import { applyProxySettings, toElectronProxyConfig } from './proxy';

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
});
