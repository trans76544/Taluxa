import { createEmbyRequest } from './client';

interface EmbyServerInfoPayload {
  ServerName?: string | null;
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export async function fetchServerInfo(
  serverUrl: string,
  accessToken: string
): Promise<{ serverName: string | null }> {
  const response = await createEmbyRequest(serverUrl, '/System/Info/Public', {
    accessToken,
  });

  if (!response.ok) {
    throw new Error(`Failed to load Emby server info (${response.status})`);
  }

  const payload = (await response.json()) as EmbyServerInfoPayload;
  return {
    serverName: hasText(payload.ServerName) ? payload.ServerName.trim() : null,
  };
}
