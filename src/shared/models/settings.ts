export type LibrarySortMode = 'latest_added' | 'date_added' | 'sort_name' | 'community_rating' | 'critic_rating' | 'production_year' | 'premiere_date' | 'official_rating' | 'date_played' | 'runtime' | 'release_date';
export type ProxyMode = 'system' | 'direct' | 'custom';
export type DataCacheTtlDays = 1 | 7 | 30 | null;
export type ImageCacheMaxBytes = 104857600 | 314572800 | 524288000 | 1073741824;
export type ImageCacheResolution = 'original' | 1080 | 720 | 480;

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

export interface CacheSettings {
  dataCacheEnabled: boolean;
  dataCacheTtlDays: DataCacheTtlDays;
  imageCacheEnabled: boolean;
  imageCacheMaxBytes: ImageCacheMaxBytes;
  imageCacheResolution: ImageCacheResolution;
}

export interface Settings {
  rememberSession: boolean;
  defaultVolume: number;
  librarySortMode: LibrarySortMode;
  proxy: ProxySettings;
  danmakuServers: DanmakuServerSettings[];
  cache: CacheSettings;
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
    cache: {
      dataCacheEnabled: true,
      dataCacheTtlDays: 30,
      imageCacheEnabled: true,
      imageCacheMaxBytes: 524288000,
      imageCacheResolution: 'original',
    },
    serverPreferencesByUrl: {},
  };
}
