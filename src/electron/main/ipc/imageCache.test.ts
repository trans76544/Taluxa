// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('returns the cached image url when the cache resolves successfully', async () => {
    registerImageCacheIpc({
      resolve: vi.fn().mockResolvedValue({
        cacheKey: 'abc123',
        filePath: 'C:\\cache\\abc123.img',
        fromCache: true,
        url: 'taluxa-image-cache://abc123',
      }),
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
    });

    await expect(
      getRegisteredHandler()(undefined, 'https://demo.emby.local/Items/1/Images/Primary')
    ).resolves.toEqual({
      cacheKey: null,
      fromCache: false,
      url: 'https://demo.emby.local/Items/1/Images/Primary',
    });
  });
});
