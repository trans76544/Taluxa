import { contextBridge, ipcRenderer } from 'electron';
import type {
  PersistedState,
  PersistedStatePatch,
  SettingsSyncEvent,
} from '../../shared/store/persistence';
import type { EmbyLoginInput, EmbyLoginSession } from '../../shared/api/emby/auth';
import type { ImageCacheResolveResult } from '../main/ipc/imageCache';
import type { ImageCacheConfig, ImageCacheStats } from '../main/image/imageCache';
import { isPlayerPlaybackEvent, type PlayerPlaybackEvent } from '../../shared/models/playback';
import type { ReportPlaybackProgressInput } from '../../shared/api/emby/playback';
import type { PlayerStoryMarkerUpdate } from '../../shared/models/storyLandmark';

export interface PlayerLaunchInput {
  authMode?: 'header' | 'local-proxy' | 'tokenless';
  episodeSelector?: PlayerEpisodeSelector;
  httpHeaders?: Record<string, string>;
  itemId: string;
  redactedDisplayUrl?: string;
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
  final?: boolean;
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
  playback: {
    reportStarted: (input: ReportPlaybackProgressInput) =>
      ipcRenderer.invoke('playback:report-started', input) as Promise<void>,
    reportProgress: (input: ReportPlaybackProgressInput) =>
      ipcRenderer.invoke('playback:report-progress', input) as Promise<void>,
    reportStopped: (input: ReportPlaybackProgressInput) =>
      ipcRenderer.invoke('playback:report-stopped', input) as Promise<void>,
  },
  player: {
    setStoryMarkers: (input: PlayerStoryMarkerUpdate) =>
      ipcRenderer.invoke('player:set-story-markers', input) as Promise<void>,
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
    onPlaybackEvent: (listener: (event: PlayerPlaybackEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        if (isPlayerPlaybackEvent(payload)) listener(payload);
      };
      ipcRenderer.on('player:playback-event', handler);
      return () => ipcRenderer.removeListener('player:playback-event', handler);
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
    onSettingsSync: (listener: (event: SettingsSyncEvent) => void) => {
      const handleSettingsSync = (
        _event: Electron.IpcRendererEvent,
        payload: SettingsSyncEvent
      ) => {
        listener(payload);
      };

      ipcRenderer.on('storage:settings-sync', handleSettingsSync);

      return () => {
        ipcRenderer.removeListener('storage:settings-sync', handleSettingsSync);
      };
    },
  },
});
