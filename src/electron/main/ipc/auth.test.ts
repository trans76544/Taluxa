// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerAuthIpc } from './auth';

const handleMock = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcMain: {
    handle: handleMock,
  },
}));

function getRegisteredHandler() {
  expect(handleMock).toHaveBeenCalledWith('auth:login', expect.any(Function));

  return handleMock.mock.calls[0][1] as (_event: unknown, input: unknown) => Promise<unknown>;
}

describe('registerAuthIpc', () => {
  beforeEach(() => {
    handleMock.mockReset();
  });

  it('authenticates through the provided fetcher', async () => {
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

    registerAuthIpc(fetcher);

    await expect(
      getRegisteredHandler()(undefined, {
        serverUrl: 'https://demo.emby.local',
        userName: 'alice',
        password: 'secret',
      })
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
});
