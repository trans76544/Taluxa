// @vitest-environment node

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageCache } from './imageCache';

async function createTempCacheDir() {
  return mkdtemp(join('C:\\tmp', 'taluxa-image-cache-'));
}

describe('ImageCache', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('downloads an image once and resolves later requests from disk', async () => {
    const cacheDir = await createTempCacheDir();
    const fetcher = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        headers: {
          'Content-Type': 'image/jpeg',
        },
      })
    );
    const cache = new ImageCache({ cacheDir, fetcher });

    try {
      const first = await cache.resolve('https://demo.emby.local/Items/1/Images/Primary');
      const second = await cache.resolve('https://demo.emby.local/Items/1/Images/Primary');

      expect(first.url).toMatch(/^taluxa-image-cache:\/\//);
      expect(first.fromCache).toBe(false);
      expect(second).toEqual({
        ...first,
        fromCache: true,
      });
      expect(fetcher).toHaveBeenCalledTimes(1);

      const cached = await cache.read(first.cacheKey);
      expect(cached.contentType).toBe('image/jpeg');
      expect([...cached.bytes]).toEqual([1, 2, 3]);
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  it('prunes least-recently-used images when the cache exceeds its byte budget', async () => {
    const cacheDir = await createTempCacheDir();
    let nextByte = 1;
    const fetcher = vi.fn(async () =>
      new Response(new Uint8Array([nextByte++, nextByte++, nextByte++]), {
        headers: {
          'Content-Type': 'image/png',
        },
      })
    );
    const cache = new ImageCache({ cacheDir, fetcher, maxBytes: 5 });

    try {
      const first = await cache.resolve('https://demo.emby.local/Items/1/Images/Primary');
      const second = await cache.resolve('https://demo.emby.local/Items/2/Images/Primary');

      await expect(readFile(first.filePath)).rejects.toThrow();
      await expect(readFile(second.filePath)).resolves.toEqual(Buffer.from([4, 5, 6]));
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  it('rejects non-cache-key protocol reads', async () => {
    const cacheDir = await createTempCacheDir();
    const cache = new ImageCache({
      cacheDir,
      fetcher: vi.fn(),
    });

    try {
      await expect(cache.read('../settings')).rejects.toThrow('Invalid image cache key');
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  it('reports cache usage and clears cached image files', async () => {
    const cacheDir = await createTempCacheDir();
    const fetcher = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3, 4]), {
        headers: {
          'Content-Type': 'image/webp',
        },
      })
    );
    const cache = new ImageCache({ cacheDir, fetcher });

    try {
      const entry = await cache.resolve('https://demo.emby.local/Items/1/Images/Primary');

      await expect(cache.stats()).resolves.toEqual({
        count: 1,
        sizeBytes: 4,
      });

      await cache.clear();

      await expect(readFile(entry.filePath)).rejects.toThrow();
      await expect(cache.stats()).resolves.toEqual({
        count: 0,
        sizeBytes: 0,
      });
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  it('uses a configured max byte budget for future downloads', async () => {
    const cacheDir = await createTempCacheDir();
    let nextByte = 1;
    const fetcher = vi.fn(async () =>
      new Response(new Uint8Array([nextByte++, nextByte++, nextByte++]), {
        headers: {
          'Content-Type': 'image/jpeg',
        },
      })
    );
    const cache = new ImageCache({ cacheDir, fetcher, maxBytes: 10 });

    try {
      const first = await cache.resolve('https://demo.emby.local/Items/1/Images/Primary');
      cache.configure({ maxBytes: 5 });
      const second = await cache.resolve('https://demo.emby.local/Items/2/Images/Primary');

      await expect(readFile(first.filePath)).rejects.toThrow();
      await expect(readFile(second.filePath)).resolves.toEqual(Buffer.from([4, 5, 6]));
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  it('transforms image bytes before writing them when a cache resolution is configured', async () => {
    const cacheDir = await createTempCacheDir();
    const transformImage = vi.fn(async () => ({
      bytes: Buffer.from([9, 8]),
      contentType: 'image/jpeg',
    }));
    const cache = new ImageCache({
      cacheDir,
      fetcher: vi.fn(async () =>
        new Response(new Uint8Array([1, 2, 3, 4]), {
          headers: {
            'Content-Type': 'image/jpeg',
          },
        })
      ),
      maxDimension: 720,
      transformImage,
    });

    try {
      const entry = await cache.resolve('https://demo.emby.local/Items/1/Images/Primary');

      expect(transformImage).toHaveBeenCalledWith(
        Buffer.from([1, 2, 3, 4]),
        'image/jpeg',
        720
      );
      await expect(readFile(entry.filePath)).resolves.toEqual(Buffer.from([9, 8]));
      await expect(cache.stats()).resolves.toEqual({
        count: 1,
        sizeBytes: 2,
      });
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  it('stores a separate cached file when the configured resolution changes', async () => {
    const cacheDir = await createTempCacheDir();
    const cache = new ImageCache({
      cacheDir,
      fetcher: vi.fn(async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: {
            'Content-Type': 'image/jpeg',
          },
        })
      ),
    });

    try {
      cache.configure({ maxDimension: 1080 });
      const high = await cache.resolve('https://demo.emby.local/Items/1/Images/Primary');
      cache.configure({ maxDimension: 480 });
      const low = await cache.resolve('https://demo.emby.local/Items/1/Images/Primary');

      expect(low.cacheKey).not.toBe(high.cacheKey);
      await expect(cache.stats()).resolves.toEqual({
        count: 2,
        sizeBytes: 6,
      });
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  it('does not share in-flight downloads across different configured resolutions', async () => {
    const cacheDir = await createTempCacheDir();
    const cache = new ImageCache({
      cacheDir,
      fetcher: vi.fn(async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: {
            'Content-Type': 'image/jpeg',
          },
        })
      ),
    });

    try {
      cache.configure({ maxDimension: 1080 });
      const highPromise = cache.resolve('https://demo.emby.local/Items/1/Images/Primary');
      cache.configure({ maxDimension: 480 });
      const lowPromise = cache.resolve('https://demo.emby.local/Items/1/Images/Primary');

      const [high, low] = await Promise.all([highPromise, lowPromise]);

      expect(low.cacheKey).not.toBe(high.cacheKey);
      await expect(cache.stats()).resolves.toEqual({
        count: 2,
        sizeBytes: 6,
      });
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  it('times out hanging image downloads and aborts the underlying fetch', async () => {
    vi.useFakeTimers();
    const cacheDir = await createTempCacheDir();
    const abortListener = vi.fn();
    const fetcher = vi.fn((_url: string, init?: RequestInit) => {
      init?.signal?.addEventListener('abort', abortListener);
      return new Promise<Response>(() => undefined);
    });
    const cache = new ImageCache({ cacheDir, fetcher });

    try {
      const resolvePromise = cache.resolve('https://demo.emby.local/Items/1/Images/Primary');
      await vi.waitFor(() => {
        expect(fetcher).toHaveBeenCalledTimes(1);
      });
      const assertion = expect(resolvePromise).rejects.toThrow('Image cache request timed out');

      await vi.advanceTimersByTimeAsync(8000);

      await assertion;
      expect(abortListener).toHaveBeenCalledTimes(1);
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });
});
