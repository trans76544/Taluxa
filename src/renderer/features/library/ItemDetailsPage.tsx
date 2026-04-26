import { useEffect, useMemo, useState } from 'react';
import { PosterCard } from '@renderer/components/PosterCard';
import type {
  LibraryEpisode,
  LibraryItem,
  LibraryItemDetails,
  LibraryItemMediaSource,
  LibrarySeason,
} from '@shared/models/library';

interface PlaybackSelection {
  title?: string | null;
  mediaSourceId?: string | null;
  audioStreamIndex?: number | null;
}

interface ItemDetailsPageProps {
  details: LibraryItemDetails;
  similarItems: LibraryItem[];
  seasons: LibrarySeason[];
  episodes: LibraryEpisode[];
  selectedSeasonId: string;
  onSelectSeason: (seasonId: string) => void;
  onPlay: (itemId: string, resumeTicks?: number | null, selection?: PlaybackSelection) => void;
}

function formatRuntime(runtimeTicks: number | null) {
  if (typeof runtimeTicks !== 'number' || runtimeTicks <= 0) {
    return null;
  }
  const runtimeMinutes = Math.round(runtimeTicks / 600000000);
  return `${runtimeMinutes} 分钟`;
}

function getFileName(path: string | null | undefined) {
  return path?.split('\\').pop()?.split('/').pop() || 'Unknown file';
}

function formatBytes(size: number | null | undefined) {
  if (typeof size !== 'number' || size <= 0) {
    return null;
  }

  const gibibytes = size / 1024 / 1024 / 1024;
  return `${gibibytes.toFixed(gibibytes >= 10 ? 1 : 2)} GB`;
}

function formatBitrate(bitrate: number | null | undefined) {
  if (typeof bitrate !== 'number' || bitrate <= 0) {
    return null;
  }

  return `${(bitrate / 1000000).toFixed(1)} Mbps`;
}

function formatResolution(source: LibraryItemMediaSource) {
  const height = source.videoStream?.Height;

  if (typeof height === 'number' && height > 0) {
    return `${height}p`;
  }

  const width = source.videoStream?.Width;
  if (typeof width === 'number' && width > 0) {
    return `${width}w`;
  }

  return null;
}

function formatFrameRate(source: LibraryItemMediaSource) {
  const frameRate = source.videoStream?.RealFrameRate;

  if (typeof frameRate !== 'number' || frameRate <= 0) {
    return null;
  }

  return `${Math.round(frameRate)}Hz`;
}

function formatVersionOption(source: LibraryItemMediaSource) {
  const fileName = getFileName(source.path);
  const details = [
    formatResolution(source),
    source.videoStream?.Codec || source.videoCodec || null,
    formatBytes(source.size),
    formatBitrate(source.bitrate),
    formatFrameRate(source),
  ].filter(Boolean);

  return details.length > 0 ? `${fileName} - ${details.join(' / ')}` : fileName;
}

function formatAudioOption(audio: LibraryItemMediaSource['audioStreams'][number]) {
  const base =
    audio.DisplayTitle?.trim() ||
    [audio.Language, audio.Codec, audio.ChannelLayout || audio.Channels]
      .filter(Boolean)
      .join(' ') ||
    'Unknown audio';

  return audio.IsDefault ? `${base} (默认)` : base;
}

function getAudioValue(
  audio: LibraryItemMediaSource['audioStreams'][number],
  fallbackIndex: number
) {
  return String(typeof audio.Index === 'number' ? audio.Index : fallbackIndex);
}

function getDefaultAudioValue(source: LibraryItemMediaSource | undefined) {
  if (!source?.audioStreams.length) {
    return '';
  }

  const defaultAudioIndex = source.audioStreams.findIndex((audio) => audio.IsDefault);
  const selectedIndex = defaultAudioIndex >= 0 ? defaultAudioIndex : 0;

  return getAudioValue(source.audioStreams[selectedIndex], selectedIndex);
}

