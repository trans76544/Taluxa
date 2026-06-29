import { createEmbyRequest, type EmbyFetch } from './client';

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

async function readFailureMessage(response: Response): Promise<string> {
  try {
    const message = (await response.text()).replace(/\s+/gu, ' ').trim();

    return message.slice(0, 240);
  } catch {
    return '';
  }
}

export async function login(
  input: EmbyLoginInput,
  fetcher?: EmbyFetch
): Promise<EmbyLoginSession> {
  const response = await createEmbyRequest(input.serverUrl, '/Users/AuthenticateByName', {
    method: 'POST',
    fetcher,
    operation: 'login',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Username: input.userName,
      Pw: input.password,
    }),
  });

  if (!response.ok) {
    const message = await readFailureMessage(response);

    throw new Error(
      message
        ? `Failed to sign in to Emby (${response.status}): ${message}`
        : `Failed to sign in to Emby (${response.status})`
    );
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
