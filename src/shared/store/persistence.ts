import type { PlaybackProgress } from '@shared/models/progress';
import type { SavedAccount, Session } from '@shared/models/session';
import type { Settings } from '@shared/models/settings';

export interface PersistedState {
  accounts: SavedAccount[];
  activeAccountId: string | null;
  settings: Settings;
  progressByItemId: Record<string, PlaybackProgress>;
}

const ACCOUNT_SCOPED_PROGRESS_PREFIX = 'account-progress::';

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

export function createAccountScopedProgressKey(accountId: string, itemId: string): string {
  return `${ACCOUNT_SCOPED_PROGRESS_PREFIX}${accountId}::${itemId}`;
}

function isAccountScopedProgressKey(key: string): boolean {
  return key.startsWith(ACCOUNT_SCOPED_PROGRESS_PREFIX);
}

function createScopedProgressPatch(
  progressByItemId: Partial<Record<string, PlaybackProgress>>,
  activeAccountId: string | null
): Partial<Record<string, PlaybackProgress>> {
  const nextProgressByItemId: Partial<Record<string, PlaybackProgress>> = {};

  for (const [itemId, progress] of Object.entries(progressByItemId)) {
    if (!progress) {
      continue;
    }

    nextProgressByItemId[
      activeAccountId && !isAccountScopedProgressKey(itemId)
        ? createAccountScopedProgressKey(activeAccountId, itemId)
        : itemId
    ] = progress;
  }

  return nextProgressByItemId;
}

export function getPersistedProgressByItemIdForAccount(
  progressByItemId: Record<string, PlaybackProgress>,
  activeAccountId: string | null
): Record<string, PlaybackProgress> {
  const scopedProgressByItemId: Record<string, PlaybackProgress> = {};
  const legacyProgressByItemId: Record<string, PlaybackProgress> = {};
  const scopedPrefix = activeAccountId
    ? `${ACCOUNT_SCOPED_PROGRESS_PREFIX}${activeAccountId}::`
    : null;

  for (const [key, progress] of Object.entries(progressByItemId)) {
    if (scopedPrefix && key.startsWith(scopedPrefix)) {
      scopedProgressByItemId[key.slice(scopedPrefix.length)] = progress;
      continue;
    }

    if (!isAccountScopedProgressKey(key)) {
      legacyProgressByItemId[key] = progress;
    }
  }

  return {
    ...legacyProgressByItemId,
    ...scopedProgressByItemId,
  };
}

export function createEmptyPersistedState(): PersistedState {
  return {
    accounts: [],
    activeAccountId: null,
    settings: {
      rememberSession: true,
      defaultVolume: 1,
      librarySortMode: 'latest_added',
      serverPreferencesByUrl: {},
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

function mergeSettings(
  currentSettings: Settings,
  nextSettings: Partial<Settings> | undefined
): Settings {
  return {
    rememberSession: nextSettings?.rememberSession ?? currentSettings.rememberSession,
    defaultVolume: nextSettings?.defaultVolume ?? currentSettings.defaultVolume,
    librarySortMode: nextSettings?.librarySortMode ?? currentSettings.librarySortMode,
    serverPreferencesByUrl: {
      ...currentSettings.serverPreferencesByUrl,
      ...nextSettings?.serverPreferencesByUrl,
    },
  };
}

export function mergePersistedState(
  partial: PersistedStatePatch = {},
  currentState: PersistedState = createEmptyPersistedState()
): PersistedState {
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

  const activeAccountId = normalizeActiveAccountId(
    partial.activeAccountId,
    accounts,
    fallbackActiveAccountId
  );
  const progressByItemId = { ...currentState.progressByItemId };

  for (const [itemId, progress] of Object.entries(
    createScopedProgressPatch(partial.progressByItemId ?? {}, activeAccountId)
  )) {
    if (progress) {
      progressByItemId[itemId] = progress;
    }
  }

  return {
    accounts,
    activeAccountId,
    settings: mergeSettings(currentState.settings, partial.settings),
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
