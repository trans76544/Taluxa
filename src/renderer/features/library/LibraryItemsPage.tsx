import { Link } from 'react-router-dom';
import type { LibraryItem } from '@shared/models/library';

interface LibraryItemsPageProps {
  libraryName: string;
  items: LibraryItem[];
}

function formatRuntime(runtimeTicks: number | null) {
  if (runtimeTicks === null) {
    return 'Unknown runtime';
  }

  const runtimeMinutes = Math.round(runtimeTicks / 600000000);
  return `${runtimeMinutes} min`;
}

export function LibraryItemsPage({ libraryName, items }: LibraryItemsPageProps) {
  return (
    <section className="stack">
      <div>
        <h2>Browse items</h2>
        <p>{libraryName}</p>
      </div>

      {items.length > 0 ? (
        <ul className="stack">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={`/player/${item.id}`}
                state={{ title: item.name, serverPositionTicks: item.serverPositionTicks }}
              >
                {item.name}
              </Link>
              <p>{formatRuntime(item.runtimeTicks)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p>No items found.</p>
      )}
    </section>
  );
}
