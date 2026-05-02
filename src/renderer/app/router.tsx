import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
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
import { fetchItems, fetchItemsByIds, fetchSearchItems, fetchViews, fetchItemDetails, fetchSimilarItems, fetchSeasons, fetchEpisodes } from '@shared/api/emby/library';
import {
  fetchPlaybackStreamSource,
  reportPlaybackProgress,
  type PlaybackStreamSource,
} from '@shared/api/emby/playback';
import type { LibraryItem, LibraryItemDetails, LibrarySeason, LibraryEpisode } from '@shared/models/library';
import type { PlaybackProgress } from '@shared/models/progress';
import type { SavedAccount } from '@shared/models/session';
import type { LibrarySortMode } from '@shared/models/settings';
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
  type PersistedHomeCacheEntry,
  type PersistedState,
} from '@shared/store/persistence';
import { normalizeServerUrl } from '@shared/utils/normalizeServerUrl';
import { getResumePositionSeconds } from '@shared/utils/playbackProgress';
import { isValidCustomProxyUrl } from '@shared/network/proxy';
import { Layout } from '@renderer/components/Layout';
import { AppTitleBar } from '@renderer/components/AppTitleBar';
import { useAuth } from '@renderer/features/auth/AuthContext';
import { LoginPage } from '@renderer/features/auth/LoginPage';
import { HomePage } from '@renderer/features/home/HomePage';
import {
  createHomeCacheEntry,
  createHomeCacheKey,
  isHomeCacheFresh,
} from '@renderer/features/home/homeCache';
import {
  AggregateViewPage,
  type AggregatePosterItem,
  type AggregatePosterRow,
} from '@renderer/features/home/AggregateViewPage';
import { LibraryItemsPage } from '@renderer/features/library/LibraryItemsPage';
import { PlayerPage } from '@renderer/features/player/PlayerPage';
import { ItemDetailsPage } from '@renderer/features/library/ItemDetailsPage';
import { SettingsPage } from '@renderer/features/settings/SettingsPage';
import type { DanmakuServerSettings, ProxyMode } from '@shared/models/settings';

interface PlayerLocationState {
  title?: string;
  serverPositionTicks?: number | null;
}

interface PlaybackSelection {
  title?: string | null;
  mediaSourceId?: string | null;
  audioStreamIndex?: number | null;
}

const PROGRESS_REPORT_INTERVAL_MS = 5000;

interface HomeRouteData {
  accountLabel: string;
  continueWatching: ReturnType<typeof buildContinueWatchingItems>;
  libraries: HomeLibraryCard[];
  featuredRows: HomePosterRow[];
}

