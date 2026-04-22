import type { ProxySettings } from '@shared/models/settings';

const SUPPORTED_PROXY_PROTOCOLS = new Set(['http:', 'https:', 'socks5:', 'socks5h:']);

export function isValidCustomProxyUrl(value: string): boolean {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return false;
  }

  try {
    const parsedUrl = new URL(normalizedValue);

    return SUPPORTED_PROXY_PROTOCOLS.has(parsedUrl.protocol) && parsedUrl.hostname.length > 0;
  } catch {
    return false;
  }
}

export function isCustomProxyConfigured(proxy: ProxySettings): boolean {
  return proxy.mode === 'custom' && isValidCustomProxyUrl(proxy.customProxyUrl);
}
