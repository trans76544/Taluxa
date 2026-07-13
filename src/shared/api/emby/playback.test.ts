import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildDirectPlaybackStreamSource,
  addFavoriteItem,
  buildStreamUrl,
  fetchPlaybackStreamSource,
  hideItemFromContinueWatching,
  markItemPlayed,
  preflightPlaybackStreamSource,
  reportPlaybackProgress,
  reportPlaybackStarted,
  reportPlaybackStopped,
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

  function createDirectSourceInput(
    overrides: Partial<FetchPlaybackStreamSourceInput> = {}
  ): FetchPlaybackStreamSourceInput {
    return createInput({
      mediaSourceId: 'mediasource_3099',
      audioStreamIndex: 1,
      ...overrides,
    });
  }

  function createPlaybackInfoTranscodeBody(
    overrides: Record<string, unknown> = {}
  ): Record<string, unknown> {
    return {
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
      ...overrides,
    };
  }

  function createPlaybackInfoFallbackBody(
    overrides: Record<string, unknown> = {}
  ): Record<string, unknown> {
    return {
      MediaSources: [],
      ...overrides,
    };
  }

  it('authenticates direct playback sources with headers', () => {
    const source = buildDirectPlaybackStreamSource(createDirectSourceInput());

    expect(source.streamUrl).toBe(
      'https://demo.emby.local/Videos/item-1/stream?static=true&DeviceId=emby-player-desktop&MediaSourceId=mediasource_3099&AudioStreamIndex=1'
    );
    expect(source.streamUrl).not.toContain('token-123');
    expect(source.streamUrl).not.toContain('api_key');
    expect(source.httpHeaders).toEqual({
      'X-Emby-Token': 'token-123',
    });
    expect(source.authMode).toBe('header');
    expect(source.redactedDisplayUrl).toBe(source.streamUrl);
  });

  it('prefers PlaybackInfo HLS transcoding urls and required headers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify(createPlaybackInfoTranscodeBody()),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    );

    const source = await fetchPlaybackStreamSource(createInput());

    expect(source.streamUrl).toBe(
      'https://demo.emby.local/Videos/item-1/master.m3u8?MediaSourceId=source-1&TranscodingContainer=ts&PlaySessionId=play-session-123&DeviceId=emby-player-desktop'
    );
    expect(source.streamUrl).not.toContain('token-123');
    expect(source.streamUrl).not.toContain('api_key');
    expect(source.httpHeaders).toEqual({
      Authorization: 'MediaBrowser Token="token-123"',
      'X-Emby-Token': 'token-123',
    });
    expect(source.authMode).toBe('header');
    expect(source.redactedDisplayUrl).toBe(source.streamUrl);
    expect(source.redactedDisplayUrl).not.toContain('token-123');
    expect(source.redactedDisplayUrl).not.toContain('api_key');
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

    await expect(fetchPlaybackStreamSource(createInput())).resolves.toEqual(
      expect.objectContaining({
      streamUrl:
        'https://demo.emby.local/Videos/item-1/stream.mp4?PlaySessionId=play-session-xyz&DeviceId=emby-player-desktop&MediaSourceId=source-9',
      httpHeaders: {
        'X-Emby-Token': 'token-123',
      },
      authMode: 'header',
      redactedDisplayUrl:
        'https://demo.emby.local/Videos/item-1/stream.mp4?PlaySessionId=play-session-xyz&DeviceId=emby-player-desktop&MediaSourceId=source-9',
    })
    );
  });

  it('redacts PlaybackInfo direct stream display urls while preserving required headers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          PlaySessionId: 'play-session-redact',
          MediaSources: [
            {
              Id: 'source-token',
              DirectStreamUrl: '/Videos/item-1/stream.mp4?api_key=token-123',
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

    const source = await fetchPlaybackStreamSource(
      createInput({
        mediaSourceId: 'source-token',
      })
    );

    expect(source.streamUrl).toBe(
      'https://demo.emby.local/Videos/item-1/stream.mp4?api_key=token-123&PlaySessionId=play-session-redact&DeviceId=emby-player-desktop&MediaSourceId=source-token'
    );
    expect(source.httpHeaders).toEqual({
      Authorization: 'MediaBrowser Token="token-123"',
      'X-Emby-Token': 'token-123',
    });
    expect(source.authMode).toBe('header');
    expect(source.redactedDisplayUrl).toBe(
      'https://demo.emby.local/Videos/item-1/stream.mp4?api_key=[redacted]&PlaySessionId=play-session-redact&DeviceId=emby-player-desktop&MediaSourceId=source-token'
    );
    expect(source.redactedDisplayUrl).not.toContain('token-123');
  });

  it('passes selected media source and audio stream into PlaybackInfo and stream urls', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          PlaySessionId: 'play-session-selected',
          MediaSources: [
            {
              Id: 'source-2',
              TranscodingUrl: '/Videos/item-1/master.m3u8?TranscodingContainer=ts',
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

    await expect(
      fetchPlaybackStreamSource(
        createInput({
          mediaSourceId: 'source-2',
          audioStreamIndex: 5,
        } as Partial<FetchPlaybackStreamSourceInput>)
      )
    ).resolves.toEqual(
      expect.objectContaining({
      streamUrl:
        'https://demo.emby.local/Videos/item-1/master.m3u8?TranscodingContainer=ts&PlaySessionId=play-session-selected&DeviceId=emby-player-desktop&MediaSourceId=source-2&AudioStreamIndex=5',
      httpHeaders: {
        'X-Emby-Token': 'token-123',
      },
      authMode: 'header',
    })
    );

    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(requestInit?.body).toContain('"MediaSourceId":"source-2"');
    expect(requestInit?.body).toContain('"AudioStreamIndex":5');
  });

  it('falls back to the static stream url when PlaybackInfo does not include a playable source', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify(createPlaybackInfoFallbackBody()),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    );

    await expect(fetchPlaybackStreamSource(createInput())).resolves.toEqual(
      expect.objectContaining({
      streamUrl: buildStreamUrl('https://demo.emby.local', 'item-1', 'token-123'),
      httpHeaders: {
        'X-Emby-Token': 'token-123',
      },
      authMode: 'header',
    })
    );
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

    const source = await fetchPlaybackStreamSource(createInput());

    expect(source.streamUrl).toBe(
      'https://demo.emby.local/Videos/item-1/master.m3u8?PlaySessionId=play-session-abc&DeviceId=emby-player-desktop&MediaSourceId=mediasource_175230&Container=ts&EnableAutoStreamCopy=false'
    );
    expect(source.streamUrl).not.toContain('token-123');
    expect(source.streamUrl).not.toContain('api_key');
    expect(source.httpHeaders).toEqual({
      'X-Emby-Token': 'token-123',
    });
    expect(source.authMode).toBe('header');
    expect(source.redactedDisplayUrl).toBe(source.streamUrl);
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

    const source = await fetchPlaybackStreamSource(createInput());

    expect(source.streamUrl).toBe(
      'https://demo.emby.local/Videos/item-1/stream?static=true&PlaySessionId=play-session-direct&DeviceId=emby-player-desktop&MediaSourceId=mediasource_175230'
    );
    expect(source.streamUrl).not.toContain('token-123');
    expect(source.streamUrl).not.toContain('api_key');
    expect(source.httpHeaders).toEqual({
      'X-Emby-Token': 'token-123',
    });
    expect(source.authMode).toBe('header');
    expect(source.redactedDisplayUrl).toBe(source.streamUrl);
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

  it('times out hanging playback preflight requests with a redacted url', async () => {
    vi.useFakeTimers();
    const abortListener = vi.fn();
    const fetcher = vi.fn((_input: string, init: RequestInit) => {
      init.signal?.addEventListener('abort', abortListener);
      return new Promise<Response>(() => undefined);
    });

    const preflightPromise = preflightPlaybackStreamSource(
      {
        streamUrl: 'https://demo.emby.local/Videos/item-1/stream.mp4?api_key=token-123',
        httpHeaders: {},
      },
      fetcher
    );

    const assertion = expect(preflightPromise).rejects.toThrow(
      'Playback stream preflight timed out for https://demo.emby.local/Videos/item-1/stream.mp4?api_key=[redacted]'
    );
    await vi.advanceTimersByTimeAsync(12000);

    await assertion;
    expect(abortListener).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('marks an item as played through the user playstate endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));

    await expect(markItemPlayed(createInput())).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://demo.emby.local/Users/user-1/PlayedItems/item-1',
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Headers),
      })
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('X-Emby-Token')).toBe('token-123');
  });

  it('adds an item to favorites through the user library endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));

    await expect(addFavoriteItem(createInput())).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://demo.emby.local/Users/user-1/FavoriteItems/item-1',
      expect.objectContaining({
        method: 'POST',
        headers: expect.any(Headers),
      })
    );
  });

  it('hides an item from continue watching by updating item userdata', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(''));

    await expect(hideItemFromContinueWatching(createInput())).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://demo.emby.local/Users/user-1/Items/item-1/UserData',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          ItemId: 'item-1',
          PlaybackPositionTicks: 0,
          Played: false,
          HideFromResume: true,
        }),
      })
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it.each([
    [reportPlaybackStarted, '/Sessions/Playing', false],
    [reportPlaybackProgress, '/Sessions/Playing/Progress', true],
    [reportPlaybackStopped, '/Sessions/Playing/Stopped', false],
  ] as const)('reports the complete playback lifecycle', async (reporter, path, hasEventName) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    await reporter({
      serverUrl: 'https://demo.emby.local', accessToken: 'token-123', itemId: 'item-1',
      positionSeconds: 12, durationSeconds: 180, playSessionId: 'play-1',
      mediaSourceId: 'source-1', playMethod: 'Transcode',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://demo.emby.local${path}`);
    expect(JSON.parse(String(init?.body))).toEqual({
      ItemId: 'item-1', PositionTicks: 120_000_000, RunTimeTicks: 1_800_000_000,
      PlaySessionId: 'play-1', MediaSourceId: 'source-1', CanSeek: true,
      IsPaused: false, IsMuted: false, PlayMethod: 'Transcode',
      ...(hasEventName ? { EventName: 'TimeUpdate' } : {}),
    });
  });
});