function isCompleteHomeCacheEntry(
  cacheEntry: PersistedHomeCacheEntry | undefined
): cacheEntry is PersistedHomeCacheEntry {
  const cachedAtMs =
    typeof cacheEntry?.cachedAt === 'string' ? Date.parse(cacheEntry.cachedAt) : Number.NaN;

  return Boolean(
    cacheEntry &&
      typeof cacheEntry.accountLabel === 'string' &&
      cacheEntry.accountLabel.trim().length > 0 &&
      Number.isFinite(cachedAtMs) &&
      Array.isArray(cacheEntry.continueWatching) &&
      Array.isArray(cacheEntry.libraries) &&
      Array.isArray(cacheEntry.featuredRows)
  );
}

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
  sidebar,
  title,
}: {
  children: ReactNode;
  sidebar?: ReactNode;
  title?: string;
}) {
  return (
    <Layout sidebar={sidebar} title={title}>
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

function AggregateGate() {
  const { accounts, isHydrated } = useAuth();

  if (!isHydrated) {
    return null;
  }

  return accounts.length > 0 ? <AggregateRoute /> : <Navigate to="/login" replace />;
}

function LibraryItemsGate() {
  const { isHydrated, session } = useAuth();

  if (!isHydrated) {
    return null;
  }

  return session ? <LibraryItemsRoute /> : <Navigate to="/login" replace />;
}

function ItemDetailsGate() {
  const { isHydrated, session } = useAuth();

  if (!isHydrated) {
    return null;
  }

  return session ? <ItemDetailsRoute /> : <Navigate to="/login" replace />;
}

function SettingsGate() {
  const { isHydrated, session } = useAuth();

  if (!isHydrated) {
    return null;
  }

  return session ? <SettingsRoute /> : <Navigate to="/login" replace />;
}

function SearchGate() {
  const { isHydrated, session } = useAuth();

  if (!isHydrated) {
    return null;
  }

  return session ? <SearchRoute /> : <Navigate to="/login" replace />;
}

function ItemDetailsRoute() {
  const { activeAccountId, serverUrl, session } = useAuth();
  const { itemId = '' } = useParams();
  const location = useLocation();

  const [details, setDetails] = useState<LibraryItemDetails | null>(null);
  const [similarItems, setSimilarItems] = useState<LibraryItem[]>([]);
  const [seasons, setSeasons] = useState<LibrarySeason[]>([]);
  const [episodes, setEpisodes] = useState<LibraryEpisode[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const [playbackSource, setPlaybackSource] = useState<PlaybackStreamSource | null>(null);
  const [playbackItemId, setPlaybackItemId] = useState('');
  const [playbackTitle, setPlaybackTitle] = useState('');
  const [initialPositionSeconds, setInitialPositionSeconds] = useState<number | null>(null);
  const [playbackErrorMessage, setPlaybackErrorMessage] = useState('');

  const resolvedActiveAccountId = activeAccountId ?? (session ? createAccountId(serverUrl, session.userId) : null);
  const progressStateRef = useRef<{ lastReportedAtMs: number | null; lastReportedPositionSeconds: number | null }>({ lastReportedAtMs: null, lastReportedPositionSeconds: null });
  const progressSyncQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    progressStateRef.current = { lastReportedAtMs: null, lastReportedPositionSeconds: null };
    progressSyncQueueRef.current = Promise.resolve();
  }, [playbackItemId, resolvedActiveAccountId]);

  useEffect(() => {
    const currentSession = session;
    if (!currentSession || !itemId) return;
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage('');
    
    setPlaybackSource(null);
    setPlaybackItemId('');
    setPlaybackTitle('');
    setPlaybackErrorMessage('');

    async function loadData() {
      try {
        const itemDetails = await fetchItemDetails(serverUrl, currentSession!.userId, itemId, currentSession!.accessToken);
        if (cancelled) return;
        setDetails(itemDetails);

        const similar = await fetchSimilarItems(serverUrl, currentSession!.userId, itemId, currentSession!.accessToken, 8).catch(() => []);
        if (cancelled) return;
        setSimilarItems(similar);

        if (itemDetails.type === 'Series') {
          const seasonsList = await fetchSeasons(serverUrl, currentSession!.userId, itemId, currentSession!.accessToken).catch(() => []);
          if (cancelled) return;
          setSeasons(seasonsList);
          
          if (seasonsList.length > 0) {
            const firstSeason = seasonsList[0].id;
            setSelectedSeasonId(firstSeason);
            const episodesList = await fetchEpisodes(serverUrl, currentSession!.userId, itemId, firstSeason, currentSession!.accessToken).catch(() => []);
            if (cancelled) return;
            setEpisodes(episodesList);
          }
        }
        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          setErrorMessage('Could not load item details.');
          setIsLoading(false);
        }
      }
    }
    void loadData();
    return () => { cancelled = true; };
  }, [itemId, serverUrl, session]);

  useEffect(() => {
    const currentSession = session;
    if (!currentSession || !itemId || !selectedSeasonId || details?.type !== 'Series') return;
    let cancelled = false;
    fetchEpisodes(serverUrl, currentSession!.userId, itemId, selectedSeasonId, currentSession!.accessToken)
      .then(eps => { if (!cancelled) setEpisodes(eps); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedSeasonId, itemId, serverUrl, session, details?.type]);

  async function handlePlay(
    playItemId: string,
    resumeTicks?: number | null,
    selection?: PlaybackSelection
  ) {
    if (!session) return;
    setPlaybackErrorMessage('');
    setPlaybackSource(null);
    setPlaybackItemId(playItemId);
    setPlaybackTitle(selection?.title?.trim() || details?.name || '');

    try {
      const [persistedState, nextSource] = await Promise.all([
        window.embyDesktop.storage.read(),
        fetchPlaybackStreamSource({
          serverUrl,
          userId: session.userId,
          itemId: playItemId,
          accessToken: session.accessToken,
          mediaSourceId: selection?.mediaSourceId,
          audioStreamIndex: selection?.audioStreamIndex,
        })
      ]);
      await window.embyDesktop.player.preflight(nextSource);
      
      const progressByItemId = getPersistedProgressByItemIdForAccount(persistedState.progressByItemId, resolvedActiveAccountId);
      const savedPositionSeconds = progressByItemId[playItemId]?.positionSeconds ?? null;
      
      setInitialPositionSeconds(getResumePositionSeconds({ savedPositionSeconds, serverPositionTicks: resumeTicks === undefined ? null : resumeTicks }));
      setPlaybackSource(nextSource);
    } catch (err) {
      setPlaybackSource(null);
      setPlaybackErrorMessage('Could not prepare desktop playback.');
    }
  }

  async function handleProgress({ itemId: progressItemId, positionSeconds, durationSeconds }: { itemId: string; positionSeconds: number; durationSeconds: number; }) {
    if (!session || progressItemId !== playbackItemId) return;

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
        } catch {}
        try {
          await reportPlaybackProgress({
            serverUrl,
            accessToken: session.accessToken,
            itemId: progressItemId,
            positionSeconds: normalizedPositionSeconds,
          });
        } catch {}
      });

    await progressSyncQueueRef.current;
  }

  if (isLoading) {
    return <AuthenticatedLayout><p>Loading item details...</p></AuthenticatedLayout>;
  }
  if (errorMessage || !details) {
    return <AuthenticatedLayout><p role="alert">{errorMessage || 'Not found'}</p></AuthenticatedLayout>;
  }

  return (
    <AuthenticatedLayout title={details.name}>
      {playbackErrorMessage ? <p role="alert">{playbackErrorMessage}</p> : null}
      
      {session && initialPositionSeconds !== null && playbackSource ? (
        <PlayerPage
          httpHeaders={playbackSource.httpHeaders}
          itemId={playbackItemId}
          title={playbackTitle || details.name}
          streamUrl={playbackSource.streamUrl}
          initialPositionSeconds={initialPositionSeconds}
          onProgress={handleProgress}
        />
      ) : null}

      <ItemDetailsPage
        details={details}
        similarItems={similarItems}
        seasons={seasons}
        episodes={episodes}
        selectedSeasonId={selectedSeasonId}
        onSelectSeason={setSelectedSeasonId}
        onPlay={handlePlay}
      />
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
    <div className="desktop-shell">
      <AppTitleBar title="Taluxa" />
      <main className="app-layout app-layout--no-sidebar">
        <section className="app-main">
          <LoginPage onSubmit={handleSubmit} hasRememberedAccounts={accounts.length > 0} />
          {errorMessage ? <p role="alert">{errorMessage}</p> : null}
        </section>
      </main>
    </div>
  );
}

