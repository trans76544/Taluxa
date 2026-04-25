import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildStreamUrl,
  fetchPlaybackStreamSource,
  preflightPlaybackStreamSource,
  type FetchPlaybackStreamSourceInput,
} from './playback';

describe('playback api', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createInput(
    overrides: Partial<FetchPlaybackStreamSourceInput> = {}
  ): FetchPlaybackStreamSourceInput {
    return {
      serverUrl: 'https://demo.emby.local',
      userId: 'user-1',
      itemId: 'item-1',
      accessToken: 'token-123',
      ...overrides,
    };
  }

  it('prefers PlaybackInfo HLS transcoding urls and required headers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          PlaySessionId: 'play-session-123',
          MediaSources: [
            {
              Id: 'source-1',
              DirectStreamUrl: '/Videos/item-1/stream.mkv?MediaSourceId=source-1',
              TranscodingUrl:
                '/Videos/item-1/master.m3u8?MediaSourceId=source-1&TranscodingContainer=ts',
              AddApiKeyToDirectStreamUrl: true,
              RequiredHttpHeaders: {
                Authorization: 'MediaBrowser Token="token-123"',
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    );

    await expect(fetchPlaybackStreamSource(createInput())).resolves.toEqual({
      streamUrl:
        'https://demo.emby.local/Videos/item-1/master.m3u8?MediaSourceId=source-1&TranscodingContainer=ts&api_key=token-123&PlaySessionId=play-session-123&DeviceId=emby-player-desktop',
      httpHeaders: {
        Authorization: 'MediaBrowser Token="token-123"',
        'X-Emby-Token': 'token-123',
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(requestUrl).toBe('https://demo.emby.local/Items/item-1/PlaybackInfo');
    expect(requestInit?.method).toBe('POST');
    expect(requestInit?.body).toBe(
      JSON.stringify({
        UserId: 'user-1',
        IsPlayback: true,
        AutoOpenLiveStream: true,
        DeviceProfile: {
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
        },
        EnableDirectPlay: false,
        EnableDirectStream: false,
        EnableTranscoding: true,
      })
    );
    const headers = requestInit?.headers as Headers;
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Emby-Token')).toBe('token-123');
  });

  it('appends playback session fields when PlaybackInfo stream urls omit them', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          PlaySessionId: 'play-session-xyz',
          MediaSources: [
            {
              Id: 'source-9',
              DirectStreamUrl: '/Videos/item-1/stream.mp4',
            },
          ],
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    );

    await expect(fetchPlaybackStreamSource(createInput())).resolves.toEqual({
      streamUrl:
        'https://demo.emby.local/Videos/item-1/stream.mp4?PlaySessionId=play-session-xyz&DeviceId=emby-player-desktop&MediaSourceId=source-9',
      httpHeaders: {},
    });
  });

  it('falls back to the static stream url when PlaybackInfo does not include a playable source', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          MediaSources: [],
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    );

    await expect(fetchPlaybackStreamSource(createInput())).resolves.toEqual({
      streamUrl: buildStreamUrl('https://demo.emby.local', 'item-1', 'token-123'),
      httpHeaders: {},
    });
  });

  it('builds an HLS transcoding url from media source metadata when PlaybackInfo omits stream urls', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          PlaySessionId: 'play-session-abc',
          MediaSources: [
            {
              Id: 'mediasource_175230',
              Container: 'mp4',
              SupportsTranscoding: true,
            },
          ],
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    );

    await expect(fetchPlaybackStreamSource(createInput())).resolves.toEqual({
      streamUrl:
        'https://demo.emby.local/Videos/item-1/master.m3u8?api_key=token-123&PlaySessionId=play-session-abc&DeviceId=emby-player-desktop&MediaSourceId=mediasource_175230&Container=ts&EnableAutoStreamCopy=false',
      httpHeaders: {
        'X-Emby-Token': 'token-123',
      },
    });
  });

  it('does not force fallback HLS when the media source cannot transcode', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          PlaySessionId: 'play-session-direct',
          MediaSources: [
            {
              Id: 'mediasource_175230',
              Container: 'mp4',
              SupportsTranscoding: false,
            },
          ],
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    );

    await expect(fetchPlaybackStreamSource(createInput())).resolves.toEqual({
      streamUrl:
        'https://demo.emby.local/Videos/item-1/stream?static=true&api_key=token-123&PlaySessionId=play-session-direct&DeviceId=emby-player-desktop&MediaSourceId=mediasource_175230',
      httpHeaders: {},
    });
  });

  it('preflights a playback stream with range and playback headers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', {
        status: 206,
        statusText: 'Partial Content',
      })
    );

    await expect(
      preflightPlaybackStreamSource({
        streamUrl: 'https://demo.emby.local/Videos/item-1/stream.mp4?api_key=token-123',
        httpHeaders: {
          Authorization: 'MediaBrowser Token="token-123"',
        },
      })
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://demo.emby.local/Videos/item-1/stream.mp4?api_key=token-123',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'MediaBrowser Token="token-123"',
          Range: 'bytes=0-0',
        }),
      })
    );
  });

  it('reports playback stream preflight http failures with a redacted url', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Forbidden', {
        status: 403,
        statusText: 'Forbidden',
      })
    );

    await expect(
      preflightPlaybackStreamSource({
        streamUrl: 'https://demo.emby.local/Videos/item-1/stream.mp4?api_key=token-123',
        httpHeaders: {},
      })
    ).rejects.toThrow(
      'Playback stream preflight failed (403 Forbidden) for https://demo.emby.local/Videos/item-1/stream.mp4?api_key=[redacted]'
    );
  });

  it('falls back to a plain get when the ranged preflight returns 416', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response('', {
          status: 416,
          statusText: 'Range Not Satisfiable',
        })
      )
      .mockResolvedValueOnce(
        new Response('', {
          status: 200,
          statusText: 'OK',
        })
      );

    await expect(
      preflightPlaybackStreamSource({
        streamUrl: 'https://demo.emby.local/Videos/item-1/stream.mp4?api_key=token-123',
        httpHeaders: {
          Authorization: 'MediaBrowser Token="token-123"',
        },
      })
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://demo.emby.local/Videos/item-1/stream.mp4?api_key=token-123',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'MediaBrowser Token="token-123"',
          Range: 'bytes=0-0',
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://demo.emby.local/Videos/item-1/stream.mp4?api_key=token-123',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'MediaBrowser Token="token-123"',
        }),
      })
    );
    expect(fetchMock.mock.calls[1]?.[1]).not.toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          Range: 'bytes=0-0',
        }),
      })
    );
  });

  it('reports playback stream preflight network failures with a redacted url', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      preflightPlaybackStreamSource({
        streamUrl: 'https://demo.emby.local/Videos/item-1/stream.mp4?api_key=token-123',
        httpHeaders: {},
      })
    ).rejects.toThrow(
      'Playback stream preflight could not reach https://demo.emby.local/Videos/item-1/stream.mp4?api_key=[redacted] (Failed to fetch)'
    );
  });
});
