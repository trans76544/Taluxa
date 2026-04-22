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

const SORT_OPTIONS: Array<{ label: string; value: LibrarySortMode }> = [
  { label: 'Recently Added', value: 'latest_added' },
  { label: 'Release Date', value: 'release_date' },
];

export function HomePage({
  accountLabel,
  continueWatching,
  libraries,
  featuredRows,
  sortMode,
  onSortModeChange,
}: HomePageProps) {
  return (
    <section className="home-screen">
      <div className="home-screen__intro">
        <p className="eyebrow">Active account</p>
        <p className="home-screen__account">{accountLabel}</p>
      </div>

      <div className="home-section__header" role="group" aria-label="Featured sort mode">
        <h2>Featured Sort</h2>
        <div>
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={sortMode === option.value}
              onClick={() => {
                if (option.value !== sortMode) {
                  void onSortModeChange(option.value);
                }
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <ContinueWatchingRow title="Continue Watching" items={continueWatching} />
      <LibraryCardRow title="Libraries" items={libraries} />

      {featuredRows.map((row) => (
        <PosterRow key={row.id} title={row.title} href={row.href} state={row.state} items={row.items} />
      ))}
    </section>
  );
}
