import type { LibraryImageCandidate, LibraryItem, LibraryView } from '@shared/models/library';
import type { PlaybackProgress } from '@shared/models/progress';

export interface HomePosterItem {
  id: string;
  title: string;
  subtitle: string;
  posterUrl: string;
  imageCandidates: LibraryImageCandidate[];
  href: string;
  progressPercent?: number;
  state?: {
    title?: string;
    serverPositionTicks?: number | null;
    resumeEpisodeId?: string;
    resumeSeasonId?: string;
    resumeSeasonIndex?: number;
  };
}

export interface HomePosterRow {
  id: string;
  title: string;
  href: string;
  state?: {
    libraryName: string;
  };
  items: HomePosterItem[];
}

export interface HomeRefreshFailure {
  sectionId: string;
  title: string;
  message: string;
}

export interface HomeLibraryCard {
  id: string;
  title: string;
  posterUrl: string;
  imageCandidates: LibraryImageCandidate[];
  href: string;
  state?: {
    libraryName: string;
  };
}

export function buildContinueWatchingItems(args: {
  progressByItemId: Record<string, PlaybackProgress>;
  itemsById: Record<string, LibraryItem>;
}): HomePosterItem[] {
  return Object.values(args.progressByItemId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((progress) => ({
      item: args.itemsById[progress.itemId],
      progress,
    }))
    .filter(
      (entry): entry is { item: LibraryItem; progress: PlaybackProgress } => Boolean(entry.item)
    )
    .filter(createLatestPerTitleFilter())
    .map(({ item, progress }) => buildContinueWatchingItem(item, progress));
}

export function buildServerContinueWatchingItems(args: {
  serverItems: LibraryItem[];
}): HomePosterItem[] {
  return args.serverItems
    .map((item, index) => ({ item, index }))
    .sort((left, right) => compareServerResumeItems(left, right))
    .map((item, index) => {
      const progress = createProgressFromServerItem(item.item, index);

      return progress ? buildContinueWatchingItem(item.item, progress) : null;
    })
    .filter((item): item is HomePosterItem => Boolean(item))
    .filter(createCachedContinueWatchingDedupeFilter());
}

export function dedupeContinueWatchingPosterItems(items: HomePosterItem[]): HomePosterItem[] {
  const seenKeys = new Set<string>();
  const nextItems: HomePosterItem[] = [];

  for (const item of items) {
    const dedupeKey = getCachedContinueWatchingDedupeKey(item);

    if (seenKeys.has(dedupeKey)) {
      continue;
    }

    seenKeys.add(dedupeKey);
    nextItems.push(item);
  }

  return nextItems;
}

function createProgressFromServerItem(
  item: LibraryItem,
  index: number
): PlaybackProgress | null {
  if (
    typeof item.serverPositionTicks !== 'number' ||
    typeof item.runtimeTicks !== 'number' ||
    item.serverPositionTicks <= 0 ||
    item.runtimeTicks <= 0
  ) {
    return null;
  }

  return {
    itemId: item.id,
    positionSeconds: Math.floor(item.serverPositionTicks / 10000000),
    durationSeconds: Math.max(1, Math.round(item.runtimeTicks / 10000000)),
    updatedAt: `server-resume-${String(index).padStart(4, '0')}`,
  };
}

function compareServerResumeItems(
  left: { item: LibraryItem; index: number },
  right: { item: LibraryItem; index: number }
): number {
  const leftTime = getResumeSortTime(left.item);
  const rightTime = getResumeSortTime(right.item);

  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return left.index - right.index;
}

function getResumeSortTime(item: LibraryItem): number {
  if (!item.lastPlayedAt) {
    return 0;
  }

  const timestamp = Date.parse(item.lastPlayedAt);

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function createCachedContinueWatchingDedupeFilter() {
  const seenKeys = new Set<string>();

  return (item: HomePosterItem) => {
    const dedupeKey = getCachedContinueWatchingDedupeKey(item);

    if (seenKeys.has(dedupeKey)) {
      return false;
    }

    seenKeys.add(dedupeKey);
    return true;
  };
}

function createLatestPerTitleFilter() {
  const seenKeys = new Set<string>();

  return ({ item }: { item: LibraryItem; progress: PlaybackProgress }) => {
    const dedupeKey = getContinueWatchingDedupeKey(item);

    if (seenKeys.has(dedupeKey)) {
      return false;
    }

    seenKeys.add(dedupeKey);
    return true;
  };
}

function getContinueWatchingDedupeKey(item: LibraryItem): string {
  if (item.type === 'Episode') {
    const seriesKey = item.seriesId?.trim() || item.seriesName?.trim();

    if (seriesKey) {
      return `series:${seriesKey}`;
    }
  }

  return `item:${item.id}`;
}

function getCachedContinueWatchingDedupeKey(item: HomePosterItem): string {
  if (item.state?.resumeEpisodeId) {
    return `series:${item.href}`;
  }

  return `item:${item.href || item.id}`;
}

function buildContinueWatchingItem(
  item: LibraryItem,
  progress: PlaybackProgress
): HomePosterItem {
  const progressPercent = getProgressPercent(progress);

  if (item.type === 'Episode') {
    const seriesTitle = item.seriesName?.trim() || item.name;
    const episodeSubtitle = formatEpisodeSubtitle(item);
    const state: HomePosterItem['state'] = {
      title: seriesTitle,
      serverPositionTicks: item.serverPositionTicks,
      resumeEpisodeId: item.id,
    };

    if (item.parentId) {
      state.resumeSeasonId = item.parentId;
    }

    if (typeof item.parentIndexNumber === 'number') {
      state.resumeSeasonIndex = item.parentIndexNumber;
    }

    return {
      id: item.id,
      title: seriesTitle,
      subtitle: episodeSubtitle,
      posterUrl: item.posterUrl,
      imageCandidates: item.imageCandidates,
      href: `/item/${item.seriesId || item.id}`,
      progressPercent,
      state,
    };
  }

  return {
    id: item.id,
    title: item.name,
    subtitle: typeof item.productionYear === 'number' ? String(item.productionYear) : '',
    posterUrl: item.posterUrl,
    imageCandidates: item.imageCandidates,
    href: `/item/${item.id}`,
    progressPercent,
    state: {
      title: item.name,
      serverPositionTicks: item.serverPositionTicks,
    },
  };
}

function getProgressPercent(progress: PlaybackProgress): number | undefined {
  if (progress.durationSeconds <= 0 || progress.positionSeconds <= 0) {
    return undefined;
  }

  return Math.min(100, Math.max(0, (progress.positionSeconds / progress.durationSeconds) * 100));
}

function formatEpisodeSubtitle(item: LibraryItem): string {
  const episodeName = item.name.trim();
  const seasonNumber = item.parentIndexNumber;
  const episodeNumber = item.indexNumber;

  if (typeof seasonNumber === 'number' && typeof episodeNumber === 'number') {
    return `S${seasonNumber}E${episodeNumber}${episodeName ? ` - ${episodeName}` : ''}`;
  }

  if (typeof episodeNumber === 'number') {
    return `E${episodeNumber}${episodeName ? ` - ${episodeName}` : ''}`;
  }

  return episodeName;
}

export function pickFeaturedViews(views: LibraryView[]): LibraryView[] {
  return views;
}

export function buildHomeRefreshStatusMessage(failedSections: HomeRefreshFailure[]): string {
  const failedTitles = failedSections
    .map((section) => section.title.trim())
    .filter(Boolean);

  if (failedTitles.length === 0) {
    return '';
  }

  return `Some home sections could not refresh: ${failedTitles.join(', ')}.`;
}
