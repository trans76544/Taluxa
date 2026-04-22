import { contextBridge, ipcRenderer } from 'electron';
import type {
  PersistedState,
  PersistedStatePatch,
} from '../../shared/store/persistence';

export interface PlayerLaunchInput {
  streamUrl: string;
  title: string;
  startSeconds?: number;
}

contextBridge.exposeInMainWorld('embyDesktop', {
  player: {
    launch: (input: PlayerLaunchInput) =>
      ipcRenderer.invoke('player:launch', input) as Promise<void>,
  },
  storage: {
    read: () => ipcRenderer.invoke('storage:read') as Promise<PersistedState>,
    write: (nextState: PersistedStatePatch) =>
      ipcRenderer.invoke('storage:write', nextState) as Promise<PersistedState>,
    clearSession: () =>
      ipcRenderer.invoke('storage:clear-session') as Promise<PersistedState>,
  },
});
