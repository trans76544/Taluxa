// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerImageCacheIpc } from './imageCache';

const handleMock = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcMain: {
    handle: handleMock,
  },
}));

function getRegisteredHandler() {
  expect(handleMock).toHaveBeenCalledWith('image-cache:resolve', expect.any(Function));

  return handleMock.mock.calls[0][1] as (_event: unknown, sourceUrl: string) => Promise<unknown>;
}

describe('registerImageCacheIpc', () => {
  beforeEach(() => {
    handleMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the cached image url when the cache resolves successfully', async () => {
    registerImageCacheIpc({
      resolve: vi.fn().mockResolvedValue({
        cacheKey: 'abc123',
        filePath: 'C:\\cache\\abc123.img',
        fromCache: true,
        url: 'taluxa-image-cache://abc123',
      }),
      stats: vi.fn(),
      clear: vi.fn(),
      configure: vi.fn(),
    });

    await expect(
      getRegisteredHandler()(undefined, 'https://demo.emby.local/Items/1/Images/Primary')
    ).resolves.toEqual({
      cacheKey: 'abc123',
      fromCache: true,
      url: 'taluxa-image-cache://abc123',
    });
  });

  it('falls back to the source url when image caching fails', async () => {
    registerImageCacheIpc({
      resolve: vi.fn().mockRejectedValue(new Error('Failed to download image (500)')),
      stats: vi.fn(),
      clear: vi.fn(),
      configure: vi.fn(),
    });

    await expect(
      getRegisteredHandler()(undefined, 'https://demo.emby.local/Items/1/Images/Primary')
    ).resolves.toEqual({
      cacheKey: null,
      fromCache: false,
      url: 'https://demo.emby.local/Items/1/Images/Primary',
    });
  });

  it('falls back to the source url when image cache resolution times out', async () => {
    vi.useFakeTimers();
    registerImageCacheIpc({
      resolve: vi.fn(() => new Promise<never>(() => undefined)),
      stats: vi.fn(),
      clear: vi.fn(),
      configure: vi.fn(),
    });

    const resolvePromise = getRegisteredHandler()(
      undefined,
      'https://demo.emby.local/Items/1/Images/Primary'
    );

    await vi.advanceTimersByTimeAsync(8000);

    await expect(resolvePromise).resolves.toEqual({
      cacheKey: null,
      fromCache: false,
      url: 'https://demo.emby.local/Items/1/Images/Primary',
    });
  });


  it('registers image cache stats, clear, and configure handlers', async () => {
    const imageCache = {
      resolve: vi.fn(),
      stats: vi.fn().mockResolvedValue({
        count: 2,
        sizeBytes: 1024,
      }),
      clear: vi.fn().mockResolvedValue(undefined),
      configure: vi.fn(),
    };

    registerImageCacheIpc(imageCache);

    const handlersByChannel = new Map(
      handleMock.mock.calls.map(([channel, handler]) => [channel, handler])
    );

    await expect(handlersByChannel.get('image-cache:stats')()).resolves.toEqual({
      count: 2,
      sizeBytes: 1024,
    });
    await expect(handlersByChannel.get('image-cache:clear')()).resolves.toBeUndefined();
    await expect(
      handlersByChannel.get('image-cache:configure')(undefined, { maxBytes: 104857600 })
    ).resolves.toBeUndefined();

    expect(imageCache.clear).toHaveBeenCalledTimes(1);
    expect(imageCache.configure).toHaveBeenCalledWith({ maxBytes: 104857600 });
  });
});
