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
import type { DanmakuSettings } from '../models/settings';

const DEFAULT_CACHE_SETTINGS = {
  dataCacheEnabled: true,
  dataCacheTtlDays: 30,
  imageCacheEnabled: true,
  imageCacheMaxBytes: 524288000,
  imageCacheResolution: 'original',
} as const;

const DEFAULT_DANMAKU_SETTINGS: DanmakuSettings = {
  enabled: true,
  scrollMaxLines: 5,
  topMaxLines: 3,
  bottomMaxLines: 3,
  scale: 1,
  opacity: 0.5,
  speed: 1,
  bold: false,
  blocklist: [],
  matchMode: 'fileName',
  conversionMode: 'off',
};

const DEFAULT_DANMAKU_SERVERS = [
  {
    id: 'dandanplay-official',
    name: 'DandanPlay',
    url: 'https://api.dandanplay.net',
    enabled: true,
  },
];

const DEFAULT_PLAYBACK_SETTINGS = {
  scaleMode: 'fit',
} as const;

const DEFAULT_SUBTITLE_SETTINGS = {
  enabled: true,
  fontFamily: 'Tahoma',
  delaySeconds: 0,
  fontSize: 55,
  position: 100,
  outline: 3,
  shadowOffset: 0,
  scale: 1,
  secondaryEnabled: false,
} as const;

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
        playback: DEFAULT_PLAYBACK_SETTINGS,
        subtitles: DEFAULT_SUBTITLE_SETTINGS,
        danmakuServers: DEFAULT_DANMAKU_SERVERS,
        danmaku: DEFAULT_DANMAKU_SETTINGS,
        cache: DEFAULT_CACHE_SETTINGS,
        serverPreferencesByUrl: {},
      },
      progressByItemId: {},
      homeCacheByKey: {},
    });
    expect('serverUrl' in state).toBe(false);
    expect('session' in state).toBe(false);
  });

  it('creates default playback and subtitle settings', () => {
    const state = createEmptyPersistedState();

    expect(state.settings.playback).toEqual({
      scaleMode: 'fit',
    });
    expect(state.settings.subtitles).toEqual({
      enabled: true,
      fontFamily: 'Tahoma',
      delaySeconds: 0,
      fontSize: 55,
      position: 100,
      outline: 3,
      shadowOffset: 0,
      scale: 1,
      secondaryEnabled: false,
    });
  });

  it('merges partial playback and subtitle settings without dropping defaults', () => {
    const merged = mergePersistedState({
      settings: {
        playback: { scaleMode: 'crop' },
        subtitles: { fontFamily: 'Microsoft YaHei UI', secondaryEnabled: true },
      },
    });

    expect(merged.settings.playback.scaleMode).toBe('crop');
    expect(merged.settings.subtitles).toMatchObject({
      enabled: true,
      fontFamily: 'Microsoft YaHei UI',
      delaySeconds: 0,
      fontSize: 55,
      position: 100,
      outline: 3,
      shadowOffset: 0,
      scale: 1,
      secondaryEnabled: true,
    });
  });

  it('merges cache settings without losing existing settings', () => {
    const currentState = createEmptyPersistedState();

    const next = mergePersistedState(
      {
        settings: {
          cache: {
            imageCacheEnabled: false,
            imageCacheMaxBytes: 104857600,
          },
        },
      },
      currentState
    );

    expect(next.settings.cache).toEqual({
      dataCacheEnabled: true,
      dataCacheTtlDays: 30,
      imageCacheEnabled: false,
      imageCacheMaxBytes: 104857600,
      imageCacheResolution: 'original',
    });
  });

  it('merges danmaku settings without losing existing values', () => {
    const currentState = createEmptyPersistedState();

    const next = mergePersistedState(
      {
        settings: {
          danmaku: {
            enabled: false,
            scrollMaxLines: 8,
            blocklist: ['spoiler', '/bad\\s+word/i'],
          },
        },
      },
      currentState
    );

    expect(next.settings.danmaku).toEqual({
      ...DEFAULT_DANMAKU_SETTINGS,
      enabled: false,
      scrollMaxLines: 8,
      blocklist: ['spoiler', '/bad\\s+word/i'],
    });
  });

  it('restores the default danmaku server when persisted settings omit server configuration', () => {
    const currentState = createEmptyPersistedState();

    const next = mergePersistedState(
      {
        settings: {
          defaultVolume: 0.8,
        },
      },
      {
        ...currentState,
        settings: {
          ...currentState.settings,
          danmakuServers: [],
        },
      }
    );

    expect(next.settings.danmakuServers).toEqual(DEFAULT_DANMAKU_SERVERS);
  });

  it('clears persisted home cache entries when requested', () => {
    const current = mergePersistedState({
      homeCacheByKey: {
        'home-cache::account-1::latest_added': {
          cachedAt: '2026-05-02T00:00:00.000Z',
          accountLabel: 'Server',
          continueWatching: [],
          libraries: [],
          featuredRows: [],
        },
      },
    });

    expect(mergePersistedState({ clearHomeCache: true }, current).homeCacheByKey).toEqual({});
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
        playback: DEFAULT_PLAYBACK_SETTINGS,
        subtitles: DEFAULT_SUBTITLE_SETTINGS,
        danmakuServers: [
          {
            id: 'official',
            name: 'Official',
            url: 'https://api.dandanplay.net',
            enabled: true,
          },
        ],
        danmaku: DEFAULT_DANMAKU_SETTINGS,
        cache: DEFAULT_CACHE_SETTINGS,
        serverPreferencesByUrl: {
          'https://a.local': {
            displayNameOverride: 'Main Server',
          },
        },
      },
      progressByItemId: {},
      homeCacheByKey: {},
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
        playback: DEFAULT_PLAYBACK_SETTINGS,
        subtitles: DEFAULT_SUBTITLE_SETTINGS,
        danmakuServers: [
          {
            id: 'official',
            name: 'Official',
            url: 'https://api.dandanplay.net',
            enabled: true,
          },
        ],
        danmaku: DEFAULT_DANMAKU_SETTINGS,
        cache: DEFAULT_CACHE_SETTINGS,
        serverPreferencesByUrl: {
          'https://a.local': {
            displayNameOverride: 'Main Server',
          },
        },
      },
      progressByItemId: {},
      homeCacheByKey: {},
    });
  });

  it('merges home cache entries by key', () => {
    const current = mergePersistedState({
      homeCacheByKey: {
        'home-cache::account-1::latest_added': {
          cachedAt: '2026-05-02T00:00:00.000Z',
          accountLabel: 'Server',
          continueWatching: [],
          libraries: [],
          featuredRows: [],
        },
      },
    });

    const next = mergePersistedState(
      {
        homeCacheByKey: {
          'home-cache::account-1::release_date': {
            cachedAt: '2026-05-02T00:10:00.000Z',
            accountLabel: 'Server',
            continueWatching: [],
            libraries: [],
            featuredRows: [],
          },
        },
      },
      current
    );

    expect(Object.keys(next.homeCacheByKey)).toEqual([
      'home-cache::account-1::latest_added',
      'home-cache::account-1::release_date',
    ]);
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
        playback: DEFAULT_PLAYBACK_SETTINGS,
        subtitles: DEFAULT_SUBTITLE_SETTINGS,
        danmakuServers: DEFAULT_DANMAKU_SERVERS,
        danmaku: DEFAULT_DANMAKU_SETTINGS,
        cache: DEFAULT_CACHE_SETTINGS,
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
      homeCacheByKey: {},
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
        playback: DEFAULT_PLAYBACK_SETTINGS,
        subtitles: DEFAULT_SUBTITLE_SETTINGS,
        danmakuServers: DEFAULT_DANMAKU_SERVERS,
        danmaku: DEFAULT_DANMAKU_SETTINGS,
        cache: DEFAULT_CACHE_SETTINGS,
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
      homeCacheByKey: {},
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
        playback: DEFAULT_PLAYBACK_SETTINGS,
        subtitles: DEFAULT_SUBTITLE_SETTINGS,
        danmakuServers: DEFAULT_DANMAKU_SERVERS,
        danmaku: DEFAULT_DANMAKU_SETTINGS,
        cache: DEFAULT_CACHE_SETTINGS,
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
      homeCacheByKey: {},
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
        playback: DEFAULT_PLAYBACK_SETTINGS,
        subtitles: DEFAULT_SUBTITLE_SETTINGS,
        danmakuServers: DEFAULT_DANMAKU_SERVERS,
        danmaku: DEFAULT_DANMAKU_SETTINGS,
        cache: DEFAULT_CACHE_SETTINGS,
        serverPreferencesByUrl: {},
      },
      progressByItemId: {},
      homeCacheByKey: {},
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
        playback: DEFAULT_PLAYBACK_SETTINGS,
        subtitles: DEFAULT_SUBTITLE_SETTINGS,
        danmakuServers: DEFAULT_DANMAKU_SERVERS,
        danmaku: DEFAULT_DANMAKU_SETTINGS,
        cache: DEFAULT_CACHE_SETTINGS,
        serverPreferencesByUrl: {},
      },
      progressByItemId: {},
      homeCacheByKey: {},
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
        playback: DEFAULT_PLAYBACK_SETTINGS,
        subtitles: DEFAULT_SUBTITLE_SETTINGS,
        danmakuServers: DEFAULT_DANMAKU_SERVERS,
        danmaku: DEFAULT_DANMAKU_SETTINGS,
        cache: DEFAULT_CACHE_SETTINGS,
        serverPreferencesByUrl: {},
      },
      progressByItemId: {},
      homeCacheByKey: {},
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
            playback: DEFAULT_PLAYBACK_SETTINGS,
            subtitles: DEFAULT_SUBTITLE_SETTINGS,
            danmakuServers: DEFAULT_DANMAKU_SERVERS,
            danmaku: DEFAULT_DANMAKU_SETTINGS,
            cache: DEFAULT_CACHE_SETTINGS,
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
          homeCacheByKey: {},
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
        playback: DEFAULT_PLAYBACK_SETTINGS,
        subtitles: DEFAULT_SUBTITLE_SETTINGS,
        danmakuServers: DEFAULT_DANMAKU_SERVERS,
        danmaku: DEFAULT_DANMAKU_SETTINGS,
        cache: DEFAULT_CACHE_SETTINGS,
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
      homeCacheByKey: {},
    });
  });

  it('removes scoped progress entries when a progress patch value is null', () => {
    const activeAccountId = 'https://demo.emby.local::user-1';

    const next = mergePersistedState(
      {
        progressByItemId: {
          'item-1': null,
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
        settings: createEmptyPersistedState().settings,
        progressByItemId: {
          [createAccountScopedProgressKey(activeAccountId, 'item-1')]: {
            itemId: 'item-1',
            positionSeconds: 240,
            durationSeconds: 3600,
            updatedAt: '2026-04-22T08:00:00.000Z',
          },
          [createAccountScopedProgressKey(activeAccountId, 'item-2')]: {
            itemId: 'item-2',
            positionSeconds: 120,
            durationSeconds: 3600,
            updatedAt: '2026-04-22T09:00:00.000Z',
          },
        },
        homeCacheByKey: {},
      }
    );

    expect(next.progressByItemId).toEqual({
      [createAccountScopedProgressKey(activeAccountId, 'item-2')]: {
        itemId: 'item-2',
        positionSeconds: 120,
        durationSeconds: 3600,
        updatedAt: '2026-04-22T09:00:00.000Z',
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
