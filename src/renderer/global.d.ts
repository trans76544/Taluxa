import type {
  PersistedState,
  PersistedStatePatch,
} from '@shared/store/persistence';
import type { PlayerLaunchInput } from '../electron/preload/index';

export {};

declare global {
  interface Window {
    embyDesktop: {
      player: {
        launch: (input: PlayerLaunchInput) => Promise<void>;
      };
      storage: {
        read: () => Promise<PersistedState>;
        write: (nextState: PersistedStatePatch) => Promise<PersistedState>;
        clearSession: () => Promise<PersistedState>;
      };
    };
  }
}
