// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaPreloadProxy, type MediaFetch } from './mediaPreloadProxy';

describe('actual next-episode media prefetch', () => {
  const servers: MediaPreloadProxy[] = [];
  afterEach(() => { for (const server of servers.splice(0)) server.close(); });
  function create(fetcher: MediaFetch, options = {}) {
    const proxy = new MediaPreloadProxy(fetcher, options);
    servers.push(proxy);
    return proxy;
  }
  function rangedFile(bytes: Buffer) {
    return vi.fn<MediaFetch>(async (_url, init) => {
      const range = new Headers(init.headers).get('range');
      const match = /^bytes=(\d+)-(\d*)$/.exec(range ?? '');
      const start = match ? Number(match[1]) : 0;
      const end = match && match[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
      return new Response(new Uint8Array(bytes.subarray(start, end + 1)), {
        status: match ? 206 : 200,
        headers: {
          'Content-Type': 'video/mp4', 'Content-Length': String(end - start + 1), ETag: '"one"',
          ...(match ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {}),
        },
      });
    });
  }

  it('downloads real head/tail bytes and serves cached ranges without another upstream request', async () => {
    const bytes = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');
    const fetcher = rangedFile(bytes);
    const proxy = create(fetcher, { headBytes: 8, tailBytes: 4 });
    const lease = await proxy.create({ streamUrl: 'https://media.example/file.mp4', httpHeaders: { 'X-Emby-Token': 'secret' } });
    await lease.ready;
    expect(proxy.hasData(lease.streamUrl)).toBe(true);
    expect(lease.streamUrl).not.toContain('secret');
    expect(fetcher).toHaveBeenCalledTimes(2);
    const response = await fetch(lease.streamUrl, { headers: { Range: 'bytes=2-6' } });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 2-6/36');
    expect(await response.text()).toBe('23456');
    expect(await fetch(lease.streamUrl, { headers: { Range: 'bytes=-4' } }).then(r => r.text())).toBe('wxyz');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('stitches a cached prefix with uncached streamed data for open-ended mpv range requests', async () => {
    const bytes = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');
    const fetcher = rangedFile(bytes);
    const proxy = create(fetcher, { headBytes: 8, tailBytes: 0 });
    const lease = await proxy.create({ streamUrl: 'https://media.example/file.mp4' });
    await lease.ready;
    const response = await fetch(lease.streamUrl, { headers: { Range: 'bytes=3-' } });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 3-35/36');
    expect(await response.text()).toBe(bytes.subarray(3).toString());
    expect(new Headers(fetcher.mock.calls[1][1].headers).get('range')).toBe('bytes=8-35');
  });

  it('delivers the cached prefix before an uncached open-ended request gets upstream headers', async () => {
    const bytes = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');
    const ranged = rangedFile(bytes);
    const fetcher = vi.fn<MediaFetch>(async (url, init) => {
      if (fetcher.mock.calls.length === 1) return ranged(url, init);
      return new Promise<Response>((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted'))));
    });
    const proxy = create(fetcher, { headBytes: 8, tailBytes: 0 });
    const lease = await proxy.create({ streamUrl: 'https://media.example/file.mp4' });
    await lease.ready;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 500);
    try {
      const response = await fetch(lease.streamUrl, { headers: { Range: 'bytes=0-' }, signal: controller.signal });
      const reader = response.body!.getReader();
      expect(Buffer.from((await reader.read()).value!).toString()).toBe('01234567');
      await reader.cancel();
    } finally { clearTimeout(timer); controller.abort(); }
  });

  it('prefetches HLS playlist, init, key and three segments and serves them from the same local URLs', async () => {
    const playlist = '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:4,\n0.ts\n#EXTINF:4,\n1.ts\n#EXTINF:4,\n2.ts\n#EXTINF:4,\n3.ts\n#EXT-X-ENDLIST';
    const fetcher = vi.fn<MediaFetch>(async (url) => new Response(url.includes('.m3u8') ? playlist : new URL(url).pathname, {
      headers: { 'Content-Type': url.includes('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t' },
    }));
    const proxy = create(fetcher);
    const lease = await proxy.create({ streamUrl: 'https://media.example/master.m3u8', httpHeaders: { 'X-Emby-Token': 'secret' } });
    await lease.ready;
    expect(fetcher).toHaveBeenCalledTimes(6);
    const rewritten = await fetch(lease.streamUrl).then(r => r.text());
    const urls = [...rewritten.matchAll(/URI="([^"]+)"/g)].map(m => m[1]).concat(rewritten.split('\n').filter(s => s.startsWith('http:')));
    for (const url of urls.slice(0, 5)) expect(await fetch(url).then(r => r.text())).toMatch(/\/(init\.mp4|key\.bin|[012]\.ts)/);
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(await fetch(urls[5]).then(r => r.text())).toBe('/3.ts');
    expect(fetcher).toHaveBeenCalledTimes(7);
  });

  it('releases cached data and aborts unfinished prefetches', async () => {
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn<MediaFetch>(async (_url, init) => {
      signal = init.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    });
    const proxy = create(fetcher);
    const lease = await proxy.create({ streamUrl: 'https://media.example/file.mp4' });
    proxy.release(lease.streamUrl);
    await expect(lease.ready).rejects.toThrow();
    expect(signal?.aborted).toBe(true);
    expect(proxy.hasData(lease.streamUrl)).toBe(false);
    expect((await fetch(lease.streamUrl)).status).toBe(404);
  });

  it('bounds downloads even when an origin ignores Range and sends an entire large file', async () => {
    let cancelled = false;
    const fetcher = vi.fn<MediaFetch>(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(100)); },
      cancel() { cancelled = true; },
    }), { headers: { 'Content-Type': 'video/mp4', 'Content-Length': '100' } }));
    const proxy = create(fetcher, { headBytes: 8, tailBytes: 0, maxSourceBytes: 8 });
    const lease = await proxy.create({ streamUrl: 'https://media.example/file.mp4' });
    await lease.ready;
    expect(cancelled).toBe(true);
    expect(proxy.cachedBytes).toBe(8);
    proxy.release(lease.streamUrl);
    expect(proxy.cachedBytes).toBe(0);
  });

  it('continues playback without corrupting bytes when the origin ignores Range with 200 responses', async () => {
    const bytes = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');
    const fetcher = vi.fn<MediaFetch>(async () => new Response(new Uint8Array(bytes), {
      headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length), ETag: '"one"' },
    }));
    const proxy = create(fetcher, { headBytes: 8, tailBytes: 0 });
    const lease = await proxy.create({ streamUrl: 'https://media.example/file.mp4' });
    await lease.ready;
    expect(await fetch(lease.streamUrl, { headers: { Range: 'bytes=3-15' } }).then(r => r.text())).toBe(bytes.subarray(3, 16).toString());
    expect(await fetch(lease.streamUrl).then(r => r.text())).toBe(bytes.toString());
  });

  it('reuses a prefix for an open-ended read even if the media origin omits optional validators', async () => {
    const bytes = Buffer.from('0123456789abcdef');
    const ranged = rangedFile(bytes);
    const fetcher = vi.fn<MediaFetch>(async (url, init) => {
      const response = await ranged(url, init);
      response.headers.delete('etag');
      return response;
    });
    const proxy = create(fetcher, { headBytes: 8, tailBytes: 0 });
    const lease = await proxy.create({ streamUrl: 'https://media.example/file.mp4' });
    await lease.ready;
    expect(await fetch(lease.streamUrl, { headers: { Range: 'bytes=0-' } }).then(r => r.text())).toBe(bytes.toString());
    expect(new Headers(fetcher.mock.calls[1][1].headers).get('range')).toBe('bytes=8-15');
  });

  it('invalidates the prefix without splicing a changed media entity, then forwards retries normally', async () => {
    const bytes = Buffer.from('0123456789abcdef');
    const ranged = rangedFile(bytes);
    const fetcher = vi.fn<MediaFetch>(async (url, init) => {
      const response = await ranged(url, init);
      if (fetcher.mock.calls.length > 1) response.headers.set('etag', '"two"');
      return response;
    });
    const proxy = create(fetcher, { headBytes: 8, tailBytes: 0 });
    const lease = await proxy.create({ streamUrl: 'https://media.example/file.mp4' });
    await lease.ready;
    await expect(fetch(lease.streamUrl, { headers: { Range: 'bytes=0-' } }).then(r => r.text())).rejects.toThrow();
    expect(proxy.hasData(lease.streamUrl)).toBe(false);
    expect(await fetch(lease.streamUrl, { headers: { Range: 'bytes=0-' } }).then(r => r.text())).toBe(bytes.toString());
    expect(new Headers(fetcher.mock.calls[2][1].headers).get('range')).toBe('bytes=0-');
  });

  it('rejects a same-length 200 response without a validator after warming a validated entity', async () => {
    const old = Buffer.from('0123456789abcdef');
    const ranged = rangedFile(old);
    const fetcher = vi.fn<MediaFetch>(async (url, init) => {
      if (fetcher.mock.calls.length === 1) return ranged(url, init);
      return new Response('xxxxxxxxxxxxxxxx', { headers: { 'Content-Length': '16' } });
    });
    const proxy = create(fetcher, { headBytes: 8, tailBytes: 0 });
    const lease = await proxy.create({ streamUrl: 'https://media.example/file.mp4' });
    await lease.ready;
    await expect(fetch(lease.streamUrl, { headers: { Range: 'bytes=0-' } }).then(r => r.text())).rejects.toThrow();
    expect(proxy.hasData(lease.streamUrl)).toBe(false);
    expect(await fetch(lease.streamUrl).then(r => r.text())).toBe('xxxxxxxxxxxxxxxx');
  });

  it('bounds combined cache memory across concurrent preparations', async () => {
    const fetcher = rangedFile(Buffer.from('0123456789abcdef'));
    const proxy = create(fetcher, { headBytes: 8, tailBytes: 0, maxTotalBytes: 12 });
    const [one, two] = await Promise.all([
      proxy.create({ streamUrl: 'https://media.example/one.mp4' }),
      proxy.create({ streamUrl: 'https://media.example/two.mp4' }),
    ]);
    await Promise.all([one.ready, two.ready]);
    expect(proxy.cachedBytes).toBeLessThanOrEqual(12);
  });

  it('warms the high-bandwidth variant at the resume segment and refreshes dynamic playlists', async () => {
    const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=200\nhigh.m3u8';
    const media = '#EXTM3U\n#EXTINF:4,\n0.ts\n#EXTINF:4,\n1.ts\n#EXTINF:4,\n2.ts\n#EXTINF:4,\n3.ts';
    const fetcher = vi.fn<MediaFetch>(async url => new Response(url.includes('master') ? master : url.includes('.m3u8') ? media : 'segment', {
      headers: { 'Content-Type': url.includes('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t' },
    }));
    const proxy = create(fetcher);
    const lease = await proxy.create({ streamUrl: 'https://media.example/master.m3u8', startSeconds: 8 });
    await lease.ready;
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://media.example/master.m3u8', 'https://media.example/high.m3u8',
      'https://media.example/2.ts', 'https://media.example/3.ts',
    ]);
    const rewritten = await fetch(lease.streamUrl).then(r => r.text());
    const high = rewritten.split('\n').filter(line => line.startsWith('http:'))[1];
    await fetch(high).then(r => r.text());
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('high.m3u8'))).toHaveLength(2);
  });

  it('warms only the map and key applicable to resumed HLS segments, including key removal', async () => {
    const playlist = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="old.key"\n#EXT-X-MAP:URI="old-init.mp4"\n#EXTINF:4,\n0.ts\n#EXT-X-KEY:METHOD=AES-128,URI="current.key"\n#EXT-X-MAP:URI="current-init.mp4"\n#EXTINF:4,\n1.ts\n#EXT-X-KEY:METHOD=NONE\n#EXTINF:4,\n2.ts\n#EXT-X-ENDLIST';
    const fetcher = vi.fn<MediaFetch>(async url => new Response(url.endsWith('.m3u8') ? playlist : 'media'));
    const proxy = create(fetcher);
    const lease = await proxy.create({ streamUrl: 'https://media.example/list.m3u8', startSeconds: 4 });
    await lease.ready;
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://media.example/list.m3u8', 'https://media.example/current-init.mp4',
      'https://media.example/current.key', 'https://media.example/1.ts', 'https://media.example/2.ts',
    ]);
  });

  it('does not download a retired HLS key when resumed segments use METHOD=NONE', async () => {
    const playlist = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="old.key"\n#EXTINF:4,\n0.ts\n#EXT-X-KEY:METHOD=NONE\n#EXTINF:4,\n1.ts\n#EXT-X-ENDLIST';
    const fetcher = vi.fn<MediaFetch>(async url => new Response(url.endsWith('.m3u8') ? playlist : 'media'));
    const proxy = create(fetcher);
    const lease = await proxy.create({ streamUrl: 'https://media.example/list.m3u8', startSeconds: 4 });
    await lease.ready;
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['https://media.example/list.m3u8', 'https://media.example/1.ts']);
  });

  it('times out stalled preparations rather than retaining a pending network request indefinitely', async () => {
    let signal!: AbortSignal;
    const proxy = create(async (_url, init) => {
      signal = init.signal!;
      return new Promise<Response>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    }, { timeoutMs: 20 });
    const lease = await proxy.create({ streamUrl: 'https://media.example/file.mp4' });
    await expect(lease.ready).rejects.toThrow('aborted');
    expect(signal.aborted).toBe(true);
  });
});
