export type LibrarySortMode = 'latest_added' | 'date_added' | 'sort_name' | 'community_rating' | 'critic_rating' | 'production_year' | 'premiere_date' | 'official_rating' | 'date_played' | 'runtime' | 'release_date';
export type ProxyMode = 'system' | 'direct' | 'custom';

export interface ProxySettings {
  mode: ProxyMode;
  customProxyUrl: string;
}

export interface DanmakuServerSettings {
  id: string;
  name: string;
  url: string;
  appId?: string;
  appSecret?: string;
  enabled: boolean;
}

export interface ServerPreferences {
  displayNameOverride?: string;
}

export interface Settings {
  rememberSession: boolean;
  defaultVolume: number;
  librarySortMode: LibrarySortMode;
  proxy: ProxySettings;
  danmakuServers: DanmakuServerSettings[];
  serverPreferencesByUrl: Record<string, ServerPreferences>;
}

export function createDefaultSettings(): Settings {
  return {
    rememberSession: true,
    defaultVolume: 1,
    librarySortMode: 'latest_added',
    proxy: {
      mode: 'system',
      customProxyUrl: '',
    },
    danmakuServers: [],
    serverPreferencesByUrl: {},
  };
}
