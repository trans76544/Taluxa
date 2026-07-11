import { createEmbyRequest, type EmbyFetch } from './client';
import { DEFAULT_NETWORK_TIMEOUT_MS } from '@shared/models/network';
import { redactSensitiveValue } from '@shared/network/redaction';

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
  authMode: 'header' | 'local-proxy' | 'tokenless';
  redactedDisplayUrl: string;
  streamUrl: string;
  httpHeaders: Record<string, string>;
  playSessionId: string | null;
  mediaSourceId: string | null;
  playMethod: PlaybackMethod;
}

export type PreflightPlaybackStreamSourceInput = Pick<
  PlaybackStreamSource,
  'httpHeaders' | 'streamUrl'
>;

type PlaybackPreflightFetch = (
  input: string,
  init: RequestInit
) => Promise<Response>;

export interface ReportPlaybackProgressInput {
  serverUrl: string;
  accessToken: string;
  itemId: string;
  positionSeconds: number;
  durationSeconds?: number;
  playSessionId?: string | null;
  mediaSourceId?: string | null;
  playMethod?: PlaybackMethod;
  audioStreamIndex?: number | null;
}

export type PlaybackMethod = 'DirectPlay' | 'DirectStream' | 'Transcode';

export interface UserItemActionInput {
  serverUrl: string;
  userId: string;
  itemId: string;
  accessToken: string;
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
  void accessToken;
  return `${serverUrl}/Videos/${encodeURIComponent(itemId)}/stream?static=true`;
}

function createPlaybackStreamSource(
  streamUrl: string,
  httpHeaders: Record<string, string>,
  metadata: Partial<Pick<PlaybackStreamSource, 'playSessionId' | 'mediaSourceId' | 'playMethod'>> = {}
): PlaybackStreamSource {
  return {
    authMode: Object.keys(httpHeaders).length > 0 ? 'header' : 'tokenless',
    redactedDisplayUrl: redactPlaybackUrl(streamUrl),
    streamUrl,
    httpHeaders,
    playSessionId: metadata.playSessionId ?? null,
    mediaSourceId: metadata.mediaSourceId ?? null,
    playMethod: metadata.playMethod ?? 'DirectPlay',
  };
}

export function buildDirectPlaybackStreamSource({
  serverUrl,
  itemId,
  accessToken,
  mediaSourceId,
  audioStreamIndex,
}: FetchPlaybackStreamSourceInput): PlaybackStreamSource {
  return createPlaybackStreamSource(
    buildMediaSourceDirectUrl(
      serverUrl,
      itemId,
      accessToken,
      null,
      mediaSourceId,
      audioStreamIndex
    ),
    {
      'X-Emby-Token': accessToken,
    },
    { mediaSourceId: mediaSourceId ?? null, playMethod: 'DirectPlay' }
  );
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

  void accessToken;

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
  void accessToken;

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

  void accessToken;
  void addApiKeyToDirectStreamUrl;

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
  return redactSensitiveValue(value);
}

export async function preflightPlaybackStreamSource({
  streamUrl,
  httpHeaders,
}: PreflightPlaybackStreamSourceInput,
fetcher: PlaybackPreflightFetch = fetch): Promise<void> {
  async function executePreflight(headers: Record<string, string>): Promise<Response> {
    const abortController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        abortController.abort();
        reject(new Error('preflight-timeout'));
      }, DEFAULT_NETWORK_TIMEOUT_MS['playback-preflight']);
    });

    try {
      return await Promise.race([
        fetcher(streamUrl, {
          method: 'GET',
          headers,
          signal: abortController.signal,
        }),
        timeoutPromise,
      ]);
    } catch (error) {
      if (error instanceof Error && error.message === 'preflight-timeout') {
        throw new Error(
          `Playback stream preflight timed out for ${redactPlaybackUrl(streamUrl)}`
        );
      }

      const message =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : 'network request failed';

      throw new Error(
        `Playback stream preflight could not reach ${redactPlaybackUrl(streamUrl)} (${message})`
      );
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
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
      operation: 'playback-info',
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
        return createPlaybackStreamSource(
          buildMediaSourceDirectUrl(
            serverUrl,
            itemId,
            accessToken,
            payload.PlaySessionId,
            mediaSource.Id,
            selectedAudioStreamIndex
          ),
          {
            ...(mediaSource.RequiredHttpHeaders ?? {}),
            'X-Emby-Token': accessToken,
          },
          { playSessionId: payload.PlaySessionId ?? null, mediaSourceId: mediaSource.Id, playMethod: 'DirectPlay' }
        );
      }

      return createPlaybackStreamSource(
        buildMediaSourceHlsUrl(
          serverUrl,
          itemId,
          accessToken,
          payload.PlaySessionId,
          mediaSource.Id,
          selectedAudioStreamIndex
        ),
        buildHlsHttpHeaders(accessToken, mediaSource.RequiredHttpHeaders),
        { playSessionId: payload.PlaySessionId ?? null, mediaSourceId: mediaSource.Id, playMethod: 'Transcode' }
      );
    }

    return createPlaybackStreamSource(buildStreamUrl(serverUrl, itemId, accessToken), {
      'X-Emby-Token': accessToken,
    }, { playSessionId: payload.PlaySessionId ?? null, mediaSourceId: mediaSource?.Id ?? null, playMethod: 'DirectPlay' });
  }

  const streamUrl = buildPlaybackInfoStreamUrl(
    serverUrl,
    streamPath,
    accessToken,
    mediaSource?.AddApiKeyToDirectStreamUrl === true,
    payload.PlaySessionId,
    mediaSource?.Id,
    selectedAudioStreamIndex
  );

  return createPlaybackStreamSource(
    streamUrl,
    isHlsStreamPath(streamPath)
      ? buildHlsHttpHeaders(accessToken, mediaSource?.RequiredHttpHeaders)
      : {
          ...(mediaSource?.RequiredHttpHeaders ?? {}),
          'X-Emby-Token': accessToken,
        },
    {
      playSessionId: payload.PlaySessionId ?? null,
      mediaSourceId: mediaSource?.Id ?? null,
      playMethod: isHlsStreamPath(streamPath) ? 'Transcode' : 'DirectStream',
    }
  );
}

