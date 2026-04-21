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

const store = new Store<PersistedState | LegacyPersistedState>({
  name: 'desktop-storage',
  defaults: createEmptyPersistedState(),
});

function readState(): PersistedState {
  return migrateLegacyPersistedState(store.store as PersistedState | LegacyPersistedState);
}

export function registerStorageIpc() {
  ipcMain.handle('storage:read', () => readState());

  ipcMain.handle('storage:write', (_event, nextState: PersistedStatePatch) => {
    const merged = mergePersistedState(nextState, readState());

    store.store = merged;
    return merged;
  });

  ipcMain.handle('storage:clear-session', () => {
    const currentState = readState();
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
