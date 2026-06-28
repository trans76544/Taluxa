import { normalizeServerUrl } from '@shared/utils/normalizeServerUrl';

export interface EmbyRequestInit extends RequestInit {
  accessToken?: string;
  fetcher?: EmbyFetch;
}

export type EmbyFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const EMBY_AUTH_HEADER =
  'Emby Client="Taluxa", Device="Windows Desktop", DeviceId="taluxa-desktop", Version="0.1.0"';

export function createEmbyRequest(
  serverUrl: string,
  path: string,
  init: EmbyRequestInit = {}
): Promise<Response> {
  const { accessToken, fetcher = fetch, ...requestInit } = init;
  const normalizedServerUrl = normalizeServerUrl(serverUrl);
  if (!normalizedServerUrl) {
    throw new Error('Server URL is required');
  }

  const requestUrl = new URL(
    path,
    normalizedServerUrl.endsWith('/') ? normalizedServerUrl : `${normalizedServerUrl}/`
  ).toString();
  const headers = new Headers(init.headers);

  headers.set('X-Emby-Authorization', EMBY_AUTH_HEADER);

  if (accessToken) {
    headers.set('X-Emby-Token', accessToken);
  }

  return fetcher(requestUrl, {
    ...requestInit,
    headers,
  });
}
