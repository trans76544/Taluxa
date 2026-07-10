import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { fetchServerInfo } from '@shared/api/emby/system';
import { createAccountId, isSettingsSyncEvent } from '@shared/store/persistence';
import type { SavedAccount, Session } from '@shared/models/session';
import { createDefaultSettings, normalizeThemeMode, type Settings } from '@shared/models/settings';

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
  const defaultSettings = createDefaultSettings();

  return {
    ...defaultSettings,
    ...currentSettings,
    ...nextSettings,
    themeMode: normalizeThemeMode(nextSettings?.themeMode ?? currentSettings.themeMode),
    proxy: {
      ...defaultSettings.proxy,
      ...currentSettings.proxy,
      ...nextSettings?.proxy,
    },
    danmaku: {
      ...defaultSettings.danmaku,
      ...currentSettings.danmaku,
      ...nextSettings?.danmaku,
    },
    cache: {
      ...defaultSettings.cache,
      ...currentSettings.cache,
      ...nextSettings?.cache,
    },
    serverPreferencesByUrl: {
      ...defaultSettings.serverPreferencesByUrl,
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

function pickBetterServerInfoAccount(
  currentBest: SavedAccount | undefined,
  candidate: SavedAccount,
  activeAccountId: string | null
): SavedAccount {
  if (!currentBest) {
    return candidate;
  }

  const currentIsActive = currentBest.id === activeAccountId;
  const candidateIsActive = candidate.id === activeAccountId;

  if (candidateIsActive && !currentIsActive) {
    return candidate;
  }

  if (currentIsActive && !candidateIsActive) {
    return currentBest;
  }

  return candidate.lastUsedAt.localeCompare(currentBest.lastUsedAt) > 0 ? candidate : currentBest;
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
    settings: mergeSettings(createDefaultSettings(), initialState?.settings),
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
  const latestInitialStateRef = useRef(initialState);
  const inFlightServerDisplayNameRequestsRef = useRef(new Map<string, string>());
  const serverDisplayNameGenerationByUrlRef = useRef(new Map<string, number>());
  latestInitialStateRef.current = initialState;
  const resolvedAuthState = authState ?? normalizeAuthState(initialState);
  const activeAccount =
    resolvedAuthState.accounts.find((account) => account.id === resolvedAuthState.activeAccountId) ??
    null;

  function updateState(updater: (current: AuthState) => AuthState) {
    setAuthState((current) => updater(current ?? normalizeAuthState(latestInitialStateRef.current)));
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

  useEffect(() => {
    const unsubscribe = window.embyDesktop?.storage.onSettingsSync?.((event) => {
      if (!isSettingsSyncEvent(event) || event.status !== 'saved') {
        return;
      }

      updateSettings(event.patch as Partial<Settings>);
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

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

    const bestAccountByServerUrl = new Map<string, SavedAccount>();

    for (const account of resolvedAuthState.accounts) {
      bestAccountByServerUrl.set(
        account.serverUrl,
        pickBetterServerInfoAccount(
          bestAccountByServerUrl.get(account.serverUrl),
          account,
          resolvedAuthState.activeAccountId
        )
      );
    }

    for (const account of bestAccountByServerUrl.values()) {
      const inFlightAccessToken = inFlightServerDisplayNameRequestsRef.current.get(account.serverUrl);

      if (
        getServerDisplayNameOverride(resolvedAuthState.settings, account.serverUrl) ||
        hasText(fetchedServerDisplayNamesByUrl[account.serverUrl]) ||
        inFlightAccessToken === account.accessToken
      ) {
        continue;
      }

      inFlightServerDisplayNameRequestsRef.current.set(account.serverUrl, account.accessToken);
      const requestToken = account.accessToken;
      const requestServerUrl = account.serverUrl;
      const requestGeneration =
        (serverDisplayNameGenerationByUrlRef.current.get(requestServerUrl) ?? 0) + 1;
      serverDisplayNameGenerationByUrlRef.current.set(requestServerUrl, requestGeneration);

      fetchServerInfo(requestServerUrl, requestToken)
        .then(({ serverName }) => {
          if (
            !cancelled &&
            requestGeneration === serverDisplayNameGenerationByUrlRef.current.get(requestServerUrl) &&
            inFlightServerDisplayNameRequestsRef.current.get(requestServerUrl) === requestToken &&
            hasText(serverName)
          ) {
            setFetchedServerDisplayNamesByUrl((current) => ({
              ...current,
              [requestServerUrl]: serverName,
            }));
          }
        })
        .catch(() => {
          // Friendly server names are best-effort.
        })
        .finally(() => {
          if (
            inFlightServerDisplayNameRequestsRef.current.get(requestServerUrl) ===
            requestToken
          ) {
            inFlightServerDisplayNameRequestsRef.current.delete(requestServerUrl);
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