function LibrariesRoute() {
  const { activeAccountId, getServerDisplayName, serverUrl, session, settings, updateSettings } = useAuth();
  const sessionUserId = session?.userId ?? null;
  const sessionAccessToken = session?.accessToken ?? null;
  const [continueWatching, setContinueWatching] = useState<
    ReturnType<typeof buildContinueWatchingItems>
  >([]);
  const [libraries, setLibraries] = useState<HomeLibraryCard[]>([]);
  const [featuredRows, setFeaturedRows] = useState<HomePosterRow[]>([]);
  const [homeAccountLabel, setHomeAccountLabel] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [hasRenderedHomeSnapshot, setHasRenderedHomeSnapshot] = useState(false);
  const resolvedActiveAccountId =
    activeAccountId ?? (sessionUserId ? createAccountId(serverUrl, sessionUserId) : null);
  const currentHomeAccountLabel = getServerDisplayName(serverUrl);
  const currentHomeAccountLabelRef = useRef(currentHomeAccountLabel);
  currentHomeAccountLabelRef.current = currentHomeAccountLabel;

  async function handleSortModeChange(nextSortMode: LibrarySortMode) {
    if (nextSortMode === settings.librarySortMode) {
      return;
    }

    try {
      await window.embyDesktop.storage.write({
        settings: {
          librarySortMode: nextSortMode,
        },
      });
      updateSettings({
        librarySortMode: nextSortMode,
      });
    } catch {
      // Keeping the current sort mode is safer than diverging UI and persisted state.
    }
  }

  useEffect(() => {
    const currentUserId = sessionUserId;
    const currentAccessToken = sessionAccessToken;

    if (!currentUserId || !currentAccessToken) {
      setContinueWatching([]);
      setLibraries([]);
      setFeaturedRows([]);
      setHomeAccountLabel('');
      setHasRenderedHomeSnapshot(false);
      setIsLoading(false);
      return;
    }
    const userId = currentUserId;
    const accessToken = currentAccessToken;

    let cancelled = false;

    setIsLoading(true);
    setErrorMessage('');
    setHasRenderedHomeSnapshot(false);

    async function refreshHomeData(persistedState: PersistedState): Promise<HomeRouteData> {
      const nextViews = await fetchViews(serverUrl, userId, accessToken);
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
        fetchItemsByIds(serverUrl, userId, continueWatchingIds, accessToken),
        Promise.all(
          nextViews.map(
            async (view): Promise<[string, LibraryItem[]]> => [
              view.id,
              await fetchItems(serverUrl, userId, view.id, accessToken, {
                limit: 8,
                sortMode: settings.librarySortMode,
              }),
            ]
          )
        ),
      ]);
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

      return {
        accountLabel: currentHomeAccountLabelRef.current,
        continueWatching: buildContinueWatchingItems({
          progressByItemId,
          itemsById,
        }),
        libraries: nextViews.map((view) => ({
          id: view.id,
          title: view.name,
          posterUrl: previewItemsByViewId.get(view.id)?.[0]?.posterUrl ?? '',
          imageCandidates: previewItemsByViewId.get(view.id)?.[0]?.imageCandidates ?? [],
          href: `/libraries/${view.id}`,
          state: {
            libraryName: view.name,
          },
        })),
        featuredRows: featuredViews.map((view) => ({
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
            imageCandidates: item.imageCandidates,
            href: `/item/${item.id}`,
            state: {
              title: item.name,
              serverPositionTicks: item.serverPositionTicks,
            },
          })),
        })),
      };
    }

    function renderHomeData(nextHomeData: HomeRouteData) {
      setHomeAccountLabel(nextHomeData.accountLabel);
      setContinueWatching(nextHomeData.continueWatching);
      setLibraries(nextHomeData.libraries);
      setFeaturedRows(nextHomeData.featuredRows);
      setHasRenderedHomeSnapshot(true);
      setIsLoading(false);
    }

    async function loadHomeData() {
      let renderedCache = false;

      try {
        const persistedState = await window.embyDesktop.storage.read();

        if (cancelled) {
          return;
        }

        const cacheKey = resolvedActiveAccountId
          ? createHomeCacheKey(resolvedActiveAccountId, settings.librarySortMode)
          : null;
        const cacheEntry = cacheKey ? persistedState.homeCacheByKey?.[cacheKey] : undefined;
        const hasCompleteCacheEntry = isCompleteHomeCacheEntry(cacheEntry);

        if (cacheEntry) {
          renderHomeData({
            accountLabel: cacheEntry.accountLabel,
            continueWatching: Array.isArray(cacheEntry.continueWatching)
              ? cacheEntry.continueWatching
              : [],
            libraries: Array.isArray(cacheEntry.libraries) ? cacheEntry.libraries : [],
            featuredRows: Array.isArray(cacheEntry.featuredRows) ? cacheEntry.featuredRows : [],
          });
          renderedCache = true;
        }

        if (
          cacheEntry &&
          hasCompleteCacheEntry &&
          isHomeCacheFresh(cacheEntry.cachedAt)
        ) {
          return;
        }

        const nextHomeData = await refreshHomeData(persistedState);

        if (cancelled) {
          return;
        }

        renderHomeData(nextHomeData);
        setErrorMessage('');

        if (cacheKey) {
          const nextEntry = createHomeCacheEntry({
            accountLabel: nextHomeData.accountLabel,
            continueWatching: nextHomeData.continueWatching,
            libraries: nextHomeData.libraries,
            featuredRows: nextHomeData.featuredRows,
            now: Date.now(),
          });

          void Promise.resolve()
            .then(() =>
              window.embyDesktop.storage.write({
                homeCacheByKey: {
                  [cacheKey]: nextEntry,
                },
              })
            )
            .catch(() => undefined);
        }
      } catch {
        if (cancelled) {
          return;
        }

        if (renderedCache) {
          setErrorMessage('Could not refresh home data. Showing saved content.');
          setIsLoading(false);
          return;
        }

        setContinueWatching([]);
        setLibraries([]);
        setFeaturedRows([]);
        setHomeAccountLabel('');
        setHasRenderedHomeSnapshot(false);
        setErrorMessage('Could not load this account. Check the server and try again.');
        setIsLoading(false);
      }
    }

    void loadHomeData();

    return () => {
      cancelled = true;
    };
  }, [
    resolvedActiveAccountId,
    serverUrl,
    sessionAccessToken,
    sessionUserId,
    settings.librarySortMode,
  ]);

  const shouldShowHomePage = !isLoading && (!errorMessage || hasRenderedHomeSnapshot);
  const displayHomeAccountLabel =
    currentHomeAccountLabel !== serverUrl
      ? currentHomeAccountLabel
      : homeAccountLabel || currentHomeAccountLabel;

  return (
    <AuthenticatedLayout>
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      {isLoading ? (
        <p>Loading home screen...</p>
      ) : shouldShowHomePage ? (
        <HomePage
          accountLabel={displayHomeAccountLabel}
          continueWatching={continueWatching}
          libraries={libraries}
          featuredRows={featuredRows}
          sortMode={settings.librarySortMode}
          onSortModeChange={handleSortModeChange}
        />
      ) : null}
    </AuthenticatedLayout>
  );
}

