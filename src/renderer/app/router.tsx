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
import { fetchItems, fetchItemsByIds, fetchResumeItems, fetchResumableItems, fetchSearchItems, fetchViews, fetchItemDetails, fetchSimilarItems, fetchSeasons, fetchEpisodes } from '@shared/api/emby/library';
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
  buildHomeRefreshStatusMessage,
  buildServerContinueWatchingItems,
  dedupeContinueWatchingPosterItems,
  pickFeaturedViews,
  type HomeRefreshFailure,
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
import {
  createConfirmedProgressUpdate,
  createFailedProgressUpdate,
  createLocalProgressUpdate,
  getResumePositionSeconds,
  shouldSyncPlaybackProgress,
} from '@shared/utils/playbackProgress';
import {
  buildOptionalFailureMessage,
  type BrowsingSectionFailure,
  createBrowsingSectionFailure,
  createRequestGenerationGuard,
} from '@shared/utils/browsingLoad';
import { createLoadTimingRecorder, type LoadTimingMilestone } from '@shared/utils/loadTiming';
import {
  createSessionSnapshotKey,
  createSessionSnapshotStore,
} from '@shared/utils/sessionSnapshot';
import { Layout } from '@renderer/components/Layout';
import { AppTitleBar } from '@renderer/components/AppTitleBar';
import { useAuth } from '@renderer/features/auth/AuthContext';
import { LoginPage } from '@renderer/features/auth/LoginPage';
import { HomePage } from '@renderer/features/home/HomePage';
import {
  createHomeCacheEntry,
  createHomeCacheFallbackStatusMessage,
  createHomeCacheKey,
  isCompleteHomeCacheEntry,
  isHomeCacheFresh,
} from '@renderer/features/home/homeCache';
import {
  AggregateViewPage,
  type AggregatePosterItem,
  type AggregatePosterRow,
} from '@renderer/features/home/AggregateViewPage';
import { LibraryItemsPage } from '@renderer/features/library/LibraryItemsPage';
import { PlayerPage } from '@renderer/features/player/PlayerPage';
import {
  getPlaybackMediaSourcesForItem,
  resolvePlaybackTitle,
} from '@renderer/features/player/playerAdapter';
import { ItemDetailsPage } from '@renderer/features/library/ItemDetailsPage';
import { SettingsPage } from '@renderer/features/settings/SettingsPage';
import {
  createCacheSettingsPatch,
  createDanmakuServersSettingsPatch,
  createDanmakuSettingsPatch,
  createPlaybackSettingsPatch,
  createProxySettingsPatch,
  createSubtitleSettingsPatch,
} from '@renderer/features/settings/settingsActions';
import type { DanmakuServerSettings, ProxyMode } from '@shared/models/settings';
import {
  createEpisodeSelector,
  createPlaybackPreparationKey,
  formatEpisodeSelectorTitle,
  isPlaybackPreparationKeyMatch,
  isFastDirectPlaybackMediaSource,
  pickDefaultAudioStreamIndex,
  pickPlaybackMediaSource,
  type PlayerEpisodeSelector,
} from './playbackRouteHelpers';

interface PlayerLocationState {
  title?: string;
  serverPositionTicks?: number | null;
}

interface PlaybackSelection {
  title?: string | null;
  mediaSourceId?: string | null;
  audioStreamIndex?: number | null;
}

interface PlaybackSourceDescriptor {
  audioStreamIndex: number | null;
  itemId: string;
  key: string;
  mediaSourceId: string | null;
  resumeTicks: number | null;
  selectedMediaSource: LibraryItemMediaSource | null;
}

interface PreparedPlaybackCandidate {
  key: string;
  sourcePromise: Promise<PlaybackStreamSource | null>;
}

interface CurrentPlaybackLaunch {
  attemptId: number;
  launchRequestId: number;
  timingRecorder: ReturnType<typeof createLoadTimingRecorder>;
}

interface DetailRouteSnapshot {
  details: LibraryItemDetails;
  episodeProgressByItemId: Record<string, PlaybackProgress>;
  episodes: LibraryEpisode[];
  optionalFailureMessage: string;
  seasons: LibrarySeason[];
  selectedSeasonId: string;
  similarItems: LibraryItem[];
}

const detailSessionSnapshots = createSessionSnapshotStore<DetailRouteSnapshot>();
const sessionSnapshotScopeIds = new WeakMap<object, number>();
let nextSessionSnapshotScopeId = 1;

function getSessionSnapshotScopeId(): string {
  const storageBridge = window.embyDesktop?.storage;

  if (!storageBridge) {
    return 'no-storage-bridge';
  }

  const existingId = sessionSnapshotScopeIds.get(storageBridge);

  if (existingId !== undefined) {
    return String(existingId);
  }

  const nextId = nextSessionSnapshotScopeId;
  nextSessionSnapshotScopeId += 1;
  sessionSnapshotScopeIds.set(storageBridge, nextId);

  return String(nextId);
}

