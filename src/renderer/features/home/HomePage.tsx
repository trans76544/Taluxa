import { ContinueWatchingRow } from '@renderer/components/ContinueWatchingRow';
import { LibraryCardRow } from '@renderer/components/LibraryCardRow';
import { PosterRow } from '@renderer/components/PosterRow';

import type { HomeLibraryCard, HomePosterItem, HomePosterRow } from '@shared/api/emby/home';

interface HomePageProps {
  accountLabel: string;
  continueWatching: HomePosterItem[];
  libraries: HomeLibraryCard[];
  featuredRows: HomePosterRow[];
}

export function HomePage({
  accountLabel,
  continueWatching,
  libraries,
  featuredRows,
}: HomePageProps) {
  return (
    <section className="home-screen">
      <div className="home-screen__intro">
        <p className="eyebrow">Active account</p>
        <p className="home-screen__account">{accountLabel}</p>
      </div>

      <ContinueWatchingRow title="Continue Watching" items={continueWatching} />
      <LibraryCardRow title="Libraries" items={libraries} />

      {featuredRows.map((row) => (
        <PosterRow key={row.id} title={row.title} href={row.href} state={row.state} items={row.items} />
      ))}
    </section>
  );
}
