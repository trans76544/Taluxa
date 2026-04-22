import { PosterCard } from './PosterCard';

import type { HomePosterItem } from '@shared/api/emby/home';

interface ContinueWatchingRowProps {
  title: string;
  items: HomePosterItem[];
}

export function ContinueWatchingRow({ title, items }: ContinueWatchingRowProps) {
  return (
    <section className="home-section">
      <div className="home-section__header">
        <h2>{title}</h2>
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
        <p className="home-section__empty">Nothing to resume yet.</p>
      )}
    </section>
  );
}
