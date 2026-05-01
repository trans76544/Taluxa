import type { LibrarySortMode } from '@shared/models/settings';
import type { HomeLibraryCard, HomePosterItem, HomePosterRow } from '@shared/api/emby/home';
import { ContinueWatchingRow } from '@renderer/components/ContinueWatchingRow';
import { LibraryCardRow } from '@renderer/components/LibraryCardRow';
import { PosterRow } from '@renderer/components/PosterRow';

interface HomePageProps {
  accountLabel: string;
  continueWatching: HomePosterItem[];
  libraries: HomeLibraryCard[];
  featuredRows: HomePosterRow[];
  sortMode: LibrarySortMode;
  onSortModeChange: (nextSortMode: LibrarySortMode) => void;
}

export function HomePage({
  accountLabel,
  continueWatching,
  libraries,
  featuredRows,
  sortMode,
  onSortModeChange,
}: HomePageProps) {
  void sortMode;
  void onSortModeChange;

  return (
    <section className="home-screen">
      <div className="home-screen__intro">
        <h1 className="home-screen__title">{accountLabel}</h1>
      </div>

      {continueWatching && continueWatching.length > 0 && (
        <ContinueWatchingRow title="继续观看" items={continueWatching} />
      )}

      {libraries && libraries.length > 0 && (
        <LibraryCardRow title="媒体库" items={libraries} />
      )}

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