function LibraryItemsRoute() {
  const { serverUrl, session, settings, updateSettings } = useAuth();
  const { viewId = '' } = useParams();
  const location = useLocation();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const libraryName =
    (location.state as { libraryName?: string } | null | undefined)?.libraryName ?? 'Library';

  async function handleSortModeChange(nextSortMode: LibrarySortMode) {
    if (nextSortMode === settings.librarySortMode) {
      return;
    }

    try {
      await window.embyDesktop.storage.write({
        settings: {
          librarySortMode: nextSortMode,
        },
      });
      updateSettings({
        librarySortMode: nextSortMode,
      });
    } catch {
      // Keeping the current sort mode is safer than diverging UI and persisted state.
    }
  }

  useEffect(() => {
    if (!session || !viewId) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    setIsLoading(true);
    setErrorMessage('');

    fetchItems(serverUrl, session.userId, viewId, session.accessToken, {
      sortMode: settings.librarySortMode,
    })
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
  }, [serverUrl, session, settings.librarySortMode, viewId]);

  return (
    <AuthenticatedLayout title={libraryName}>
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      {isLoading ? (
        <p>Loading items...</p>
      ) : (
        <LibraryItemsPage
          libraryName={libraryName}
          sortMode={settings.librarySortMode}
          onSortModeChange={handleSortModeChange}
          items={items}
        />
      )}
    </AuthenticatedLayout>
  );
}

