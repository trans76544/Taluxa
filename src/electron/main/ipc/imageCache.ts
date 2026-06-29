import { ipcMain } from 'electron';
import { DEFAULT_NETWORK_TIMEOUT_MS } from '@shared/models/network';
import type {
  ImageCache,
  ImageCacheConfig,
  ImageCacheStats,
  ResolvedImageCacheEntry,
} from '../image/imageCache';

export type ImageCacheResolveResult = Pick<
  ResolvedImageCacheEntry,
  'fromCache' | 'url'
> & {
  cacheKey: string | null;
};

export interface ImageCacheBridge {
  resolve: (sourceUrl: string) => Promise<ImageCacheResolveResult>;
  stats: () => Promise<ImageCacheStats>;
  clear: () => Promise<void>;
  configure: (config: ImageCacheConfig) => Promise<void>;
}

async function resolveWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Image cache resolution timed out'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

export function registerImageCacheIpc(
  imageCache: Pick<ImageCache, 'resolve' | 'stats' | 'clear' | 'configure'>
) {
  ipcMain.handle('image-cache:resolve', async (_event, sourceUrl: string) => {
    try {
      const { cacheKey, fromCache, url } = await resolveWithTimeout(
        imageCache.resolve(sourceUrl),
        DEFAULT_NETWORK_TIMEOUT_MS.image
      );

      return { cacheKey, fromCache, url } satisfies ImageCacheResolveResult;
    } catch {
      return {
        cacheKey: null,
        fromCache: false,
        url: sourceUrl,
      } satisfies ImageCacheResolveResult;
    }
  });
  ipcMain.handle('image-cache:stats', () => imageCache.stats());
  ipcMain.handle('image-cache:clear', () => imageCache.clear());
  ipcMain.handle('image-cache:configure', async (_event, config: ImageCacheConfig) => {
    imageCache.configure(config);
  });
}
