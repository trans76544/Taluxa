import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LibraryImageCandidate } from '@shared/models/library';
import { useCachedImageUrl } from './useCachedImageUrl';

interface PosterCardProps {
  title: string;
  subtitle: string;
  posterUrl: string;
  imageCandidates?: LibraryImageCandidate[];
  href: string;
  state?: {
    title?: string;
    serverPositionTicks?: number | null;
    resumeEpisodeId?: string;
    resumeSeasonId?: string;
    resumeSeasonIndex?: number;
  };
  landscape?: boolean;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  className?: string;
  communityRating?: number | null;
  productionYear?: number | null;
  progressPercent?: number;
  onContextMenu?: React.MouseEventHandler<HTMLAnchorElement>;
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
  landscape = false,
  onClick,
  className = '',
  communityRating,
  productionYear,
  progressPercent,
  onContextMenu,
}: PosterCardProps) {
  const candidates = getPosterCandidates(posterUrl, imageCandidates);
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [posterUrl, imageCandidates]);

  const activePosterUrl = candidates[candidateIndex] ?? null;
  const resolvedPosterUrl = useCachedImageUrl(activePosterUrl);
  const normalizedProgressPercent =
    typeof progressPercent === 'number' && Number.isFinite(progressPercent)
      ? Math.min(100, Math.max(0, progressPercent))
      : null;

  return (
    <Link
      className={`poster-card ${landscape ? 'poster-card--landscape' : ''} ${className}`}
      to={href}
      state={state}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <div className="poster-card__image-container">
        {activePosterUrl ? (
          <img
            className={`poster-card__image ${landscape ? 'poster-card__image--landscape' : ''}`}
            alt={title}
            src={resolvedPosterUrl ?? activePosterUrl}
            loading="lazy"
            decoding="async"
            onError={() => {
              setCandidateIndex((currentIndex) => currentIndex + 1);
            }}
          />
        ) : (
          <div className={`poster-card__image poster-card__image--placeholder ${landscape ? 'poster-card__image--landscape' : ''}`} aria-hidden="true" />
        )}
        {communityRating != null && communityRating > 0 && (
          <div className="poster-card__rating">{communityRating.toFixed(1)}</div>
        )}
        {normalizedProgressPercent !== null && normalizedProgressPercent > 0 && (
          <div
            className="poster-card__progress"
            role="progressbar"
            aria-label="Watching progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(normalizedProgressPercent)}
          >
            <div
              className="poster-card__progress-fill"
              style={{ width: `${normalizedProgressPercent}%` }}
            />
          </div>
        )}
      </div>
      <span className="poster-card__title">{title}</span>
      <span className="poster-card__subtitle">{subtitle}</span>
    </Link>
  );
}
