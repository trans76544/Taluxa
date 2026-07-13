import type {
  PersistedState,
  PersistedStatePatch,
  SettingsSyncEvent,
} from '@shared/store/persistence';
import type {
  PlayerLaunchInput,
  PlayerProgressEvent,
} from '../electron/preload/index';
import type { EmbyLoginInput, EmbyLoginSession } from '@shared/api/emby/auth';
import type { ImageCacheResolveResult } from '../electron/main/ipc/imageCache';
import type { ImageCacheConfig, ImageCacheStats } from '../electron/main/image/imageCache';
import type { PlayerPlaybackEvent } from '@shared/models/playback';
import type { ReportPlaybackProgressInput } from '@shared/api/emby/playback';
import type { PlayerStoryMarkerUpdate, StoryMarkerDiagnostic } from '@shared/models/storyLandmark';

export {};

declare global {
  interface Window {
    embyDesktop: {
      windowControls: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
      };
      auth: {
        login: (input: EmbyLoginInput) => Promise<EmbyLoginSession>;
      };
      playback?: {
        reportStarted: (input: ReportPlaybackProgressInput) => Promise<void>;
        reportProgress: (input: ReportPlaybackProgressInput) => Promise<void>;
        reportStopped: (input: ReportPlaybackProgressInput) => Promise<void>;
      };
      player: {
        reportStoryMarkerDiagnostic?: (input: StoryMarkerDiagnostic) => Promise<void>;
        setStoryMarkers: (input: PlayerStoryMarkerUpdate) => Promise<void>;
        launch: (input: PlayerLaunchInput) => Promise<void>;
        switchEpisode: (input: PlayerLaunchInput) => Promise<void>;
        preflight: (input: Pick<PlayerLaunchInput, 'httpHeaders' | 'streamUrl'>) => Promise<void>;
        onEpisodeSelect: (listener: (itemId: string) => void) => () => void;
        onProgress: (listener: (event: PlayerProgressEvent) => void) => () => void;
        onPlaybackEvent?: (listener: (event: PlayerPlaybackEvent) => void) => () => void;
      };
      imageCache: {
        resolve: (sourceUrl: string) => Promise<ImageCacheResolveResult>;
        stats: () => Promise<ImageCacheStats>;
        clear: () => Promise<void>;
        configure: (config: ImageCacheConfig) => Promise<void>;
      };
      storage: {
        read: () => Promise<PersistedState>;
        write: (nextState: PersistedStatePatch) => Promise<PersistedState>;
        clearSession: () => Promise<PersistedState>;
        onSettingsSync?: (listener: (event: SettingsSyncEvent) => void) => () => void;
      };
    };
  }
}
