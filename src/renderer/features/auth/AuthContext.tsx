import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@shared/models/session';

interface AuthState {
  serverUrl: string;
  session: Session | null;
}

interface AuthContextValue extends AuthState {
  isHydrated: boolean;
  setAuthState: (next: AuthState) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    serverUrl: '',
    session: null,
  });
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
          setAuthState({
            serverUrl: persistedState.serverUrl,
            session: persistedState.session,
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
        setAuthState,
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
