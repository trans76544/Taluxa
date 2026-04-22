import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { HomeLibraryCard } from '@shared/api/emby/home';

interface LibraryCardRowProps {
  title: string;
  items: HomeLibraryCard[];
}

function getLibraryCardCandidates(item: HomeLibraryCard): string[] {
  const candidates: string[] = [];

  for (const candidateUrl of [
    item.posterUrl,
    ...item.imageCandidates.map((candidate) => candidate.url),
  ]) {
    if (!candidateUrl || candidates.includes(candidateUrl)) {
      continue;
    }

    candidates.push(candidateUrl);
  }

  return candidates;
}

function LibraryCard({ item }: { item: HomeLibraryCard }) {
  const candidates = getLibraryCardCandidates(item);
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [item.posterUrl, item.imageCandidates]);

  const activePosterUrl = candidates[candidateIndex] ?? null;

  return (
    <Link className="library-card" to={item.href} state={item.state}>
      {activePosterUrl ? (
        <img
          className="library-card__image"
          alt={item.title}
          src={activePosterUrl}
          onError={() => {
            setCandidateIndex((currentIndex) => currentIndex + 1);
          }}
        />
      ) : (
        <div className="library-card__image library-card__image--placeholder" aria-hidden="true" />
      )}
      <span className="library-card__title">{item.title}</span>
    </Link>
  );
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
            <LibraryCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <p className="home-section__empty">No libraries found.</p>
      )}
    </section>
  );
}
