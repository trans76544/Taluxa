// @vitest-environment node

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ImageCache } from './imageCache';

async function createTempCacheDir() {
  return mkdtemp(join('C:\\tmp', 'taluxa-image-cache-'));
}

describe('ImageCache', () => {
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
});
