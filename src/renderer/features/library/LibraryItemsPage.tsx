import { PosterCard } from '@renderer/components/PosterCard';
import type { LibraryItem } from '@shared/models/library';
import type { LibrarySortMode } from '@shared/models/settings';

interface LibraryItemsPageProps {
  libraryName: string;
  sortMode: LibrarySortMode;
  onSortModeChange: (nextSortMode: LibrarySortMode) => void;
  items: LibraryItem[];
}

const SORT_OPTIONS: Array<{ label: string; value: LibrarySortMode }> = [
  { label: 'Recently Added', value: 'latest_added' },
  { label: 'Release Date', value: 'release_date' },
];

function formatRuntime(runtimeTicks: number | null) {
  if (typeof runtimeTicks !== 'number' || runtimeTicks <= 0) {
    return 'Unknown runtime';
  }

  const runtimeMinutes = Math.round(runtimeTicks / 600000000);
  return `${runtimeMinutes} min`;
}

export function LibraryItemsPage({
  libraryName,
  sortMode,
  onSortModeChange,
  items,
}: LibraryItemsPageProps) {
  return (
    <section className="home-section library-items-page">
      <div className="library-items-page__header">
        <div>
          <h2>Browse items</h2>
          <p>{libraryName}</p>
        </div>
        <div role="group" aria-label="Library sort mode">
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

      {items.length > 0 ? (
        <ul className="library-items-grid">
          {items.map((item) => (
            <li key={item.id}>
              <PosterCard
                title={item.name}
                subtitle={formatRuntime(item.runtimeTicks)}
                posterUrl={item.posterUrl}
                imageCandidates={item.imageCandidates}
                href={`/item/${item.id}`}
                state={{ title: item.name, serverPositionTicks: item.serverPositionTicks }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="home-section__empty">No items found.</p>
      )}
    </section>
  );
}
