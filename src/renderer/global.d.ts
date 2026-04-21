import type {
  PersistedState,
  PersistedStatePatch,
} from '@shared/store/persistence';

export {};

declare global {
  interface Window {
    embyDesktop: {
      storage: {
        read: () => Promise<PersistedState>;
        write: (nextState: PersistedStatePatch) => Promise<PersistedState>;
        clearSession: () => Promise<PersistedState>;
      };
    };
  }
}
