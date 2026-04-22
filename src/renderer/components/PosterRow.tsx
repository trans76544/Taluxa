import { Link } from 'react-router-dom';
import { PosterCard } from './PosterCard';

import type { HomePosterItem } from '@shared/api/emby/home';

interface PosterRowProps {
  title: string;
  href: string;
  state?: {
    libraryName: string;
  };
  items: HomePosterItem[];
}

export function PosterRow({ title, href, state, items }: PosterRowProps) {
  return (
    <section className="home-section">
      <div className="home-section__header">
        <h2>{title}</h2>
        <Link to={href} state={state}>
          View all
        </Link>
      </div>

      {items.length > 0 ? (
        <div className="poster-row-grid">
          {items.map((item) => (
            <PosterCard
              key={item.id}
              title={item.title}
              subtitle={item.subtitle}
              posterUrl={item.posterUrl}
              imageCandidates={item.imageCandidates}
              href={item.href}
              state={item.state}
            />
          ))}
        </div>
      ) : (
        <p className="home-section__empty">No items available yet.</p>
      )}
    </section>
  );
}
