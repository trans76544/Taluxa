import { Link } from 'react-router-dom';
import type { LibraryView } from '@shared/models/library';

interface LibraryViewsPageProps {
  views: LibraryView[];
}

export function LibraryViewsPage({ views }: LibraryViewsPageProps) {
  return (
    <section className="stack">
      <div>
        <h2>Your libraries</h2>
        <p>Pick a library to browse movies and episodes.</p>
      </div>

      {views.length > 0 ? (
        <ul className="stack">
          {views.map((view) => (
            <li key={view.id}>
              <Link to={`/libraries/${view.id}`} state={{ libraryName: view.name }}>
                {view.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>No libraries found.</p>
      )}
    </section>
  );
}
