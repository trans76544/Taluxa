import { ipcMain } from 'electron';
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

export function registerImageCacheIpc(
  imageCache: Pick<ImageCache, 'resolve' | 'stats' | 'clear' | 'configure'>
) {
  ipcMain.handle('image-cache:resolve', async (_event, sourceUrl: string) => {
    try {
      const { cacheKey, fromCache, url } = await imageCache.resolve(sourceUrl);

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
