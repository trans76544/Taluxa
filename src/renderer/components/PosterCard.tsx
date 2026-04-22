import { Link } from 'react-router-dom';

interface PosterCardProps {
  title: string;
  subtitle: string;
  posterUrl: string;
  href: string;
  state?: {
    title?: string;
    serverPositionTicks?: number | null;
  };
}

export function PosterCard({ title, subtitle, posterUrl, href, state }: PosterCardProps) {
  return (
    <Link className="poster-card" to={href} state={state}>
      {posterUrl ? (
        <img className="poster-card__image" alt={title} src={posterUrl} />
      ) : (
        <div className="poster-card__image poster-card__image--placeholder" aria-hidden="true" />
      )}
      <span className="poster-card__title">{title}</span>
      <span className="poster-card__subtitle">{subtitle}</span>
    </Link>
  );
}
