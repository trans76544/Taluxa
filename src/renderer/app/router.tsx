import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { login } from '@shared/api/emby/auth';
import { fetchItems, fetchItemsByIds, fetchViews } from '@shared/api/emby/library';
import { buildStreamUrl, reportPlaybackProgress } from '@shared/api/emby/playback';
import type { LibraryItem } from '@shared/models/library';
import type { PlaybackProgress } from '@shared/models/progress';
import type { SavedAccount } from '@shared/models/session';
import {
  buildContinueWatchingItems,
  pickFeaturedViews,
  type HomeLibraryCard,
  type HomePosterRow,
} from '@shared/api/emby/home';
import {
  createAccountId,
  createAccountScopedProgressKey,
  getPersistedProgressByItemIdForAccount,
} from '@shared/store/persistence';
import { normalizeServerUrl } from '@shared/utils/normalizeServerUrl';
import { getResumePositionSeconds } from '@shared/utils/playbackProgress';
import { Layout } from '@renderer/components/Layout';
import { useAuth } from '@renderer/features/auth/AuthContext';
import { LoginPage } from '@renderer/features/auth/LoginPage';
import { HomePage } from '@renderer/features/home/HomePage';
import { LibraryItemsPage } from '@renderer/features/library/LibraryItemsPage';
import { PlayerPage } from '@renderer/features/player/PlayerPage';
import { SettingsPage } from '@renderer/features/settings/SettingsPage';

interface PlayerLocationState {
  title?: string;
  serverPositionTicks?: number | null;
}

const PROGRESS_REPORT_INTERVAL_MS = 5000;

function mergeSavedAccounts(currentAccounts: SavedAccount[], nextAccount: SavedAccount) {
  const accountsById = new Map<string, SavedAccount>();

  for (const account of currentAccounts) {
    accountsById.set(account.id, account);
  }

  accountsById.set(nextAccount.id, nextAccount);

  return Array.from(accountsById.values());
}

function AuthenticatedLayout({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <Layout title={title}>
      {children}
    </Layout>
  );
}

function HomeGate() {
  const { isHydrated, session } = useAuth();

  if (!isHydrated) {
    return null;
  }

  return <Navigate to={session ? '/libraries' : '/login'} replace />;
}

function LibrariesGate() {
  const { isHydrated, session } = useAuth();

  if (!isHydrated) {
    return null;
  }

  return session ? <LibrariesRoute /> : <Navigate to="/login" replace />;
}

function LibraryItemsGate() {
  const { isHydrated, session } = useAuth();

  if (!isHydrated) {
    return null;
  }

  return session ? <LibraryItemsRoute /> : <Navigate to="/login" replace />;
}

function PlayerGate() {
  const { isHydrated, session } = useAuth();

  if (!isHydrated) {
    return null;
  }

  return session ? <PlayerRoute /> : <Navigate to="/login" replace />;
}

function SettingsGate() {
  const { isHydrated, session } = useAuth();

  if (!isHydrated) {
    return null;
  }

  return session ? <SettingsRoute /> : <Navigate to="/login" replace />;
}

