import { createEmbyRequest } from './client';

export interface BuildStreamUrlInput {
  serverUrl: string;
  itemId: string;
  accessToken: string;
}

export interface ReportPlaybackProgressInput {
  serverUrl: string;
  accessToken: string;
  itemId: string;
  positionSeconds: number;
}

export function buildStreamUrl(serverUrl: string, itemId: string, accessToken: string): string {
  return `${serverUrl}/Videos/${encodeURIComponent(itemId)}/stream.mp4?static=true&api_key=${encodeURIComponent(accessToken)}`;
}

export async function reportPlaybackProgress({
  serverUrl,
  accessToken,
  itemId,
  positionSeconds,
}: ReportPlaybackProgressInput): Promise<void> {
  const response = await createEmbyRequest(serverUrl, '/Sessions/Playing/Progress', {
    method: 'POST',
    accessToken,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ItemId: itemId,
      PositionTicks: Math.floor(positionSeconds * 10000000),
      IsPaused: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to report playback progress (${response.status})`);
  }
}