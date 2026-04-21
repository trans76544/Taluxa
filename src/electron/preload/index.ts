import { contextBridge, ipcRenderer } from 'electron';
import type {
  PersistedState,
  PersistedStatePatch,
} from '../../shared/store/persistence';

contextBridge.exposeInMainWorld('embyDesktop', {
  storage: {
    read: () => ipcRenderer.invoke('storage:read') as Promise<PersistedState>,
    write: (nextState: PersistedStatePatch) =>
      ipcRenderer.invoke('storage:write', nextState) as Promise<PersistedState>,
    clearSession: () =>
      ipcRenderer.invoke('storage:clear-session') as Promise<PersistedState>,
  },
});
