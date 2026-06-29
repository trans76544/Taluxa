import { ipcMain } from 'electron';
import Store from 'electron-store';
import {
  createEmptyPersistedState,
  type SettingsSyncEvent,
  migrateLegacyPersistedState,
  mergePersistedState,
  type LegacyPersistedState,
  type PersistedStatePatch,
  type PersistedState,
} from '../../../shared/store/persistence';
import type { Settings } from '@shared/models/settings';
import { redactErrorMessage } from '@shared/network/redaction';

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
  onSettingsSync?: (event: SettingsSyncEvent) => void | Promise<void>;
  settingsSyncOrigin?: SettingsSyncEvent['origin'];
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
      try {
        await options.onSettingsChanged?.(merged.settings, merged);
      } catch (error) {
        await options.onSettingsSync?.({
          errorMessage: redactErrorMessage(error),
          origin: options.settingsSyncOrigin ?? 'renderer-settings',
          patch: nextState.settings,
          persistedAt: new Date().toISOString(),
          status: 'failed',
        });
        throw error;
      }
    }

    storeLike.store = merged;

    if (nextState.settings) {
      await options.onSettingsSync?.({
        origin: options.settingsSyncOrigin ?? 'renderer-settings',
        patch: nextState.settings,
        persistedAt: new Date().toISOString(),
        status: 'saved',
      });
    }

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

export function clearPersistedSession(storeLike: PersistedStateStoreLike): Promise<PersistedState> {
  return writePersistedStatePatch(storeLike, {
    activeAccountId: null,
  });
}

export function writeSettingsPatchFromMain(
  settings: PersistedStatePatch['settings'],
  options: RegisterStorageIpcOptions = {}
): Promise<PersistedState> {
  return writePersistedStatePatch(store, { settings }, {
    ...options,
    settingsSyncOrigin: options.settingsSyncOrigin ?? 'player',
  });
}

export function registerStorageIpc(options: RegisterStorageIpcOptions = {}) {
  ipcMain.handle('storage:read', () => readPersistedState());

  ipcMain.handle('storage:write', (_event, nextState: PersistedStatePatch) =>
    writePersistedStatePatch(store, nextState, options)
  );

  ipcMain.handle('storage:clear-session', () => clearPersistedSession(store));
}
