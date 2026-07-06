import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { HomeLibraryCard } from '@shared/api/emby/home';
import { useCachedImageUrl } from './useCachedImageUrl';

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

function LibraryCardCollageImage({
  alt,
  url,
  onError,
}: {
  alt: string;
  url: string;
  onError: () => void;
}) {
  const resolvedUrl = useCachedImageUrl(url);

  return (
    <img
      className="library-card__collage-image"
      alt={alt}
      src={resolvedUrl ?? url}
      loading="lazy"
      decoding="async"
      onError={onError}
    />
  );
}

function LibraryCard({ item }: { item: HomeLibraryCard }) {
  const candidates = getLibraryCardCandidates(item);
  const candidateKey = candidates.join('\n');
  const [failedCandidates, setFailedCandidates] = useState<string[]>([]);

  useEffect(() => {
    setFailedCandidates([]);
  }, [candidateKey]);

  const visibleCandidates = candidates
    .filter((candidateUrl) => !failedCandidates.includes(candidateUrl))
    .slice(0, 3);

  return (
    <Link className="library-card" to={item.href} state={item.state}>
      {visibleCandidates.length > 0 ? (
        <div className={`library-card__collage library-card__collage--${visibleCandidates.length}`}>
          {visibleCandidates.map((candidateUrl, index) => (
            <LibraryCardCollageImage
              key={candidateUrl}
              alt={index === 0 ? item.title : ''}
              url={candidateUrl}
              onError={() => {
                setFailedCandidates((currentCandidates) =>
                  currentCandidates.includes(candidateUrl)
                    ? currentCandidates
                    : [...currentCandidates, candidateUrl]
                );
              }}
            />
          ))}
        </div>
      ) : (
        <div className="library-card__image library-card__image--placeholder" aria-hidden="true" />
      )}
      <span className="library-card__title">{item.title}</span>
    </Link>
  );
}

export function LibraryCardRow({ title, items }: LibraryCardRowProps) {
  return (
    <section className="home-section home-section--libraries">
      <div className="home-section__header">
        <h2>{title}</h2>
      </div>

      {items.length > 0 ? (
        <div className="library-card-grid" aria-label={title}>
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
