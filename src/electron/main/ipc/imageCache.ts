import { ipcMain } from 'electron';
import type { ImageCache, ResolvedImageCacheEntry } from '../image/imageCache';

export type ImageCacheResolveResult = Pick<
  ResolvedImageCacheEntry,
  'fromCache' | 'url'
> & {
  cacheKey: string | null;
};

export interface ImageCacheBridge {
  resolve: (sourceUrl: string) => Promise<ImageCacheResolveResult>;
}

export function registerImageCacheIpc(imageCache: Pick<ImageCache, 'resolve'>) {
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
}
