export type LibrarySortMode = 'latest_added' | 'release_date';
export type ProxyMode = 'system' | 'direct' | 'custom';

export interface ProxySettings {
  mode: ProxyMode;
  customProxyUrl: string;
}

export interface ServerPreferences {
  displayNameOverride?: string;
}

export interface Settings {
  rememberSession: boolean;
  defaultVolume: number;
  librarySortMode: LibrarySortMode;
  proxy: ProxySettings;
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
    serverPreferencesByUrl: {},
  };
}
