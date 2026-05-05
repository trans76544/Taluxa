import { createEmbyRequest } from './client';

const EMBY_DEVICE_ID = 'emby-player-desktop';
const EMBY_HLS_DEVICE_PROFILE = {
  MaxStreamingBitrate: 120000000,
  MaxStaticBitrate: 0,
  DirectPlayProfiles: [],
  TranscodingProfiles: [
    {
      Container: 'ts',
      Type: 'Video',
      VideoCodec: 'h264',
      AudioCodec: 'aac,mp3,ac3,eac3',
      Protocol: 'hls',
      Context: 'Streaming',
      MaxAudioChannels: '6',
      MinSegments: 2,
      BreakOnNonKeyFrames: true,
      EnableSubtitlesInManifest: false,
    },
  ],
};

export interface BuildStreamUrlInput {
  serverUrl: string;
  itemId: string;
  accessToken: string;
}

export interface FetchPlaybackStreamSourceInput {
  serverUrl: string;
  userId: string;
  itemId: string;
  accessToken: string;
  mediaSourceId?: string | null;
  audioStreamIndex?: number | null;
}

export interface PlaybackStreamSource {
  streamUrl: string;
  httpHeaders: Record<string, string>;
}

export interface PreflightPlaybackStreamSourceInput extends PlaybackStreamSource {}

type PlaybackPreflightFetch = (
  input: string,
  init: RequestInit
) => Promise<Response>;

export interface ReportPlaybackProgressInput {
  serverUrl: string;
  accessToken: string;
  itemId: string;
  positionSeconds: number;
}

interface PlaybackInfoResponse {
  PlaySessionId?: string | null;
  MediaSources?: Array<{
    AddApiKeyToDirectStreamUrl?: boolean;
    Container?: string | null;
    DirectStreamUrl?: string | null;
    Id?: string | null;
    RequiredHttpHeaders?: Record<string, string> | null;
    SupportsTranscoding?: boolean;
    TranscodingUrl?: string | null;
  }>;
}

type PlaybackMediaSource = NonNullable<PlaybackInfoResponse['MediaSources']>[number];

export function buildStreamUrl(serverUrl: string, itemId: string, accessToken: string): string {
  return `${serverUrl}/Videos/${encodeURIComponent(itemId)}/stream?static=true&api_key=${encodeURIComponent(accessToken)}`;
}

export function buildDirectPlaybackStreamSource({
  serverUrl,
  itemId,
  accessToken,
  mediaSourceId,
  audioStreamIndex,
}: FetchPlaybackStreamSourceInput): PlaybackStreamSource {
  return {
    streamUrl: buildMediaSourceDirectUrl(
      serverUrl,
      itemId,
      accessToken,
      null,
      mediaSourceId,
      audioStreamIndex
    ),
    httpHeaders: {},
  };
}

function buildMediaSourceHlsUrl(
  serverUrl: string,
  itemId: string,
  accessToken: string,
  playSessionId?: string | null,
  mediaSourceId?: string | null,
  audioStreamIndex?: number | null
): string {
  const streamUrl = new URL(
    `/Videos/${encodeURIComponent(itemId)}/master.m3u8`,
    serverUrl.endsWith('/') ? serverUrl : `${serverUrl}/`
  );

  streamUrl.searchParams.set('api_key', accessToken);

  if (playSessionId?.trim()) {
    streamUrl.searchParams.set('PlaySessionId', playSessionId.trim());
  }

  streamUrl.searchParams.set('DeviceId', EMBY_DEVICE_ID);

  if (mediaSourceId?.trim()) {
    streamUrl.searchParams.set('MediaSourceId', mediaSourceId.trim());
  }

  if (typeof audioStreamIndex === 'number') {
    streamUrl.searchParams.set('AudioStreamIndex', String(audioStreamIndex));
  }

  streamUrl.searchParams.set('Container', 'ts');
  streamUrl.searchParams.set('EnableAutoStreamCopy', 'false');

  return streamUrl.toString();
}

