import { contextBridge, ipcRenderer } from 'electron';
import type {
  PersistedState,
  PersistedStatePatch,
} from '../../shared/store/persistence';
import type { ImageCacheResolveResult } from '../main/ipc/imageCache';
import type { ImageCacheConfig, ImageCacheStats } from '../main/image/imageCache';

export interface PlayerLaunchInput {
  httpHeaders?: Record<string, string>;
  itemId: string;
  streamUrl: string;
  title: string;
  startSeconds?: number;
}

export interface PlayerProgressEvent {
  itemId: string;
  positionSeconds: number;
  durationSeconds: number;
}

contextBridge.exposeInMainWorld('embyDesktop', {
  windowControls: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },
  player: {
    launch: (input: PlayerLaunchInput) =>
      ipcRenderer.invoke('player:launch', input) as Promise<void>,
    preflight: (input: Pick<PlayerLaunchInput, 'httpHeaders' | 'streamUrl'>) =>
      ipcRenderer.invoke('player:preflight', input) as Promise<void>,
    onProgress: (listener: (event: PlayerProgressEvent) => void) => {
      const handleProgress = (_event: Electron.IpcRendererEvent, payload: PlayerProgressEvent) => {
        listener(payload);
      };

      ipcRenderer.on('player:progress', handleProgress);

      return () => {
        ipcRenderer.removeListener('player:progress', handleProgress);
      };
    },
  },
  imageCache: {
    resolve: (sourceUrl: string) =>
      ipcRenderer.invoke('image-cache:resolve', sourceUrl) as Promise<ImageCacheResolveResult>,
    stats: () => ipcRenderer.invoke('image-cache:stats') as Promise<ImageCacheStats>,
    clear: () => ipcRenderer.invoke('image-cache:clear') as Promise<void>,
    configure: (config: ImageCacheConfig) =>
      ipcRenderer.invoke('image-cache:configure', config) as Promise<void>,
  },
  storage: {
    read: () => ipcRenderer.invoke('storage:read') as Promise<PersistedState>,
    write: (nextState: PersistedStatePatch) =>
      ipcRenderer.invoke('storage:write', nextState) as Promise<PersistedState>,
    clearSession: () =>
      ipcRenderer.invoke('storage:clear-session') as Promise<PersistedState>,
  },
});
