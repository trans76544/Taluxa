import type { HomeLibraryCard, HomePosterItem, HomePosterRow } from '@shared/api/emby/home';
import type { LibrarySortMode } from '@shared/models/settings';
import { ContinueWatchingRow } from '@renderer/components/ContinueWatchingRow';
import { LibraryCardRow } from '@renderer/components/LibraryCardRow';
import { PosterRow } from '@renderer/components/PosterRow';

interface HomePageProps {
  accountLabel: string;
  continueWatching: HomePosterItem[];
  libraries: HomeLibraryCard[];
  featuredRows: HomePosterRow[];
  refreshStatusMessage?: string;
  sortMode: LibrarySortMode;
  onSortModeChange: (nextSortMode: LibrarySortMode) => void;
  onRemoveFromContinueWatching?: (item: HomePosterItem) => void;
  onAddToFavorites?: (item: HomePosterItem) => void;
  onMarkPlayed?: (item: HomePosterItem) => void;
}

export function HomePage({
  accountLabel,
  continueWatching,
  libraries,
  featuredRows,
  refreshStatusMessage,
  sortMode,
  onSortModeChange,
  onRemoveFromContinueWatching,
  onAddToFavorites,
  onMarkPlayed,
}: HomePageProps) {
  void sortMode;
  void onSortModeChange;

  return (
    <section className="home-screen">
      <div className="home-screen__intro">
        <h1 className="home-screen__title">{accountLabel}</h1>
      </div>

      {refreshStatusMessage ? (
        <p className="home-screen__status" role="status">
          {refreshStatusMessage}
        </p>
      ) : null}

      {continueWatching && continueWatching.length > 0 && (
        <ContinueWatchingRow
          title="继续观看"
          items={continueWatching}
          onRemoveFromContinueWatching={onRemoveFromContinueWatching}
          onAddToFavorites={onAddToFavorites}
          onMarkPlayed={onMarkPlayed}
        />
      )}

      {libraries && libraries.length > 0 && <LibraryCardRow title="媒体库" items={libraries} />}

      {featuredRows.filter((row) => row.items.length > 0).map((row) => (
        <PosterRow
          key={row.id}
          title={row.title}
          href={row.href}
          state={row.state}
          items={row.items}
        />
      ))}
    </section>
  );
}
