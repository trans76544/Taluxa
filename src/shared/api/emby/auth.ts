import { createEmbyRequest } from './client';

export interface EmbyLoginInput {
  serverUrl: string;
  userName: string;
  password: string;
}

export interface EmbyLoginSession {
  userId: string;
  userName: string;
  accessToken: string;
}

interface EmbyLoginResponse {
  User?: {
    Id?: string;
    Name?: string;
  };
  AccessToken?: string;
}

export async function login(input: EmbyLoginInput): Promise<EmbyLoginSession> {
  const response = await createEmbyRequest(input.serverUrl, '/Users/AuthenticateByName', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Username: input.userName,
      Pw: input.password,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to sign in to Emby (${response.status})`);
  }

  const result = (await response.json()) as EmbyLoginResponse;

  return {
    userId: result.User?.Id ?? '',
    userName: result.User?.Name ?? input.userName,
    accessToken: result.AccessToken ?? '',
  };
}