function PlayerRoute() {
  const { activeAccountId, serverUrl, session } = useAuth();
  const { itemId = '' } = useParams();
  const location = useLocation();
  const [initialPositionSeconds, setInitialPositionSeconds] = useState<number | null>(null);
  const playerState = location.state as PlayerLocationState | null | undefined;
  const title = playerState?.title?.trim() || itemId || 'Playback';
  const resolvedActiveAccountId =
    activeAccountId ?? (session ? createAccountId(serverUrl, session.userId) : null);
  const progressStateRef = useRef<{
    lastReportedAtMs: number | null;
    lastReportedPositionSeconds: number | null;
  }>({
    lastReportedAtMs: null,
    lastReportedPositionSeconds: null,
  });
  const progressSyncQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    progressStateRef.current = {
      lastReportedAtMs: null,
      lastReportedPositionSeconds: null,
    };
    progressSyncQueueRef.current = Promise.resolve();
  }, [itemId, resolvedActiveAccountId]);

  useEffect(() => {
    if (!itemId) {
      setInitialPositionSeconds(0);
      return;
    }

    let cancelled = false;

    setInitialPositionSeconds(null);

    window.embyDesktop.storage
      .read()
      .then((persistedState) => {
        if (cancelled) {
          return;
        }

        const progressByItemId = getPersistedProgressByItemIdForAccount(
          persistedState.progressByItemId,
          resolvedActiveAccountId
        );
        const savedPositionSeconds =
          progressByItemId[itemId]?.positionSeconds ?? null;
        const serverPositionTicks =
          typeof playerState?.serverPositionTicks === 'number'
            ? playerState.serverPositionTicks
            : null;

        setInitialPositionSeconds(
          getResumePositionSeconds({
            savedPositionSeconds,
            serverPositionTicks,
          })
        );
      })
      .catch(() => {
        if (!cancelled) {
          setInitialPositionSeconds(0);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [itemId, playerState?.serverPositionTicks, resolvedActiveAccountId]);

  async function handleProgress({
    itemId: progressItemId,
    positionSeconds,
    durationSeconds,
  }: {
    itemId: string;
    positionSeconds: number;
    durationSeconds: number;
  }) {
    if (!session || progressItemId !== itemId) {
      return;
    }

    const normalizedPositionSeconds = Math.max(0, Math.floor(positionSeconds));
    const normalizedDurationSeconds = Math.max(0, Math.floor(durationSeconds));
    const nowMs = Date.now();
    const { lastReportedAtMs, lastReportedPositionSeconds } = progressStateRef.current;

    if (
      lastReportedPositionSeconds === normalizedPositionSeconds ||
      (lastReportedAtMs !== null && nowMs - lastReportedAtMs < PROGRESS_REPORT_INTERVAL_MS)
    ) {
      return;
    }

    progressStateRef.current = {
      lastReportedAtMs: nowMs,
      lastReportedPositionSeconds: normalizedPositionSeconds,
    };

    const nextProgress: PlaybackProgress = {
      itemId: progressItemId,
      positionSeconds: normalizedPositionSeconds,
      durationSeconds: normalizedDurationSeconds,
      updatedAt: new Date().toISOString(),
    };

    progressSyncQueueRef.current = progressSyncQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await window.embyDesktop.storage.write({
            progressByItemId: {
              [resolvedActiveAccountId
                ? createAccountScopedProgressKey(resolvedActiveAccountId, progressItemId)
                : progressItemId]: nextProgress,
            },
          });
        } catch {
          // Persisting progress is best-effort.
        }

        try {
          await reportPlaybackProgress({
            serverUrl,
            accessToken: session.accessToken,
            itemId: progressItemId,
            positionSeconds: normalizedPositionSeconds,
          });
        } catch {
          // Reporting progress is best-effort.
        }
      });

    await progressSyncQueueRef.current;
  }

  return (
    <AuthenticatedLayout title={title}>
      {session && initialPositionSeconds !== null ? (
        <PlayerPage
          itemId={itemId}
          title={title}
          streamUrl={buildStreamUrl(serverUrl, itemId, session.accessToken)}
          initialPositionSeconds={initialPositionSeconds}
          onProgress={handleProgress}
        />
      ) : null}
      <p>
        <Link to="/libraries">Back to libraries</Link>
      </p>
    </AuthenticatedLayout>
  );
}

function LoginRoute() {
  const navigate = useNavigate();
  const { accounts, upsertAccount } = useAuth();
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit({
    serverUrl,
    userName,
    password,
  }: {
    serverUrl: string;
    userName: string;
    password: string;
  }) {
    try {
      const storageBridge = window.embyDesktop?.storage;

      if (!storageBridge?.write) {
        setErrorMessage('Desktop integration is unavailable. Restart the app and try again.');
        return;
      }

      const normalizedServerUrl = normalizeServerUrl(serverUrl);
      const session = await login({
        serverUrl: normalizedServerUrl,
        userName,
        password,
      });
      const accountId = createAccountId(normalizedServerUrl, session.userId);
      const savedAccount: SavedAccount = {
        id: accountId,
        serverUrl: normalizedServerUrl,
        userId: session.userId,
        userName: session.userName,
        accessToken: session.accessToken,
        lastUsedAt: new Date().toISOString(),
      };

      const nextState = {
        accounts: mergeSavedAccounts(accounts, savedAccount),
        activeAccountId: accountId,
      };

      try {
        await storageBridge.write(nextState);
      } catch {
        setErrorMessage('Could not save your session. Try again.');
        return;
      }

      upsertAccount(savedAccount);
      setErrorMessage('');
      navigate('/libraries');
    } catch {
      setErrorMessage('Sign in failed. Check your server URL and credentials.');
    }
  }

  return (
    <>
      <LoginPage onSubmit={handleSubmit} hasRememberedAccounts={accounts.length > 0} />
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
    </>
  );
}

