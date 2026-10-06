// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlayerMediaPreloadHandlers } from './playerMediaPreload';
import { MediaPreloadProxy } from '../player/mediaPreloadProxy';
import { NextEpisodeMediaCache } from '../player/nextEpisodeMediaCache';

describe('media preload IPC connection', () => {
  let proxy: MediaPreloadProxy | undefined;
  afterEach(() => proxy?.close());
  it('hands mpv the same URL that serves prefetched bytes and clears upstream credentials', async () => {
    const fetcher = vi.fn(async () => new Response('video', { headers: { 'Content-Length': '5' } }));
    proxy = new MediaPreloadProxy(fetcher, { headBytes: 5, tailBytes: 0 });
    const cache = new NextEpisodeMediaCache(proxy);
    cache.handlePlaybackEvent({ phase: 'progress', playerSessionId: 1, itemId: 'one', playbackId: '1:1', sequence: 1, positionSeconds: 90, durationSeconds: 100 });
    const handlers = createPlayerMediaPreloadHandlers(cache);
    const input = { playerSessionId: 1, currentItemId: 'one', itemId: 'two', streamUrl: 'https://media.example/two', httpHeaders: { 'X-Emby-Token': 'secret' } };
    await handlers.preload(input);
    await vi.waitFor(() => expect(proxy?.cachedBytes).toBe(5));
    const selected = handlers.prepareSelection({ ...input, title: 'Episode two' });
    expect(selected.title).toBe('Episode two');
    expect(selected.authMode).toBe('local-proxy');
    expect(selected.httpHeaders).toEqual({});
    expect(await fetch(selected.streamUrl).then(r => r.text())).toBe('video');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('rejects malformed IPC without fetching media and keeps normal selection when nothing is cached', async () => {
    const fetcher = vi.fn();
    proxy = new MediaPreloadProxy(fetcher);
    const handlers = createPlayerMediaPreloadHandlers(new NextEpisodeMediaCache(proxy));
    const input = { playerSessionId: 1, currentItemId: 'one', itemId: 'two', streamUrl: 'https://media.example/two' };
    for (const patch of [ { playerSessionId: 0 }, { streamUrl: 'file:///private' }, { itemId: 'one' }, { startSeconds: -1 }, { httpHeaders: { A: 'x\r\ny' } } ]) {
      await expect(handlers.preload({ ...input, ...patch })).rejects.toThrow('Invalid media preload request.');
    }
    expect(fetcher).not.toHaveBeenCalled();
    expect(handlers.prepareSelection(input)).toBe(input);
  });
});
