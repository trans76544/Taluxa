import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@shared/models/session';
import type { Settings } from '@shared/models/settings';

interface AuthState {
  serverUrl: string;
  session: Session | null;
  settings: Settings;
}

interface AuthStateUpdate {
  serverUrl: string;
  session: Session | null;
  settings?: Settings;
}

interface AuthContextValue extends AuthState {
  isHydrated: boolean;
  clearAuthState: () => void;
  setAuthState: (next: AuthStateUpdate) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    serverUrl: '',
    session: null,
    settings: {
      rememberSession: true,
      defaultVolume: 1,
    },
  });
  const [isHydrated, setIsHydrated] = useState(false);

  function updateAuthState(next: AuthStateUpdate) {
    setAuthState((current) => ({
      serverUrl: next.serverUrl,
      session: next.session,
      settings: next.settings ?? current.settings,
    }));
  }

  function clearAuthState() {
    setAuthState((current) => ({
      serverUrl: '',
      session: null,
      settings: current.settings,
    }));
  }

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
          setAuthState({
            serverUrl: persistedState.serverUrl,
            session: persistedState.session,
            settings: persistedState.settings,
          });
          setIsHydrated(true);
        }
      })
      .catch(() => {
        // The shell can fall back to the empty auth state if storage is unavailable.
        if (!cancelled) {
          setIsHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...authState,
        isHydrated,
        clearAuthState,
        setAuthState: updateAuthState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return value;
}
