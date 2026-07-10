import { readFileSync } from 'node:fs';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ItemDetailsPage } from './ItemDetailsPage';
import type { LibraryEpisode, LibraryItem, LibraryItemDetails, LibraryItemMediaSource } from '@shared/models/library';

let observedResizeCallbacks: ResizeObserverCallback[] = [];
let originalResizeObserver: typeof ResizeObserver | undefined;
let originalClientWidthDescriptor: PropertyDescriptor | undefined;
let originalGetBoundingClientRect: typeof HTMLElement.prototype.getBoundingClientRect;
let mockedCarouselViewportWidth = 500;

function createMediaSource(
  id: string,
  overrides: Partial<LibraryItemMediaSource> = {}
): LibraryItemMediaSource {
  return {
    id,
    container: 'mkv',
    path: `/media/${id}.mkv`,
    size: 12_000_000_000,
    bitrate: 20_000_000,
    videoCodec: 'hevc',
    videoStream: {
      Width: 1920,
      Height: 1080,
      RealFrameRate: 24,
      Codec: 'hevc',
    },
    audioStreams: [
      {
        Index: 1,
        DisplayTitle: 'AAC stereo',
        Codec: 'aac',
        Channels: 2,
        ChannelLayout: 'stereo',
        IsDefault: true,
      },
    ],
    ...overrides,
  };
}

function createMovieDetails(overrides: Partial<LibraryItemDetails> = {}): LibraryItemDetails {
  return {
    id: 'movie-1',
    name: 'Movie 1',
    type: 'Movie',
    overview: 'A test movie.',
    genres: ['Action'],
    communityRating: 6.4,
    officialRating: 'NR',
    productionYear: 2026,
    runtimeTicks: 60000000000,
    serverPositionTicks: 42000000,
    posterUrl: 'https://demo.local/poster.jpg',
    imageCandidates: [],
    backdropUrl: 'https://demo.local/backdrop.jpg',
    people: [],
    studios: [],
    externalUrls: [],
    mediaSources: [
      createMediaSource('source-1080', {
        container: 'mp4',
        path: '/movies/movie-1-1080p.mp4',
        audioStreams: [
          {
            Index: 1,
            DisplayTitle: 'AAC stereo',
            Codec: 'aac',
            Channels: 2,
            ChannelLayout: 'stereo',
            IsDefault: true,
          },
          {
            Index: 2,
            DisplayTitle: 'DTS 5.1',
            Codec: 'dts',
            Channels: 6,
            ChannelLayout: '5.1',
          },
        ],
      }),
      createMediaSource('source-2160', {
        container: 'mp4',
        path: '/movies/movie-1-2160p.mp4',
        size: 27_500_000_000,
        bitrate: 35_100_000,
        videoStream: {
          Width: 3840,
          Height: 2160,
          RealFrameRate: 60,
          Codec: 'hevc',
        },
        audioStreams: [
          {
            Index: 5,
            DisplayTitle: 'EAC3 5.1',
            Codec: 'eac3',
            Channels: 6,
            ChannelLayout: '5.1',
            IsDefault: true,
          },
        ],
      }),
    ],
    ...overrides,
  };
}

function createSeriesDetails(overrides: Partial<LibraryItemDetails> = {}): LibraryItemDetails {
  return createMovieDetails({
    id: 'series-1',
    name: 'Series 1',
    type: 'Series',
    runtimeTicks: null,
    serverPositionTicks: null,
    mediaSources: [],
    ...overrides,
  });
}

function createLongTitleMovieDetails(overrides: Partial<LibraryItemDetails> = {}): LibraryItemDetails {
  return createMovieDetails({
    name: 'A very long detail page title for backdrop layout testing',
    overview:
      'A long overview used to verify the full-page detail hero remains readable across layouts.',
    genres: ['Animation', 'Fantasy', 'Adventure', 'Comedy'],
    ...overrides,
  });
}

function createNoBackdropMovieDetails(
  overrides: Partial<LibraryItemDetails> = {}
): LibraryItemDetails {
  return createMovieDetails({
    backdropUrl: null,
    ...overrides,
  });
}

