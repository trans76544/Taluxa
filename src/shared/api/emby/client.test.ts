import { describe, expect, it, vi } from 'vitest';
import { createEmbyRequest, EmbyRequestError } from './client';

describe('createEmbyRequest', () => {
  it('aborts requests after the configured timeout', async () => {
    vi.useFakeTimers();

    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    const request = expect(
      createEmbyRequest('http://server.local', '/Items', {
      fetcher,
      operation: 'home',
      timeoutMs: 25,
      })
    ).rejects.toMatchObject({
      operation: 'home',
      status: 'timeout',
      canRetry: true,
    });

    await vi.advanceTimersByTimeAsync(25);
    await request;

    vi.useRealTimers();
  });

  it('reports caller cancellations separately from timeouts', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    const request = createEmbyRequest('http://server.local', '/Items', {
      fetcher,
      operation: 'library',
      signal: controller.signal,
      timeoutMs: 1000,
    });

    controller.abort();

    await expect(request).rejects.toMatchObject({
      operation: 'library',
      status: 'cancelled',
      canRetry: false,
    });
  });

  it('redacts sensitive urls from request failures', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('failed http://server.local/Videos/item/stream?api_key=secret-token');
    });

    await expect(
      createEmbyRequest('http://server.local', '/Items', {
        fetcher,
        operation: 'playback-info',
      })
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(EmbyRequestError);
      expect(String(error)).not.toContain('secret-token');
      expect((error as EmbyRequestError).message).toContain('api_key=[redacted]');
      return true;
    });
  });
});
