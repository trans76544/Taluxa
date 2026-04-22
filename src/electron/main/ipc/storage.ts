import { ipcMain } from 'electron';
import Store from 'electron-store';
import {
  createEmptyPersistedState,
  migrateLegacyPersistedState,
  mergePersistedState,
  type LegacyPersistedState,
  type PersistedStatePatch,
  type PersistedState,
} from '../../../shared/store/persistence';
import type { Settings } from '@shared/models/settings';

const store = new Store<PersistedState | LegacyPersistedState>({
  name: 'desktop-storage',
  defaults: createEmptyPersistedState(),
});

export function readPersistedState(): PersistedState {
  return migrateLegacyPersistedState(store.store as PersistedState | LegacyPersistedState);
}

export interface RegisterStorageIpcOptions {
  onSettingsChanged?: (
    settings: Settings,
    persistedState: PersistedState
  ) => void | Promise<void>;
}

export function registerStorageIpc(options: RegisterStorageIpcOptions = {}) {
  ipcMain.handle('storage:read', () => readPersistedState());

  ipcMain.handle('storage:write', async (_event, nextState: PersistedStatePatch) => {
    const merged = mergePersistedState(nextState, readPersistedState());

    store.store = merged;

    if (nextState.settings) {
      await options.onSettingsChanged?.(merged.settings, merged);
    }

    return merged;
  });

  ipcMain.handle('storage:clear-session', () => {
    const currentState = readPersistedState();
    const merged = mergePersistedState(
      {
        activeAccountId: null,
      },
      currentState
    );

    store.store = merged;
    return merged;
  });
}
