import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@shared/models/session';

interface AuthState {
  serverUrl: string;
  session: Session | null;
}

interface AuthContextValue extends AuthState {
  setAuthState: (next: AuthState) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    serverUrl: '',
    session: null,
  });

  useEffect(() => {
    const readPersistedState = window.embyDesktop?.storage?.read;

    if (!readPersistedState) {
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
        }
      })
      .catch(() => {
        // The shell can fall back to the empty auth state if storage is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...authState,
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
