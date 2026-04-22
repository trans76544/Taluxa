import { Link } from 'react-router-dom';

import type { HomeLibraryCard } from '@shared/api/emby/home';

interface LibraryCardRowProps {
  title: string;
  items: HomeLibraryCard[];
}

export function LibraryCardRow({ title, items }: LibraryCardRowProps) {
  return (
    <section className="home-section">
      <div className="home-section__header">
        <h2>{title}</h2>
      </div>

      {items.length > 0 ? (
        <div className="library-card-grid">
          {items.map((item) => (
            <Link className="library-card" key={item.id} to={item.href} state={item.state}>
              {item.posterUrl ? (
                <img className="library-card__image" alt={item.title} src={item.posterUrl} />
              ) : (
                <div className="library-card__image library-card__image--placeholder" aria-hidden="true" />
              )}
              <span className="library-card__title">{item.title}</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="home-section__empty">No libraries found.</p>
      )}
    </section>
  );
}
