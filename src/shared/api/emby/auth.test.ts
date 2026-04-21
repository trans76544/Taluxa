import { describe, expect, it, vi, beforeEach } from 'vitest';
import { login } from './auth';

describe('login', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('maps a complete response payload into a session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          User: {
            Id: 'user-1',
            Name: 'Alice',
          },
          AccessToken: 'token-123',
        }),
      })
    );

    await expect(
      login({
        serverUrl: 'demo.emby.local',
        userName: 'alice',
        password: 'secret',
      })
    ).resolves.toEqual({
      userId: 'user-1',
      userName: 'Alice',
      accessToken: 'token-123',
    });
  });

  it('throws when the response omits required session fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          User: {
            Id: '',
            Name: '',
          },
          AccessToken: '',
        }),
      })
    );

    await expect(
      login({
        serverUrl: 'demo.emby.local',
        userName: 'alice',
        password: 'secret',
      })
    ).rejects.toThrow('Invalid Emby login response');
  });
});