function createLongMediaSourceDetails(
  overrides: Partial<LibraryItemDetails> = {}
): LibraryItemDetails {
  return createLongTitleMovieDetails({
    mediaSources: [
      createMediaSource('source-long-1080', {
        path:
          '/movies/a-very-long-detail-page-title-for-backdrop-layout-testing-2026-1080p-h264-high-bitrate-theatrical-edition.mkv',
        audioStreams: [
          {
            Index: 11,
            DisplayTitle: 'Japanese AAC stereo commentary and default theatrical mix',
            Codec: 'aac',
            Channels: 2,
            ChannelLayout: 'stereo',
            IsDefault: true,
          },
        ],
      }),
    ],
    ...overrides,
  });
}

function createEpisode(overrides: Partial<LibraryEpisode> = {}): LibraryEpisode {
  return {
    id: 'episode-1',
    name: 'First Case',
    overview: '',
    indexNumber: 1,
    parentIndexNumber: 1,
    posterUrl: '',
    runtimeTicks: 600000000,
    serverPositionTicks: null,
    mediaSources: [createMediaSource('episode-1-source')],
    ...overrides,
  };
}

function createPeople(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `person-${index + 1}`,
    name: `Actor ${index + 1}`,
    role: `Role ${index + 1}`,
    type: 'Actor',
    imageUrl: `https://demo.local/person-${index + 1}.jpg`,
  }));
}

function createSimilarItems(count: number): LibraryItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `similar-${index + 1}`,
    name: `Similar ${index + 1}`,
    type: 'Movie',
    posterUrl: `https://demo.local/similar-${index + 1}.jpg`,
    imageCandidates: [],
    runtimeTicks: 60000000000 + index,
    serverPositionTicks: index,
    communityRating: null,
    productionYear: 2026,
  }));
}

function getCssRuleBody(selector: string) {
  const styles = getStylesheet();
  const selectorPattern = selector
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  return styles.match(new RegExp(`${selectorPattern}\\s*\\{(?<body>[^}]*)\\}`))?.groups?.body ?? '';
}

function getStylesheet() {
  return readFileSync('src/renderer/styles.css', 'utf8');
}

function expectCssRule(selector: string) {
  const ruleBody = getCssRuleBody(selector);

  return {
    toContainDeclaration(declaration: string) {
      expect(ruleBody).toContain(declaration);
    },
    notToContainDeclaration(declaration: string) {
      expect(ruleBody).not.toContain(declaration);
    },
  };
}

function installCarouselLayoutMocks(width = 500) {
  mockedCarouselViewportWidth = width;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() {
      return this.classList.contains('detail-carousel__viewport') ? mockedCarouselViewportWidth : 0;
    },
  });

  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    if (this.classList.contains('cast-card')) {
      return { width: 140 } as DOMRect;
    }

    if (this.classList.contains('poster-card')) {
      return { width: 180 } as DOMRect;
    }

    return { width: 0 } as DOMRect;
  };
}

function triggerResizeObservers() {
  for (const callback of observedResizeCallbacks) {
    callback([], {} as ResizeObserver);
  }
}

function setCarouselViewportWidth(width: number) {
  mockedCarouselViewportWidth = width;
}

function getCarouselTrackForButton(button: HTMLElement) {
  const carousel = button.closest('.detail-carousel');
  const track = carousel?.querySelector('.detail-carousel__track');
  if (!(track instanceof HTMLElement)) {
    throw new Error('Expected carousel track to exist');
  }

  return track;
}

function LocationStateProbe() {
  const location = useLocation();

  return (
    <>
      <output data-testid="location-path">{location.pathname}</output>
      <output data-testid="location-state">{JSON.stringify(location.state)}</output>
    </>
  );
}

