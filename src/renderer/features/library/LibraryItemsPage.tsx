import { PosterCard } from '@renderer/components/PosterCard';
import type { LibraryItem } from '@shared/models/library';

interface LibraryItemsPageProps {
  libraryName: string;
  items: LibraryItem[];
}

function formatRuntime(runtimeTicks: number | null) {
  if (typeof runtimeTicks !== 'number' || runtimeTicks <= 0) {
    return 'Unknown runtime';
  }

  const runtimeMinutes = Math.round(runtimeTicks / 600000000);
  return `${runtimeMinutes} min`;
}

export function LibraryItemsPage({ libraryName, items }: LibraryItemsPageProps) {
  return (
    <section className="home-section library-items-page">
      <div className="library-items-page__header">
        <h2>Browse items</h2>
        <p>{libraryName}</p>
      </div>

      {items.length > 0 ? (
        <ul className="library-items-grid">
          {items.map((item) => (
            <li key={item.id}>
              <PosterCard
                title={item.name}
                subtitle={formatRuntime(item.runtimeTicks)}
                posterUrl={item.posterUrl}
                href={`/player/${item.id}`}
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
