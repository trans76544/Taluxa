// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextEpisodeMediaCache } from './nextEpisodeMediaCache';
import { MediaPreloadProxy, type MediaFetch } from './mediaPreloadProxy';
import type { PlayerPlaybackEvent } from '@shared/models/playback';

describe('next episode media cache session ownership', () => {
  const proxies: MediaPreloadProxy[] = [];
  afterEach(() => { for (const proxy of proxies.splice(0)) proxy.close(); });
  const source = { playerSessionId: 1, currentItemId: 'ep1', itemId: 'ep2', streamUrl: 'https://media.example/ep2.mp4', httpHeaders: { 'X-Emby-Token': 'one' } };
  function progress(session = 1, itemId = 'ep1'): PlayerPlaybackEvent {
    return { phase: 'progress', playerSessionId: session, itemId, playbackId: `${session}:1`, sequence: 1, positionSeconds: 90, durationSeconds: 100 };
  }
  function harness(fetcher: MediaFetch = async () => new Response('video-data', { headers: { 'Content-Length': '10' } })) {
    const proxy = new MediaPreloadProxy(fetcher, { headBytes: 10, tailBytes: 0 });
    proxies.push(proxy);
    const cache = new NextEpisodeMediaCache(proxy);
    cache.handlePlaybackEvent(progress());
    return { proxy, cache };
  }

  it('returns a ready local media URL only for the same player, target, URL and credentials', async () => {
    const { cache, proxy } = harness();
    await cache.prefetch(source);
    await vi.waitFor(() => expect(proxy.cachedBytes).toBe(10));
    expect(cache.consume({ ...source, playerSessionId: 9 })).toBeNull();
    const url = cache.consume(source);
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:/);
    expect(await fetch(url!).then(r => r.text())).toBe('video-data');
    cache.releaseSession(1);
    expect(proxy.cachedBytes).toBe(0);
    expect((await fetch(url!)).status).toBe(404);
  });

  it('rejects prefetch for a stale current item and discards a candidate on another selection', async () => {
    const { cache, proxy } = harness();
    await cache.prefetch({ ...source, currentItemId: 'old' });
    expect(proxy.cachedBytes).toBe(0);
    await cache.prefetch(source);
    await vi.waitFor(() => expect(proxy.cachedBytes).toBe(10));
    expect(cache.consume({ ...source, itemId: 'ep3' })).toBeNull();
    expect(proxy.cachedBytes).toBe(0);
  });

  it('falls back during failed or unfinished preparation and cancels the obsolete request', async () => {
    let signal!: AbortSignal;
    const { cache } = harness(async (_url, init) => {
      signal = init.signal!;
      return new Promise<Response>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('abort'))));
    });
    await cache.prefetch(source);
    expect(cache.consume(source)).toBeNull();
    expect(signal.aborted).toBe(true);
  });

  it('keeps consumed bytes through the outgoing switch stop event and new lineage', async () => {
    const { cache, proxy } = harness();
    await cache.prefetch(source);
    await vi.waitFor(() => expect(proxy.cachedBytes).toBe(10));
    const url = cache.consume(source)!;
    cache.handlePlaybackEvent({ ...progress(), phase: 'stopped', reason: 'switch', completed: false });
    cache.handlePlaybackEvent({ ...progress(1, 'ep2'), phase: 'started' });
    await cache.prefetch({ ...source, currentItemId: 'ep2', itemId: 'ep3', streamUrl: 'https://media.example/ep3.mp4' });
    expect(await fetch(url).then(r => r.text())).toBe('video-data');
    cache.releaseSession(1);
    expect(proxy.cachedBytes).toBe(0);
  });

  it('isolates windows and retains a prepared candidate on eof for an explicit next click', async () => {
    const { cache, proxy } = harness();
    cache.handlePlaybackEvent(progress(2));
    await cache.prefetch(source);
    await cache.prefetch({ ...source, playerSessionId: 2 });
    await vi.waitFor(() => expect(proxy.cachedBytes).toBe(20));
    cache.handlePlaybackEvent({ ...progress(), phase: 'stopped', reason: 'eof', completed: true });
    cache.releaseSession(2);
    expect(cache.consume(source)).not.toBeNull();
    expect(proxy.cachedBytes).toBe(10);
  });

  it('keeps the playing proxy available until a replacement actually starts', async () => {
    const { cache, proxy } = harness();
    await cache.prefetch(source);
    await vi.waitFor(() => expect(proxy.cachedBytes).toBe(10));
    const playingUrl = cache.consume(source)!;
    cache.handlePlaybackEvent({ ...progress(1, 'ep2'), phase: 'started' });
    expect(cache.consume({ ...source, itemId: 'unavailable' })).toBeNull();
    expect(await fetch(playingUrl).then(r => r.text())).toBe('video-data');
    cache.handlePlaybackEvent({ ...progress(1, 'ep3'), phase: 'started' });
    expect((await fetch(playingUrl)).status).toBe(404);
  });

  it('discards failed preparation and never exposes remote errors', async () => {
    const { cache, proxy } = harness(async () => { throw new Error('secret remote URL'); });
    await expect(cache.prefetch(source)).resolves.toBeUndefined();
    await vi.waitFor(() => expect(cache.consume(source)).toBeNull());
    expect(proxy.cachedBytes).toBe(0);
  });

  it('extends candidate lifetime while its current episode is still playing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-03T00:00:00Z'));
      const { cache, proxy } = harness();
      await cache.prefetch(source);
      await vi.waitFor(() => expect(proxy.cachedBytes).toBe(10));
      vi.setSystemTime(new Date('2026-10-03T00:04:00Z'));
      cache.handlePlaybackEvent(progress());
      vi.setSystemTime(new Date('2026-10-03T00:06:00Z'));
      expect(cache.consume(source)).not.toBeNull();
      cache.releaseSession(1);
    } finally { vi.useRealTimers(); }
  });
});