describe('ItemDetailsPage', () => {
  beforeEach(() => {
    observedResizeCallbacks = [];
    originalResizeObserver = globalThis.ResizeObserver;
    originalClientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

    class MockResizeObserver implements ResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {
        observedResizeCallbacks.push(callback);
      }

      disconnect() {}
      observe() {
        this.callback([], this);
      }
      unobserve() {}
    }

    globalThis.ResizeObserver = MockResizeObserver;
    installCarouselLayoutMocks();
  });

  afterEach(() => {
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver;
    } else {
      delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    }

    if (originalClientWidthDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidthDescriptor);
    }

    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  it('plays the selected version and audio stream', () => {
    const onPlay = vi.fn();

    render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createMovieDetails()}
          similarItems={[]}
          seasons={[]}
          episodes={[]}
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={onPlay}
        />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('版本'), {
      target: { value: 'source-2160' },
    });
    fireEvent.click(screen.getByRole('button', { name: /播放/ }));

    expect(screen.getByLabelText('音频')).toHaveValue('5');
    expect(onPlay).toHaveBeenCalledWith('movie-1', 42000000, {
      mediaSourceId: 'source-2160',
      audioStreamIndex: 5,
    });
  });

  it('selects a series episode and only plays it when the play button is clicked', () => {
    const onPlay = vi.fn();

    render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createSeriesDetails()}
          similarItems={[]}
          seasons={[]}
          episodes={[
            createEpisode(),
            createEpisode({
              id: 'episode-2',
              name: 'Second Case',
              indexNumber: 2,
              mediaSources: [
                createMediaSource('episode-2-1080', {
                  path: '/series/episode-2-1080p.mkv',
                }),
                createMediaSource('episode-2-2160', {
                  path: '/series/episode-2-2160p.mkv',
                  videoStream: {
                    Width: 3840,
                    Height: 2160,
                    RealFrameRate: 24,
                    Codec: 'hevc',
                  },
                  audioStreams: [
                    {
                      Index: 7,
                      DisplayTitle: 'Japanese FLAC stereo',
                      Codec: 'flac',
                      Channels: 2,
                      ChannelLayout: 'stereo',
                      IsDefault: true,
                    },
                  ],
                }),
              ],
            }),
          ]}
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={onPlay}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('link', { name: /2\. Second Case/ }));

    expect(onPlay).not.toHaveBeenCalled();
    expect(screen.getByText('S1:E2 - Second Case')).toBeInTheDocument();
    expect(screen.getByLabelText('版本')).toHaveValue('episode-2-1080');

    fireEvent.change(screen.getByLabelText('版本'), {
      target: { value: 'episode-2-2160' },
    });
    expect(screen.getByLabelText('音频')).toHaveValue('7');

    fireEvent.click(screen.getByRole('button', { name: /播放/ }));

    expect(onPlay).toHaveBeenCalledWith('episode-2', null, {
      title: 'Series 1 - S1:E2 - Second Case',
      mediaSourceId: 'episode-2-2160',
      audioStreamIndex: 7,
    });
  });

  it('selects the continue-watching episode when it is present in the loaded season', () => {
    render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createSeriesDetails()}
          similarItems={[]}
          seasons={[]}
          episodes={[
            createEpisode(),
            createEpisode({
              id: 'episode-2',
              name: 'Second Case',
              indexNumber: 2,
            }),
          ]}
          selectedSeasonId=""
          resumeEpisodeId="episode-2"
          onSelectSeason={() => undefined}
          onPlay={() => undefined}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('S1:E2 - Second Case')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /2\. Second Case/ })).toHaveClass('episode-active');
  });

  it('shows playback progress and played status on episode cards', () => {
    const playedEpisode = {
      ...createEpisode({
        id: 'episode-2',
        name: 'Solved Case',
        indexNumber: 2,
      }),
      played: true,
    };

    render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createSeriesDetails()}
          similarItems={[]}
          seasons={[]}
          episodes={[
            createEpisode({
              id: 'episode-1',
              name: 'In Progress',
              runtimeTicks: 600000000,
              serverPositionTicks: 150000000,
            }),
            playedEpisode,
          ]}
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={() => undefined}
        />
      </MemoryRouter>
    );

    const inProgressCard = screen.getByRole('link', { name: /1\. In Progress/ });
    const progress = inProgressCard.querySelector('[role="progressbar"]');
    expect(progress).toHaveAttribute('aria-valuenow', '25');
    expect(progress?.querySelector('.poster-card__progress-fill')).toHaveStyle({ width: '25%' });

    const playedCard = screen.getByRole('link', { name: /2\. Solved Case/ });
    expect(playedCard.querySelector('.poster-card__played-indicator')).not.toBeNull();
  });

  it('uses the series poster when an episode poster is missing or fails to load', () => {
    render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createSeriesDetails({
            posterUrl: 'https://demo.local/series-primary.jpg',
          })}
          similarItems={[]}
          seasons={[]}
          episodes={[
            createEpisode({
              id: 'episode-1',
              name: 'Missing Poster',
              posterUrl: null,
            }),
            createEpisode({
              id: 'episode-2',
              name: 'Broken Poster',
              indexNumber: 2,
              posterUrl: 'https://demo.local/episode-2-primary.jpg',
            }),
          ]}
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={() => undefined}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('img', { name: '1. Missing Poster' })).toHaveAttribute(
      'src',
      'https://demo.local/series-primary.jpg'
    );

    const brokenEpisodeImage = screen.getByRole('img', { name: '2. Broken Poster' });
    expect(brokenEpisodeImage).toHaveAttribute(
      'src',
      'https://demo.local/episode-2-primary.jpg'
    );

    fireEvent.error(brokenEpisodeImage);

    expect(brokenEpisodeImage).toHaveAttribute('src', 'https://demo.local/series-primary.jpg');
  });

  it('keeps details visible while showing optional section failures', () => {
    render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createMovieDetails()}
          similarItems={[]}
          seasons={[]}
          episodes={[]}
          optionalFailureMessage="Some secondary content could not be loaded: Similar items."
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={() => undefined}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Movie 1' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Some secondary content could not be loaded: Similar items.'
    );
  });

  it('keeps visible controls stable when refreshed details arrive for the same item', () => {
    const onPlay = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createMovieDetails()}
          similarItems={[]}
          seasons={[]}
          episodes={[]}
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={onPlay}
        />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('\u7248\u672c'), {
      target: { value: 'source-2160' },
    });

    rerender(
      <MemoryRouter>
        <ItemDetailsPage
          details={createMovieDetails({ overview: 'Fresh overview.' })}
          similarItems={[]}
          seasons={[]}
          episodes={[]}
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={onPlay}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Movie 1' })).toBeInTheDocument();
    expect(screen.getByText('Fresh overview.')).toBeInTheDocument();
    expect(screen.getByLabelText('\u7248\u672c')).toHaveValue('source-2160');
    expect(screen.getByLabelText('\u97f3\u9891')).toHaveValue('5');

    fireEvent.click(screen.getByRole('button', { name: /\u64ad\u653e/ }));

    expect(onPlay).toHaveBeenCalledWith('movie-1', 42000000, {
      mediaSourceId: 'source-2160',
      audioStreamIndex: 5,
    });
  });

  it('runs favorite and played actions for movie details', () => {
    const onAddToFavorites = vi.fn();
    const onMarkPlayed = vi.fn();

    render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createMovieDetails()}
          similarItems={[]}
          seasons={[]}
          episodes={[]}
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={() => undefined}
          onAddToFavorites={onAddToFavorites}
          onMarkPlayed={onMarkPlayed}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark as played' }));

    expect(onAddToFavorites).toHaveBeenCalledWith('movie-1');
    expect(onMarkPlayed).toHaveBeenCalledWith('movie-1');
  });

  it('runs favorite and played actions for the selected series episode', () => {
    const onAddToFavorites = vi.fn();
    const onMarkPlayed = vi.fn();

    render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createSeriesDetails()}
          similarItems={[]}
          seasons={[]}
          episodes={[
            createEpisode(),
            createEpisode({
              id: 'episode-2',
              name: 'Second Case',
              indexNumber: 2,
            }),
          ]}
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={() => undefined}
          onAddToFavorites={onAddToFavorites}
          onMarkPlayed={onMarkPlayed}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('link', { name: /2\. Second Case/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark as played' }));

    expect(onAddToFavorites).toHaveBeenCalledWith('episode-2');
    expect(onMarkPlayed).toHaveBeenCalledWith('episode-2');
  });

  it('opens a right-click menu for episode card favorite and played actions', () => {
    const onAddToFavorites = vi.fn();
    const onMarkPlayed = vi.fn();

    render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createSeriesDetails()}
          similarItems={[]}
          seasons={[]}
          episodes={[
            createEpisode(),
            createEpisode({
              id: 'episode-2',
              name: 'Second Case',
              indexNumber: 2,
            }),
          ]}
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={() => undefined}
          onAddToFavorites={onAddToFavorites}
          onMarkPlayed={onMarkPlayed}
        />
      </MemoryRouter>
    );

    fireEvent.contextMenu(screen.getByRole('link', { name: /2\. Second Case/ }), {
      clientX: 220,
      clientY: 140,
    });

    fireEvent.click(screen.getByRole('menuitem', { name: 'Add to favorites' }));
    expect(onAddToFavorites).toHaveBeenCalledWith('episode-2');

    fireEvent.contextMenu(screen.getByRole('link', { name: /2\. Second Case/ }), {
      clientX: 220,
      clientY: 140,
    });

    fireEvent.click(screen.getByRole('menuitem', { name: 'Mark as played' }));
    expect(onMarkPlayed).toHaveBeenCalledWith('episode-2');
  });

  it('shows carousel buttons for overflowing cast and similar rows', () => {
    render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createMovieDetails({ people: createPeople(8) })}
          similarItems={createSimilarItems(8)}
          seasons={[]}
          episodes={[]}
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={() => undefined}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: '\u4e0a\u4e00\u7ec4\u6f14\u804c\u4eba\u5458'})).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '\u4e0b\u4e00\u7ec4\u6f14\u804c\u4eba\u5458'})).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '\u4e0a\u4e00\u7ec4\u66f4\u591a\u7c7b\u4f3c'})).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '\u4e0b\u4e00\u7ec4\u66f4\u591a\u7c7b\u4f3c'})).toBeInTheDocument();
  });

  it('hides carousel buttons when cast and similar rows fit within the viewport', () => {
    render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createMovieDetails({ people: createPeople(2) })}
          similarItems={createSimilarItems(2)}
          seasons={[]}
          episodes={[]}
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={() => undefined}
        />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: '\u4e0a\u4e00\u7ec4\u6f14\u804c\u4eba\u5458'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '\u4e0b\u4e00\u7ec4\u6f14\u804c\u4eba\u5458'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '\u4e0a\u4e00\u7ec4\u66f4\u591a\u7c7b\u4f3c'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '\u4e0b\u4e00\u7ec4\u66f4\u591a\u7c7b\u4f3c'})).not.toBeInTheDocument();
  });

  it('shows carousel buttons for overflowing series detail rows', () => {
    render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createSeriesDetails({ people: createPeople(8) })}
          similarItems={createSimilarItems(8)}
          seasons={[]}
          episodes={[]}
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={() => undefined}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: '\u4e0a\u4e00\u7ec4\u6f14\u804c\u4eba\u5458'})).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '\u4e0b\u4e00\u7ec4\u66f4\u591a\u7c7b\u4f3c'})).toBeInTheDocument();
  });

  it('removes native horizontal scrolling from detail carousel rows', () => {
    const castRule = getCssRuleBody('.cast-carousel');
    const moviesRule = getCssRuleBody('.movies-carousel');
    const viewportRule = getCssRuleBody('.detail-carousel__viewport');

    expect(castRule).not.toContain('overflow-x: auto');
    expect(moviesRule).not.toContain('overflow-x: auto');
    expect(viewportRule).toContain('overflow: hidden');
  });

  it('uses full-page detail layout rules without an inset app-main gutter', () => {
    expectCssRule('.app-main:has(.item-details-page)').toContainDeclaration('padding: 0');
    expectCssRule('.app-main:has(.item-details-page)').toContainDeclaration(
      'background: var(--app-bg)'
    );
    expectCssRule('.item-details-page').toContainDeclaration('min-height: 100%');
    expectCssRule('.item-details-page').toContainDeclaration('background: var(--app-bg)');
    expectCssRule('.item-hero').toContainDeclaration(
      'min-height: min(700px, calc(100vh - 44px))'
    );
    expectCssRule('.item-details-body').toContainDeclaration(
      'padding: 0 var(--detail-page-pad) 86px'
    );
  });

  it('renders movie details inside the full-page detail surface with backdrop artwork', () => {
    const { container } = render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createLongTitleMovieDetails()}
          similarItems={[]}
          seasons={[]}
          episodes={[]}
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={() => undefined}
        />
      </MemoryRouter>
    );

    expect(container.querySelector('.item-details-page')).not.toBeNull();
    expect(container.querySelector('.item-hero')).toHaveStyle({
      backgroundImage: 'url(https://demo.local/backdrop.jpg)',
    });
  });

  it('renders series details inside the same full-page detail surface', () => {
    const { container } = render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createSeriesDetails({ backdropUrl: 'https://demo.local/series-backdrop.jpg' })}
          similarItems={[]}
          seasons={[]}
          episodes={[createEpisode()]}
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={() => undefined}
        />
      </MemoryRouter>
    );

    expect(container.querySelector('.item-details-page')).not.toBeNull();
    expect(container.querySelector('.item-hero')).toHaveStyle({
      backgroundImage: 'url(https://demo.local/series-backdrop.jpg)',
    });
  });

  it('keeps the full-page hero surface when backdrop artwork is missing', () => {
    const { container } = render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createNoBackdropMovieDetails()}
          similarItems={[]}
          seasons={[]}
          episodes={[]}
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={() => undefined}
        />
      </MemoryRouter>
    );

    expect(container.querySelector('.item-details-page')).not.toBeNull();
    expect(container.querySelector('.item-hero')).toHaveStyle({ backgroundImage: 'none' });
  });

  it('keeps media selectors contained within the full-page hero', () => {
    expectCssRule('.item-hero__media-badge').toContainDeclaration(
      'right: var(--detail-page-pad)'
    );
    expectCssRule('.item-hero__media-badge').toContainDeclaration('bottom: 54px');
    expectCssRule('.item-hero__media-badge').toContainDeclaration(
      'width: min(460px, calc(100% - (var(--detail-page-pad) * 2)))'
    );
    expectCssRule('.media-select select').toContainDeclaration('min-width: 0');
    expectCssRule('.media-select__summary').toContainDeclaration('overflow-wrap: anywhere');
  });

  it('preserves long media source selection behavior in the full hero layout', () => {
    render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createLongMediaSourceDetails()}
          similarItems={[]}
          seasons={[]}
          episodes={[]}
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={() => undefined}
        />
      </MemoryRouter>
    );

    expect(screen.getByLabelText('\u7248\u672c')).toHaveValue('source-long-1080');
    expect(screen.getByLabelText('\u97f3\u9891')).toHaveValue('11');
  });

  it('aligns detail rows and carousel fades with the full-page body', () => {
    expectCssRule('.details-section').toContainDeclaration('min-width: 0');
    expectCssRule('.details-section .section-title').toContainDeclaration('color: var(--text)');
    expectCssRule('.detail-carousel').toContainDeclaration('width: 100%');
    expectCssRule('.detail-carousel').toContainDeclaration(
      '--detail-carousel-fade-bg: var(--app-bg)'
    );
    expectCssRule('.episodes-row').toContainDeclaration(
      'grid-template-columns: repeat(auto-fill, minmax(230px, 1fr))'
    );
    expectCssRule('.metadata-footer').toContainDeclaration('margin-top: 0');
  });

  it('uses theme text variables for detail body labels and carousel captions', () => {
    expectCssRule('.cast-card__name').toContainDeclaration('color: var(--text)');
    expectCssRule('.cast-card__role').toContainDeclaration('color: var(--muted)');
    expectCssRule('.metadata-title').toContainDeclaration('color: var(--text)');
    expectCssRule('.metadata-text').toContainDeclaration('color: var(--muted)');
    expectCssRule('.media-source-block').toContainDeclaration('background: var(--surface-2)');
    expectCssRule('.source-filePath').toContainDeclaration('color: var(--muted)');
    expectCssRule('.stream-box h5').toContainDeclaration('color: var(--text)');
    expectCssRule('.stream-box p').toContainDeclaration('color: var(--muted)');
  });

  it('tints detail backdrop artwork with the active theme palette', () => {
    const styles = getStylesheet();

    expect(styles).toMatch(/html\[data-theme='dark'\]\s*\{[^}]*--detail-hero-scrim:/u);
    expect(styles).toMatch(/html\[data-theme='daily'\]\s*\{[^}]*--detail-hero-scrim:/u);
    expect(styles).toMatch(/html\[data-theme='eye'\]\s*\{[^}]*--detail-hero-scrim:/u);
    expect(styles).toMatch(/html\[data-theme='daily'\]\s*\{[^}]*--detail-hero-tint:/u);
    expect(styles).toMatch(/html\[data-theme='eye'\]\s*\{[^}]*--detail-hero-tint:/u);

    expectCssRule('.item-hero__gradient').toContainDeclaration('var(--detail-hero-scrim)');
    expectCssRule('.item-hero__gradient').toContainDeclaration('var(--detail-hero-tint)');
    expectCssRule('.item-hero__gradient').notToContainDeclaration('#111113');
    expectCssRule('.item-hero__title').toContainDeclaration('color: var(--detail-hero-text)');
    expectCssRule('.item-hero__meta').toContainDeclaration('color: var(--detail-hero-muted)');
    expectCssRule('.item-hero__overview').toContainDeclaration('color: var(--detail-hero-muted)');
  });
  it('scopes full-page detail behavior without changing app shell defaults', () => {
    expectCssRule('.app-main').toContainDeclaration('padding: 40px');
    expectCssRule('.app-main:has(.item-details-page)').toContainDeclaration('padding: 0');
    expectCssRule('.app-layout').toContainDeclaration('grid-template-columns: 260px minmax(0, 1fr)');
    expectCssRule('.app-sidebar').toContainDeclaration('background: var(--sidebar)');
    expectCssRule('.panel--content').toContainDeclaration('width: min(1040px, 100%)');
  });

  it('defines responsive detail breakpoints for desktop and narrow widths', () => {
    const styles = getStylesheet();

    expect(styles).toMatch(/@media \(max-width: 1100px\)/);
    expect(styles).toMatch(/\.item-hero__content\s*\{[^}]*padding-bottom: 252px;/);
    expect(styles).toMatch(/\.item-hero__media-badge\s*\{[^}]*left: var\(--detail-page-pad\);/);
    expect(styles).toMatch(/@media \(max-width: 760px\)/);
    expect(styles).toMatch(/\.media-select\s*\{[^}]*grid-template-columns: 1fr;/);
    expect(styles).toMatch(/\.metadata-footer\s*\{[^}]*grid-template-columns: 1fr;/);
  });

  it('advances an overflowing cast row when the next button is clicked', () => {
    render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createMovieDetails({ people: createPeople(8) })}
          similarItems={[]}
          seasons={[]}
          episodes={[]}
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={() => undefined}
        />
      </MemoryRouter>
    );

    const nextButton = screen.getByRole('button', { name: '\u4e0b\u4e00\u7ec4\u6f14\u804c\u4eba\u5458'});
    const track = getCarouselTrackForButton(nextButton);

    expect(track).toHaveStyle({ transform: 'translate3d(0px, 0, 0)' });

    fireEvent.click(nextButton);

    expect(track).toHaveStyle({ transform: 'translate3d(-280px, 0, 0)' });
  });

  it('moves an advanced similar row back when the previous button is clicked', () => {
    render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createMovieDetails()}
          similarItems={createSimilarItems(8)}
          seasons={[]}
          episodes={[]}
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={() => undefined}
        />
      </MemoryRouter>
    );

    const nextButton = screen.getByRole('button', { name: '\u4e0b\u4e00\u7ec4\u66f4\u591a\u7c7b\u4f3c'});
    const previousButton = screen.getByRole('button', { name: '\u4e0a\u4e00\u7ec4\u66f4\u591a\u7c7b\u4f3c'});
    const track = getCarouselTrackForButton(nextButton);

    fireEvent.click(nextButton);
    expect(track).toHaveStyle({ transform: 'translate3d(-196px, 0, 0)' });

    fireEvent.click(previousButton);
    expect(track).toHaveStyle({ transform: 'translate3d(0px, 0, 0)' });
  });

  it('keeps similar recommendation links and route state after carousel movement', () => {
    render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createMovieDetails()}
          similarItems={createSimilarItems(8)}
          seasons={[]}
          episodes={[]}
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={() => undefined}
        />
        <LocationStateProbe />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: '\u4e0b\u4e00\u7ec4\u66f4\u591a\u7c7b\u4f3c'}));
    fireEvent.click(screen.getByRole('link', { name: /Similar 2/ }));

    expect(screen.getByTestId('location-path')).toHaveTextContent('/item/similar-2');
    expect(screen.getByTestId('location-state')).toHaveTextContent(
      JSON.stringify({ title: 'Similar 2', serverPositionTicks: 1 })
    );
  });

  it('loops an overflowing row only after reaching the final position', () => {
    render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createMovieDetails({ people: createPeople(8) })}
          similarItems={[]}
          seasons={[]}
          episodes={[]}
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={() => undefined}
        />
      </MemoryRouter>
    );

    const nextButton = screen.getByRole('button', { name: '\u4e0b\u4e00\u7ec4\u6f14\u804c\u4eba\u5458'});
    const track = getCarouselTrackForButton(nextButton);

    fireEvent.click(nextButton);
    fireEvent.click(nextButton);
    fireEvent.click(nextButton);
    expect(track).toHaveStyle({ transform: 'translate3d(-700px, 0, 0)' });

    fireEvent.click(nextButton);
    expect(track).toHaveStyle({ transform: 'translate3d(0px, 0, 0)' });
  });

  it('loops an overflowing row from the beginning to the final position with the previous button', () => {
    render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createMovieDetails({ people: createPeople(8) })}
          similarItems={[]}
          seasons={[]}
          episodes={[]}
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={() => undefined}
        />
      </MemoryRouter>
    );

    const previousButton = screen.getByRole('button', { name: '\u4e0a\u4e00\u7ec4\u6f14\u804c\u4eba\u5458'});
    const track = getCarouselTrackForButton(previousButton);

    fireEvent.click(previousButton);

    expect(track).toHaveStyle({ transform: 'translate3d(-700px, 0, 0)' });
  });

  it('updates carousel controls after row width changes', () => {
    render(
      <MemoryRouter>
        <ItemDetailsPage
          details={createMovieDetails({ people: createPeople(8) })}
          similarItems={[]}
          seasons={[]}
          episodes={[]}
          selectedSeasonId=""
          onSelectSeason={() => undefined}
          onPlay={() => undefined}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: '\u4e0b\u4e00\u7ec4\u6f14\u804c\u4eba\u5458'})).toBeInTheDocument();

    act(() => {
      setCarouselViewportWidth(2000);
      triggerResizeObservers();
    });

    expect(screen.queryByRole('button', { name: '\u4e0b\u4e00\u7ec4\u6f14\u804c\u4eba\u5458'})).not.toBeInTheDocument();

    act(() => {
      setCarouselViewportWidth(300);
      triggerResizeObservers();
    });

    expect(screen.getByRole('button', { name: '\u4e0b\u4e00\u7ec4\u6f14\u804c\u4eba\u5458'})).toBeInTheDocument();
  });
});
