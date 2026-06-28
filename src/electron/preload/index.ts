import { contextBridge, ipcRenderer } from 'electron';
import type {
  PersistedState,
  PersistedStatePatch,
} from '../../shared/store/persistence';
import type { EmbyLoginInput, EmbyLoginSession } from '../../shared/api/emby/auth';
import type { ImageCacheResolveResult } from '../main/ipc/imageCache';
import type { ImageCacheConfig, ImageCacheStats } from '../main/image/imageCache';

export interface PlayerLaunchInput {
  episodeSelector?: PlayerEpisodeSelector;
  httpHeaders?: Record<string, string>;
  itemId: string;
  streamUrl: string;
  title: string;
  startSeconds?: number;
}

export interface PlayerEpisodeSelector {
  currentItemId: string;
  episodes: PlayerEpisodeSelectorItem[];
}

export interface PlayerEpisodeSelectorItem {
  durationSeconds?: number | null;
  itemId: string;
  thumbnailHeight?: number | null;
  thumbnailPath?: string | null;
  thumbnailStride?: number | null;
  thumbnailUrl?: string | null;
  thumbnailWidth?: number | null;
  title: string;
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
  auth: {
    login: (input: EmbyLoginInput) =>
      ipcRenderer.invoke('auth:login', input) as Promise<EmbyLoginSession>,
  },
  player: {
    launch: (input: PlayerLaunchInput) =>
      ipcRenderer.invoke('player:launch', input) as Promise<void>,
    switchEpisode: (input: PlayerLaunchInput) =>
      ipcRenderer.invoke('player:switch-episode', input) as Promise<void>,
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
    onEpisodeSelect: (listener: (itemId: string) => void) => {
      const handleEpisodeSelect = (_event: Electron.IpcRendererEvent, itemId: string) => {
        listener(itemId);
      };

      ipcRenderer.on('player:episode-select', handleEpisodeSelect);

      return () => {
        ipcRenderer.removeListener('player:episode-select', handleEpisodeSelect);
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
