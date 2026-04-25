import { PosterCard } from '@renderer/components/PosterCard';
import type { LibraryItem, LibraryItemDetails, LibrarySeason, LibraryEpisode } from '@shared/models/library';

interface ItemDetailsPageProps {
  details: LibraryItemDetails;
  similarItems: LibraryItem[];
  seasons: LibrarySeason[];
  episodes: LibraryEpisode[];
  selectedSeasonId: string;
  onSelectSeason: (seasonId: string) => void;
  onPlay: (itemId: string, resumeTicks?: number | null) => void;
}

function formatRuntime(runtimeTicks: number | null) {
  if (typeof runtimeTicks !== 'number' || runtimeTicks <= 0) {
    return null;
  }
  const runtimeMinutes = Math.round(runtimeTicks / 600000000);
  return `${runtimeMinutes} 分钟`;
}

export function ItemDetailsPage({
  details,
  similarItems,
  seasons,
  episodes,
  selectedSeasonId,
  onSelectSeason,
  onPlay,
}: ItemDetailsPageProps) {
  const isSeries = details.type === 'Series';
  const runtimeLabel = formatRuntime(details.runtimeTicks);

  // For series, determine next up
  const activeEpisode = episodes.find(e => e.serverPositionTicks !== null && e.serverPositionTicks > 0) || episodes[0];

  return (
    <div className="item-details-page">
      {/* HERO SECTION */}
      <div 
        className="item-hero" 
        style={{ backgroundImage: details.backdropUrl ? `url(${details.backdropUrl})` : 'none' }}
      >
        <div className="item-hero__gradient"></div>
        <div className="item-hero__content">
          <h1 className="item-hero__title">{details.name}</h1>
          <div className="item-hero__meta">
            {details.communityRating !== null && <span className="meta-rating">★ {details.communityRating.toFixed(1)}</span>}
            {details.productionYear && <span>{details.productionYear}</span>}
            {runtimeLabel && <span>{runtimeLabel}</span>}
            {details.genres.length > 0 && <span>{details.genres.join(' / ')}</span>}
            {details.officialRating && <span className="meta-badge">{details.officialRating}</span>}
          </div>

          <div className="item-hero__overview">
            <p>{details.overview}</p>
          </div>

          <div className="item-hero__actions">
            {!isSeries ? (
              <button 
                className="btn-play" 
                onClick={() => onPlay(details.id, details.serverPositionTicks)}
              >
                <span className="btn-icon">▶</span> 播放
              </button>
            ) : (
              <div className="series-play-block">
                <button 
                  className="btn-play" 
                  onClick={() => activeEpisode && onPlay(activeEpisode.id, activeEpisode.serverPositionTicks)}
                  disabled={!activeEpisode}
                >
                  <span className="btn-icon">▶</span> 播放
                </button>
                {activeEpisode && (
                  <span className="series-play-subtitle">
                    S{activeEpisode.parentIndexNumber}:E{activeEpisode.indexNumber} - {activeEpisode.name}
                  </span>
                )}
              </div>
            )}
            <div className="action-icons">
              <button className="icon-btn">🔍</button>
              <button className="icon-btn">♡</button>
              <button className="icon-btn">✓</button>
            </div>
          </div>
          
          {/* Media Info embedded in Hero Bottom Right */}
          {details.mediaSources.length > 0 && !isSeries && (
            <div className="item-hero__media-badge">
              <div className="media-badge-row">
                <span className="media-badge-label">版本:</span>
                <span className="media-badge-value">{details.mediaSources[0].path?.split('\\').pop()?.split('/').pop() || 'Unknown File'}</span>
              </div>
              <div className="media-badge-row">
                <span className="media-badge-label">音频:</span>
                <span className="media-badge-value">
                  {details.mediaSources[0].audioStreams[0]?.Codec || 'Unknown'} 
                  {details.mediaSources[0].audioStreams[0]?.ChannelLayout ? ` ${details.mediaSources[0].audioStreams[0].ChannelLayout}` : ''}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="item-details-body">
        {/* SERIES SECTIONS */}
        {isSeries && episodes.length > 0 && (
          <section className="details-section">
            <h3 className="section-title">继续观看</h3>
            <ul className="library-items-grid episodes-row">
              {episodes.map(eps => (
                <li key={eps.id}>
                   <PosterCard
                    landscape
                    title={`${eps.indexNumber}. ${eps.name}`}
                    subtitle={formatRuntime(eps.runtimeTicks) || 'Ready to play'}
                    posterUrl={eps.posterUrl || ''}
                    imageCandidates={[]} // Not used immediately
                    href="#" // Prevent navigation
                    onClick={(e) => {
                      e.preventDefault();
                      onPlay(eps.id, eps.serverPositionTicks);
                    }}
                    state={{}}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {isSeries && seasons.length > 0 && (
          <section className="details-section">
            <h3 className="section-title">季</h3>
            <ul className="library-items-grid">
              {seasons.map(season => (
                <li key={season.id}>
                  <PosterCard
                    title={season.name}
                    subtitle=""
                    posterUrl={season.posterUrl || ''}
                    imageCandidates={[]}
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      onSelectSeason(season.id);
                    }}
                    className={selectedSeasonId === season.id ? 'season-active' : ''}
                    state={{}}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* CAST & CREW */}
        {details.people.length > 0 && (
          <section className="details-section">
            <h3 className="section-title">演职人员</h3>
            <div className="cast-carousel">
              {details.people.map(person => (
                <div key={person.id} className="cast-card">
                  <div className="cast-card__image" style={{ backgroundImage: person.imageUrl ? `url(${person.imageUrl})` : 'none' }}>
                    {!person.imageUrl && <span className="cast-card__fallback">?</span>}
                  </div>
                  <div className="cast-card__info">
                    <span className="cast-card__name">{person.name}</span>
                    <span className="cast-card__role">{person.role}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* SIMILAR ITEMS */}
        {similarItems.length > 0 && (
          <section className="details-section">
            <h3 className="section-title">更多类似</h3>
            <ul className="movies-carousel">
              {similarItems.map(item => (
                <li key={item.id}>
                  <PosterCard
                    title={item.name}
                    subtitle={formatRuntime(item.runtimeTicks) || ''}
                    posterUrl={item.posterUrl}
                    imageCandidates={item.imageCandidates}
                    href={`/item/${item.id}`}
                    state={{ title: item.name, serverPositionTicks: item.serverPositionTicks }}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* STUDIOS AND LINKS */}
        <section className="details-section metadata-footer">
          {details.studios.length > 0 && (
            <div className="metadata-row">
              <h4 className="metadata-title">工作室</h4>
              <p className="metadata-text">{details.studios.map(s => s.name).join(', ')}</p>
            </div>
          )}

          {details.externalUrls.length > 0 && (
            <div className="metadata-row">
              <h4 className="metadata-title">外部链接</h4>
              <div className="external-links">
                {details.externalUrls.map((link, idx) => (
                  <a key={idx} href={link.url} target="_blank" rel="noreferrer" className="external-link-badge">
                    {link.name}
                  </a>
                ))}
              </div>
            </div>
          )}
          
          {/* Detailed Media Streams */}
          {details.mediaSources.length > 0 && (
            <div className="metadata-row">
              <h4 className="metadata-title">媒体信息</h4>
              <div className="media-sources-list">
                {details.mediaSources.map(source => (
                  <div key={source.id} className="media-source-block">
                    <p className="source-filePath">{source.path}</p>
                    <div className="source-streams">
                      <div className="stream-box video-stream">
                        <h5>📽 视频</h5>
                        <p>编码器Id: {source.videoCodec}</p>
                        <p>宽度: {source.videoStream?.Width}</p>
                        <p>高度: {source.videoStream?.Height}</p>
                        <p>帧率: {source.videoStream?.RealFrameRate}</p>
                      </div>
                      <div className="stream-box audio-stream">
                        <h5>📻 音频</h5>
                        {source.audioStreams.map((audio, idx) => (
                          <div key={idx} className="audio-track">
                            <p>语言: {audio.Language}</p>
                            <p>编码器Id: {audio.Codec}</p>
                            <p>声道: {audio.Channels} ({audio.ChannelLayout})</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