function formatEpisodePlaybackTitle(seriesName: string, episode: LibraryEpisode) {
  return `${seriesName} - S${episode.parentIndexNumber}:E${episode.indexNumber} - ${episode.name}`;
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
  const [selectedMediaSourceId, setSelectedMediaSourceId] = useState(
    details.mediaSources[0]?.id ?? ''
  );
  const [selectedEpisodeId, setSelectedEpisodeId] = useState('');
  const selectedEpisode = useMemo(
    () =>
      episodes.find((episode) => episode.id === selectedEpisodeId) ??
      episodes.find((episode) => episode.serverPositionTicks !== null && episode.serverPositionTicks > 0) ??
      episodes[0],
    [episodes, selectedEpisodeId]
  );
  const playbackMediaSources = isSeries
    ? selectedEpisode?.mediaSources ?? []
    : details.mediaSources;
  const selectedMediaSource = useMemo(
    () =>
      playbackMediaSources.find((source) => source.id === selectedMediaSourceId) ??
      playbackMediaSources[0],
    [playbackMediaSources, selectedMediaSourceId]
  );
  const [selectedAudioValue, setSelectedAudioValue] = useState(
    getDefaultAudioValue(selectedMediaSource)
  );

  useEffect(() => {
    const firstMediaSource = playbackMediaSources[0];
    setSelectedMediaSourceId(firstMediaSource?.id ?? '');
  }, [details.id, selectedEpisode?.id, playbackMediaSources]);

  useEffect(() => {
    setSelectedAudioValue(getDefaultAudioValue(selectedMediaSource));
  }, [selectedMediaSource]);

  const selectedAudioStreamIndex =
    selectedAudioValue.trim() === '' ? null : Number(selectedAudioValue);
  const playbackSelection = selectedMediaSource
    ? {
        mediaSourceId: selectedMediaSource.id,
        audioStreamIndex: selectedAudioStreamIndex !== null && Number.isFinite(selectedAudioStreamIndex)
          ? selectedAudioStreamIndex
          : null,
      }
    : undefined;
  const selectedEpisodePlaybackSelection =
    selectedEpisode && playbackSelection
      ? {
          ...playbackSelection,
          title: formatEpisodePlaybackTitle(details.name, selectedEpisode),
        }
      : selectedEpisode
        ? {
            title: formatEpisodePlaybackTitle(details.name, selectedEpisode),
          }
        : undefined;

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
                onClick={() => onPlay(details.id, details.serverPositionTicks, playbackSelection)}
              >
                <span className="btn-icon">▶</span> 播放
              </button>
            ) : (
              <div className="series-play-block">
                <button 
                  className="btn-play" 
                  onClick={() =>
                    selectedEpisode &&
                    onPlay(
                      selectedEpisode.id,
                      selectedEpisode.serverPositionTicks,
                      selectedEpisodePlaybackSelection
                    )
                  }
                  disabled={!selectedEpisode}
                >
                  <span className="btn-icon">▶</span> 播放
                </button>
                {selectedEpisode && (
                  <span className="series-play-subtitle">
                    S{selectedEpisode.parentIndexNumber}:E{selectedEpisode.indexNumber} - {selectedEpisode.name}
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
        </div>

        {playbackMediaSources.length > 0 && (
          <div className="item-hero__media-badge">
            <label className="media-select">
              <span className="media-select__label">版本</span>
              <select
                value={selectedMediaSource?.id ?? ''}
                onChange={(event) => setSelectedMediaSourceId(event.target.value)}
              >
                {playbackMediaSources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {formatVersionOption(source)}
                  </option>
                ))}
              </select>
            </label>
            <label className="media-select">
              <span className="media-select__label">音频</span>
              <select
                value={selectedAudioValue}
                onChange={(event) => setSelectedAudioValue(event.target.value)}
                disabled={!selectedMediaSource?.audioStreams.length}
              >
                {(selectedMediaSource?.audioStreams ?? []).map((audio, index) => (
                  <option key={getAudioValue(audio, index)} value={getAudioValue(audio, index)}>
                    {formatAudioOption(audio)}
                  </option>
                ))}
              </select>
            </label>
            {selectedMediaSource ? (
              <p className="media-select__summary">{formatVersionOption(selectedMediaSource)}</p>
            ) : null}
          </div>
        )}
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
                      setSelectedEpisodeId(eps.id);
                    }}
                    className={selectedEpisode?.id === eps.id ? 'episode-active' : ''}
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