interface ItemRouteState {
  title?: string;
  serverPositionTicks?: number | null;
  resumeEpisodeId?: string;
  resumeSeasonId?: string;
  resumeSeasonIndex?: number;
}

const PROGRESS_REPORT_INTERVAL_MS = 5000;
const PLAYBACK_PREFLIGHT_FAST_TIMEOUT_MS = 1500;

function emitLoadTimingMilestone(milestone: LoadTimingMilestone) {
  window.dispatchEvent(
    new CustomEvent<LoadTimingMilestone>('taluxa-load-timing', {
      detail: milestone,
    })
  );
}

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

function getImageCacheMaxDimension(resolution: ImageCacheResolution): number | null {
  return resolution === 'original' ? null : resolution;
}

interface HomeRouteData {
  accountLabel: string;
  continueWatching: ReturnType<typeof buildContinueWatchingItems>;
  libraries: HomeLibraryCard[];
  featuredRows: HomePosterRow[];
  refreshStatusMessage?: string;
}

const homeSessionSnapshots = createSessionSnapshotStore<HomeRouteData>();

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
  const [optionalFailureMessage, setOptionalFailureMessage] = useState('');

  const [playbackSource, setPlaybackSource] = useState<PlaybackStreamSource | null>(null);
  const [playbackItemId, setPlaybackItemId] = useState('');
  const [playbackLaunchId, setPlaybackLaunchId] = useState(0);
  const [playbackTitle, setPlaybackTitle] = useState('');
  const [playbackEpisodeSelector, setPlaybackEpisodeSelector] = useState<PlayerEpisodeSelector | undefined>(undefined);
  const [initialPositionSeconds, setInitialPositionSeconds] = useState<number | null>(null);
  const [playbackErrorMessage, setPlaybackErrorMessage] = useState('');
  const [playbackStartupMessage, setPlaybackStartupMessage] = useState('');

  const resolvedActiveAccountId = activeAccountId ?? (session ? createAccountId(serverUrl, session.userId) : null);
  const progressStateRef = useRef<{ lastReportedAtMs: number | null; lastReportedPositionSeconds: number | null }>({ lastReportedAtMs: null, lastReportedPositionSeconds: null });
  const progressSyncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const detailsGenerationRef = useRef(createRequestGenerationGuard());
  const seasonEpisodesGenerationRef = useRef(createRequestGenerationGuard());
  const playbackAttemptGenerationRef = useRef(createRequestGenerationGuard());
  const playbackLaunchIdRef = useRef(0);
  const currentPlaybackLaunchRef = useRef<CurrentPlaybackLaunch | null>(null);
  const preparedPlaybackCandidateRef = useRef<PreparedPlaybackCandidate | null>(null);

  function createDefaultPlaybackSelection(playItemId: string): PlaybackSelection | undefined {
    const mediaSources = getPlaybackMediaSourcesForItem({
      details,
      episodes,
      itemId: playItemId,
    });
    const selectedMediaSource = pickPlaybackMediaSource(mediaSources);

    return selectedMediaSource
      ? {
          audioStreamIndex: pickDefaultAudioStreamIndex(selectedMediaSource),
          mediaSourceId: selectedMediaSource.id,
        }
      : undefined;
  }

  function createPlaybackSourceDescriptor(
    playItemId: string,
    resumeTicks?: number | null,
    selection?: PlaybackSelection
  ): PlaybackSourceDescriptor | null {
    if (!session) {
      return null;
    }

    const playbackMediaSources = getPlaybackMediaSourcesForItem({
      details,
      episodes,
      itemId: playItemId,
    });
    const selectedMediaSource = pickPlaybackMediaSource(
      playbackMediaSources,
      selection?.mediaSourceId
    );
    const mediaSourceId = selectedMediaSource?.id ?? selection?.mediaSourceId ?? null;
    const audioStreamIndex =
      typeof selection?.audioStreamIndex === 'number' ? selection.audioStreamIndex : null;
    const normalizedResumeTicks = typeof resumeTicks === 'number' ? resumeTicks : null;

    return {
      audioStreamIndex,
      itemId: playItemId,
      key: createPlaybackPreparationKey({
        accountId: resolvedActiveAccountId,
        audioStreamIndex,
        itemId: playItemId,
        mediaSourceId,
        resumeTicks: normalizedResumeTicks,
      }),
      mediaSourceId,
      resumeTicks: normalizedResumeTicks,
      selectedMediaSource,
    };
  }

  function resolvePlaybackSourceFromDescriptor(
    descriptor: PlaybackSourceDescriptor
  ): Promise<PlaybackStreamSource> {
    if (!session) {
      return Promise.reject(new Error('Playback session is unavailable.'));
    }

    const directSource =
      descriptor.selectedMediaSource &&
      isFastDirectPlaybackMediaSource(descriptor.selectedMediaSource)
        ? buildDirectPlaybackStreamSource({
            serverUrl,
            userId: session.userId,
            itemId: descriptor.itemId,
            accessToken: session.accessToken,
            mediaSourceId: descriptor.mediaSourceId ?? undefined,
            audioStreamIndex: descriptor.audioStreamIndex,
          })
        : null;

    return Promise.resolve(
      directSource ??
        fetchPlaybackStreamSource({
          serverUrl,
          userId: session.userId,
          itemId: descriptor.itemId,
          accessToken: session.accessToken,
          mediaSourceId: descriptor.mediaSourceId ?? undefined,
          audioStreamIndex: descriptor.audioStreamIndex,
        })
    );
  }

  useEffect(() => {
    progressStateRef.current = { lastReportedAtMs: null, lastReportedPositionSeconds: null };
    progressSyncQueueRef.current = Promise.resolve();
  }, [playbackItemId, resolvedActiveAccountId]);

  useEffect(() => {
    const currentSession = session;
    if (!currentSession || !itemId) return;
    const generation = detailsGenerationRef.current.next();
    let cancelled = false;
    let emittedDetailPrimaryVisible = false;
    const timingRecorder = createLoadTimingRecorder({
      attemptId: Date.now(),
      surface: 'details',
    });
    const detailSnapshotKey = resolvedActiveAccountId
      ? createSessionSnapshotKey({
          accountId: resolvedActiveAccountId,
          parts: ['detail', getSessionSnapshotScopeId(), itemId],
        })
      : null;
    const detailSnapshot = detailSnapshotKey
      ? detailSessionSnapshots.get(detailSnapshotKey)
      : undefined;

    setErrorMessage('');
    setOptionalFailureMessage('');

    if (detailSnapshot) {
      setDetails(detailSnapshot.details);
      setSimilarItems(detailSnapshot.similarItems);
      setSeasons(detailSnapshot.seasons);
      setEpisodes(detailSnapshot.episodes);
      setSelectedSeasonId(detailSnapshot.selectedSeasonId);
      setEpisodeProgressByItemId(detailSnapshot.episodeProgressByItemId);
      setOptionalFailureMessage(detailSnapshot.optionalFailureMessage);
      setIsLoading(false);
      emittedDetailPrimaryVisible = true;
      emitLoadTimingMilestone(timingRecorder.mark('detail-revisit-visible'));
    } else {
      setIsLoading(true);
      setDetails(null);
      setSimilarItems([]);
      setSeasons([]);
      setEpisodes([]);
      setSelectedSeasonId('');
      setEpisodeProgressByItemId({});
    }

    setPlaybackSource(null);
    setPlaybackItemId('');
    setPlaybackTitle('');
    setPlaybackEpisodeSelector(undefined);
    setPlaybackErrorMessage('');
    setPlaybackStartupMessage('');
    currentPlaybackLaunchRef.current = null;

    async function loadData() {
      try {
        const persistedState = await window.embyDesktop.storage.read().catch(() => null);
        if (cancelled || !detailsGenerationRef.current.isCurrent(generation)) return;
        const progressByItemId = persistedState
          ? getPersistedProgressByItemIdForAccount(
              persistedState.progressByItemId,
              resolvedActiveAccountId
            )
          : {};
        setEpisodeProgressByItemId(progressByItemId);

        const itemDetails = await fetchItemDetails(serverUrl, currentSession!.userId, itemId, currentSession!.accessToken);
        if (cancelled || !detailsGenerationRef.current.isCurrent(generation)) return;
        setDetails(itemDetails);
        setIsLoading(false);
        if (!emittedDetailPrimaryVisible) {
          emittedDetailPrimaryVisible = true;
          emitLoadTimingMilestone(timingRecorder.mark('detail-primary-visible'));
        }

        const optionalFailures: BrowsingSectionFailure[] = [];
        let similar: LibraryItem[] = [];
        try {
          similar = await fetchSimilarItems(serverUrl, currentSession!.userId, itemId, currentSession!.accessToken, 8);
        } catch (error) {
          optionalFailures.push(
            createBrowsingSectionFailure({
              section: 'similar',
              label: 'Similar items',
              error,
            })
          );
        }
        if (cancelled || !detailsGenerationRef.current.isCurrent(generation)) return;
        setSimilarItems(similar);

        if (itemDetails.type === 'Series') {
          let seasonsList: LibrarySeason[] = [];
          let selectedSeasonForSnapshot = '';
          let episodesList: LibraryEpisode[] = [];
          try {
            seasonsList = await fetchSeasons(serverUrl, currentSession!.userId, itemId, currentSession!.accessToken);
          } catch (error) {
            optionalFailures.push(
              createBrowsingSectionFailure({
                section: 'seasons',
                label: 'Seasons',
                error,
              })
            );
          }
          if (cancelled || !detailsGenerationRef.current.isCurrent(generation)) return;
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
            selectedSeasonForSnapshot = initialSeason;
            setSelectedSeasonId(initialSeason);
            try {
              episodesList = await fetchEpisodes(serverUrl, currentSession!.userId, itemId, initialSeason, currentSession!.accessToken);
            } catch (error) {
              optionalFailures.push(
                createBrowsingSectionFailure({
                  section: 'episodes',
                  label: 'Episodes',
                  error,
                })
              );
            }
            if (cancelled || !detailsGenerationRef.current.isCurrent(generation)) return;
            setEpisodes(episodesList);
          }
          const nextOptionalFailureMessage = buildOptionalFailureMessage(optionalFailures) ?? '';
          setOptionalFailureMessage(nextOptionalFailureMessage);
          if (detailSnapshotKey) {
            detailSessionSnapshots.set(detailSnapshotKey, {
              details: itemDetails,
              episodeProgressByItemId: progressByItemId,
              episodes: episodesList,
              optionalFailureMessage: nextOptionalFailureMessage,
              seasons: seasonsList,
              selectedSeasonId: selectedSeasonForSnapshot,
              similarItems: similar,
            });
          }
          return;
        }
        const nextOptionalFailureMessage = buildOptionalFailureMessage(optionalFailures) ?? '';
        setOptionalFailureMessage(nextOptionalFailureMessage);
        if (detailSnapshotKey) {
          detailSessionSnapshots.set(detailSnapshotKey, {
            details: itemDetails,
            episodeProgressByItemId: progressByItemId,
            episodes: [],
            optionalFailureMessage: nextOptionalFailureMessage,
            seasons: [],
            selectedSeasonId: '',
            similarItems: similar,
          });
        }
      } catch (err) {
        if (!cancelled && detailsGenerationRef.current.isCurrent(generation)) {
          setErrorMessage('Could not load item details.');
          setIsLoading(false);
        }
      }
    }
    void loadData();
    return () => { cancelled = true; };
  }, [itemId, resolvedActiveAccountId, resumeSeasonId, resumeSeasonIndex, serverUrl, session]);

  useEffect(() => {
    if (!session || !details) {
      preparedPlaybackCandidateRef.current = null;
      return;
    }

    const targetEpisode =
      details.type === 'Series'
        ? episodes.find((episode) => episode.id === resumeEpisodeId) ??
          episodes.find(
            (episode) =>
              typeof episode.serverPositionTicks === 'number' && episode.serverPositionTicks > 0
          ) ??
          episodes.find(
            (episode) => (episodeProgressByItemId[episode.id]?.positionSeconds ?? 0) > 0
          ) ??
          episodes[0]
        : null;
    const preparedItemId = details.type === 'Series' ? targetEpisode?.id : details.id;
    const preparedResumeTicks =
      details.type === 'Series' ? targetEpisode?.serverPositionTicks : details.serverPositionTicks;

    if (!preparedItemId) {
      preparedPlaybackCandidateRef.current = null;
      return;
    }

    const descriptor = createPlaybackSourceDescriptor(
      preparedItemId,
      preparedResumeTicks,
      createDefaultPlaybackSelection(preparedItemId)
    );

    if (!descriptor) {
      preparedPlaybackCandidateRef.current = null;
      return;
    }

    if (
      isPlaybackPreparationKeyMatch(preparedPlaybackCandidateRef.current?.key, {
        accountId: resolvedActiveAccountId,
        audioStreamIndex: descriptor.audioStreamIndex,
        itemId: descriptor.itemId,
        mediaSourceId: descriptor.mediaSourceId,
        resumeTicks: descriptor.resumeTicks,
      })
    ) {
      return;
    }

    const candidate: PreparedPlaybackCandidate = {
      key: descriptor.key,
      sourcePromise: resolvePlaybackSourceFromDescriptor(descriptor).catch(() => null),
    };
    preparedPlaybackCandidateRef.current = candidate;
  }, [
    details,
    episodeProgressByItemId,
    episodes,
    resolvedActiveAccountId,
    resumeEpisodeId,
    serverUrl,
    session,
  ]);

  useEffect(() => {
    const currentSession = session;
    if (!currentSession || !itemId || !selectedSeasonId || details?.type !== 'Series') return;
    const generation = seasonEpisodesGenerationRef.current.next();
    let cancelled = false;
    fetchEpisodes(serverUrl, currentSession!.userId, itemId, selectedSeasonId, currentSession!.accessToken)
      .then(eps => {
        if (!cancelled && seasonEpisodesGenerationRef.current.isCurrent(generation)) {
          setEpisodes(eps);
          if (resolvedActiveAccountId && details) {
            detailSessionSnapshots.set(
              createSessionSnapshotKey({
                accountId: resolvedActiveAccountId,
                parts: ['detail', getSessionSnapshotScopeId(), itemId],
              }),
              {
                details,
                episodeProgressByItemId,
                episodes: eps,
                optionalFailureMessage,
                seasons,
                selectedSeasonId,
                similarItems,
              }
            );
          }
        }
      })
      .catch((error) => {
        if (!cancelled && seasonEpisodesGenerationRef.current.isCurrent(generation)) {
          setEpisodes([]);
          setOptionalFailureMessage(
            buildOptionalFailureMessage([
              createBrowsingSectionFailure({
                section: 'episodes',
                label: 'Episodes',
                error,
              }),
            ]) ?? ''
          );
        }
      });
    return () => { cancelled = true; };
  }, [selectedSeasonId, itemId, serverUrl, session, details?.type]);

  async function handlePlay(
    playItemId: string,
    resumeTicks?: number | null,
    selection?: PlaybackSelection
  ) {
    if (!session) return;
    const playbackAttempt = playbackAttemptGenerationRef.current.next();
    const timingRecorder = createLoadTimingRecorder({
      attemptId: playbackAttempt,
      surface: 'playback',
    });
    const nextLaunchId = playbackLaunchIdRef.current + 1;
    playbackLaunchIdRef.current = nextLaunchId;
    currentPlaybackLaunchRef.current = {
      attemptId: playbackAttempt,
      launchRequestId: nextLaunchId,
      timingRecorder,
    };
    setPlaybackErrorMessage('');
    setPlaybackStartupMessage('Preparing playback...');
    emitLoadTimingMilestone(timingRecorder.mark('play-acknowledged'));
    setPlaybackSource(null);
    setPlaybackItemId(playItemId);
    setPlaybackLaunchId(nextLaunchId);
    setPlaybackTitle(
      resolvePlaybackTitle({
        fallbackTitle: details?.name || '',
        selectionTitle: selection?.title,
      })
    );
    setPlaybackEpisodeSelector(details?.type === 'Series' ? createEpisodeSelector(playItemId, episodes) : undefined);

    try {
      const descriptor = createPlaybackSourceDescriptor(playItemId, resumeTicks, selection);
      if (!descriptor) {
        return;
      }
      const preparedCandidate = preparedPlaybackCandidateRef.current;
      const preparedSourcePromise =
        preparedCandidate &&
        isPlaybackPreparationKeyMatch(preparedCandidate.key, {
          accountId: resolvedActiveAccountId,
          audioStreamIndex: descriptor.audioStreamIndex,
          itemId: descriptor.itemId,
          mediaSourceId: descriptor.mediaSourceId,
          resumeTicks: descriptor.resumeTicks,
        })
          ? preparedCandidate.sourcePromise
          : null;
      const [persistedState, nextSource] = await Promise.all([
        window.embyDesktop.storage.read(),
        preparedSourcePromise
          ? preparedSourcePromise.then(
              (preparedSource) =>
                preparedSource ?? resolvePlaybackSourceFromDescriptor(descriptor)
            )
          : resolvePlaybackSourceFromDescriptor(descriptor),
      ]);
      if (!playbackAttemptGenerationRef.current.isCurrent(playbackAttempt)) {
        return;
      }
      emitLoadTimingMilestone(timingRecorder.mark('playback-source-ready'));
      await waitForFastPlaybackPreflight(nextSource);

      if (!playbackAttemptGenerationRef.current.isCurrent(playbackAttempt)) {
        return;
      }
      
      const progressByItemId = getPersistedProgressByItemIdForAccount(persistedState.progressByItemId, resolvedActiveAccountId);
      const savedPositionSeconds = progressByItemId[playItemId]?.positionSeconds ?? null;
      
      setInitialPositionSeconds(getResumePositionSeconds({ savedPositionSeconds, serverPositionTicks: resumeTicks === undefined ? null : resumeTicks }));
      setPlaybackSource(nextSource);
      setPlaybackStartupMessage('Starting playback...');
      emitLoadTimingMilestone(timingRecorder.mark('player-launch-requested'));
    } catch (err) {
      if (playbackAttemptGenerationRef.current.isCurrent(playbackAttempt)) {
        setPlaybackSource(null);
        setPlaybackStartupMessage('');
        setPlaybackErrorMessage('Could not prepare desktop playback.');
        currentPlaybackLaunchRef.current = null;
      }
    }
  }

  function handlePlaybackLaunchReady({
    launchRequestId,
  }: {
    itemId: string;
    launchRequestId?: number;
  }) {
    const currentLaunch = currentPlaybackLaunchRef.current;

    if (!currentLaunch || launchRequestId !== currentLaunch.launchRequestId) {
      return;
    }

    setPlaybackStartupMessage('');
    emitLoadTimingMilestone(currentLaunch.timingRecorder.mark('playback-ready'));
    currentPlaybackLaunchRef.current = null;
  }

  function handlePlaybackLaunchFailure({
    launchRequestId,
    message,
  }: {
    itemId: string;
    launchRequestId?: number;
    message: string;
  }) {
    const currentLaunch = currentPlaybackLaunchRef.current;

    if (!currentLaunch || launchRequestId !== currentLaunch.launchRequestId) {
      return;
    }

    setPlaybackStartupMessage('');
    setPlaybackErrorMessage(message);
    emitLoadTimingMilestone(currentLaunch.timingRecorder.mark('playback-recoverable-failure', 'failure'));
    currentPlaybackLaunchRef.current = null;
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
        authMode: nextSource.authMode,
        httpHeaders: nextSource.httpHeaders,
        itemId: episode.id,
        redactedDisplayUrl: nextSource.redactedDisplayUrl,
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

  async function handleProgress({ itemId: progressItemId, positionSeconds, durationSeconds, final = false }: { itemId: string; positionSeconds: number; durationSeconds: number; final?: boolean; }) {
    if (!session || progressItemId !== playbackItemId) return;

    const normalizedPositionSeconds = Math.max(0, Math.floor(positionSeconds));
    const normalizedDurationSeconds = Math.max(0, Math.floor(durationSeconds));
    const nowMs = Date.now();
    const { lastReportedAtMs, lastReportedPositionSeconds } = progressStateRef.current;

    if (!shouldSyncPlaybackProgress({
      final,
      lastReportedAtMs,
      lastReportedPositionSeconds,
      nowMs,
      positionSeconds: normalizedPositionSeconds,
      reportIntervalMs: PROGRESS_REPORT_INTERVAL_MS,
    })) {
      return;
    }

    progressStateRef.current = {
      lastReportedAtMs: nowMs,
      lastReportedPositionSeconds: normalizedPositionSeconds,
    };

    const progressKey = resolvedActiveAccountId
      ? createAccountScopedProgressKey(resolvedActiveAccountId, progressItemId)
      : progressItemId;
    const nextProgress: PlaybackProgress = createLocalProgressUpdate({
      itemId: progressItemId,
      positionSeconds: normalizedPositionSeconds,
      durationSeconds: normalizedDurationSeconds,
      now: new Date().toISOString(),
      final,
    });

    progressSyncQueueRef.current = progressSyncQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await window.embyDesktop.storage.write({
            clearHomeCache: true,
            progressByItemId: {
              [progressKey]: nextProgress,
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
          await Promise.resolve(window.embyDesktop.storage.write({
            progressByItemId: {
              [progressKey]: createConfirmedProgressUpdate(
                nextProgress,
                new Date().toISOString()
              ),
            },
          })).catch(() => undefined);
        } catch (error) {
          await Promise.resolve(window.embyDesktop.storage.write({
            progressByItemId: {
              [progressKey]: createFailedProgressUpdate(
                nextProgress,
                error,
                new Date().toISOString()
              ),
            },
          })).catch(() => undefined);
        }
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
      {playbackStartupMessage ? <p role="status">{playbackStartupMessage}</p> : null}
      
      {session && initialPositionSeconds !== null && playbackSource ? (
        <PlayerPage
          authMode={playbackSource.authMode}
          httpHeaders={playbackSource.httpHeaders}
          itemId={playbackItemId}
          launchRequestId={playbackLaunchId}
          redactedDisplayUrl={playbackSource.redactedDisplayUrl}
          title={playbackTitle || details.name}
          streamUrl={playbackSource.streamUrl}
          initialPositionSeconds={initialPositionSeconds}
          episodeSelector={playbackEpisodeSelector}
          onEpisodeSelect={handleEpisodeSelect}
          onLaunchFailure={handlePlaybackLaunchFailure}
          onLaunchReady={handlePlaybackLaunchReady}
          onProgress={handleProgress}
        />
      ) : null}

      <ItemDetailsPage
        details={details}
        similarItems={similarItems}
        seasons={seasons}
        episodes={episodes}
        optionalFailureMessage={optionalFailureMessage}
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
      const desktopBridge = window.embyDesktop;
      const storageBridge = desktopBridge?.storage;
      const authBridge = desktopBridge?.auth;

      if (!storageBridge?.write || !authBridge?.login) {
        setErrorMessage('Desktop integration is unavailable. Restart the app and try again.');
        return;
      }

      const normalizedServerUrl = normalizeServerUrl(serverUrl);
      const session = await authBridge.login({
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
    let emittedHomePrimaryVisible = false;
    const timingRecorder = createLoadTimingRecorder({
      attemptId: Date.now(),
      surface: 'home',
    });
    const homeSnapshotKey = resolvedActiveAccountId
      ? createSessionSnapshotKey({
          accountId: resolvedActiveAccountId,
          parts: ['home', getSessionSnapshotScopeId(), settings.librarySortMode],
        })
      : null;
    const homeSnapshot = homeSnapshotKey ? homeSessionSnapshots.get(homeSnapshotKey) : undefined;

    setIsLoading(true);
    setErrorMessage('');
    setHasRenderedHomeSnapshot(false);

    async function refreshHomeData(): Promise<HomeRouteData> {
      const nextViews = await fetchViews(serverUrl, userId, accessToken);
      const featuredViews = pickFeaturedViews(nextViews);
      const [serverResumeItems, serverResumableItems, previewResults] = await Promise.all([
        fetchResumeItems(serverUrl, userId, accessToken).catch(() => []),
        fetchResumableItems(serverUrl, userId, accessToken).catch(() => []),
        Promise.all(
          nextViews.map(async (view) => {
            try {
              return {
                items: await fetchItems(serverUrl, userId, view.id, accessToken, {
                limit: 8,
                sortMode: settings.librarySortMode,
              }),
                view,
              };
            } catch (error) {
              const message =
                error instanceof Error && error.message.trim()
                  ? error.message.trim()
                  : 'Preview refresh failed';

              return {
                failedSection: {
                  sectionId: `preview:${view.id}`,
                  title: view.name,
                  message,
                },
                items: [] as LibraryItem[],
                view,
              };
            }
          })
        ),
      ]);
      const failedSections = previewResults
        .map((entry) => entry.failedSection)
        .filter((entry): entry is HomeRefreshFailure => Boolean(entry));
      const previewItemsByViewId = new Map(
        previewResults.map((entry) => [entry.view.id, entry.items.slice(0, 8)])
      );
      const refreshStatusMessage = buildHomeRefreshStatusMessage(failedSections);
      return {
        accountLabel: currentHomeAccountLabelRef.current,
        continueWatching: buildServerContinueWatchingItems({
          serverItems: [...serverResumeItems, ...serverResumableItems],
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
        refreshStatusMessage,
      };
    }

    function renderHomeData(
      nextHomeData: HomeRouteData,
      milestoneName: 'home-primary-visible' | 'home-revisit-visible' = 'home-primary-visible'
    ) {
      setHomeAccountLabel(nextHomeData.accountLabel);
      setContinueWatching(nextHomeData.continueWatching);
      setLibraries(nextHomeData.libraries);
      setFeaturedRows(nextHomeData.featuredRows);
      setHasRenderedHomeSnapshot(true);
      setIsLoading(false);
      setErrorMessage(nextHomeData.refreshStatusMessage ?? '');

      if (homeSnapshotKey) {
        homeSessionSnapshots.set(homeSnapshotKey, {
          accountLabel: nextHomeData.accountLabel,
          continueWatching: nextHomeData.continueWatching,
          featuredRows: nextHomeData.featuredRows,
          libraries: nextHomeData.libraries,
        });
      }

      if (!emittedHomePrimaryVisible) {
        emittedHomePrimaryVisible = true;
        emitLoadTimingMilestone(timingRecorder.mark(milestoneName));
      }
    }

    async function refreshContinueWatchingData(): Promise<HomePosterItem[] | null> {
      const [serverResumeItems, serverResumableItems] = await Promise.all([
        fetchResumeItems(serverUrl, userId, accessToken).catch(() => null),
        fetchResumableItems(serverUrl, userId, accessToken).catch(() => null),
      ]);

      if (!serverResumeItems && !serverResumableItems) {
        return null;
      }

      return buildServerContinueWatchingItems({
        serverItems: [...(serverResumeItems ?? []), ...(serverResumableItems ?? [])],
      });
    }

    async function loadHomeData() {
      let renderedReusableContent = Boolean(homeSnapshot);

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

        if (settings.cache.dataCacheEnabled && hasCompleteCacheEntry) {
          renderHomeData({
            accountLabel: cacheEntry.accountLabel,
            continueWatching: Array.isArray(cacheEntry.continueWatching)
              ? dedupeContinueWatchingPosterItems(cacheEntry.continueWatching)
              : [],
            libraries: Array.isArray(cacheEntry.libraries) ? cacheEntry.libraries : [],
            featuredRows: Array.isArray(cacheEntry.featuredRows) ? cacheEntry.featuredRows : [],
          });
          renderedReusableContent = true;
        }

        if (
          settings.cache.dataCacheEnabled &&
          cacheEntry &&
          hasCompleteCacheEntry &&
          isHomeCacheFresh(cacheEntry.cachedAt, Date.now(), settings.cache.dataCacheTtlDays)
        ) {
          const refreshedContinueWatching = await refreshContinueWatchingData();

          if (!cancelled && refreshedContinueWatching) {
            setContinueWatching(refreshedContinueWatching);

            if (cacheKey) {
              void Promise.resolve()
                .then(() =>
                  window.embyDesktop.storage.write({
                    homeCacheByKey: {
                      [cacheKey]: {
                        ...cacheEntry,
                        continueWatching: refreshedContinueWatching,
                      },
                    },
                  })
                )
                .catch(() => undefined);
            }
          }

          return;
        }

        const nextHomeData = await refreshHomeData();

        if (cancelled) {
          return;
        }

        renderHomeData(nextHomeData);

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

        if (renderedReusableContent) {
          setErrorMessage(createHomeCacheFallbackStatusMessage());
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

    if (homeSnapshot) {
      renderHomeData(homeSnapshot, 'home-revisit-visible');
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
          refreshStatusMessage={errorMessage && hasRenderedHomeSnapshot ? errorMessage : undefined}
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
  const libraryGenerationRef = useRef(createRequestGenerationGuard());
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

    const generation = libraryGenerationRef.current.next();
    let cancelled = false;

    setIsLoading(true);
    setErrorMessage('');

    fetchItems(serverUrl, session.userId, viewId, session.accessToken, {
      sortMode: settings.librarySortMode,
    })
      .then((nextItems) => {
        if (!cancelled && libraryGenerationRef.current.isCurrent(generation)) {
          setItems(nextItems);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled && libraryGenerationRef.current.isCurrent(generation)) {
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
  const [unavailableServers, setUnavailableServers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const aggregateGenerationRef = useRef(createRequestGenerationGuard());

  useEffect(() => {
    if (accounts.length === 0) {
      setRows([]);
      setUnavailableServers([]);
      setIsLoading(false);
      return;
    }

    const generation = aggregateGenerationRef.current.next();
    let cancelled = false;

    setIsLoading(true);
    setErrorMessage('');
    setUnavailableServers([]);

    window.embyDesktop.storage
      .read()
      .then(async (persistedState) => {
        void persistedState;
        const optionalFailures: BrowsingSectionFailure[] = [];
        const nextRows = await Promise.all(
          accounts.map(async (account): Promise<LoadedAggregatePosterRow> => {
            const [serverResumeItemsResult, serverResumableItemsResult] = await Promise.allSettled([
              fetchResumeItems(account.serverUrl, account.userId, account.accessToken),
              fetchResumableItems(account.serverUrl, account.userId, account.accessToken),
            ]);
            const serverResumeItems =
              serverResumeItemsResult.status === 'fulfilled' ? serverResumeItemsResult.value : [];
            const serverResumableItems =
              serverResumableItemsResult.status === 'fulfilled'
                ? serverResumableItemsResult.value
                : [];

            if (
              serverResumeItemsResult.status === 'rejected' ||
              serverResumableItemsResult.status === 'rejected'
            ) {
              optionalFailures.push(
                createBrowsingSectionFailure({
                  section: 'server-resume',
                  label: account.serverUrl,
                  error:
                    serverResumeItemsResult.status === 'rejected'
                      ? serverResumeItemsResult.reason
                      : serverResumableItemsResult.status === 'rejected'
                        ? serverResumableItemsResult.reason
                        : undefined,
                  serverId: account.id,
                })
              );
            }

            return {
              id: account.id,
              serverUrl: account.serverUrl,
              title: account.serverUrl,
              items: buildServerContinueWatchingItems({
                serverItems: [...serverResumeItems, ...serverResumableItems],
              }).map((item): AggregatePosterItem => ({
                ...item,
                accountId: account.id,
              })),
            };
          })
        );

        if (!cancelled && aggregateGenerationRef.current.isCurrent(generation)) {
          setRows(nextRows);
          setUnavailableServers(optionalFailures.map((failure) => failure.label));
          setErrorMessage(buildOptionalFailureMessage(optionalFailures) ?? '');
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled && aggregateGenerationRef.current.isCurrent(generation)) {
          setRows([]);
          setUnavailableServers([]);
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
      {errorMessage && rows.length === 0 ? <p role="alert">{errorMessage}</p> : null}
      {isLoading ? (
        <p>Loading aggregate view...</p>
      ) : errorMessage && rows.length === 0 ? null : (
        <AggregateViewPage
          rows={displayRows}
          unavailableServers={unavailableServers.map((serverUrl) => getServerDisplayName(serverUrl))}
          onOpenItem={handleOpenItem}
        />
      )}
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
  const searchGenerationRef = useRef(createRequestGenerationGuard());

  useEffect(() => {
    if (!session || !query) {
      setItems([]);
      setIsLoading(false);
      setErrorMessage('');
      return;
    }

    const generation = searchGenerationRef.current.next();
    let cancelled = false;

    setIsLoading(true);
    setErrorMessage('');

    fetchSearchItems(serverUrl, session.userId, query, session.accessToken)
      .then((nextItems) => {
        if (!cancelled && searchGenerationRef.current.isCurrent(generation)) {
          setItems(nextItems);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled && searchGenerationRef.current.isCurrent(generation)) {
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
    const settingsPatch = createProxySettingsPatch(next);

    await window.embyDesktop.storage.write({
      settings: settingsPatch,
    });
    updateSettings(settingsPatch);
  }

  async function handleDanmakuServersSave(next: DanmakuServerSettings[]) {
    const settingsPatch = createDanmakuServersSettingsPatch(next);

    await window.embyDesktop.storage.write({
      settings: settingsPatch,
    });
    updateSettings(settingsPatch);
  }

  async function handleDanmakuSettingsSave(next: DanmakuSettings) {
    const settingsPatch = createDanmakuSettingsPatch(next);

    await window.embyDesktop.storage.write({
      settings: settingsPatch,
    });
    updateSettings(settingsPatch);
  }

  async function handlePlaybackSettingsSave(next: PlaybackSettings) {
    const settingsPatch = createPlaybackSettingsPatch(next);

    await window.embyDesktop.storage.write({
      settings: settingsPatch,
    });
    updateSettings(settingsPatch);
  }

  async function handleSubtitleSettingsSave(next: SubtitleSettings) {
    const settingsPatch = createSubtitleSettingsPatch(next);

    await window.embyDesktop.storage.write({
      settings: settingsPatch,
    });
    updateSettings(settingsPatch);
  }

  async function handleCacheSettingsSave(next: CacheSettings) {
    const imageCacheResolutionChanged =
      next.imageCacheResolution !== settings.cache.imageCacheResolution;
    const settingsPatch = createCacheSettingsPatch(next);

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
