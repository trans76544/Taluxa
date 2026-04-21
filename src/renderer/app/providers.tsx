import { useEffect, useState, type ReactNode } from 'react';
import { AuthProvider } from '@renderer/features/auth/AuthContext';
import type { PersistedState } from '@shared/store/persistence';

function createInitialState(): Pick<PersistedState, 'accounts' | 'activeAccountId' | 'settings'> {
  return {
    accounts: [],
    activeAccountId: null,
    settings: {
      rememberSession: true,
      defaultVolume: 1,
    },
  };
}

function resolveStartupActiveAccountId(persistedState: PersistedState): string | null {
  if (persistedState.activeAccountId === undefined) {
    return persistedState.accounts[0]?.id ?? null;
  }

  return persistedState.activeAccountId;
}

function toStartupState(persistedState: PersistedState) {
  return {
    accounts: persistedState.accounts,
    activeAccountId: resolveStartupActiveAccountId(persistedState),
    settings: persistedState.settings,
  };
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [initialState, setInitialState] = useState(createInitialState);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const readPersistedState = window.embyDesktop?.storage?.read;

    if (!readPersistedState) {
      setIsHydrated(true);
      return;
    }

    let cancelled = false;

    readPersistedState()
      .then((persistedState) => {
        if (!cancelled) {
          setInitialState(toStartupState(persistedState));
          setIsHydrated(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthProvider initialState={initialState} isHydrated={isHydrated}>
      {children}
    </AuthProvider>
  );
}
