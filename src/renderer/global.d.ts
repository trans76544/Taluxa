import type { PersistedState } from '@shared/store/persistence';

export {};

declare global {
  interface Window {
    embyDesktop: {
      storage: {
        read: () => Promise<PersistedState>;
        write: (nextState: Partial<PersistedState>) => Promise<PersistedState>;
        clearSession: () => Promise<PersistedState>;
      };
    };
  }
}
