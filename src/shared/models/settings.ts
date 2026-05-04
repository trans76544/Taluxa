export type LibrarySortMode = 'latest_added' | 'date_added' | 'sort_name' | 'community_rating' | 'critic_rating' | 'production_year' | 'premiere_date' | 'official_rating' | 'date_played' | 'runtime' | 'release_date';
export type ProxyMode = 'system' | 'direct' | 'custom';
export type DataCacheTtlDays = 1 | 7 | 30 | null;
export type ImageCacheMaxBytes = 104857600 | 314572800 | 524288000 | 1073741824;
export type ImageCacheResolution = 'original' | 1080 | 720 | 480;
export type DanmakuMatchMode = 'fileName' | 'hashAndFileName';
export type DanmakuConversionMode = 'off' | 'simplified' | 'traditional';
export type PlaybackScaleMode = 'fit' | 'stretch' | 'crop';

export interface ProxySettings {
  mode: ProxyMode;
  customProxyUrl: string;
}

export interface PlaybackSettings {
  scaleMode: PlaybackScaleMode;
}

export interface SubtitleSettings {
  enabled: boolean;
  fontFamily: string;
  delaySeconds: number;
  fontSize: number;
  position: number;
  outline: number;
  shadowOffset: number;
  scale: number;
  secondaryEnabled: boolean;
}

export interface DanmakuServerSettings {
  id: string;
  name: string;
  url: string;
  appId?: string;
  appSecret?: string;
  enabled: boolean;
}

export interface DanmakuSettings {
  enabled: boolean;
  scrollMaxLines: number;
  topMaxLines: number;
  bottomMaxLines: number;
  scale: number;
  opacity: number;
  speed: number;
  bold: boolean;
  blocklist: string[];
  matchMode: DanmakuMatchMode;
  conversionMode: DanmakuConversionMode;
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
  playback: PlaybackSettings;
  subtitles: SubtitleSettings;
  danmakuServers: DanmakuServerSettings[];
  danmaku: DanmakuSettings;
  cache: CacheSettings;
  serverPreferencesByUrl: Record<string, ServerPreferences>;
}

export function createDefaultDanmakuServers(): DanmakuServerSettings[] {
  return [
    {
      id: 'dandanplay-official',
      name: 'DandanPlay',
      url: 'https://api.dandanplay.net',
      enabled: true,
    },
  ];
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
    playback: {
      scaleMode: 'fit',
    },
    subtitles: {
      enabled: true,
      fontFamily: 'Tahoma',
      delaySeconds: 0,
      fontSize: 55,
      position: 100,
      outline: 3,
      shadowOffset: 0,
      scale: 1,
      secondaryEnabled: false,
    },
    danmakuServers: createDefaultDanmakuServers(),
    danmaku: {
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
    },
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
