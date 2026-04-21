import { ipcMain } from 'electron';
import Store from 'electron-store';
import {
  createEmptyPersistedState,
  mergePersistedState,
  type PersistedState,
} from '../../../shared/store/persistence';

const store = new Store<PersistedState>({
  name: 'desktop-storage',
  defaults: createEmptyPersistedState(),
});

function readState(): PersistedState {
  return mergePersistedState(store.store as Partial<PersistedState>);
}

export function registerStorageIpc() {
  ipcMain.handle('storage:read', () => readState());

  ipcMain.handle('storage:write', (_event, nextState: Partial<PersistedState>) => {
    const currentState = readState();
    const merged = mergePersistedState({
      ...currentState,
      ...nextState,
      settings: {
        ...currentState.settings,
        ...nextState.settings,
      },
    });

    store.store = merged;
    return merged;
  });

  ipcMain.handle('storage:clear-session', () => {
    const currentState = readState();
    const merged = mergePersistedState({
      ...currentState,
      session: null,
    });

    store.store = merged;
    return merged;
  });
}
