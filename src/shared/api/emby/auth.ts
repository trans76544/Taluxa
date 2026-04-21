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

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
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
  const userId = result.User?.Id;
  const userName = result.User?.Name;
  const accessToken = result.AccessToken;

  if (!hasText(userId) || !hasText(userName) || !hasText(accessToken)) {
    throw new Error('Invalid Emby login response');
  }

  return {
    userId: userId.trim(),
    userName: userName.trim(),
    accessToken: accessToken.trim(),
  };
}
