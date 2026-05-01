import { describe, expect, it } from 'vitest';
import {
  createAccountId,
  createAccountScopedProgressKey,
  createEmptyPersistedState,
  getPersistedProgressByItemIdForAccount,
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
        librarySortMode: 'latest_added',
        proxy: {
          mode: 'system',
          customProxyUrl: '',
        },
        danmakuServers: [],
        serverPreferencesByUrl: {},
      },
      progressByItemId: {},
    });
    expect('serverUrl' in state).toBe(false);
    expect('session' in state).toBe(false);
  });

  it('merges proxy settings without losing existing settings or server preferences', () => {
    const currentState: PersistedState = {
      accounts: [],
      activeAccountId: null,
      settings: {
        rememberSession: false,
        defaultVolume: 0.5,
        librarySortMode: 'release_date',
        proxy: {
          mode: 'system',
          customProxyUrl: '',
        },
        danmakuServers: [
          {
            id: 'official',
            name: 'Official',
            url: 'https://api.dandanplay.net',
            enabled: true,
          },
        ],
        serverPreferencesByUrl: {
          'https://a.local': {
            displayNameOverride: 'Main Server',
          },
        },
      },
      progressByItemId: {},
    };

    expect(
      mergePersistedState(
        {
          settings: {
            proxy: {
              mode: 'custom',
              customProxyUrl: 'http://127.0.0.1:8080',
            },
          },
        },
        currentState
      )
    ).toEqual({
      accounts: [],
      activeAccountId: null,
      settings: {
        rememberSession: false,
        defaultVolume: 0.5,
        librarySortMode: 'release_date',
        proxy: {
          mode: 'custom',
          customProxyUrl: 'http://127.0.0.1:8080',
        },
        danmakuServers: [
          {
            id: 'official',
            name: 'Official',
            url: 'https://api.dandanplay.net',
            enabled: true,
          },
        ],
        serverPreferencesByUrl: {
          'https://a.local': {
            displayNameOverride: 'Main Server',
          },
        },
      },
      progressByItemId: {},
    });
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
      progressByItemId: {
        'item-1': {
          itemId: 'item-1',
          positionSeconds: 120,
          durationSeconds: 3600,
          updatedAt: '2026-04-21T03:00:00.000Z',
        },
      },
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
        librarySortMode: 'latest_added',
        proxy: {
          mode: 'system',
          customProxyUrl: '',
        },
        danmakuServers: [],
        serverPreferencesByUrl: {},
      },
      progressByItemId: {
        [createAccountScopedProgressKey('https://demo.emby.local::user-1', 'item-1')]: {
          itemId: 'item-1',
          positionSeconds: 120,
          durationSeconds: 3600,
          updatedAt: '2026-04-21T03:00:00.000Z',
        },
      },
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
        librarySortMode: 'latest_added',
        proxy: {
          mode: 'system',
          customProxyUrl: '',
        },
        danmakuServers: [],
        serverPreferencesByUrl: {
          'https://a.local': {
            displayNameOverride: 'Main Server',
          },
        },
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
          settings: {
            librarySortMode: 'release_date',
            serverPreferencesByUrl: {
              'https://b.local': {
                displayNameOverride: 'Backup Server Updated',
              },
              'https://c.local': {
                displayNameOverride: 'Archive Server',
              },
            },
          },
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
        librarySortMode: 'release_date',
        proxy: {
          mode: 'system',
          customProxyUrl: '',
        },
        danmakuServers: [],
        serverPreferencesByUrl: {
          'https://a.local': {
            displayNameOverride: 'Main Server',
          },
          'https://b.local': {
            displayNameOverride: 'Backup Server Updated',
          },
          'https://c.local': {
            displayNameOverride: 'Archive Server',
          },
        },
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
        librarySortMode: 'latest_added',
        proxy: {
          mode: 'system',
          customProxyUrl: '',
        },
        danmakuServers: [],
        serverPreferencesByUrl: {},
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
        librarySortMode: 'latest_added',
        proxy: {
          mode: 'system',
          customProxyUrl: '',
        },
        danmakuServers: [],
        serverPreferencesByUrl: {},
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
        librarySortMode: 'latest_added',
        proxy: {
          mode: 'system',
          customProxyUrl: '',
        },
        danmakuServers: [],
        serverPreferencesByUrl: {},
      },
      progressByItemId: {},
    });
  });

  it('scopes new progress updates to the active account while preserving existing data', () => {
    const activeAccountId = 'https://demo.emby.local::user-1';

    expect(
      mergePersistedState(
        {
          progressByItemId: {
            'item-1': {
              itemId: 'item-1',
              positionSeconds: 240,
              durationSeconds: 3600,
              updatedAt: '2026-04-22T08:00:00.000Z',
            },
          },
        },
        {
          accounts: [
            {
              id: activeAccountId,
              serverUrl: 'https://demo.emby.local',
              userId: 'user-1',
              userName: 'Alice',
              accessToken: 'token-123',
              lastUsedAt: '2026-04-21T00:00:00.000Z',
            },
          ],
          activeAccountId,
          settings: {
            rememberSession: true,
            defaultVolume: 1,
            librarySortMode: 'latest_added',
            proxy: {
              mode: 'system',
              customProxyUrl: '',
            },
            danmakuServers: [],
            serverPreferencesByUrl: {},
          },
          progressByItemId: {
            'legacy-item': {
              itemId: 'legacy-item',
              positionSeconds: 60,
              durationSeconds: 1000,
              updatedAt: '2026-04-20T00:00:00.000Z',
            },
          },
        }
      )
    ).toEqual({
      accounts: [
        {
          id: activeAccountId,
          serverUrl: 'https://demo.emby.local',
          userId: 'user-1',
          userName: 'Alice',
          accessToken: 'token-123',
          lastUsedAt: '2026-04-21T00:00:00.000Z',
        },
      ],
      activeAccountId,
      settings: {
        rememberSession: true,
        defaultVolume: 1,
        librarySortMode: 'latest_added',
        proxy: {
          mode: 'system',
          customProxyUrl: '',
        },
        danmakuServers: [],
        serverPreferencesByUrl: {},
      },
      progressByItemId: {
        'legacy-item': {
          itemId: 'legacy-item',
          positionSeconds: 60,
          durationSeconds: 1000,
          updatedAt: '2026-04-20T00:00:00.000Z',
        },
        [createAccountScopedProgressKey(activeAccountId, 'item-1')]: {
          itemId: 'item-1',
          positionSeconds: 240,
          durationSeconds: 3600,
          updatedAt: '2026-04-22T08:00:00.000Z',
        },
      },
    });
  });

  it('reads scoped progress for the active account and falls back to legacy unscoped entries', () => {
    const activeAccountId = 'https://demo.emby.local::user-1';

    expect(
      getPersistedProgressByItemIdForAccount(
        {
          'legacy-item': {
            itemId: 'legacy-item',
            positionSeconds: 60,
            durationSeconds: 1000,
            updatedAt: '2026-04-20T00:00:00.000Z',
          },
          [createAccountScopedProgressKey(activeAccountId, 'item-1')]: {
            itemId: 'item-1',
            positionSeconds: 240,
            durationSeconds: 3600,
            updatedAt: '2026-04-22T08:00:00.000Z',
          },
          [createAccountScopedProgressKey('https://backup.emby.local::user-2', 'item-2')]: {
            itemId: 'item-2',
            positionSeconds: 180,
            durationSeconds: 2400,
            updatedAt: '2026-04-22T07:00:00.000Z',
          },
        },
        activeAccountId
      )
    ).toEqual({
      'legacy-item': {
        itemId: 'legacy-item',
        positionSeconds: 60,
        durationSeconds: 1000,
        updatedAt: '2026-04-20T00:00:00.000Z',
      },
      'item-1': {
        itemId: 'item-1',
        positionSeconds: 240,
        durationSeconds: 3600,
        updatedAt: '2026-04-22T08:00:00.000Z',
      },
    });
  });
});
