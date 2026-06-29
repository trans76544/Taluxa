import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { login } from './auth';

function createAbortableHangingFetch() {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    });
  });
}

describe('login', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('can authenticate with a provided fetcher', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        User: {
          Id: 'user-1',
          Name: 'Alice',
        },
        AccessToken: 'token-123',
      }),
    });

    await expect(
      login(
        {
          serverUrl: 'demo.emby.local',
          userName: 'alice',
          password: 'secret',
        },
        fetcher
      )
    ).resolves.toEqual({
      userId: 'user-1',
      userName: 'Alice',
      accessToken: 'token-123',
    });

    expect(fetcher).toHaveBeenCalledWith(
      'https://demo.emby.local/Users/AuthenticateByName',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('sends the current Emby authorization header schema', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        User: {
          Id: 'user-1',
          Name: 'Alice',
        },
        AccessToken: 'token-123',
      }),
    });

    await login(
      {
        serverUrl: 'demo.emby.local',
        userName: 'alice',
        password: 'secret',
      },
      fetcher
    );

    const [, init] = fetcher.mock.calls[0];
    const headers = new Headers(init?.headers);

    expect(headers.get('X-Emby-Authorization')).toBe(
      'Emby Client="Taluxa", Device="Windows Desktop", DeviceId="taluxa-desktop", Version="0.1.0"'
    );
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

  it('includes a short response message when sign-in is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'Invalid username or password entered.',
      })
    );

    await expect(
      login({
        serverUrl: 'demo.emby.local',
        userName: 'alice',
        password: 'secret',
      })
    ).rejects.toThrow(
      'Failed to sign in to Emby (403): Invalid username or password entered.'
    );
  });

  it('times out hanging sign-in requests with a retryable login failure', async () => {
    vi.useFakeTimers();
    const fetcher = createAbortableHangingFetch();
    const loginPromise = login(
      {
        serverUrl: 'demo.emby.local',
        userName: 'alice',
        password: 'secret',
      },
      fetcher
    );

    const assertion = expect(loginPromise).rejects.toMatchObject({
      operation: 'login',
      status: 'timeout',
      canRetry: true,
    });
    await vi.advanceTimersByTimeAsync(10000);

    await assertion;
  });
});
