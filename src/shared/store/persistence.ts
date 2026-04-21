import type { PlaybackProgress } from '@shared/models/progress';
import type { Session } from '@shared/models/session';
import type { Settings } from '@shared/models/settings';

export interface PersistedState {
  serverUrl: string;
  session: Session | null;
  settings: Settings;
  progressByItemId: Record<string, PlaybackProgress>;
}

type PersistedStatePatch = Partial<Omit<PersistedState, 'settings'>> & {
  settings?: Partial<Settings>;
};

export function createEmptyPersistedState(): PersistedState {
  return {
    serverUrl: '',
    session: null,
    settings: {
      rememberSession: true,
      defaultVolume: 1,
    },
    progressByItemId: {},
  };
}

export function mergePersistedState(
  partial: PersistedStatePatch = {}
): PersistedState {
  const defaults = createEmptyPersistedState();

  return {
    serverUrl: partial.serverUrl ?? defaults.serverUrl,
    session: partial.session ?? defaults.session,
    settings: {
      rememberSession:
        partial.settings?.rememberSession ?? defaults.settings.rememberSession,
      defaultVolume:
        partial.settings?.defaultVolume ?? defaults.settings.defaultVolume,
    },
    progressByItemId:
      partial.progressByItemId ?? defaults.progressByItemId,
  };
}
