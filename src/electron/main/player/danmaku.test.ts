// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  DanmakuSourceError,
  fetchDandanplayDanmaku,
  normalizeDanmakuServers,
  toAssSubtitle,
} from './danmaku';
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
    const logger = vi.fn();

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
        logger,
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
    expect(logger).toHaveBeenCalledWith(
      '[danmaku][dandanplay] match request server=Official fileName=Bocchi the Rock! - S1:E1 - Lonely Turn'
    );
    expect(logger).toHaveBeenCalledWith(
      '[danmaku][dandanplay] match result server=Official success=true matched=true episodeId=123450001 matches=1'
    );
    expect(logger).toHaveBeenCalledWith(
      '[danmaku][dandanplay] comments fetched server=Official episodeId=123450001 comments=2'
    );
  });

  it('logs ascii-safe dandanplay match diagnostics for non-ascii titles', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          isMatched: false,
          matches: [],
        }),
        { status: 200 }
      )
    );
    const logger = vi.fn();

    const comments = await fetchDandanplayDanmaku(
      {
        title: '未来少年柯南',
        itemId: 'item-1',
      },
      [
        {
          id: 'official',
          name: 'Official',
          url: 'https://api.dandanplay.net',
          enabled: true,
        },
      ],
      {
        fetcher,
        logger,
      }
    );

    expect(comments).toEqual([]);
    expect(logger).toHaveBeenCalledWith(
      '[danmaku][dandanplay] match request server=Official fileName=\\u672a\\u6765\\u5c11\\u5e74\\u67ef\\u5357'
    );
    expect(logger).toHaveBeenCalledWith(
      '[danmaku][dandanplay] match result server=Official success=true matched=false episodeId=none matches=0'
    );
  });

  it('throws a source error when every configured dandanplay source rejects the request', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('Forbidden', { status: 403 }))
      .mockResolvedValueOnce(new Response('Payment Required', { status: 402 }));
    const logger = vi.fn();

    await expect(
      fetchDandanplayDanmaku(
        {
          title: '未来少年柯南',
          itemId: 'item-1',
        },
        [
          {
            id: 'official',
            name: 'Official',
            url: 'https://api.dandanplay.net',
            enabled: true,
          },
          {
            id: 'mirror',
            name: 'Mirror',
            url: 'https://danmaku.example.test',
            enabled: true,
          },
        ],
        {
          fetcher,
          logger,
        }
      )
    ).rejects.toThrow(DanmakuSourceError);
    expect(logger).toHaveBeenCalledWith(
      '[danmaku][dandanplay] server failed server=Official error=Danmaku request failed (403)'
    );
    expect(logger).toHaveBeenCalledWith(
      '[danmaku][dandanplay] server failed server=Mirror error=Danmaku request failed (402)'
    );
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

  it('applies danmaku rendering options to ASS output', () => {
    const ass = toAssSubtitle(
      [
        { color: 16777215, mode: 'scroll', text: 'first', timeSeconds: 10 },
        { color: 16777215, mode: 'scroll', text: 'second', timeSeconds: 11 },
        { color: 16777215, mode: 'scroll', text: 'third', timeSeconds: 12 },
        { color: 16711680, mode: 'top', text: 'top one', timeSeconds: 20 },
        { color: 65280, mode: 'top', text: 'top two', timeSeconds: 21 },
        { color: 255, mode: 'bottom', text: 'bottom one', timeSeconds: 30 },
        { color: 255, mode: 'bottom', text: 'bottom two', timeSeconds: 31 },
      ],
      {
        scrollMaxLines: 2,
        topMaxLines: 1,
        bottomMaxLines: 1,
        scale: 1.5,
        opacity: 0.25,
        speed: 2,
        bold: true,
      }
    );

    expect(ass).toContain('Style: Scroll,Microsoft YaHei UI,51,&HBF');
    expect(ass).toContain('Style: Top,Microsoft YaHei UI,51,&HBF');
    expect(ass).toContain('Style: Bottom,Microsoft YaHei UI,51,&HBF');
    expect(ass).toContain('Style: Scroll,Microsoft YaHei UI,51,&HBF00FFFFFF,&HBF00FFFFFF,&H96000000,&H00000000,1');
    expect(ass).toContain('Dialogue: 0,0:00:10.00,0:00:16.00,Scroll');
    expect(ass).toContain('\\move(2000,88,-420,88)');
    expect(ass).toContain('\\move(2000,134,-420,134)');
    expect(ass).toContain('third');
    expect(ass).toContain('\\move(2000,88,-420,88)}third');
    expect(ass).toContain('\\pos(960,72)}top two');
    expect(ass).toContain('\\pos(960,960)}bottom two');
  });

  it('filters danmaku comments with plain-text and regex blocklist entries', () => {
    const ass = toAssSubtitle(
      [
        { color: 16777215, mode: 'scroll', text: 'keep this', timeSeconds: 10 },
        { color: 16777215, mode: 'scroll', text: 'contains Spoiler text', timeSeconds: 11 },
        { color: 16777215, mode: 'scroll', text: 'baaad phrase', timeSeconds: 12 },
      ],
      {
        blocklist: ['spoiler', '/ba+d/i', '/[/'],
      }
    );

    expect(ass).toContain('keep this');
    expect(ass).not.toContain('Spoiler');
    expect(ass).not.toContain('baaad');
  });
});