async function reportPlaybackCheckIn(
  kind: 'started' | 'progress' | 'stopped',
  input: ReportPlaybackProgressInput,
  fetcher?: EmbyFetch
): Promise<void> {
  const path = kind === 'started'
    ? '/Sessions/Playing'
    : kind === 'stopped'
      ? '/Sessions/Playing/Stopped'
      : '/Sessions/Playing/Progress';
  const body = {
    ItemId: input.itemId,
    PositionTicks: Math.floor(Math.max(0, input.positionSeconds) * 10000000),
    ...(typeof input.durationSeconds === 'number'
      ? { RunTimeTicks: Math.floor(Math.max(0, input.durationSeconds) * 10000000) }
      : {}),
    ...(input.playSessionId ? { PlaySessionId: input.playSessionId } : {}),
    ...(input.mediaSourceId ? { MediaSourceId: input.mediaSourceId } : {}),
    ...(typeof input.audioStreamIndex === 'number' ? { AudioStreamIndex: input.audioStreamIndex } : {}),
    CanSeek: true,
    IsPaused: false,
    IsMuted: false,
    PlayMethod: input.playMethod ?? 'DirectPlay',
    QueueableMediaTypes: ['Video'],
    ...(kind === 'progress' ? { EventName: 'TimeUpdate' } : {}),
  };
  const response = await createEmbyRequest(input.serverUrl, path, {
    method: 'POST',
    accessToken: input.accessToken,
    fetcher,
    operation: 'progress',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to report playback ${kind} (${response.status})`);
  }
}

export const reportPlaybackStarted = (input: ReportPlaybackProgressInput, fetcher?: EmbyFetch) => reportPlaybackCheckIn('started', input, fetcher);
export const reportPlaybackProgress = (input: ReportPlaybackProgressInput, fetcher?: EmbyFetch) => reportPlaybackCheckIn('progress', input, fetcher);
export const reportPlaybackStopped = (input: ReportPlaybackProgressInput, fetcher?: EmbyFetch) => reportPlaybackCheckIn('stopped', input, fetcher);

export async function markItemPlayed({
  serverUrl,
  userId,
  itemId,
  accessToken,
}: UserItemActionInput): Promise<void> {
  const response = await createEmbyRequest(
    serverUrl,
    `/Users/${encodeURIComponent(userId)}/PlayedItems/${encodeURIComponent(itemId)}`,
    {
      method: 'POST',
      accessToken,
      operation: 'user-data',
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to mark item played (${response.status})`);
  }
}

export async function addFavoriteItem({
  serverUrl,
  userId,
  itemId,
  accessToken,
}: UserItemActionInput): Promise<void> {
  const response = await createEmbyRequest(
    serverUrl,
    `/Users/${encodeURIComponent(userId)}/FavoriteItems/${encodeURIComponent(itemId)}`,
    {
      method: 'POST',
      accessToken,
      operation: 'user-data',
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to add item to favorites (${response.status})`);
  }
}

export async function hideItemFromContinueWatching({
  serverUrl,
  userId,
  itemId,
  accessToken,
}: UserItemActionInput): Promise<void> {
  const response = await createEmbyRequest(
    serverUrl,
    `/Users/${encodeURIComponent(userId)}/Items/${encodeURIComponent(itemId)}/UserData`,
    {
      method: 'POST',
      accessToken,
      operation: 'user-data',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ItemId: itemId,
        PlaybackPositionTicks: 0,
        Played: false,
        HideFromResume: true,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to remove item from continue watching (${response.status})`);
  }
}
