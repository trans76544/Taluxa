import type { ProxySettings } from '@shared/models/settings';
import { isCustomProxyConfigured } from '@shared/network/proxy';

export interface ElectronProxyConfig {
  mode?: 'direct' | 'system';
  proxyRules?: string;
}

export interface SessionLike {
  setProxy(config: ElectronProxyConfig): Promise<void>;
}

function createSystemProxySettings(): ProxySettings {
  return {
    mode: 'system',
    customProxyUrl: '',
  };
}

export function toElectronProxyConfig(proxy: ProxySettings): ElectronProxyConfig {
  if (proxy.mode === 'system') {
    return { mode: 'system' };
  }

  if (proxy.mode === 'direct') {
    return { mode: 'direct' };
  }

  if (isCustomProxyConfigured(proxy)) {
    return { proxyRules: proxy.customProxyUrl.trim() };
  }

  return { mode: 'system' };
}

export function applyProxySettings(
  sessionLike: SessionLike,
  proxy: ProxySettings
): Promise<void> {
  return sessionLike.setProxy(toElectronProxyConfig(proxy));
}

export async function applyProxySettingsWithFallback(
  sessionLike: SessionLike,
  proxy: ProxySettings,
  fallbackProxy: ProxySettings = createSystemProxySettings()
): Promise<void> {
  try {
    await applyProxySettings(sessionLike, proxy);
  } catch {
    try {
      await applyProxySettings(sessionLike, fallbackProxy);
    } catch {
      // Startup should remain usable even if both the persisted and fallback proxy application fail.
    }
  }
}
