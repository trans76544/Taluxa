import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LibraryImageCandidate } from '@shared/models/library';

interface PosterCardProps {
  title: string;
  subtitle: string;
  posterUrl: string;
  imageCandidates?: LibraryImageCandidate[];
  href: string;
  state?: {
    title?: string;
    serverPositionTicks?: number | null;
  };
}

function getPosterCandidates(
  posterUrl: string,
  imageCandidates: LibraryImageCandidate[] | undefined
): string[] {
  const candidates: string[] = [];

  for (const candidateUrl of [
    posterUrl,
    ...(imageCandidates ?? []).map((candidate) => candidate.url),
  ]) {
    if (!candidateUrl || candidates.includes(candidateUrl)) {
      continue;
    }

    candidates.push(candidateUrl);
  }

  return candidates;
}

export function PosterCard({
  title,
  subtitle,
  posterUrl,
  imageCandidates,
  href,
  state,
}: PosterCardProps) {
  const candidates = getPosterCandidates(posterUrl, imageCandidates);
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [posterUrl, imageCandidates]);

  const activePosterUrl = candidates[candidateIndex] ?? null;

  return (
    <Link className="poster-card" to={href} state={state}>
      {activePosterUrl ? (
        <img
          className="poster-card__image"
          alt={title}
          src={activePosterUrl}
          onError={() => {
            setCandidateIndex((currentIndex) => currentIndex + 1);
          }}
        />
      ) : (
        <div className="poster-card__image poster-card__image--placeholder" aria-hidden="true" />
      )}
      <span className="poster-card__title">{title}</span>
      <span className="poster-card__subtitle">{subtitle}</span>
    </Link>
  );
}
