import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchServerInfo } from './system';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
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
});
