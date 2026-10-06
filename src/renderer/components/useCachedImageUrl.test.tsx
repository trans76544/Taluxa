import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidateCachedImageUrls, useCachedImageUrl } from './useCachedImageUrl';
import { createDeferred } from '../../test/deferred';

const sourceUrl = 'https://demo.local/poster.jpg';
const cachedUrl = 'taluxa-image-cache://poster-hash';

describe('useCachedImageUrl', () => {
  const resolve = vi.fn();
  beforeEach(() => {
    resolve.mockReset().mockResolvedValue({ url: cachedUrl, fromCache: true });
    window.embyDesktop = { imageCache: { resolve } } as unknown as Window['embyDesktop'];
  });
  afterEach(() => {
    cleanup();
    delete (window as Partial<Window>).embyDesktop;
  });

  it('reuses the resolved local url synchronously after remounting', async () => {
    const first = renderHook(() => useCachedImageUrl(sourceUrl));
    await waitFor(() => expect(first.result.current).toBe(cachedUrl));
    first.unmount();
    const revisit = renderHook(() => useCachedImageUrl(sourceUrl));
    expect(revisit.result.current).toBe(cachedUrl);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('shares pending resolutions between mounted cards', async () => {
    const pending = createDeferred<{ url: string; fromCache: boolean }>();
    resolve.mockReturnValue(pending.promise);
    const first = renderHook(() => useCachedImageUrl(sourceUrl));
    const second = renderHook(() => useCachedImageUrl(sourceUrl));
    expect(first.result.current).toBeNull();
    expect(second.result.current).toBeNull();
    await waitFor(() => expect(resolve).toHaveBeenCalledTimes(1));
    await act(async () => pending.resolve({ url: cachedUrl, fromCache: true }));
    expect(first.result.current).toBe(cachedUrl);
    expect(second.result.current).toBe(cachedUrl);
  });

  it('does not show the previous poster while resolving a new source', async () => {
    const hook = renderHook(({ url }) => useCachedImageUrl(url), { initialProps: { url: sourceUrl } });
    await waitFor(() => expect(hook.result.current).toBe(cachedUrl));
    const pending = createDeferred<{ url: string; fromCache: boolean }>();
    resolve.mockReturnValue(pending.promise);
    hook.rerender({ url: 'https://demo.local/other.jpg' });
    expect(hook.result.current).toBeNull();
    await act(async () => pending.resolve({ url: 'taluxa-image-cache://other', fromCache: true }));
    expect(hook.result.current).toBe('taluxa-image-cache://other');
  });

  it('falls back to the server after resolution failure and retries on revisit', async () => {
    resolve.mockRejectedValueOnce(new Error('offline'));
    const first = renderHook(() => useCachedImageUrl(sourceUrl));
    await waitFor(() => expect(first.result.current).toBe(sourceUrl));
    first.unmount();
    const revisit = renderHook(() => useCachedImageUrl(sourceUrl));
    await waitFor(() => expect(revisit.result.current).toBe(cachedUrl));
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('does not reuse local urls after clearing the cache', async () => {
    const first = renderHook(() => useCachedImageUrl(sourceUrl));
    await waitFor(() => expect(first.result.current).toBe(cachedUrl));
    first.unmount();
    invalidateCachedImageUrls();
    resolve.mockResolvedValue({ url: 'taluxa-image-cache://new-size', fromCache: false });
    const revisit = renderHook(() => useCachedImageUrl(sourceUrl));
    expect(revisit.result.current).toBeNull();
    await waitFor(() => expect(revisit.result.current).toBe('taluxa-image-cache://new-size'));
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('ignores a resolution that finishes after clearing the cache', async () => {
    const pending = createDeferred<{ url: string; fromCache: boolean }>();
    resolve.mockReturnValueOnce(pending.promise);
    const first = renderHook(() => useCachedImageUrl(sourceUrl));
    await waitFor(() => expect(resolve).toHaveBeenCalledTimes(1));
    first.unmount();
    invalidateCachedImageUrls();
    await act(async () => pending.resolve({ url: cachedUrl, fromCache: false }));
    const revisit = renderHook(() => useCachedImageUrl(sourceUrl));
    expect(revisit.result.current).toBeNull();
    await waitFor(() => expect(revisit.result.current).toBe(cachedUrl));
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('retries a source-url fallback instead of treating it as a cached image', async () => {
    resolve.mockResolvedValueOnce({ url: sourceUrl, fromCache: false });
    const first = renderHook(() => useCachedImageUrl(sourceUrl));
    await waitFor(() => expect(first.result.current).toBe(sourceUrl));
    first.unmount();
    const revisit = renderHook(() => useCachedImageUrl(sourceUrl));
    await waitFor(() => expect(revisit.result.current).toBe(cachedUrl));
    expect(resolve).toHaveBeenCalledTimes(2);
  });
});
