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

interface PersistedStateStoreLike {
  store: PersistedState | LegacyPersistedState;
}

const writeQueueByStore = new WeakMap<PersistedStateStoreLike, Promise<void>>();

export async function writePersistedStatePatch(
  storeLike: PersistedStateStoreLike,
  nextState: PersistedStatePatch,
  options: RegisterStorageIpcOptions = {}
): Promise<PersistedState> {
  const previousWrite = writeQueueByStore.get(storeLike) ?? Promise.resolve();
  const queuedWrite = previousWrite.catch(() => undefined).then(async () => {
    const merged = mergePersistedState(
      nextState,
      migrateLegacyPersistedState(storeLike.store as PersistedState | LegacyPersistedState)
    );

    if (nextState.settings) {
      await options.onSettingsChanged?.(merged.settings, merged);
    }

    storeLike.store = merged;
    return merged;
  });

  writeQueueByStore.set(
    storeLike,
    queuedWrite.then(
      () => undefined,
      () => undefined
    )
  );

  return queuedWrite;
}

export function registerStorageIpc(options: RegisterStorageIpcOptions = {}) {
  ipcMain.handle('storage:read', () => readPersistedState());

  ipcMain.handle('storage:write', (_event, nextState: PersistedStatePatch) =>
    writePersistedStatePatch(store, nextState, options)
  );

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