function buildMediaSourceDirectUrl(
  serverUrl: string,
  itemId: string,
  accessToken: string,
  playSessionId?: string | null,
  mediaSourceId?: string | null,
  audioStreamIndex?: number | null
): string {
  const streamUrl = new URL(
    `/Videos/${encodeURIComponent(itemId)}/stream`,
    serverUrl.endsWith('/') ? serverUrl : `${serverUrl}/`
  );

  streamUrl.searchParams.set('static', 'true');
  streamUrl.searchParams.set('api_key', accessToken);

  if (playSessionId?.trim()) {
    streamUrl.searchParams.set('PlaySessionId', playSessionId.trim());
  }

  streamUrl.searchParams.set('DeviceId', EMBY_DEVICE_ID);

  if (mediaSourceId?.trim()) {
    streamUrl.searchParams.set('MediaSourceId', mediaSourceId.trim());
  }

  if (typeof audioStreamIndex === 'number') {
    streamUrl.searchParams.set('AudioStreamIndex', String(audioStreamIndex));
  }

  return streamUrl.toString();
}

function buildPlaybackInfoStreamUrl(
  serverUrl: string,
  streamPath: string,
  accessToken: string,
  addApiKeyToDirectStreamUrl: boolean,
  playSessionId?: string | null,
  mediaSourceId?: string | null,
  audioStreamIndex?: number | null
): string {
  const streamUrl = new URL(
    streamPath,
    serverUrl.endsWith('/') ? serverUrl : `${serverUrl}/`
  );

  if (addApiKeyToDirectStreamUrl && !streamUrl.searchParams.has('api_key')) {
    streamUrl.searchParams.set('api_key', accessToken);
  }

  if (playSessionId?.trim() && !streamUrl.searchParams.has('PlaySessionId')) {
    streamUrl.searchParams.set('PlaySessionId', playSessionId.trim());
  }

  if (!streamUrl.searchParams.has('DeviceId')) {
    streamUrl.searchParams.set('DeviceId', EMBY_DEVICE_ID);
  }

  if (mediaSourceId?.trim() && !streamUrl.searchParams.has('MediaSourceId')) {
    streamUrl.searchParams.set('MediaSourceId', mediaSourceId.trim());
  }

  if (typeof audioStreamIndex === 'number' && !streamUrl.searchParams.has('AudioStreamIndex')) {
    streamUrl.searchParams.set('AudioStreamIndex', String(audioStreamIndex));
  }

  return streamUrl.toString();
}

function isHlsStreamPath(streamPath: string | null | undefined): boolean {
  return streamPath?.toLowerCase().includes('.m3u8') ?? false;
}

function pickPreferredMediaSource(
  mediaSources: PlaybackMediaSource[] | undefined,
  preferredMediaSourceId?: string | null
): PlaybackMediaSource | null {
  if (!mediaSources?.length) {
    return null;
  }

  const preferredId = preferredMediaSourceId?.trim();
  const selectedMediaSource = preferredId
    ? mediaSources.find((candidate) => candidate.Id?.trim() === preferredId)
    : null;

  if (selectedMediaSource) {
    return selectedMediaSource;
  }

  return (
    mediaSources.find((candidate) => isHlsStreamPath(candidate.TranscodingUrl)) ??
    mediaSources.find((candidate) => candidate.TranscodingUrl?.trim()) ??
    mediaSources.find((candidate) => candidate.DirectStreamUrl?.trim()) ??
    mediaSources[0]
  );
}

function pickPreferredStreamPath(mediaSource: PlaybackMediaSource | null): string {
  return mediaSource?.TranscodingUrl?.trim() || mediaSource?.DirectStreamUrl?.trim() || '';
}

function canBuildFallbackHls(mediaSource: PlaybackMediaSource | null): boolean {
  return mediaSource?.SupportsTranscoding !== false;
}

function buildHlsHttpHeaders(
  accessToken: string,
  requiredHeaders: Record<string, string> | null | undefined
): Record<string, string> {
  return {
    ...(requiredHeaders ?? {}),
    'X-Emby-Token': accessToken,
  };
}

function redactPlaybackUrl(value: string): string {
  return value.replace(/([?&]api_key=)[^&]+/giu, '$1[redacted]');
}

