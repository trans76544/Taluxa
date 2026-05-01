// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { fetchDandanplayDanmaku, normalizeDanmakuServers, toAssSubtitle } from './danmaku';
import type { DanmakuServerSettings } from '@shared/models/settings';

describe('danmaku', () => {
  it('normalizes enabled dandanplay-compatible servers with trimmed values', () => {
    const servers: DanmakuServerSettings[] = [
      {
        id: 'official',
        name: ' Official ',
        url: ' https://api.dandanplay.net/ ',
        appId: ' app-id ',
        appSecret: ' secret ',
        enabled: true,
      },
      {
        id: 'disabled',
        name: 'Disabled',
        url: 'https://disabled.local',
        enabled: false,
      },
      {
        id: 'empty-url',
        name: 'Empty',
        url: '   ',
        enabled: true,
      },
    ];

    expect(normalizeDanmakuServers(servers)).toEqual([
      {
        id: 'official',
        name: 'Official',
        url: 'https://api.dandanplay.net',
        appId: 'app-id',
        appSecret: 'secret',
        enabled: true,
      },
    ]);
  });

  it('matches an item and fetches comments from a dandanplay-compatible server', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            isMatched: true,
            matches: [{ episodeId: 123450001, animeTitle: 'Bocchi', episodeTitle: 'Episode 1' }],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            count: 2,
            comments: [
              { cid: 1, p: '36.12,1,25,16777215,0,0,0,0', m: 'hello' },
              { cid: 2, p: '45.5,5,25,16711680,0,0,0,0', m: 'top line' },
            ],
          }),
          { status: 200 }
        )
      );

    const comments = await fetchDandanplayDanmaku(
      {
        title: 'Bocchi the Rock! - S1:E1 - Lonely Turn',
        itemId: 'item-1',
      },
      [
        {
          id: 'official',
          name: 'Official',
          url: 'https://api.dandanplay.net',
          appId: 'app-id',
          appSecret: 'secret',
          enabled: true,
        },
      ],
      {
        fetcher,
        nowSeconds: () => 1735660800,
      }
    );

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      'https://api.dandanplay.net/api/v2/match',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-AppId': 'app-id',
          'X-Timestamp': '1735660800',
          'X-Signature': expect.any(String),
        }),
        body: JSON.stringify({
          fileName: 'Bocchi the Rock! - S1:E1 - Lonely Turn',
          fileHash: '',
          fileSize: 0,
          videoDuration: 0,
          matchMode: 'fileNameOnly',
        }),
      })
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      'https://api.dandanplay.net/api/v2/comment/123450001?withRelated=true',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'X-AppId': 'app-id',
          'X-Timestamp': '1735660800',
          'X-Signature': expect.any(String),
        }),
      })
    );
    expect(comments).toEqual([
      { color: 16777215, mode: 'scroll', text: 'hello', timeSeconds: 36.12 },
      { color: 16711680, mode: 'top', text: 'top line', timeSeconds: 45.5 },
    ]);
  });

  it('converts dandanplay comments to ASS subtitle events', () => {
    const ass = toAssSubtitle([
      { color: 16777215, mode: 'scroll', text: 'hello {world}', timeSeconds: 36.12 },
      { color: 16711680, mode: 'top', text: 'top line', timeSeconds: 45.5 },
      { color: 65280, mode: 'bottom', text: 'bottom line', timeSeconds: 48 },
    ]);

    expect(ass).toContain('[Script Info]');
    expect(ass).toContain('PlayResX: 1920');
    expect(ass).toContain('Dialogue: 0,0:00:36.12,0:00:48.12,Scroll');
    expect(ass).toContain('hello \\{world\\}');
    expect(ass).toContain('Dialogue: 0,0:00:45.50,0:00:50.50,Top');
    expect(ass).toContain('Dialogue: 0,0:00:48.00,0:00:53.00,Bottom');
  });
});
