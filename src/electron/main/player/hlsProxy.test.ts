// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { HlsProxyServer, rewriteHlsPlaylist, type HlsProxyFetch } from './hlsProxy';

describe('HlsProxyServer', () => {
  let proxyServer: HlsProxyServer | null = null;

  afterEach(() => {
    proxyServer?.close();
    proxyServer = null;
  });

  it('rewrites HLS playlist relative urls through the local proxy', () => {
    const playlist = [
      '#EXTM3U',
      '#EXT-X-KEY:METHOD=AES-128,URI="keys/key.bin"',
      '#EXTINF:3.0,',
      'main/0.ts?PlaySessionId=play-session-1',
    ].join('\n');

    const rewritten = rewriteHlsPlaylist(
      playlist,
      'https://demo.emby.local/Videos/item-1/master.m3u8?api_key=token-123',
      (remoteUrl) => `http://127.0.0.1/hls?url=${encodeURIComponent(remoteUrl)}`
    );

    expect(rewritten).toContain(
      'URI="http://127.0.0.1/hls?url=https%3A%2F%2Fdemo.emby.local%2FVideos%2Fitem-1%2Fkeys%2Fkey.bin"'
    );
    expect(rewritten).toContain(
      'http://127.0.0.1/hls?url=https%3A%2F%2Fdemo.emby.local%2FVideos%2Fitem-1%2Fmain%2F0.ts%3FPlaySessionId%3Dplay-session-1'
    );
  });

  it('fetches playlists and rewritten segments with playback headers', async () => {
    const fetcher = vi.fn<HlsProxyFetch>(async (url) => {
      if (url === 'https://demo.emby.local/Videos/item-1/master.m3u8?api_key=token-123') {
        return new Response('#EXTM3U\n#EXTINF:3.0,\nhls1/main/0.ts?PlaySessionId=play-session-1', {
          headers: {
            'Content-Type': 'application/vnd.apple.mpegurl',
          },
        });
      }

      return new Response('segment-body', {
        headers: {
          'Content-Type': 'video/mp2t',
        },
      });
    });

    proxyServer = new HlsProxyServer(fetcher);
    const proxiedUrl = await proxyServer.createProxiedUrl({
      streamUrl: 'https://demo.emby.local/Videos/item-1/master.m3u8?api_key=token-123',
      httpHeaders: {
        'X-Emby-Token': 'token-123',
      },
    });

    expect(proxiedUrl).not.toContain('token-123');
    expect(proxiedUrl).not.toContain('api_key');

    const playlist = await fetch(proxiedUrl).then((response) => response.text());
    const segmentUrl = playlist
      .split('\n')
      .find((line) => line.startsWith('http://127.0.0.1'));

    expect(segmentUrl).toBeTruthy();
    expect(segmentUrl).not.toContain('token-123');
    expect(segmentUrl).not.toContain('api_key');
    await expect(fetch(segmentUrl ?? '').then((response) => response.text())).resolves.toBe(
      'segment-body'
    );

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      'https://demo.emby.local/Videos/item-1/master.m3u8?api_key=token-123',
      expect.objectContaining({
        headers: {
          'X-Emby-Token': 'token-123',
        },
      })
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      'https://demo.emby.local/Videos/item-1/hls1/main/0.ts?PlaySessionId=play-session-1&api_key=token-123',
      expect.objectContaining({
        headers: {
          'X-Emby-Token': 'token-123',
        },
      })
    );
  });
});
