import { createEmbyRequest } from './client';

interface EmbyServerInfoPayload {
  ServerName?: string | null;
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

  const payload = (await response.json()) as unknown;
  if (!isRecord(payload)) {
    throw new Error('Invalid Emby server info response');
  }

  const serverName = payload.ServerName;
  if (serverName !== undefined && serverName !== null && !hasText(serverName)) {
    throw new Error('Invalid Emby server info response');
  }

  return {
    serverName: hasText(serverName) ? serverName.trim() : null,
  };
}
