import type { LibraryImageCandidate, LibraryItem, LibraryView } from '@shared/models/library';
import type { PlaybackProgress } from '@shared/models/progress';

export interface HomePosterItem {
  id: string;
  title: string;
  subtitle: string;
  posterUrl: string;
  imageCandidates: LibraryImageCandidate[];
  href: string;
  state?: {
    title?: string;
    serverPositionTicks?: number | null;
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
    .map((progress) => args.itemsById[progress.itemId])
    .filter((item): item is LibraryItem => Boolean(item))
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      title: item.name,
      subtitle: 'Continue watching',
      posterUrl: item.posterUrl,
      imageCandidates: item.imageCandidates,
      href: `/player/${item.id}`,
      state: {
        title: item.name,
        serverPositionTicks: item.serverPositionTicks,
      },
    }));
}

export function pickFeaturedViews(views: LibraryView[]): LibraryView[] {
  return views.slice(0, 3);
}
