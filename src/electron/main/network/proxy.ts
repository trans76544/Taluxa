import type { ProxySettings } from '@shared/models/settings';
import { isCustomProxyConfigured } from '@shared/network/proxy';

export interface ElectronProxyConfig {
  mode?: 'direct' | 'system';
  proxyRules?: string;
}

export interface SessionLike {
  setProxy(config: ElectronProxyConfig): Promise<void>;
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
