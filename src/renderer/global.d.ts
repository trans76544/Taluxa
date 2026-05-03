import type {
  PersistedState,
  PersistedStatePatch,
} from '@shared/store/persistence';
import type {
  PlayerLaunchInput,
  PlayerProgressEvent,
} from '../electron/preload/index';
import type { ImageCacheResolveResult } from '../electron/main/ipc/imageCache';
import type { ImageCacheConfig, ImageCacheStats } from '../electron/main/image/imageCache';

export {};

declare global {
  interface Window {
    embyDesktop: {
      windowControls: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
      };
      player: {
        launch: (input: PlayerLaunchInput) => Promise<void>;
        preflight: (input: Pick<PlayerLaunchInput, 'httpHeaders' | 'streamUrl'>) => Promise<void>;
        onProgress: (listener: (event: PlayerProgressEvent) => void) => () => void;
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
      };
    };
  }
}