function LibrariesRoute() {
  const { activeAccountId, serverUrl, session } = useAuth();
  const [continueWatching, setContinueWatching] = useState<
    ReturnType<typeof buildContinueWatchingItems>
  >([]);
  const [libraries, setLibraries] = useState<HomeLibraryCard[]>([]);
  const [featuredRows, setFeaturedRows] = useState<HomePosterRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const resolvedActiveAccountId =
    activeAccountId ?? (session ? createAccountId(serverUrl, session.userId) : null);

  useEffect(() => {
    if (!session) {
      setContinueWatching([]);
      setLibraries([]);
      setFeaturedRows([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    setIsLoading(true);
    setErrorMessage('');

    Promise.all([
      window.embyDesktop.storage.read(),
      fetchViews(serverUrl, session.userId, session.accessToken),
    ])
      .then(async ([persistedState, nextViews]) => {
        if (!cancelled) {
          const progressByItemId = getPersistedProgressByItemIdForAccount(
            persistedState.progressByItemId,
            resolvedActiveAccountId
          );
          const featuredViews = pickFeaturedViews(nextViews);
          const continueWatchingIds = Object.values(progressByItemId)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
            .slice(0, 8)
            .map((progress) => progress.itemId);
          const [continueWatchingItems, previewEntries] = await Promise.all([
            fetchItemsByIds(serverUrl, session.userId, continueWatchingIds, session.accessToken),
            Promise.all(
              featuredViews.map(
                async (view): Promise<[string, LibraryItem[]]> => [
                  view.id,
                  await fetchItems(serverUrl, session.userId, view.id, session.accessToken, {
                    limit: 8,
                  }),
                ]
              )
            ),
          ]);

          if (cancelled) {
            return;
          }

          const previewItemsByViewId = new Map(
            previewEntries.map(([viewId, items]) => [viewId, items.slice(0, 8)])
          );
          const itemsById: Record<string, LibraryItem> = {};

          for (const items of previewItemsByViewId.values()) {
            for (const item of items) {
              itemsById[item.id] = item;
            }
          }

          for (const item of continueWatchingItems) {
            itemsById[item.id] = item;
          }

          setContinueWatching(
            buildContinueWatchingItems({
              progressByItemId,
              itemsById,
            })
          );
          setLibraries(
            nextViews.map((view) => ({
              id: view.id,
              title: view.name,
              posterUrl: previewItemsByViewId.get(view.id)?.[0]?.posterUrl ?? '',
              href: `/libraries/${view.id}`,
              state: {
                libraryName: view.name,
              },
            }))
          );
          setFeaturedRows(
            featuredViews.map((view) => ({
              id: view.id,
              title: view.name,
              href: `/libraries/${view.id}`,
              state: {
                libraryName: view.name,
              },
              items: (previewItemsByViewId.get(view.id) ?? []).map((item: LibraryItem) => ({
                id: item.id,
                title: item.name,
                subtitle:
                  typeof item.runtimeTicks === 'number' && item.runtimeTicks > 0
                    ? `${Math.round(item.runtimeTicks / 600000000)} min`
                    : 'Ready to play',
                posterUrl: item.posterUrl,
                href: `/player/${item.id}`,
                state: {
                  title: item.name,
                  serverPositionTicks: item.serverPositionTicks,
                },
              })),
            }))
          );
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setContinueWatching([]);
          setLibraries([]);
          setFeaturedRows([]);
          setErrorMessage('Could not load this account. Check the server and try again.');
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedActiveAccountId, serverUrl, session]);

  return (
    <AuthenticatedLayout>
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      {isLoading ? (
        <p>Loading home screen...</p>
      ) : !errorMessage ? (
        <HomePage
          accountLabel={`${serverUrl} / ${session?.userName ?? 'Unknown user'}`}
          continueWatching={continueWatching}
          libraries={libraries}
          featuredRows={featuredRows}
        />
      ) : null}
    </AuthenticatedLayout>
  );
}

function LibraryItemsRoute() {
  const { serverUrl, session } = useAuth();
  const { viewId = '' } = useParams();
  const location = useLocation();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const libraryName =
    (location.state as { libraryName?: string } | null | undefined)?.libraryName ?? 'Library';

  useEffect(() => {
    if (!session || !viewId) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    setIsLoading(true);
    setErrorMessage('');

    fetchItems(serverUrl, session.userId, viewId, session.accessToken)
      .then((nextItems) => {
        if (!cancelled) {
          setItems(nextItems);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage('Could not load this library.');
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [serverUrl, session, viewId]);

  return (
    <AuthenticatedLayout title={libraryName}>
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      {isLoading ? (
        <p>Loading items...</p>
      ) : (
        <LibraryItemsPage libraryName={libraryName} items={items} />
      )}
    </AuthenticatedLayout>
  );
}

function SettingsRoute() {
  const navigate = useNavigate();
  const { clearAuthState, serverUrl, session, settings } = useAuth();

  async function handleLogout() {
    await window.embyDesktop.storage.clearSession();
    clearAuthState();
    navigate('/login');
  }

  return (
    <SettingsPage
      userName={session?.userName ?? 'Unknown user'}
      serverUrl={serverUrl}
      defaultVolume={settings.defaultVolume}
      onLogout={handleLogout}
    />
  );
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomeGate />} />
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/libraries" element={<LibrariesGate />} />
      <Route path="/libraries/:viewId" element={<LibraryItemsGate />} />
      <Route path="/player/:itemId" element={<PlayerGate />} />
      <Route path="/settings" element={<SettingsGate />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