interface LoadedAggregatePosterRow extends AggregatePosterRow {
  serverUrl: string;
}

function AggregateRoute() {
  const { accounts, activeAccountId, getServerDisplayName, setActiveAccountId } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<LoadedAggregatePosterRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (accounts.length === 0) {
      setRows([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    setIsLoading(true);
    setErrorMessage('');

    window.embyDesktop.storage
      .read()
      .then(async (persistedState) => {
        const nextRows = await Promise.all(
          accounts.map(async (account): Promise<LoadedAggregatePosterRow> => {
            const progressByItemId = getPersistedProgressByItemIdForAccount(
              persistedState.progressByItemId,
              account.id
            );
            const continueWatchingIds = Object.values(progressByItemId)
              .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
              .slice(0, 8)
              .map((progress) => progress.itemId);

            const continueWatchingItems =
              continueWatchingIds.length > 0
                ? await fetchItemsByIds(
                    account.serverUrl,
                    account.userId,
                    continueWatchingIds,
                    account.accessToken
                  ).catch(() => [])
                : [];
            const itemsById: Record<string, LibraryItem> = {};

            for (const item of continueWatchingItems) {
              itemsById[item.id] = item;
            }

            return {
              id: account.id,
              serverUrl: account.serverUrl,
              title: account.serverUrl,
              items: buildContinueWatchingItems({
                progressByItemId,
                itemsById,
              }).map((item): AggregatePosterItem => ({
                ...item,
                accountId: account.id,
              })),
            };
          })
        );

        if (!cancelled) {
          setRows(nextRows);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setErrorMessage('Could not load aggregate view. Check your saved servers and try again.');
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accounts]);

  async function handleOpenItem(
    item: AggregatePosterItem,
    event: MouseEvent<HTMLAnchorElement>
  ) {
    event.preventDefault();

    if (item.accountId !== activeAccountId) {
      try {
        await window.embyDesktop.storage.write({
          activeAccountId: item.accountId,
        });
      } catch {
        // Persisting the selection is best-effort; the in-memory account switch is enough to open.
      }

      setActiveAccountId(item.accountId);
    }

    navigate(item.href, { state: item.state });
  }

  const displayRows = rows.map((row) => ({
    ...row,
    title: getServerDisplayName(row.serverUrl),
  }));

  return (
    <AuthenticatedLayout title="聚合视界">
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      {isLoading ? (
        <p>Loading aggregate view...</p>
      ) : !errorMessage ? (
        <AggregateViewPage rows={displayRows} onOpenItem={handleOpenItem} />
      ) : null}
    </AuthenticatedLayout>
  );
}

function SearchRoute() {
  const { serverUrl, session, settings } = useAuth();
  const location = useLocation();
  const query = new URLSearchParams(location.search).get('q')?.trim() ?? '';
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!session || !query) {
      setItems([]);
      setIsLoading(false);
      setErrorMessage('');
      return;
    }

    let cancelled = false;

    setIsLoading(true);
    setErrorMessage('');

    fetchSearchItems(serverUrl, session.userId, query, session.accessToken)
      .then((nextItems) => {
        if (!cancelled) {
          setItems(nextItems);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setErrorMessage('搜索失败，请稍后再试。');
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [query, serverUrl, session]);

  return (
    <AuthenticatedLayout title="搜索">
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      {!query ? <p className="search-empty">请输入关键词开始搜索。</p> : null}
      {query && isLoading ? <p>正在搜索...</p> : null}
      {query && !isLoading && !errorMessage ? (
        <LibraryItemsPage
          libraryName={`搜索：${query}`}
          sortMode={settings.librarySortMode}
          onSortModeChange={() => undefined}
          items={items}
        />
      ) : null}
    </AuthenticatedLayout>
  );
}

function SettingsRoute() {
  const navigate = useNavigate();
  const { clearAuthState, serverUrl, session, settings, updateSettings } = useAuth();

  async function handleLogout() {
    await window.embyDesktop.storage.clearSession();
    clearAuthState();
    navigate('/login');
  }

  async function handleProxySettingsSave(next: {
    mode: ProxyMode;
    customProxyUrl: string;
  }) {
    if (next.mode === 'custom' && !isValidCustomProxyUrl(next.customProxyUrl)) {
      throw new Error('invalid proxy');
    }

    const settingsPatch = {
      proxy: {
        mode: next.mode,
        customProxyUrl: next.customProxyUrl,
      },
    };

    await window.embyDesktop.storage.write({
      settings: settingsPatch,
    });
    updateSettings(settingsPatch);
  }

  async function handleDanmakuServersSave(next: DanmakuServerSettings[]) {
    for (const server of next) {
      if (!isValidCustomProxyUrl(server.url)) {
        throw new Error('invalid danmaku server');
      }
    }

    const settingsPatch = {
      danmakuServers: next,
    };

    await window.embyDesktop.storage.write({
      settings: settingsPatch,
    });
    updateSettings(settingsPatch);
  }

  return (
    <SettingsPage
      userName={session?.userName ?? 'Unknown user'}
      serverUrl={serverUrl}
      defaultVolume={settings.defaultVolume}
      proxyMode={settings.proxy.mode}
      customProxyUrl={settings.proxy.customProxyUrl}
      danmakuServers={settings.danmakuServers}
      onDanmakuServersSave={handleDanmakuServersSave}
      onProxySettingsSave={handleProxySettingsSave}
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
      <Route path="/aggregate" element={<AggregateGate />} />
      <Route path="/libraries/:viewId" element={<LibraryItemsGate />} />
      <Route path="/search" element={<SearchGate />} />
      <Route path="/item/:itemId" element={<ItemDetailsGate />} />
      <Route path="/settings" element={<SettingsGate />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
