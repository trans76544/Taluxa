import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import type { HomePosterItem } from '@shared/api/emby/home';
import { PosterCard } from '@renderer/components/PosterCard';

export interface AggregatePosterItem extends HomePosterItem {
  accountId: string;
}

export interface AggregatePosterRow {
  id: string;
  title: string;
  items: AggregatePosterItem[];
}

interface AggregateViewPageProps {
  rows: AggregatePosterRow[];
  unavailableServers?: string[];
  onOpenItem: (item: AggregatePosterItem, event: MouseEvent<HTMLAnchorElement>) => void;
}

function AggregateTabs() {
  return (
    <nav className="aggregate-tabs" aria-label="聚合视界">
      <button className="aggregate-tabs__item is-active" type="button" aria-pressed="true">
        <span aria-hidden="true">▶</span>
        继续播放
      </button>
      <button className="aggregate-tabs__item" type="button" aria-pressed="false">
        <span aria-hidden="true">♡</span>
        收藏
      </button>
      <Link className="aggregate-tabs__item" to="/libraries">
        <span aria-hidden="true">▣</span>
        媒体库
      </Link>
    </nav>
  );
}

export function AggregateViewPage({
  rows,
  unavailableServers = [],
  onOpenItem,
}: AggregateViewPageProps) {
  const visibleRows = rows.filter((row) => row.items.length > 0);

  return (
    <section className="home-screen home-screen--aggregate">
      <AggregateTabs />
      <h1 className="sr-only">聚合视界</h1>

      {unavailableServers.length > 0 ? (
        <p role="alert" className="home-section__status">
          Some servers could not load: {unavailableServers.join(', ')}.
        </p>
      ) : null}

      {visibleRows.length > 0 ? (
        visibleRows.map((row) => (
          <section className="home-section" key={row.id}>
            <div className="home-section__header">
              <h2>{row.title}</h2>
            </div>
            <div className="poster-row-grid">
              {row.items.map((item) => (
                <PosterCard
                  key={`${item.accountId}:${item.id}`}
                  title={item.title}
                  subtitle={item.subtitle}
                  posterUrl={item.posterUrl}
                  imageCandidates={item.imageCandidates}
                  href={item.href}
                  state={item.state}
                  landscape={true}
                  progressPercent={item.progressPercent}
                  className="poster-card--continue"
                  onClick={(event) => onOpenItem(item, event)}
                />
              ))}
            </div>
          </section>
        ))
      ) : (
        <p className="home-section__empty">还没有可继续播放的内容。</p>
      )}
    </section>
  );
}
