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
  addFavoriteItem,
  buildDirectPlaybackStreamSource,
  fetchPlaybackStreamSource,
  hideItemFromContinueWatching,
  markItemPlayed,
  reportPlaybackProgress,
  type PlaybackStreamSource,
} from '@shared/api/emby/playback';
import type {
  LibraryItem,
  LibraryItemDetails,
  LibraryItemMediaSource,
  LibrarySeason,
  LibraryEpisode,
} from '@shared/models/library';
import type { PlaybackProgress } from '@shared/models/progress';
import type { SavedAccount } from '@shared/models/session';
import type {
  CacheSettings,
  DanmakuSettings,
  ImageCacheResolution,
  LibrarySortMode,
  PlaybackSettings,
  SubtitleSettings,
} from '@shared/models/settings';
import {
  buildContinueWatchingItems,
  dedupeContinueWatchingPosterItems,
  pickFeaturedViews,
  type HomeLibraryCard,
  type HomePosterItem,
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

type PlayerEpisodeSelector = NonNullable<
  Parameters<Window['embyDesktop']['player']['launch']>[0]['episodeSelector']
>;

interface ItemRouteState {
  title?: string;
  serverPositionTicks?: number | null;
  resumeEpisodeId?: string;
  resumeSeasonId?: string;
  resumeSeasonIndex?: number;
}

const PROGRESS_REPORT_INTERVAL_MS = 5000;
const PLAYBACK_PREFLIGHT_FAST_TIMEOUT_MS = 1500;

async function waitForFastPlaybackPreflight(source: PlaybackStreamSource): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const preflightPromise = window.embyDesktop.player.preflight(source);
  preflightPromise.catch(() => undefined);

  try {
    const result = await Promise.race([
      preflightPromise.then(() => 'completed' as const),
      new Promise<'timed-out'>((resolve) => {
        timeoutId = setTimeout(resolve, PLAYBACK_PREFLIGHT_FAST_TIMEOUT_MS, 'timed-out');
      }),
    ]);

    if (result === 'timed-out') {
      return;
    }
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

function getJsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function pickPlaybackMediaSource(
  mediaSources: LibraryItemMediaSource[],
  preferredMediaSourceId?: string | null
): LibraryItemMediaSource | null {
  if (mediaSources.length === 0) {
    return null;
  }

  const preferredId = preferredMediaSourceId?.trim();
  return (
    (preferredId ? mediaSources.find((source) => source.id === preferredId) : null) ??
    mediaSources[0]
  );
}

function isFastDirectPlaybackMediaSource(mediaSource: LibraryItemMediaSource): boolean {
  const container = mediaSource.container.toLowerCase();
  const videoCodec = mediaSource.videoCodec.toLowerCase();
  const hasProgressiveContainer = ['mp4', 'm4v', 'mov'].some((value) =>
    container.split(',').map((part) => part.trim()).includes(value)
  );
  const needsSeekHeavyDemuxing =
    container.includes('mkv') ||
    container.includes('matroska') ||
    container.includes('webm') ||
    videoCodec === 'hevc' ||
    videoCodec === 'h265';

  return hasProgressiveContainer && !needsSeekHeavyDemuxing;
}

function formatEpisodeSelectorTitle(episode: LibraryEpisode): string {
  return `S${episode.parentIndexNumber}E${episode.indexNumber} - ${episode.name}`;
}

function runtimeTicksToSeconds(runtimeTicks: number | null): number | null {
  if (typeof runtimeTicks !== 'number' || runtimeTicks <= 0) {
    return null;
  }

  return Math.round(runtimeTicks / 10000000);
}

function pickEpisodeThumbnailUrl(episode: LibraryEpisode): string | null {
  return (
    episode.imageCandidates?.find((image) => image.kind === 'thumb')?.url ??
    episode.posterUrl ??
    episode.imageCandidates?.find((image) => image.kind === 'primary')?.url ??
    episode.imageCandidates?.find((image) => image.kind === 'backdrop')?.url ??
    null
  );
}

function createEpisodeSelector(
  currentItemId: string,
  episodes: LibraryEpisode[]
): PlayerEpisodeSelector | undefined {
  if (episodes.length === 0 || !episodes.some((episode) => episode.id === currentItemId)) {
    return undefined;
  }

  return {
    currentItemId,
    episodes: episodes.map((episode) => ({
      durationSeconds: runtimeTicksToSeconds(episode.runtimeTicks),
      itemId: episode.id,
      thumbnailUrl: pickEpisodeThumbnailUrl(episode),
      title: formatEpisodeSelectorTitle(episode),
    })),
  };
}

function getImageCacheMaxDimension(resolution: ImageCacheResolution): number | null {
  return resolution === 'original' ? null : resolution;
}

interface HomeRouteData {
  accountLabel: string;
  continueWatching: ReturnType<typeof buildContinueWatchingItems>;
  libraries: HomeLibraryCard[];
  featuredRows: HomePosterRow[];
}

function getItemIdFromItemHref(href: string): string | null {
  const match = href.match(/\/item\/([^/?#]+)/u);
  return match ? decodeURIComponent(match[1]) : null;
}

function getContinueWatchingPlaybackItemId(item: HomePosterItem): string {
  return item.state?.resumeEpisodeId?.trim() || item.id;
}

function getContinueWatchingFavoriteItemId(item: HomePosterItem): string {
  if (item.state?.resumeEpisodeId) {
    return getItemIdFromItemHref(item.href) ?? item.id;
  }

  return item.id;
}

function getRuntimeSeconds(runtimeTicks: number | null | undefined): number {
  return typeof runtimeTicks === 'number' && runtimeTicks > 0
    ? Math.round(runtimeTicks / 10000000)
    : 0;
}

function formatContinueWatchingEpisodeSubtitle(episode: LibraryEpisode): string {
  const episodeName = episode.name.trim();

  if (
    typeof episode.parentIndexNumber === 'number' &&
    typeof episode.indexNumber === 'number'
  ) {
    return `S${episode.parentIndexNumber}E${episode.indexNumber}${
      episodeName ? ` - ${episodeName}` : ''
    }`;
  }

  if (typeof episode.indexNumber === 'number') {
    return `E${episode.indexNumber}${episodeName ? ` - ${episodeName}` : ''}`;
  }

  return episodeName;
}

function createContinueWatchingItemForEpisode(
  currentItem: HomePosterItem,
  episode: LibraryEpisode,
  seasonId: string
): HomePosterItem {
  return {
    id: episode.id,
    title: currentItem.title,
    subtitle: formatContinueWatchingEpisodeSubtitle(episode),
    posterUrl: episode.posterUrl || currentItem.posterUrl,
    imageCandidates: episode.imageCandidates ?? currentItem.imageCandidates,
    href: currentItem.href,
    state: {
      title: currentItem.title,
      serverPositionTicks: episode.serverPositionTicks,
      resumeEpisodeId: episode.id,
      resumeSeasonId: seasonId,
      ...(typeof episode.parentIndexNumber === 'number'
        ? { resumeSeasonIndex: episode.parentIndexNumber }
        : {}),
    },
  };
}

function sortSeasonsByIndex(seasons: LibrarySeason[]): LibrarySeason[] {
  return [...seasons].sort((left, right) => {
    const leftIndex = typeof left.indexNumber === 'number' ? left.indexNumber : Number.MAX_SAFE_INTEGER;
    const rightIndex = typeof right.indexNumber === 'number' ? right.indexNumber : Number.MAX_SAFE_INTEGER;

    return leftIndex - rightIndex || left.name.localeCompare(right.name);
  });
}

function sortEpisodesByIndex(episodes: LibraryEpisode[]): LibraryEpisode[] {
  return [...episodes].sort((left, right) => {
    const leftIndex = typeof left.indexNumber === 'number' ? left.indexNumber : Number.MAX_SAFE_INTEGER;
    const rightIndex = typeof right.indexNumber === 'number' ? right.indexNumber : Number.MAX_SAFE_INTEGER;

    return leftIndex - rightIndex || left.name.localeCompare(right.name);
  });
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
  const itemRouteState = (location.state as ItemRouteState | null | undefined) ?? {};
  const resumeEpisodeId = itemRouteState.resumeEpisodeId;
  const resumeSeasonId = itemRouteState.resumeSeasonId;
  const resumeSeasonIndex = itemRouteState.resumeSeasonIndex;

  const [details, setDetails] = useState<LibraryItemDetails | null>(null);
  const [similarItems, setSimilarItems] = useState<LibraryItem[]>([]);
  const [seasons, setSeasons] = useState<LibrarySeason[]>([]);
  const [episodes, setEpisodes] = useState<LibraryEpisode[]>([]);
  const [episodeProgressByItemId, setEpisodeProgressByItemId] = useState<
    Record<string, PlaybackProgress>
  >({});
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const [playbackSource, setPlaybackSource] = useState<PlaybackStreamSource | null>(null);
  const [playbackItemId, setPlaybackItemId] = useState('');
  const [playbackLaunchId, setPlaybackLaunchId] = useState(0);
  const [playbackTitle, setPlaybackTitle] = useState('');
  const [playbackEpisodeSelector, setPlaybackEpisodeSelector] = useState<PlayerEpisodeSelector | undefined>(undefined);
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
    setPlaybackEpisodeSelector(undefined);
    setPlaybackErrorMessage('');
    setEpisodeProgressByItemId({});

    async function loadData() {
      try {
        const persistedState = await window.embyDesktop.storage.read().catch(() => null);
        if (cancelled) return;
        setEpisodeProgressByItemId(
          persistedState
            ? getPersistedProgressByItemIdForAccount(
                persistedState.progressByItemId,
                resolvedActiveAccountId
              )
            : {}
        );

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
            const resumeSeason =
              seasonsList.find((season) => season.id === resumeSeasonId) ??
              seasonsList.find(
                (season) =>
                  typeof resumeSeasonIndex === 'number' &&
                  season.indexNumber === resumeSeasonIndex
              );
            const initialSeason = resumeSeason?.id ?? seasonsList[0].id;
            setSelectedSeasonId(initialSeason);
            const episodesList = await fetchEpisodes(serverUrl, currentSession!.userId, itemId, initialSeason, currentSession!.accessToken).catch(() => []);
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
  }, [itemId, resolvedActiveAccountId, resumeSeasonId, resumeSeasonIndex, serverUrl, session]);

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
    setPlaybackLaunchId((current) => current + 1);
    setPlaybackTitle(selection?.title?.trim() || details?.name || '');
    setPlaybackEpisodeSelector(details?.type === 'Series' ? createEpisodeSelector(playItemId, episodes) : undefined);

    try {
      const playbackMediaSources =
        details?.id === playItemId
          ? details.mediaSources
          : episodes.find((episode) => episode.id === playItemId)?.mediaSources ?? [];
      const selectedMediaSource = pickPlaybackMediaSource(
        playbackMediaSources,
        selection?.mediaSourceId
      );
      const directSource = selectedMediaSource && isFastDirectPlaybackMediaSource(selectedMediaSource)
        ? buildDirectPlaybackStreamSource({
            serverUrl,
            userId: session.userId,
            itemId: playItemId,
            accessToken: session.accessToken,
            mediaSourceId: selectedMediaSource.id,
            audioStreamIndex: selection?.audioStreamIndex,
          })
        : null;
      const [persistedState, nextSource] = await Promise.all([
        window.embyDesktop.storage.read(),
        directSource ??
          fetchPlaybackStreamSource({
            serverUrl,
            userId: session.userId,
            itemId: playItemId,
            accessToken: session.accessToken,
            mediaSourceId: selection?.mediaSourceId,
            audioStreamIndex: selection?.audioStreamIndex,
          })
      ]);
      await waitForFastPlaybackPreflight(nextSource);
      
      const progressByItemId = getPersistedProgressByItemIdForAccount(persistedState.progressByItemId, resolvedActiveAccountId);
      const savedPositionSeconds = progressByItemId[playItemId]?.positionSeconds ?? null;
      
      setInitialPositionSeconds(getResumePositionSeconds({ savedPositionSeconds, serverPositionTicks: resumeTicks === undefined ? null : resumeTicks }));
      setPlaybackSource(nextSource);
    } catch (err) {
      setPlaybackSource(null);
      setPlaybackErrorMessage('Could not prepare desktop playback.');
    }
  }

  async function handleEpisodeSelect(nextItemId: string) {
    const episode = episodes.find((candidate) => candidate.id === nextItemId);

    if (!episode || !details || details.type !== 'Series') {
      return;
    }

    const nextTitle = `${details.name} - ${formatEpisodeSelectorTitle(episode)}`;

    if (typeof window.embyDesktop.player.switchEpisode !== 'function') {
      await handlePlay(episode.id, episode.serverPositionTicks, {
        title: nextTitle,
      });
      return;
    }

    setPlaybackErrorMessage('');

    try {
      const selectedMediaSource = pickPlaybackMediaSource(episode.mediaSources);
      const directSource = selectedMediaSource && isFastDirectPlaybackMediaSource(selectedMediaSource)
        ? buildDirectPlaybackStreamSource({
            serverUrl,
            userId: session!.userId,
            itemId: episode.id,
            accessToken: session!.accessToken,
            mediaSourceId: selectedMediaSource.id,
          })
        : null;
      const [persistedState, nextSource] = await Promise.all([
        window.embyDesktop.storage.read(),
        directSource ??
          fetchPlaybackStreamSource({
            serverUrl,
            userId: session!.userId,
            itemId: episode.id,
            accessToken: session!.accessToken,
          }),
      ]);
      await waitForFastPlaybackPreflight(nextSource);

      const progressByItemId = getPersistedProgressByItemIdForAccount(
        persistedState.progressByItemId,
        resolvedActiveAccountId
      );
      const savedPositionSeconds = progressByItemId[episode.id]?.positionSeconds ?? null;
      const nextInitialPositionSeconds = getResumePositionSeconds({
        savedPositionSeconds,
        serverPositionTicks: episode.serverPositionTicks,
      });
      const nextEpisodeSelector = createEpisodeSelector(episode.id, episodes);

      await window.embyDesktop.player.switchEpisode({
        httpHeaders: nextSource.httpHeaders,
        itemId: episode.id,
        title: nextTitle,
        streamUrl: nextSource.streamUrl,
        startSeconds: nextInitialPositionSeconds,
      });

      setPlaybackItemId(episode.id);
      setPlaybackTitle(nextTitle);
      setPlaybackEpisodeSelector(nextEpisodeSelector);
      setInitialPositionSeconds(nextInitialPositionSeconds);
      setPlaybackSource(nextSource);
    } catch {
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
            clearHomeCache: true,
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

  async function handleAddDetailFavorite(actionItemId: string) {
    if (!session) {
      return;
    }

    try {
      await addFavoriteItem({
        serverUrl,
        userId: session.userId,
        itemId: actionItemId,
        accessToken: session.accessToken,
      });
      setPlaybackErrorMessage('');
    } catch {
      setPlaybackErrorMessage('Could not add to favorites.');
    }
  }

  async function handleMarkDetailPlayed(actionItemId: string) {
    if (!session) {
      return;
    }

    try {
      await markItemPlayed({
        serverUrl,
        userId: session.userId,
        itemId: actionItemId,
        accessToken: session.accessToken,
      });

      try {
        await window.embyDesktop.storage.write({
          clearHomeCache: true,
          progressByItemId: {
            [resolvedActiveAccountId
              ? createAccountScopedProgressKey(resolvedActiveAccountId, actionItemId)
              : actionItemId]: null,
          },
        });
      } catch {
        // The server action succeeded; stale local resume data can be refreshed later.
      }

      setEpisodeProgressByItemId((currentProgress) => {
        const { [actionItemId]: _playedProgress, ...remainingProgress } = currentProgress;
        return remainingProgress;
      });
      setEpisodes((currentEpisodes) =>
        currentEpisodes.map((episode) =>
          episode.id === actionItemId ? { ...episode, played: true } : episode
        )
      );
      setDetails((currentDetails) =>
        currentDetails?.id === actionItemId ? { ...currentDetails, played: true } : currentDetails
      );
      setPlaybackErrorMessage('');
    } catch {
      setPlaybackErrorMessage('Could not mark as played.');
    }
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
          launchRequestId={playbackLaunchId}
          title={playbackTitle || details.name}
          streamUrl={playbackSource.streamUrl}
          initialPositionSeconds={initialPositionSeconds}
          episodeSelector={playbackEpisodeSelector}
          onEpisodeSelect={handleEpisodeSelect}
          onProgress={handleProgress}
        />
      ) : null}

      <ItemDetailsPage
        details={details}
        similarItems={similarItems}
        seasons={seasons}
        episodes={episodes}
        selectedSeasonId={selectedSeasonId}
        resumeEpisodeId={resumeEpisodeId}
        episodeProgressByItemId={episodeProgressByItemId}
        onSelectSeason={setSelectedSeasonId}
        onPlay={handlePlay}
        onAddToFavorites={handleAddDetailFavorite}
        onMarkPlayed={handleMarkDetailPlayed}
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

  function getProgressStorageKey(itemId: string): string {
    return resolvedActiveAccountId
      ? createAccountScopedProgressKey(resolvedActiveAccountId, itemId)
      : itemId;
  }

  async function persistContinueWatchingProgressPatch(
    progressByItemId: Record<string, PlaybackProgress | null>
  ) {
    await window.embyDesktop.storage.write({
      clearHomeCache: true,
      progressByItemId,
    });
  }

  async function findNextContinueWatchingEpisode(item: HomePosterItem): Promise<{
    episode: LibraryEpisode;
    seasonId: string;
  } | null> {
    if (!sessionUserId || !sessionAccessToken || !item.state?.resumeEpisodeId) {
      return null;
    }

    const seriesId = getItemIdFromItemHref(item.href);

    if (!seriesId) {
      return null;
    }

    const seasons = sortSeasonsByIndex(
      await fetchSeasons(serverUrl, sessionUserId, seriesId, sessionAccessToken)
    );
    const currentSeasonIndex = seasons.findIndex((season) => {
      if (item.state?.resumeSeasonId && season.id === item.state.resumeSeasonId) {
        return true;
      }

      return (
        typeof item.state?.resumeSeasonIndex === 'number' &&
        season.indexNumber === item.state.resumeSeasonIndex
      );
    });
    const startSeasonIndex = currentSeasonIndex >= 0 ? currentSeasonIndex : 0;

    for (let seasonIndex = startSeasonIndex; seasonIndex < seasons.length; seasonIndex += 1) {
      const season = seasons[seasonIndex];
      const episodes = sortEpisodesByIndex(
        await fetchEpisodes(serverUrl, sessionUserId, seriesId, season.id, sessionAccessToken)
      );

      if (episodes.length === 0) {
        continue;
      }

      if (seasonIndex === startSeasonIndex) {
        const currentEpisodeIndex = episodes.findIndex(
          (episode) => episode.id === item.state?.resumeEpisodeId
        );

        if (currentEpisodeIndex >= 0 && currentEpisodeIndex < episodes.length - 1) {
          return {
            episode: episodes[currentEpisodeIndex + 1],
            seasonId: season.id,
          };
        }

        continue;
      }

      return {
        episode: episodes[0],
        seasonId: season.id,
      };
    }

    return null;
  }

  async function handleRemoveFromContinueWatching(item: HomePosterItem) {
    if (!sessionUserId || !sessionAccessToken) {
      return;
    }

    const itemId = getContinueWatchingPlaybackItemId(item);

    try {
      await hideItemFromContinueWatching({
        serverUrl,
        userId: sessionUserId,
        itemId,
        accessToken: sessionAccessToken,
      });
      setContinueWatching((currentItems) =>
        currentItems.filter((currentItem) => currentItem.id !== item.id)
      );
      await persistContinueWatchingProgressPatch({
        [getProgressStorageKey(itemId)]: null,
      });
      setErrorMessage('');
    } catch {
      setErrorMessage('无法从继续观看中移除，请稍后重试。');
    }
  }

  async function handleAddContinueWatchingFavorite(item: HomePosterItem) {
    if (!sessionUserId || !sessionAccessToken) {
      return;
    }

    try {
      await addFavoriteItem({
        serverUrl,
        userId: sessionUserId,
        itemId: getContinueWatchingFavoriteItemId(item),
        accessToken: sessionAccessToken,
      });
      setErrorMessage('');
    } catch {
      setErrorMessage('无法添加到收藏，请稍后重试。');
    }
  }

  async function handleMarkContinueWatchingPlayed(item: HomePosterItem) {
    if (!sessionUserId || !sessionAccessToken) {
      return;
    }

    const itemId = getContinueWatchingPlaybackItemId(item);

    try {
      await markItemPlayed({
        serverUrl,
        userId: sessionUserId,
        itemId,
        accessToken: sessionAccessToken,
      });

      const nextEpisode = item.state?.resumeEpisodeId
        ? await findNextContinueWatchingEpisode(item)
        : null;

      if (!nextEpisode) {
        setContinueWatching((currentItems) =>
          currentItems.filter((currentItem) => currentItem.id !== item.id)
        );
        await persistContinueWatchingProgressPatch({
          [getProgressStorageKey(itemId)]: null,
        });
        setErrorMessage('');
        return;
      }

      const nextItem = createContinueWatchingItemForEpisode(
        item,
        nextEpisode.episode,
        nextEpisode.seasonId
      );
      setContinueWatching((currentItems) =>
        dedupeContinueWatchingPosterItems(
          currentItems.map((currentItem) => (currentItem.id === item.id ? nextItem : currentItem))
        )
      );
      await persistContinueWatchingProgressPatch({
        [getProgressStorageKey(itemId)]: null,
        [getProgressStorageKey(nextEpisode.episode.id)]: {
          itemId: nextEpisode.episode.id,
          positionSeconds: 0,
          durationSeconds: getRuntimeSeconds(nextEpisode.episode.runtimeTicks),
          updatedAt: new Date().toISOString(),
        },
      });
      setErrorMessage('');
    } catch {
      setErrorMessage('无法标记为已播放，请稍后重试。');
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

        if (settings.cache.dataCacheEnabled && cacheEntry) {
          renderHomeData({
            accountLabel: cacheEntry.accountLabel,
            continueWatching: Array.isArray(cacheEntry.continueWatching)
              ? dedupeContinueWatchingPosterItems(cacheEntry.continueWatching)
              : [],
            libraries: Array.isArray(cacheEntry.libraries) ? cacheEntry.libraries : [],
            featuredRows: Array.isArray(cacheEntry.featuredRows) ? cacheEntry.featuredRows : [],
          });
          renderedCache = true;
        }

        if (
          settings.cache.dataCacheEnabled &&
          cacheEntry &&
          hasCompleteCacheEntry &&
          isHomeCacheFresh(cacheEntry.cachedAt, Date.now(), settings.cache.dataCacheTtlDays)
        ) {
          return;
        }

        const nextHomeData = await refreshHomeData(persistedState);

        if (cancelled) {
          return;
        }

        renderHomeData(nextHomeData);
        setErrorMessage('');

        if (settings.cache.dataCacheEnabled && cacheKey) {
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
    settings.cache.dataCacheEnabled,
    settings.cache.dataCacheTtlDays,
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
          onRemoveFromContinueWatching={handleRemoveFromContinueWatching}
          onAddToFavorites={handleAddContinueWatchingFavorite}
          onMarkPlayed={handleMarkContinueWatchingPlayed}
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
  const [dataCacheBytes, setDataCacheBytes] = useState(0);
  const [imageCacheBytes, setImageCacheBytes] = useState(0);

  async function refreshCacheStats() {
    const [persistedState, imageStats] = await Promise.all([
      window.embyDesktop.storage.read(),
      window.embyDesktop.imageCache.stats(),
    ]);

    setDataCacheBytes(getJsonByteLength(persistedState.homeCacheByKey ?? {}));
    setImageCacheBytes(imageStats.sizeBytes);
  }

  useEffect(() => {
    let cancelled = false;

    Promise.all([window.embyDesktop.storage.read(), window.embyDesktop.imageCache.stats()])
      .then(([persistedState, imageStats]) => {
        if (cancelled) {
          return;
        }

        setDataCacheBytes(getJsonByteLength(persistedState.homeCacheByKey ?? {}));
        setImageCacheBytes(imageStats.sizeBytes);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

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

  async function handleDanmakuSettingsSave(next: DanmakuSettings) {
    const settingsPatch = {
      danmaku: next,
    };

    await window.embyDesktop.storage.write({
      settings: settingsPatch,
    });
    updateSettings(settingsPatch);
  }

  async function handlePlaybackSettingsSave(next: PlaybackSettings) {
    const settingsPatch = {
      playback: next,
    };

    await window.embyDesktop.storage.write({
      settings: settingsPatch,
    });
    updateSettings(settingsPatch);
  }

  async function handleSubtitleSettingsSave(next: SubtitleSettings) {
    const settingsPatch = {
      subtitles: next,
    };

    await window.embyDesktop.storage.write({
      settings: settingsPatch,
    });
    updateSettings(settingsPatch);
  }

  async function handleCacheSettingsSave(next: CacheSettings) {
    const imageCacheResolutionChanged =
      next.imageCacheResolution !== settings.cache.imageCacheResolution;
    const settingsPatch = {
      cache: next,
    };

    await window.embyDesktop.storage.write({
      settings: settingsPatch,
    });

    if (imageCacheResolutionChanged) {
      await window.embyDesktop.imageCache.clear();
      setImageCacheBytes(0);
    }

    await window.embyDesktop.imageCache.configure({
      enabled: next.imageCacheEnabled,
      maxDimension: getImageCacheMaxDimension(next.imageCacheResolution),
      maxBytes: next.imageCacheMaxBytes,
    });
    updateSettings(settingsPatch);
  }

  async function handleClearDataCache() {
    await window.embyDesktop.storage.write({
      clearHomeCache: true,
    });
    setDataCacheBytes(0);
  }

  async function handleClearImageCache() {
    await window.embyDesktop.imageCache.clear();
    await refreshCacheStats();
  }

  return (
    <SettingsPage
      userName={session?.userName ?? 'Unknown user'}
      serverUrl={serverUrl}
      defaultVolume={settings.defaultVolume}
      proxyMode={settings.proxy.mode}
      customProxyUrl={settings.proxy.customProxyUrl}
      playbackSettings={settings.playback}
      subtitleSettings={settings.subtitles}
      danmakuServers={settings.danmakuServers}
      danmakuSettings={settings.danmaku}
      cacheSettings={settings.cache}
      dataCacheBytes={dataCacheBytes}
      imageCacheBytes={imageCacheBytes}
      onCacheSettingsSave={handleCacheSettingsSave}
      onClearDataCache={handleClearDataCache}
      onClearImageCache={handleClearImageCache}
      onDanmakuServersSave={handleDanmakuServersSave}
      onDanmakuSettingsSave={handleDanmakuSettingsSave}
      onPlaybackSettingsSave={handlePlaybackSettingsSave}
      onProxySettingsSave={handleProxySettingsSave}
      onSubtitleSettingsSave={handleSubtitleSettingsSave}
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
