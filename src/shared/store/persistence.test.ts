import { describe, expect, it } from 'vitest';
import {
  createAccountId,
  createEmptyPersistedState,
  mergePersistedState,
  migrateLegacyPersistedState,
  type PersistedState,
} from './persistence';

describe('persistence', () => {
  it('creates empty persisted state with multi-account defaults', () => {
    const state = createEmptyPersistedState();

    expect(state).toEqual({
      accounts: [],
      activeAccountId: null,
      settings: {
        rememberSession: true,
        defaultVolume: 1,
      },
      progressByItemId: {},
    });
    expect('serverUrl' in state).toBe(false);
    expect('session' in state).toBe(false);
  });

  it('creates a durable account id from server url and user id', () => {
    expect(createAccountId('https://demo.emby.local', 'user-1')).toBe(
      'https://demo.emby.local::user-1'
    );
  });

  it('migrates legacy single-session state into one saved account', () => {
    const state = migrateLegacyPersistedState({
        serverUrl: 'https://demo.emby.local',
        session: {
          userId: 'user-1',
          userName: 'Alice',
          accessToken: 'token-123',
        },
        settings: {
          rememberSession: true,
          defaultVolume: 0.8,
        },
        progressByItemId: {},
      });

    expect(state).toEqual({
      accounts: [
        {
          id: 'https://demo.emby.local::user-1',
          serverUrl: 'https://demo.emby.local',
          userId: 'user-1',
          userName: 'Alice',
          accessToken: 'token-123',
          lastUsedAt: expect.any(String),
        },
      ],
      activeAccountId: 'https://demo.emby.local::user-1',
      settings: {
        rememberSession: true,
        defaultVolume: 0.8,
      },
      progressByItemId: {},
    });
    expect('serverUrl' in state).toBe(false);
    expect('session' in state).toBe(false);
  });

  it('merges accounts by id and preserves existing settings and progress', () => {
    const currentState: PersistedState = {
      accounts: [
        {
          id: 'https://a.local::user-1',
          serverUrl: 'https://a.local',
          userId: 'user-1',
          userName: 'Alice',
          accessToken: 'token-1',
          lastUsedAt: '2026-04-21T00:00:00.000Z',
        },
      ],
      activeAccountId: 'https://a.local::user-1',
      settings: {
        rememberSession: true,
        defaultVolume: 1,
      },
      progressByItemId: {
        'item-a': {
          itemId: 'item-a',
          positionSeconds: 12,
          durationSeconds: 100,
          updatedAt: '2026-04-21T00:00:00.000Z',
        },
      },
    };

    expect(
      mergePersistedState(
        {
          accounts: [
            {
              id: 'https://a.local::user-1',
              serverUrl: 'https://a.local',
              userId: 'user-1',
              userName: 'Alice Updated',
              accessToken: 'token-2',
              lastUsedAt: '2026-04-21T02:00:00.000Z',
            },
            {
              id: 'https://b.local::user-2',
              serverUrl: 'https://b.local',
              userId: 'user-2',
              userName: 'Bob',
              accessToken: 'token-3',
              lastUsedAt: '2026-04-21T01:00:00.000Z',
            },
          ],
          activeAccountId: 'https://b.local::user-2',
        },
        currentState
      )
    ).toEqual({
      accounts: [
        {
          id: 'https://a.local::user-1',
          serverUrl: 'https://a.local',
          userId: 'user-1',
          userName: 'Alice Updated',
          accessToken: 'token-2',
          lastUsedAt: '2026-04-21T02:00:00.000Z',
        },
        {
          id: 'https://b.local::user-2',
          serverUrl: 'https://b.local',
          userId: 'user-2',
          userName: 'Bob',
          accessToken: 'token-3',
          lastUsedAt: '2026-04-21T01:00:00.000Z',
        },
      ],
      activeAccountId: 'https://b.local::user-2',
      settings: {
        rememberSession: true,
        defaultVolume: 1,
      },
      progressByItemId: {
        'item-a': {
          itemId: 'item-a',
          positionSeconds: 12,
          durationSeconds: 100,
          updatedAt: '2026-04-21T00:00:00.000Z',
        },
      },
    });
  });

  it('falls back to the first account when the requested active account is missing', () => {
    const currentState: PersistedState = {
      accounts: [
        {
          id: 'https://a.local::user-1',
          serverUrl: 'https://a.local',
          userId: 'user-1',
          userName: 'Alice',
          accessToken: 'token-1',
          lastUsedAt: '2026-04-21T00:00:00.000Z',
        },
      ],
      activeAccountId: 'https://a.local::user-1',
      settings: {
        rememberSession: true,
        defaultVolume: 1,
      },
      progressByItemId: {},
    };

    expect(
      mergePersistedState(
        {
          activeAccountId: 'https://missing.local::user-9',
        },
        currentState
      )
    ).toEqual({
      accounts: [
        {
          id: 'https://a.local::user-1',
          serverUrl: 'https://a.local',
          userId: 'user-1',
          userName: 'Alice',
          accessToken: 'token-1',
          lastUsedAt: '2026-04-21T00:00:00.000Z',
        },
      ],
      activeAccountId: 'https://a.local::user-1',
      settings: {
        rememberSession: true,
        defaultVolume: 1,
      },
      progressByItemId: {},
    });
  });

  it('converts a legacy session patch into a saved active account', () => {
    expect(
      mergePersistedState({
        serverUrl: 'https://demo.emby.local',
        session: {
          userId: 'user-1',
          userName: 'Alice',
          accessToken: 'token-123',
        },
      })
    ).toEqual({
      accounts: [
        {
          id: 'https://demo.emby.local::user-1',
          serverUrl: 'https://demo.emby.local',
          userId: 'user-1',
          userName: 'Alice',
          accessToken: 'token-123',
          lastUsedAt: expect.any(String),
        },
      ],
      activeAccountId: 'https://demo.emby.local::user-1',
      settings: {
        rememberSession: true,
        defaultVolume: 1,
      },
      progressByItemId: {},
    });
  });
});
