import type { PlaybackProgress } from '@shared/models/progress';
import type { SavedAccount, Session } from '@shared/models/session';
import type { Settings } from '@shared/models/settings';

export interface PersistedState {
  accounts: SavedAccount[];
  activeAccountId: string | null;
  settings: Settings;
  progressByItemId: Record<string, PlaybackProgress>;
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
  serverUrl?: string;
  session?: Session | null;
};

export function createAccountId(serverUrl: string, userId: string): string {
  return `${serverUrl}::${userId}`;
}

export function createEmptyPersistedState(): PersistedState {
  return {
    accounts: [],
    activeAccountId: null,
    settings: {
      rememberSession: true,
      defaultVolume: 1,
    },
    progressByItemId: {},
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

function createSavedAccountFromLegacyPatch(
  serverUrl: string | undefined,
  session: Session | null | undefined
): SavedAccount | null {
  const normalizedServerUrl = serverUrl?.trim() ?? '';

  if (!normalizedServerUrl || !session) {
    return null;
  }

  return {
    id: createAccountId(normalizedServerUrl, session.userId),
    serverUrl: normalizedServerUrl,
    userId: session.userId,
    userName: session.userName,
    accessToken: session.accessToken,
    lastUsedAt: new Date().toISOString(),
  };
}

export function mergePersistedState(
  partial: PersistedStatePatch = {},
  currentState: PersistedState = createEmptyPersistedState()
): PersistedState {
  const progressByItemId = { ...currentState.progressByItemId };

  for (const [itemId, progress] of Object.entries(partial.progressByItemId ?? {})) {
    if (progress) {
      progressByItemId[itemId] = progress;
    }
  }

  let accounts =
    partial.accounts === undefined
      ? currentState.accounts
      : mergeAccounts(currentState.accounts, partial.accounts);
  let fallbackActiveAccountId = currentState.activeAccountId;

  const legacyAccount = createSavedAccountFromLegacyPatch(partial.serverUrl, partial.session);

  if (legacyAccount) {
    accounts = mergeAccounts(accounts, [legacyAccount]);
    fallbackActiveAccountId = legacyAccount.id;
  } else if (partial.session === null && partial.activeAccountId === undefined) {
    fallbackActiveAccountId = null;
  }

  return {
    accounts,
    activeAccountId: normalizeActiveAccountId(
      partial.activeAccountId,
      accounts,
      fallbackActiveAccountId
    ),
    settings: {
      rememberSession:
        partial.settings?.rememberSession ?? currentState.settings.rememberSession,
      defaultVolume: partial.settings?.defaultVolume ?? currentState.settings.defaultVolume,
    },
    progressByItemId,
  };
}

export function migrateLegacyPersistedState(
  legacy: LegacyPersistedState | PersistedState = createEmptyPersistedState()
): PersistedState {
  return mergePersistedState(
    {
      accounts: Array.isArray(legacy.accounts) ? legacy.accounts : undefined,
      activeAccountId: legacy.activeAccountId,
      settings: legacy.settings,
      progressByItemId: legacy.progressByItemId,
      serverUrl: 'serverUrl' in legacy ? legacy.serverUrl : undefined,
      session: 'session' in legacy ? legacy.session : undefined,
    },
    createEmptyPersistedState()
  );
}
