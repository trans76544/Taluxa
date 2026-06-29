import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchServerInfo } from './system';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('fetchServerInfo', () => {
  it('maps trimmed server name values from the public system info response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ServerName: '  Emby Demo  ',
      }),
    });

    await expect(fetchServerInfo('https://demo.emby.local', 'token-1')).resolves.toEqual({
      serverName: 'Emby Demo',
    });
  });

  it('returns a null server name when the response omits a usable value', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await expect(fetchServerInfo('https://demo.emby.local', 'token-1')).resolves.toEqual({
      serverName: null,
    });
  });

  it('returns a null server name for whitespace-only values', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ServerName: '   ',
      }),
    });

    await expect(fetchServerInfo('https://demo.emby.local', 'token-1')).resolves.toEqual({
      serverName: null,
    });
  });

  it('rejects malformed system info payloads', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => null,
    });

    await expect(fetchServerInfo('https://demo.emby.local', 'token-1')).rejects.toThrow(
      'Invalid Emby server info response'
    );
  });

  it('times out hanging server info requests with a retryable failure', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });

    const infoPromise = fetchServerInfo('https://demo.emby.local', 'token-1');

    const assertion = expect(infoPromise).rejects.toMatchObject({
      operation: 'server-info',
      status: 'timeout',
      canRetry: true,
    });
    await vi.advanceTimersByTimeAsync(10000);

    await assertion;
  });
});
