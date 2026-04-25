import type {
  PersistedState,
  PersistedStatePatch,
} from '@shared/store/persistence';
import type {
  PlayerLaunchInput,
  PlayerProgressEvent,
} from '../electron/preload/index';

export {};

declare global {
  interface Window {
    embyDesktop: {
      player: {
        launch: (input: PlayerLaunchInput) => Promise<void>;
        preflight: (input: Pick<PlayerLaunchInput, 'httpHeaders' | 'streamUrl'>) => Promise<void>;
        onProgress: (listener: (event: PlayerProgressEvent) => void) => () => void;
      };
      storage: {
        read: () => Promise<PersistedState>;
        write: (nextState: PersistedStatePatch) => Promise<PersistedState>;
        clearSession: () => Promise<PersistedState>;
      };
    };
  }
}