export async function preflightPlaybackStreamSource({
  streamUrl,
  httpHeaders,
}: PreflightPlaybackStreamSourceInput,
fetcher: PlaybackPreflightFetch = fetch): Promise<void> {
  async function executePreflight(headers: Record<string, string>): Promise<Response> {
    try {
      return await fetcher(streamUrl, {
        method: 'GET',
        headers,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : 'network request failed';

      throw new Error(
        `Playback stream preflight could not reach ${redactPlaybackUrl(streamUrl)} (${message})`
      );
    }
  }

  let response = await executePreflight({
    ...httpHeaders,
    Range: 'bytes=0-0',
  });

  if (response.status === 416) {
    try {
      await response.body?.cancel();
    } catch {
      // The preflight only needs response headers/status.
    }

    response = await executePreflight({
      ...httpHeaders,
    });
  }

  try {
    await response.body?.cancel();
  } catch {
    // The preflight only needs response headers/status.
  }

  if (!response.ok) {
    throw new Error(
      `Playback stream preflight failed (${response.status} ${response.statusText}) for ${redactPlaybackUrl(streamUrl)}`
    );
  }
}

export async function fetchPlaybackStreamSource({
  serverUrl,
  userId,
  itemId,
  accessToken,
  mediaSourceId,
  audioStreamIndex,
}: FetchPlaybackStreamSourceInput): Promise<PlaybackStreamSource> {
  const selectedMediaSourceId = mediaSourceId?.trim() || null;
  const selectedAudioStreamIndex =
    typeof audioStreamIndex === 'number' ? audioStreamIndex : null;
  const requestBody: Record<string, unknown> = {
    UserId: userId,
    IsPlayback: true,
    AutoOpenLiveStream: true,
    DeviceProfile: EMBY_HLS_DEVICE_PROFILE,
    EnableDirectPlay: false,
    EnableDirectStream: false,
    EnableTranscoding: true,
  };

  if (selectedMediaSourceId) {
    requestBody.MediaSourceId = selectedMediaSourceId;
  }

  if (selectedAudioStreamIndex !== null) {
    requestBody.AudioStreamIndex = selectedAudioStreamIndex;
  }

  const response = await createEmbyRequest(
    serverUrl,
    `/Items/${encodeURIComponent(itemId)}/PlaybackInfo`,
    {
      method: 'POST',
      accessToken,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch playback info (${response.status})`);
  }

  const payload = (await response.json()) as PlaybackInfoResponse;
  const mediaSource = pickPreferredMediaSource(payload.MediaSources, selectedMediaSourceId);
  const streamPath = pickPreferredStreamPath(mediaSource);

  if (!streamPath) {
    if (mediaSource?.Id?.trim()) {
      if (!canBuildFallbackHls(mediaSource)) {
        return {
          streamUrl: buildMediaSourceDirectUrl(
            serverUrl,
            itemId,
            accessToken,
            payload.PlaySessionId,
            mediaSource.Id,
            selectedAudioStreamIndex
          ),
          httpHeaders: {
            ...(mediaSource.RequiredHttpHeaders ?? {}),
          },
        };
      }

      return {
        streamUrl: buildMediaSourceHlsUrl(
          serverUrl,
          itemId,
          accessToken,
          payload.PlaySessionId,
          mediaSource.Id,
          selectedAudioStreamIndex
        ),
        httpHeaders: buildHlsHttpHeaders(accessToken, mediaSource.RequiredHttpHeaders),
      };
    }

    return {
      streamUrl: buildStreamUrl(serverUrl, itemId, accessToken),
      httpHeaders: {},
    };
  }

  return {
    streamUrl: buildPlaybackInfoStreamUrl(
      serverUrl,
      streamPath,
      accessToken,
      mediaSource?.AddApiKeyToDirectStreamUrl === true,
      payload.PlaySessionId,
      mediaSource?.Id,
      selectedAudioStreamIndex
    ),
    httpHeaders: isHlsStreamPath(streamPath)
      ? buildHlsHttpHeaders(accessToken, mediaSource?.RequiredHttpHeaders)
      : {
          ...(mediaSource?.RequiredHttpHeaders ?? {}),
        },
  };
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
