import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { fetchServerInfo } from '@shared/api/emby/system';
import { createAccountId } from '@shared/store/persistence';
import type { SavedAccount, Session } from '@shared/models/session';
import { createDefaultSettings, type Settings } from '@shared/models/settings';

interface AuthState {
  accounts: SavedAccount[];
  activeAccountId: string | null;
  settings: Settings;
}

interface AuthStateUpdate {
  serverUrl: string;
  session: Session | null;
  settings?: Settings;
}

interface AuthProviderProps {
  children: ReactNode;
  initialState?: Partial<AuthState>;
  isHydrated?: boolean;
}

interface AuthContextValue extends AuthState {
  activeAccount: SavedAccount | null;
  isHydrated: boolean;
  serverUrl: string;
  session: Session | null;
  clearAuthState: () => void;
  getServerDisplayName: (serverUrl: string) => string;
  setActiveAccountId: (accountId: string) => void;
  setAuthState: (next: AuthStateUpdate) => void;
  updateSettings: (nextSettings: Partial<Settings>) => void;
  upsertAccount: (account: SavedAccount, settings?: Partial<Settings>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function createDefaultAuthState(): AuthState {
  return {
    accounts: [],
    activeAccountId: null,
    settings: createDefaultSettings(),
  };
}

function mergeAccounts(
  currentAccounts: SavedAccount[],
  nextAccounts: SavedAccount[]
): SavedAccount[] {
  const accountsById = new Map<string, SavedAccount>();

  for (const account of currentAccounts) {
    accountsById.set(account.id, account);
  }

  for (const account of nextAccounts) {
    accountsById.set(account.id, account);
  }

  return Array.from(accountsById.values());
}

function mergeSettings(currentSettings: Settings, nextSettings?: Partial<Settings>): Settings {
  return {
    ...currentSettings,
    ...nextSettings,
    serverPreferencesByUrl: {
      ...currentSettings.serverPreferencesByUrl,
      ...nextSettings?.serverPreferencesByUrl,
    },
  };
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function getServerDisplayNameOverride(settings: Settings, serverUrl: string): string | null {
  const displayNameOverride = settings.serverPreferencesByUrl[serverUrl]?.displayNameOverride;

  return hasText(displayNameOverride) ? displayNameOverride.trim() : null;
}

function normalizeActiveAccountId(
  accounts: SavedAccount[],
  activeAccountId: string | null | undefined
): string | null {
  if (activeAccountId === undefined) {
    return accounts[0]?.id ?? null;
  }

  if (activeAccountId === null) {
    return null;
  }

  return accounts.some((account) => account.id === activeAccountId)
    ? activeAccountId
    : accounts[0]?.id ?? null;
}

function normalizeAuthState(initialState?: Partial<AuthState>): AuthState {
  const accounts = initialState?.accounts ?? [];

  return {
    accounts,
    activeAccountId: normalizeActiveAccountId(accounts, initialState?.activeAccountId),
    settings: initialState?.settings ?? createDefaultSettings(),
  };
}

function toSession(account: SavedAccount | null): Session | null {
  if (!account) {
    return null;
  }

  return {
    userId: account.userId,
    userName: account.userName,
    accessToken: account.accessToken,
  };
}

export function AuthProvider({
  children,
  initialState,
  isHydrated = true,
}: AuthProviderProps) {
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [fetchedServerDisplayNamesByUrl, setFetchedServerDisplayNamesByUrl] = useState<
    Record<string, string>
  >({});
  const inFlightServerDisplayNameRequestsRef = useRef(new Map<string, string>());
  const resolvedAuthState = authState ?? normalizeAuthState(initialState);
  const activeAccount =
    resolvedAuthState.accounts.find((account) => account.id === resolvedAuthState.activeAccountId) ??
    null;

  function updateState(updater: (current: AuthState) => AuthState) {
    setAuthState((current) => updater(current ?? normalizeAuthState(initialState)));
  }

  function setActiveAccountId(accountId: string) {
    updateState((current) =>
      current.accounts.some((account) => account.id === accountId)
        ? {
            ...current,
            activeAccountId: accountId,
          }
        : current
    );
  }

  function updateSettings(nextSettings: Partial<Settings>) {
    updateState((current) => ({
      ...current,
      settings: mergeSettings(current.settings, nextSettings),
    }));
  }

  function upsertAccount(account: SavedAccount, settings?: Partial<Settings>) {
    updateState((current) => ({
      accounts: mergeAccounts(current.accounts, [account]),
      activeAccountId: account.id,
      settings: mergeSettings(current.settings, settings),
    }));
  }

  function clearAuthState() {
    updateState((current) => ({
      ...current,
      activeAccountId: null,
    }));
  }

  function updateAuthState(next: AuthStateUpdate) {
    if (!next.session) {
      updateState((current) => ({
        ...current,
        activeAccountId: null,
        settings: mergeSettings(current.settings, next.settings),
      }));
      return;
    }

    upsertAccount(
      {
        id: createAccountId(next.serverUrl, next.session.userId),
        serverUrl: next.serverUrl,
        userId: next.session.userId,
        userName: next.session.userName,
        accessToken: next.session.accessToken,
        lastUsedAt: new Date().toISOString(),
      },
      next.settings
    );
  }

  function getServerDisplayName(serverUrl: string) {
    return (
      getServerDisplayNameOverride(resolvedAuthState.settings, serverUrl) ??
      fetchedServerDisplayNamesByUrl[serverUrl]?.trim() ??
      serverUrl
    );
  }

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    let cancelled = false;

    const firstAccountByServerUrl = new Map<string, SavedAccount>();

    for (const account of resolvedAuthState.accounts) {
      if (!firstAccountByServerUrl.has(account.serverUrl)) {
        firstAccountByServerUrl.set(account.serverUrl, account);
      }
    }

    for (const account of firstAccountByServerUrl.values()) {
      const inFlightAccessToken = inFlightServerDisplayNameRequestsRef.current.get(account.serverUrl);

      if (
        getServerDisplayNameOverride(resolvedAuthState.settings, account.serverUrl) ||
        hasText(fetchedServerDisplayNamesByUrl[account.serverUrl]) ||
        inFlightAccessToken === account.accessToken
      ) {
        continue;
      }

      inFlightServerDisplayNameRequestsRef.current.set(account.serverUrl, account.accessToken);

      fetchServerInfo(account.serverUrl, account.accessToken)
        .then(({ serverName }) => {
          if (!cancelled && hasText(serverName)) {
            setFetchedServerDisplayNamesByUrl((current) => ({
              ...current,
              [account.serverUrl]: serverName,
            }));
          }
        })
        .catch(() => {
          // Friendly server names are best-effort.
        })
        .finally(() => {
          if (
            inFlightServerDisplayNameRequestsRef.current.get(account.serverUrl) ===
            account.accessToken
          ) {
            inFlightServerDisplayNameRequestsRef.current.delete(account.serverUrl);
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [fetchedServerDisplayNamesByUrl, isHydrated, resolvedAuthState.accounts, resolvedAuthState.settings]);

  return (
    <AuthContext.Provider
      value={{
        ...resolvedAuthState,
        activeAccount,
        isHydrated,
        serverUrl: activeAccount?.serverUrl ?? '',
        session: toSession(activeAccount),
        clearAuthState,
        getServerDisplayName,
        setActiveAccountId,
        setAuthState: updateAuthState,
        updateSettings,
        upsertAccount,
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
