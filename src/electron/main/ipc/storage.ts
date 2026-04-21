import { ipcMain } from 'electron';
import Store from 'electron-store';
import {
  createEmptyPersistedState,
  mergePersistedState,
  type PersistedStatePatch,
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

  ipcMain.handle('storage:write', (_event, nextState: PersistedStatePatch) => {
    const merged = mergePersistedState(nextState, readState());

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
