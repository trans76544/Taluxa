import { protocol } from 'electron';
import { IMAGE_CACHE_PROTOCOL, type ImageCache } from './imageCache';

export function registerImageCacheProtocol(imageCache: ImageCache) {
  protocol.handle(IMAGE_CACHE_PROTOCOL, async (request) => {
    const cacheKey = new URL(request.url).host;
    const cached = await imageCache.read(cacheKey);

    return new Response(new Uint8Array(cached.bytes), {
      headers: {
        'Content-Type': cached.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  });
}
