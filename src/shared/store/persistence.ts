import type { PlaybackProgress } from '@shared/models/progress';
import type { Session } from '@shared/models/session';
import type { Settings } from '@shared/models/settings';

export interface PersistedState {
  serverUrl: string;
  session: Session | null;
  settings: Settings;
  progressByItemId: Record<string, PlaybackProgress>;
}

export type PersistedStatePatch = Partial<Omit<PersistedState, 'settings' | 'progressByItemId'>> & {
  settings?: Partial<Settings>;
  progressByItemId?: Partial<Record<string, PlaybackProgress>>;
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
  partial: PersistedStatePatch = {},
  currentState: PersistedState = createEmptyPersistedState()
): PersistedState {
  const progressByItemId = { ...currentState.progressByItemId };

  for (const [itemId, progress] of Object.entries(partial.progressByItemId ?? {})) {
    if (progress) {
      progressByItemId[itemId] = progress;
    }
  }

  return {
    serverUrl: partial.serverUrl ?? currentState.serverUrl,
    session: partial.session ?? currentState.session,
    settings: {
      rememberSession:
        partial.settings?.rememberSession ?? currentState.settings.rememberSession,
      defaultVolume:
        partial.settings?.defaultVolume ?? currentState.settings.defaultVolume,
    },
    progressByItemId,
  };
}
