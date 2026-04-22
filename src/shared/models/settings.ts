export type LibrarySortMode = 'latest_added' | 'release_date';

export interface ServerPreferences {
  displayNameOverride?: string;
}

export interface Settings {
  rememberSession: boolean;
  defaultVolume: number;
  librarySortMode: LibrarySortMode;
  serverPreferencesByUrl: Record<string, ServerPreferences>;
}

export function createDefaultSettings(): Settings {
  return {
    rememberSession: true,
    defaultVolume: 1,
    librarySortMode: 'latest_added',
    serverPreferencesByUrl: {},
  };
}
