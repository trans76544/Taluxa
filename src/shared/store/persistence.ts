import type { PlaybackProgress } from '@shared/models/progress';
import type { SavedAccount, Session } from '@shared/models/session';
import type { Settings } from '@shared/models/settings';

export interface PersistedState {
  accounts?: SavedAccount[];
  activeAccountId?: string | null;
  settings: Settings;
  progressByItemId: Record<string, PlaybackProgress>;
  serverUrl: string;
  session: Session | null;
}

export interface LegacyPersistedState {
  serverUrl?: string;
  session?: Session | null;
  settings?: Partial<Settings>;
  progressByItemId?: Partial<Record<string, PlaybackProgress>>;
  accounts?: SavedAccount[];
  activeAccountId?: string | null;
}

export type PersistedStatePatch = Partial<Omit<PersistedState, 'settings' | 'progressByItemId'>> & {
  settings?: Partial<Settings>;
  progressByItemId?: Partial<Record<string, PlaybackProgress>>;
};

function attachLegacyFields(
  state: Omit<PersistedState, 'serverUrl' | 'session'>,
  serverUrl: string,
  session: Session | null
): PersistedState {
  Object.defineProperties(state, {
    serverUrl: {
      value: serverUrl,
      enumerable: false,
      writable: true,
    },
    session: {
      value: session,
      enumerable: false,
      writable: true,
    },
  });

  return state as PersistedState;
}

export function createAccountId(serverUrl: string, userId: string): string {
  return `${serverUrl}::${userId}`;
}

export function createEmptyPersistedState(): PersistedState {
  const emptyState = attachLegacyFields(
    {
      accounts: [],
      activeAccountId: null,
      settings: {
        rememberSession: true,
        defaultVolume: 1,
      },
      progressByItemId: {},
    },
    '',
    null
  );

  return emptyState;
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

function pickLegacyServerUrl(accounts: SavedAccount[], serverUrl?: string): string {
  return serverUrl ?? accounts[0]?.serverUrl ?? '';
}

function pickLegacySession(
  accounts: SavedAccount[],
  activeAccountId: string | null | undefined,
  session?: Session | null
): Session | null {
  if (session !== undefined) {
    return session;
  }

  const activeAccount = accounts.find((account) => account.id === activeAccountId) ?? accounts[0];

  return activeAccount
    ? {
        userId: activeAccount.userId,
        userName: activeAccount.userName,
        accessToken: activeAccount.accessToken,
      }
    : null;
}

function normalizeActiveAccountId(
  activeAccountId: string | null | undefined,
  accounts: SavedAccount[],
  fallbackActiveAccountId: string | null
): string | null {
  if (activeAccountId === undefined) {
    return fallbackActiveAccountId;
  }

  if (activeAccountId === null) {
    return null;
  }

  return accounts.some((account) => account.id === activeAccountId)
    ? activeAccountId
    : accounts[0]?.id ?? null;
}

export function mergePersistedState(
  partial: PersistedStatePatch = {},
  currentState: PersistedState = createEmptyPersistedState()
): PersistedState {
  const currentAccounts = currentState.accounts ?? [];
  const nextAccounts = partial.accounts ?? [];
  const progressByItemId = { ...currentState.progressByItemId };

  for (const [itemId, progress] of Object.entries(partial.progressByItemId ?? {})) {
    if (progress) {
      progressByItemId[itemId] = progress;
    }
  }

  const accounts =
    partial.accounts === undefined ? currentAccounts : mergeAccounts(currentAccounts, nextAccounts);

  const activeAccountId = normalizeActiveAccountId(
    partial.activeAccountId,
    accounts,
    currentState.activeAccountId ?? null
  );

  return attachLegacyFields(
    {
      accounts,
      activeAccountId,
      settings: {
        rememberSession:
          partial.settings?.rememberSession ?? currentState.settings.rememberSession,
        defaultVolume:
          partial.settings?.defaultVolume ?? currentState.settings.defaultVolume,
      },
      progressByItemId,
    },
    pickLegacyServerUrl(accounts, partial.serverUrl ?? currentState.serverUrl),
    pickLegacySession(accounts, activeAccountId, partial.session ?? currentState.session)
  );
}

export function migrateLegacyPersistedState(
  legacy: LegacyPersistedState | PersistedState = createEmptyPersistedState()
): PersistedState {
  if ('accounts' in legacy && Array.isArray(legacy.accounts)) {
    const accounts = legacy.accounts ?? [];

    return mergePersistedState(
      {
        accounts,
        activeAccountId: legacy.activeAccountId,
        settings: legacy.settings,
        progressByItemId: legacy.progressByItemId,
        serverUrl: legacy.serverUrl,
        session: legacy.session,
      },
      createEmptyPersistedState()
    );
  }

  const serverUrl = legacy.serverUrl?.trim() ?? '';
  const session = legacy.session ?? null;

  const accounts: SavedAccount[] =
    serverUrl && session
      ? [
          {
            id: createAccountId(serverUrl, session.userId),
            serverUrl,
            userId: session.userId,
            userName: session.userName,
            accessToken: session.accessToken,
            lastUsedAt: new Date().toISOString(),
          },
        ]
      : [];

  return mergePersistedState(
    {
      accounts,
      activeAccountId: accounts[0]?.id ?? null,
      settings: legacy.settings,
      progressByItemId: legacy.progressByItemId,
      serverUrl: serverUrl,
      session,
    },
    createEmptyPersistedState()
  );
}
