export function normalizeServerUrl(serverUrl: string): string {
  const trimmed = serverUrl.trim();

  if (!trimmed) {
    return '';
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  return withProtocol.replace(/\/+$/, '');
}
